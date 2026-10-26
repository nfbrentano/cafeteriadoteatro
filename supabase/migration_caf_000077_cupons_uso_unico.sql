BEGIN;

-- ==============================================================================
-- CAF-000077 — Cupons: uso único por pedido, RPC protegida e rastreio no PDV
-- ==============================================================================

-- 1. Tabela para auditoria e garantia estrita de unicidade de uso de cupom por pedido
CREATE TABLE IF NOT EXISTS public.campanha_usos (
  id BIGSERIAL PRIMARY KEY,
  campanha_id BIGINT NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  pedido_id BIGINT NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  valor_receita NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
  CONSTRAINT uq_campanha_usos_pedido UNIQUE (pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_campanha_usos_campanha ON public.campanha_usos(campanha_id);
CREATE INDEX IF NOT EXISTS idx_campanha_usos_pedido ON public.campanha_usos(pedido_id);

ALTER TABLE public.campanha_usos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campanha_usos_select_staff" ON public.campanha_usos;
CREATE POLICY "campanha_usos_select_staff" ON public.campanha_usos
  FOR SELECT TO authenticated
  USING (true);

-- 2. Remove a assinatura antiga de registrar_uso_cupom (sem pedido_id)
DROP FUNCTION IF EXISTS public.registrar_uso_cupom(BIGINT, NUMERIC);

-- 3. Nova RPC registrar_uso_cupom vinculada ao pedido, com receita do pedido e idempotente
CREATE OR REPLACE FUNCTION public.registrar_uso_cupom(
  p_campanha_id BIGINT,
  p_pedido_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_uso_id BIGINT;
BEGIN
  -- 1. Exige autenticação (bloqueia anon)
  IF auth.role() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Não autorizado para registrar uso de cupom.';
  END IF;

  -- 2. Validações básicas
  IF p_campanha_id IS NULL THEN
    RAISE EXCEPTION 'Campanha ID é obrigatório para registrar uso de cupom.';
  END IF;

  IF p_pedido_id IS NULL THEN
    RAISE EXCEPTION 'Pedido ID é obrigatório para registrar uso de cupom.';
  END IF;

  -- 3. Busca o pedido e valida estado
  SELECT id, status, total, campanha_id INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado.', p_pedido_id;
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é permitido registrar uso de cupom para pedido cancelado.';
  END IF;

  -- Se o pedido já possui outra campanha vinculada diferente da informada, rejeita
  IF v_pedido.campanha_id IS NOT NULL AND v_pedido.campanha_id <> p_campanha_id THEN
    RAISE EXCEPTION 'Campanha informada (%) diverge da campanha já associada ao pedido (%).', p_campanha_id, v_pedido.campanha_id;
  END IF;

  -- 4. Inserção idempotente em campanha_usos (garante exatamente 1 uso por pedido)
  INSERT INTO public.campanha_usos (campanha_id, pedido_id, valor_receita)
  VALUES (p_campanha_id, p_pedido_id, COALESCE(v_pedido.total, 0))
  ON CONFLICT (pedido_id) DO NOTHING
  RETURNING id INTO v_uso_id;

  -- 5. Atualiza contadores na campanha e vincula pedido se foi novo registro
  IF v_uso_id IS NOT NULL THEN
    UPDATE public.campanhas
    SET
      usos_registrados = (SELECT COUNT(*) FROM public.campanha_usos WHERE campanha_id = p_campanha_id),
      receita_atribuida = (SELECT COALESCE(SUM(valor_receita), 0) FROM public.campanha_usos WHERE campanha_id = p_campanha_id)
    WHERE id = p_campanha_id;

    UPDATE public.pedidos
    SET campanha_id = p_campanha_id
    WHERE id = p_pedido_id AND campanha_id IS NULL;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_uso_cupom(BIGINT, BIGINT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.registrar_uso_cupom(BIGINT, BIGINT) TO authenticated;

-- 4. Atualiza fechar_conta_mesa para passar p_pedido_id à registrar_uso_cupom e unificar assinatura
DROP FUNCTION IF EXISTS public.fechar_conta_mesa(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, UUID, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT);

CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_desconto_manual NUMERIC DEFAULT 0,
  p_desconto_motivo TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_cupom_codigo TEXT DEFAULT NULL,
  p_campanha_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_pedido RECORD;
  v_subtotal NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_existing_fechamento RECORD;
  v_primeiro_pedido_id BIGINT := NULL;
  v_user_role TEXT;
  v_pode_dar_desconto BOOLEAN;
  v_uid UUID := auth.uid();
BEGIN
  -- 1. Idempotência por idempotency_key
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT id, troco, total_conta INTO v_existing_fechamento
    FROM public.fechamentos
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF FOUND THEN
      RETURN jsonb_build_object(
        'fechamento_id', v_existing_fechamento.id,
        'troco', v_existing_fechamento.troco,
        'total', v_existing_fechamento.total_conta,
        'idempotent', true
      );
    END IF;
  END IF;

  -- Validação de Role e Permissões
  SELECT role, pode_dar_desconto INTO v_user_role, v_pode_dar_desconto
  FROM public.perfis WHERE id = v_uid;

  IF v_user_role IS NOT NULL AND v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas baristas e administradores podem fechar contas de mesa.';
  END IF;

  IF p_desconto_manual > 0 AND NOT (v_user_role = 'admin' OR v_pode_dar_desconto = true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para aplicar desconto manual.';
  END IF;

  IF p_desconto_manual > 0 AND (p_desconto_motivo IS NULL OR length(trim(p_desconto_motivo)) = 0) THEN
    RAISE EXCEPTION 'Motivo do desconto é obrigatório.';
  END IF;

  -- 2. Calcula subtotal apenas dos pedidos ativos (não cancelados e não pagos) da mesa
  FOR v_pedido IN
    SELECT id, total
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    FOR UPDATE
  LOOP
    v_subtotal := v_subtotal + COALESCE(v_pedido.total, 0);
    IF v_primeiro_pedido_id IS NULL THEN
      v_primeiro_pedido_id := v_pedido.id;
    END IF;
  END LOOP;

  IF v_subtotal = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  IF p_desconto_manual > v_subtotal THEN
    RAISE EXCEPTION 'O desconto (R$ %) não pode ser maior que o subtotal da mesa (R$ %).', p_desconto_manual, v_subtotal;
  END IF;

  -- 3. Calcula total com taxa de serviço e desconto manual
  v_total_a_pagar := ROUND(v_subtotal + COALESCE(p_taxa_servico, 0) - COALESCE(p_desconto_manual, 0), 2);
  IF v_total_a_pagar < 0 THEN
    v_total_a_pagar := 0;
  END IF;

  -- 4. Valida soma dos pagamentos
  FOR v_pagamento IN
    SELECT (elem->>'valor')::NUMERIC AS valor, (elem->>'forma') AS forma
    FROM jsonb_array_elements(p_pagamentos) AS elem
  LOOP
    v_total_pago := v_total_pago + COALESCE(v_pagamento.valor, 0);
  END LOOP;

  IF ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 5. Cria registro de fechamento em public.fechamentos
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, desconto_manual, desconto_motivo, desconto_por,
    idempotency_key, cupom_codigo, campanha_id
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), COALESCE(p_desconto_manual, 0), p_desconto_motivo, CASE WHEN p_desconto_manual > 0 THEN v_uid ELSE NULL END,
    p_idempotency_key, p_cupom_codigo, p_campanha_id
  ) RETURNING id INTO v_fechamento_id;

  -- 6. Inserir formas de pagamento
  FOR v_pagamento IN
    SELECT (elem->>'valor')::NUMERIC(10,2) AS valor, (elem->>'forma') AS forma
    FROM jsonb_array_elements(p_pagamentos) AS elem
  LOOP
    INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
    VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);
  END LOOP;

  -- 7. Atualiza pedidos da mesa para 'pago' e vincula cupom/campanha
  FOR v_pedido IN
    SELECT id FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
  LOOP
    UPDATE public.pedidos
    SET 
      status_pagamento = 'pago',
      cupom_codigo = COALESCE(p_cupom_codigo, cupom_codigo),
      campanha_id = COALESCE(p_campanha_id, campanha_id),
      updated_at = now()
    WHERE id = v_pedido.id;

    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_pedido.id);
  END LOOP;

  -- 8. Registrar uso de cupom dentro da mesma transação com o pedido principal da mesa
  IF p_campanha_id IS NOT NULL AND v_primeiro_pedido_id IS NOT NULL THEN
    PERFORM public.registrar_uso_cupom(p_campanha_id, v_primeiro_pedido_id);
  END IF;

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'troco', v_troco,
    'total', v_total_a_pagar,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

-- 5. Trigger para estornar uso de cupom se o pedido for cancelado
CREATE OR REPLACE FUNCTION public.fn_estorno_cupom_pedido_cancelado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campanha_id BIGINT;
BEGIN
  IF NEW.status = 'cancelado' AND (OLD.status IS NULL OR OLD.status <> 'cancelado') THEN
    SELECT campanha_id INTO v_campanha_id
    FROM public.campanha_usos
    WHERE pedido_id = NEW.id;

    IF v_campanha_id IS NOT NULL THEN
      DELETE FROM public.campanha_usos WHERE pedido_id = NEW.id;

      UPDATE public.campanhas
      SET
        usos_registrados = (SELECT COUNT(*) FROM public.campanha_usos WHERE campanha_id = v_campanha_id),
        receita_atribuida = (SELECT COALESCE(SUM(valor_receita), 0) FROM public.campanha_usos WHERE campanha_id = v_campanha_id)
      WHERE id = v_campanha_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estorno_cupom_pedido_cancelado ON public.pedidos;
CREATE TRIGGER trg_estorno_cupom_pedido_cancelado
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_estorno_cupom_pedido_cancelado();

-- 6. Script de Conciliação Histórica
INSERT INTO public.campanha_usos (campanha_id, pedido_id, valor_receita, created_at)
SELECT p.campanha_id, p.id, COALESCE(p.total, 0), p.created_at
FROM public.pedidos p
WHERE p.campanha_id IS NOT NULL
  AND COALESCE(p.status, '') <> 'cancelado'
ON CONFLICT (pedido_id) DO NOTHING;

UPDATE public.campanhas c
SET
  usos_registrados = (SELECT COUNT(*) FROM public.campanha_usos u WHERE u.campanha_id = c.id),
  receita_atribuida = (SELECT COALESCE(SUM(u.valor_receita), 0) FROM public.campanha_usos u WHERE u.campanha_id = c.id);

-- Registro de aplicação (RF04)
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('077', 'migration_caf_000077_cupons_uso_unico.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
