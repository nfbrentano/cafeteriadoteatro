-- ==============================================================================
-- MIGRATION: CAF-000073 - CORREÇÃO DO FECHAMENTO DE CONTA DA MESA
-- ==============================================================================

-- 1. Garantir colunas de idempotência e cupom em fechamentos
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS cupom_codigo TEXT,
  ADD COLUMN IF NOT EXISTS campanha_id BIGINT REFERENCES public.campanhas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fechamentos_idempotency_key
  ON public.fechamentos(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Atualizar RPC fechar_conta_mesa com assinatura segura e unificada
CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_desconto_manual NUMERIC DEFAULT 0,
  p_desconto_motivo TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_cupom_codigo TEXT DEFAULT NULL,
  p_campanha_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_pode_dar_desconto BOOLEAN;
  v_subtotal NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento JSONB;
  v_fechamento_id UUID;
  v_pedido RECORD;
  v_count_pedidos INT := 0;
  v_uid UUID := auth.uid();
BEGIN
  -- Idempotência: se já processado com a mesma chave, retorna o fechamento existente
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, troco, total_conta INTO v_fechamento_id, v_troco, v_total_a_pagar
    FROM public.fechamentos
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'fechamento_id', v_fechamento_id,
        'troco', v_troco,
        'total', v_total_a_pagar,
        'idempotent', true
      );
    END IF;
  END IF;

  -- Validação de Role e Permissões
  SELECT role, pode_dar_desconto INTO v_user_role, v_pode_dar_desconto
  FROM public.perfis WHERE id = v_uid;

  -- Se perfil não encontrado ou papel não barista/admin (ou anônimo), bloquear
  IF v_user_role IS NOT NULL AND v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas baristas e administradores podem fechar contas de mesa.';
  END IF;

  IF p_desconto_manual > 0 AND NOT (v_user_role = 'admin' OR v_pode_dar_desconto = true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para aplicar desconto manual.';
  END IF;

  IF p_desconto_manual > 0 AND (p_desconto_motivo IS NULL OR length(trim(p_desconto_motivo)) = 0) THEN
    RAISE EXCEPTION 'Motivo do desconto é obrigatório.';
  END IF;

  -- 1. Calcular o total de pedidos em aberto com lock FOR UPDATE, ignorando estritamente pedidos cancelados
  SELECT COALESCE(SUM(total), 0), COUNT(id)
  INTO v_subtotal, v_count_pedidos
  FROM public.pedidos
  WHERE mesa_codigo = p_mesa_codigo
    AND status <> 'cancelado'
    AND (status_pagamento IS NULL OR status_pagamento != 'pago')
  FOR UPDATE;

  IF v_count_pedidos = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  IF p_desconto_manual > v_subtotal THEN
    RAISE EXCEPTION 'O desconto (R$ %) não pode ser maior que o subtotal da mesa (R$ %).', p_desconto_manual, v_subtotal;
  END IF;

  -- 2. Calcular total final: (Subtotal - Desconto) + Taxa de Serviço
  v_total_a_pagar := (v_subtotal - p_desconto_manual) + p_taxa_servico;

  -- 3. Calcular a soma dos pagamentos enviados
  FOR v_pagamento IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    v_total_pago := v_total_pago + (v_pagamento->>'valor')::NUMERIC(10,2);
  END LOOP;

  IF v_total_pago < (v_total_a_pagar - 0.01) THEN
    RAISE EXCEPTION 'O valor dos pagamentos (R$ %) é inferior ao total a pagar (R$ %).', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := GREATEST(0, v_total_pago - v_total_a_pagar);

  -- 4. Inserir o Fechamento
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por, 
    taxa_servico, desconto_manual, desconto_motivo, desconto_por,
    idempotency_key, cupom_codigo, campanha_id
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    p_taxa_servico, p_desconto_manual, p_desconto_motivo, CASE WHEN p_desconto_manual > 0 THEN v_uid ELSE NULL END,
    p_idempotency_key, p_cupom_codigo, p_campanha_id
  ) RETURNING id INTO v_fechamento_id;

  -- 5. Inserir formas de pagamento detalhadas
  FOR v_pagamento IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    INSERT INTO public.fechamento_pagamentos (fechamento_id, forma_pagamento, valor)
    VALUES (v_fechamento_id, v_pagamento->>'forma', (v_pagamento->>'valor')::NUMERIC(10,2));
  END LOOP;

  -- 6. Atualizar status dos pedidos vinculados e associar ao fechamento
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

  -- 7. Registrar uso de cupom dentro da mesma transação, se houver
  IF p_campanha_id IS NOT NULL THEN
    PERFORM public.registrar_uso_cupom(p_campanha_id, v_total_a_pagar);
  END IF;

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'troco', v_troco,
    'total', v_total_a_pagar,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, UUID, TEXT, BIGINT) TO authenticated;
