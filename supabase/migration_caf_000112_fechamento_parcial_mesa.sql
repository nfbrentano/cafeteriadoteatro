-- =========================================================
-- MIGRATION: CAF-000112 - FECHAMENTO PARCIAL DE CONTA DA MESA
-- =========================================================

-- 1. Coluna quantidade_paga em pedido_itens
ALTER TABLE public.pedido_itens
ADD COLUMN IF NOT EXISTS quantidade_paga NUMERIC(10,3) NOT NULL DEFAULT 0;

-- 2. Coluna parcial em fechamentos
ALTER TABLE public.fechamentos
ADD COLUMN IF NOT EXISTS parcial BOOLEAN NOT NULL DEFAULT false;

-- 3. Tabela fechamento_itens para auditoria de itens quitados por fechamento parcial
CREATE TABLE IF NOT EXISTS public.fechamento_itens (
  id BIGSERIAL PRIMARY KEY,
  fechamento_id UUID NOT NULL REFERENCES public.fechamentos(id) ON DELETE CASCADE,
  pedido_item_id BIGINT NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  quantidade NUMERIC(10,3) NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fechamento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fechamento_itens_select" ON public.fechamento_itens;
CREATE POLICY "fechamento_itens_select" ON public.fechamento_itens FOR SELECT USING (true);

DROP POLICY IF EXISTS "fechamento_itens_insert" ON public.fechamento_itens;
CREATE POLICY "fechamento_itens_insert" ON public.fechamento_itens FOR INSERT WITH CHECK (
  public.get_user_role() IN ('barista', 'admin')
);

CREATE INDEX IF NOT EXISTS idx_fechamento_itens_fechamento_id ON public.fechamento_itens(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fechamento_itens_pedido_item_id ON public.fechamento_itens(pedido_item_id);

-- 4. RPC registrar_pagamento_parcial_mesa
CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcial_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_itens JSONB DEFAULT '[]'::jsonb,
  p_valor_abatimento NUMERIC DEFAULT 0,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_existing_fechamento RECORD;
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_pedido RECORD;
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_subtotal_geral NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_saldo_restante NUMERIC(10,2) := 0;
  v_valor_esperado NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_item_elem JSONB;
  v_item_id BIGINT;
  v_qtd_pagar NUMERIC(10,3);
  v_item RECORD;
  v_subtotal_item NUMERIC(10,2);
  v_primeiro_pedido_id BIGINT := NULL;
  v_cliente_id UUID := NULL;
  v_ja_debitado BOOLEAN := false;
  v_novo_saldo NUMERIC(10,2) := 0;
BEGIN
  -- 1. Idempotência
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, troco, total_conta INTO v_existing_fechamento
    FROM public.fechamentos
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'fechamento_id', v_existing_fechamento.id,
        'troco', v_existing_fechamento.troco,
        'total', v_existing_fechamento.total_conta,
        'idempotent', true
      );
    END IF;
  END IF;

  -- 2. Permissões
  SELECT role INTO v_user_role FROM public.perfis WHERE id = v_uid;
  IF v_user_role IS NOT NULL AND v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: apenas baristas e administradores podem registrar pagamentos parciais.';
  END IF;

  -- 3. Obter e bloquear pedidos ativos da mesa
  FOR v_pedido IN
    SELECT id, total, cliente_id
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    FOR UPDATE
  LOOP
    v_pedido_ids := array_append(v_pedido_ids, v_pedido.id);
    v_subtotal_geral := v_subtotal_geral + COALESCE(v_pedido.total, 0);
    IF v_primeiro_pedido_id IS NULL THEN
      v_primeiro_pedido_id := v_pedido.id;
    END IF;
    IF v_cliente_id IS NULL AND v_pedido.cliente_id IS NOT NULL THEN
      v_cliente_id := v_pedido.cliente_id;
    END IF;
  END LOOP;

  IF array_length(v_pedido_ids, 1) IS NULL OR array_length(v_pedido_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  -- 4. Somar pagamentos parciais anteriores desta mesa aberta
  SELECT COALESCE(SUM(fp.valor), 0) INTO v_ja_pago_parcial
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_saldo_restante := GREATEST(0, v_subtotal_geral - v_ja_pago_parcial);

  -- 5. Calcular valor a pagar (itens ou abatimento de valor livre)
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' AND jsonb_array_length(p_itens) > 0 THEN
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_item_id := (v_item_elem->>'pedido_item_id')::BIGINT;
      v_qtd_pagar := COALESCE((v_item_elem->>'quantidade')::NUMERIC, 1);

      IF v_qtd_pagar <= 0 THEN
        RAISE EXCEPTION 'Quantidade de item a pagar deve ser maior que zero.';
      END IF;

      SELECT pi.id, pi.pedido_id, pi.quantidade, pi.quantidade_paga, pi.preco_unitario, pi.cancelado
      INTO v_item
      FROM public.pedido_itens pi
      WHERE pi.id = v_item_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item de pedido #% não encontrado.', v_item_id;
      END IF;

      IF v_item.cancelado = true THEN
        RAISE EXCEPTION 'Item #% está cancelado e não pode ser pago.', v_item_id;
      END IF;

      IF NOT (v_item.pedido_id = ANY(v_pedido_ids)) THEN
        RAISE EXCEPTION 'Item #% não pertence aos pedidos ativos da mesa %.', v_item_id, p_mesa_codigo;
      END IF;

      IF (v_item.quantidade - v_item.quantidade_paga) < (v_qtd_pagar - 0.001) THEN
        RAISE EXCEPTION 'Quantidade solicitada (%) excede a quantidade restante (%) do item #%.',
          v_qtd_pagar, (v_item.quantidade - v_item.quantidade_paga), v_item_id;
      END IF;

      v_subtotal_item := ROUND(v_qtd_pagar * v_item.preco_unitario, 2);
      v_valor_esperado := v_valor_esperado + v_subtotal_item;
    END LOOP;
  ELSE
    v_valor_esperado := ROUND(COALESCE(p_valor_abatimento, 0), 2);
  END IF;

  v_total_a_pagar := ROUND(v_valor_esperado + COALESCE(p_taxa_servico, 0), 2);

  IF v_total_a_pagar <= 0 THEN
    RAISE EXCEPTION 'Valor a pagar deve ser maior que zero.';
  END IF;

  IF v_valor_esperado > (v_saldo_restante + 0.01) THEN
    RAISE EXCEPTION 'Valor informado (R$ %) excede o saldo restante da mesa (R$ %).', v_valor_esperado, v_saldo_restante;
  END IF;

  -- 6. Validação dos pagamentos recebidos
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Nenhuma forma de pagamento informada.';
  END IF;

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

  -- 7. Criar registro de fechamento parcial
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, parcial, idempotency_key
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), true, p_idempotency_key
  ) RETURNING id INTO v_fechamento_id;

  -- 8. Inserir pagamentos e debitar conta do cliente se aplicável
  FOR v_pagamento IN
    SELECT (elem->>'valor')::NUMERIC(10,2) AS valor, (elem->>'forma') AS forma, (elem->>'cliente_id')::UUID AS pag_cliente_id
    FROM jsonb_array_elements(p_pagamentos) AS elem
  LOOP
    INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
    VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);

    IF v_pagamento.forma = 'conta_cliente' AND COALESCE(v_pagamento.valor, 0) > 0 THEN
      v_cliente_id := COALESCE(v_pagamento.pag_cliente_id, v_cliente_id);
      IF v_cliente_id IS NULL THEN
        RAISE EXCEPTION 'Mesa sem cliente vinculado para pagamento via Conta do Cliente.';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.cliente_conta_movimentos m
        WHERE m.cliente_id = v_cliente_id
          AND m.tipo = 'consumo'
          AND ABS(m.valor) = ABS(v_pagamento.valor)
          AND (
            (v_primeiro_pedido_id IS NOT NULL AND m.pedido_id = v_primeiro_pedido_id)
            OR m.created_at >= (now() - interval '10 minutes')
          )
      ) INTO v_ja_debitado;

      IF NOT v_ja_debitado THEN
        PERFORM public.lancar_movimento_conta(
          p_cliente_id := v_cliente_id,
          p_tipo := 'consumo',
          p_valor := ABS(v_pagamento.valor),
          p_pedido_id := v_primeiro_pedido_id,
          p_fechamento_id := NULL,
          p_forma_pagamento := 'conta_cliente',
          p_motivo := 'Pagamento Parcial Mesa ' || p_mesa_codigo
        );
      END IF;
    END IF;
  END LOOP;

  -- 9. Vincular fechamento parcial aos pedidos ativos da mesa
  FOREACH v_item_id IN ARRAY v_pedido_ids
  LOOP
    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_item_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 10. Atualizar quantidade_paga dos itens e registrar fechamento_itens
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' AND jsonb_array_length(p_itens) > 0 THEN
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_item_id := (v_item_elem->>'pedido_item_id')::BIGINT;
      v_qtd_pagar := COALESCE((v_item_elem->>'quantidade')::NUMERIC, 1);

      SELECT preco_unitario INTO v_subtotal_item
      FROM public.pedido_itens WHERE id = v_item_id;

      UPDATE public.pedido_itens
      SET quantidade_paga = quantidade_paga + v_qtd_pagar
      WHERE id = v_item_id;

      INSERT INTO public.fechamento_itens (
        fechamento_id, pedido_item_id, quantidade, valor_unitario, subtotal
      ) VALUES (
        v_fechamento_id, v_item_id, v_qtd_pagar, v_subtotal_item, ROUND(v_qtd_pagar * v_subtotal_item, 2)
      );
    END LOOP;
  END IF;

  v_novo_saldo := GREATEST(0, v_saldo_restante - v_valor_esperado);

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'troco', v_troco,
    'total_pago', v_total_pago,
    'valor_abatido', v_valor_esperado,
    'taxa_servico', COALESCE(p_taxa_servico, 0),
    'saldo_restante', v_novo_saldo,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pagamento_parcial_mesa(TEXT, JSONB, JSONB, NUMERIC, NUMERIC, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_parcial_mesa(TEXT, JSONB, JSONB, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- 5. Atualizar fechar_conta_mesa para considerar abatimentos parciais anteriores
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
  v_subtotal NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_subtotal_restante NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_pedido RECORD;
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_pode_dar_desconto BOOLEAN := false;
  v_existing_fechamento RECORD;
  v_primeiro_pedido_id BIGINT := NULL;
  v_count_pedidos INT := 0;
  v_cliente_id UUID := NULL;
  v_ja_debitado BOOLEAN := false;
BEGIN
  -- 1. Verificação de Idempotência
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, troco, total_conta INTO v_existing_fechamento
    FROM public.fechamentos
    WHERE idempotency_key = p_idempotency_key;

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
    SELECT id, total, cliente_id
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    FOR UPDATE
  LOOP
    v_count_pedidos := v_count_pedidos + 1;
    v_pedido_ids := array_append(v_pedido_ids, v_pedido.id);
    v_subtotal := v_subtotal + COALESCE(v_pedido.total, 0);
    IF v_primeiro_pedido_id IS NULL THEN
      v_primeiro_pedido_id := v_pedido.id;
    END IF;
    IF v_cliente_id IS NULL AND v_pedido.cliente_id IS NOT NULL THEN
      v_cliente_id := v_pedido.cliente_id;
    END IF;
  END LOOP;

  IF v_count_pedidos = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  -- 2b. Deduz pagamentos parciais já realizados na sessão aberta da mesa
  SELECT COALESCE(SUM(fp.valor), 0) INTO v_ja_pago_parcial
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_subtotal_restante := GREATEST(0, v_subtotal - v_ja_pago_parcial);

  IF p_desconto_manual > v_subtotal_restante THEN
    RAISE EXCEPTION 'O desconto (R$ %) não pode ser maior que o subtotal da mesa (R$ %).', p_desconto_manual, v_subtotal_restante;
  END IF;

  -- 3. Calcula total com taxa de serviço e desconto manual sobre o saldo restante
  v_total_a_pagar := ROUND(v_subtotal_restante + COALESCE(p_taxa_servico, 0) - COALESCE(p_desconto_manual, 0), 2);
  IF v_total_a_pagar < 0 THEN
    v_total_a_pagar := 0;
  END IF;

  -- 4. Valida soma dos pagamentos
  IF p_pagamentos IS NOT NULL AND jsonb_typeof(p_pagamentos) = 'array' THEN
    FOR v_pagamento IN
      SELECT (elem->>'valor')::NUMERIC AS valor, (elem->>'forma') AS forma
      FROM jsonb_array_elements(p_pagamentos) AS elem
    LOOP
      v_total_pago := v_total_pago + COALESCE(v_pagamento.valor, 0);
    END LOOP;
  END IF;

  IF v_total_a_pagar > 0 AND ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 5. Cria registro de fechamento em public.fechamentos
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, desconto_manual, desconto_motivo, desconto_por,
    idempotency_key, cupom_codigo, campanha_id, parcial
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), COALESCE(p_desconto_manual, 0), p_desconto_motivo, CASE WHEN p_desconto_manual > 0 THEN v_uid ELSE NULL END,
    p_idempotency_key, p_cupom_codigo, p_campanha_id, false
  ) RETURNING id INTO v_fechamento_id;

  -- 6. Inserir formas de pagamento e garantir débito atômico na Conta do Cliente
  IF p_pagamentos IS NOT NULL AND jsonb_typeof(p_pagamentos) = 'array' THEN
    FOR v_pagamento IN
      SELECT (elem->>'valor')::NUMERIC(10,2) AS valor, (elem->>'forma') AS forma, (elem->>'cliente_id')::UUID AS pag_cliente_id
      FROM jsonb_array_elements(p_pagamentos) AS elem
    LOOP
      INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
      VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);

      IF v_pagamento.forma = 'conta_cliente' AND COALESCE(v_pagamento.valor, 0) > 0 THEN
        v_cliente_id := COALESCE(v_pagamento.pag_cliente_id, v_cliente_id);
        IF v_cliente_id IS NULL THEN
          RAISE EXCEPTION 'Mesa sem cliente vinculado para pagamento via Conta do Cliente.';
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.cliente_conta_movimentos m
          WHERE m.cliente_id = v_cliente_id
            AND m.tipo = 'consumo'
            AND ABS(m.valor) = ABS(v_pagamento.valor)
            AND (
              (v_primeiro_pedido_id IS NOT NULL AND m.pedido_id = v_primeiro_pedido_id)
              OR m.created_at >= (now() - interval '10 minutes')
            )
        ) INTO v_ja_debitado;

        IF NOT v_ja_debitado THEN
          PERFORM public.lancar_movimento_conta(
            p_cliente_id := v_cliente_id,
            p_tipo := 'consumo',
            p_valor := ABS(v_pagamento.valor),
            p_pedido_id := v_primeiro_pedido_id,
            p_fechamento_id := NULL,
            p_forma_pagamento := 'conta_cliente',
            p_motivo := 'Fechamento Mesa ' || p_mesa_codigo
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 7. Atualiza pedidos da mesa para 'pago', grava pago_em e vincula cupom/campanha
  FOR v_pedido IN
    SELECT id FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
  LOOP
    UPDATE public.pedidos
    SET
      status_pagamento = 'pago',
      pago_em = COALESCE(pago_em, now()),
      cupom_codigo = COALESCE(p_cupom_codigo, cupom_codigo),
      campanha_id = COALESCE(p_campanha_id, campanha_id),
      updated_at = now()
    WHERE id = v_pedido.id;

    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_pedido.id);
  END LOOP;

  -- 7b. Marcar todos os itens como integralmente quitados
  UPDATE public.pedido_itens
  SET quantidade_paga = quantidade
  WHERE pedido_id = ANY(v_pedido_ids)
    AND quantidade_paga < quantidade;

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

-- 6. RPC obter_resumo_conta_mesa
CREATE OR REPLACE FUNCTION public.obter_resumo_conta_mesa(p_mesa_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_subtotal NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_saldo_restante NUMERIC(10,2) := 0;
  v_itens JSONB := '[]'::jsonb;
  v_pagamentos JSONB := '[]'::jsonb;
BEGIN
  -- Identifica pedidos ativos
  SELECT COALESCE(array_agg(id), ARRAY[]::BIGINT[]), COALESCE(SUM(total), 0)
  INTO v_pedido_ids, v_subtotal
  FROM public.pedidos
  WHERE mesa_codigo = p_mesa_codigo
    AND status <> 'cancelado'
    AND (status_pagamento IS NULL OR status_pagamento != 'pago');

  IF array_length(v_pedido_ids, 1) IS NULL OR array_length(v_pedido_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'mesa_codigo', p_mesa_codigo,
      'pedidos_count', 0,
      'subtotal_geral', 0,
      'ja_pago', 0,
      'saldo_restante', 0,
      'itens', '[]'::jsonb,
      'pagamentos_parciais', '[]'::jsonb
    );
  END IF;

  -- Já pago em fechamentos parciais vinculados a estes pedidos
  SELECT COALESCE(SUM(fp.valor), 0) INTO v_ja_pago_parcial
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_saldo_restante := GREATEST(0, v_subtotal - v_ja_pago_parcial);

  -- Lista de itens
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
      'pedido_id', pi.pedido_id,
      'produto_id', pi.produto_id,
      'nome_produto', pi.nome_produto,
      'quantidade', pi.quantidade,
      'quantidade_paga', COALESCE(pi.quantidade_paga, 0),
      'quantidade_pendente', GREATEST(0, pi.quantidade - COALESCE(pi.quantidade_paga, 0)),
      'preco_unitario', pi.preco_unitario,
      'subtotal', ROUND(pi.quantidade * pi.preco_unitario, 2),
      'saldo_restante', ROUND(GREATEST(0, pi.quantidade - COALESCE(pi.quantidade_paga, 0)) * pi.preco_unitario, 2),
      'cancelado', pi.cancelado
    ) ORDER BY pi.id
  ), '[]'::jsonb) INTO v_itens
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = ANY(v_pedido_ids)
    AND pi.cancelado = false;

  -- Lista de pagamentos parciais
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fechamento_id', f.id,
      'created_at', f.created_at,
      'total', f.total_conta,
      'taxa_servico', f.taxa_servico,
      'formas', (
        SELECT jsonb_agg(jsonb_build_object('forma', fp.forma, 'valor', fp.valor))
        FROM public.fechamento_pagamentos fp
        WHERE fp.fechamento_id = f.id
      )
    ) ORDER BY f.created_at
  ), '[]'::jsonb) INTO v_pagamentos
  FROM public.fechamentos f
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  RETURN jsonb_build_object(
    'mesa_codigo', p_mesa_codigo,
    'pedidos_count', array_length(v_pedido_ids, 1),
    'subtotal_geral', v_subtotal,
    'ja_pago', v_ja_pago_parcial,
    'saldo_restante', v_saldo_restante,
    'itens', v_itens,
    'pagamentos_parciais', v_pagamentos
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obter_resumo_conta_mesa(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.obter_resumo_conta_mesa(TEXT) TO authenticated;

-- 7. Registrar versão da migration
INSERT INTO public.app_migrations (versao, arquivo, aplicada_em, aplicada_por)
VALUES ('112', 'migration_caf_000112_fechamento_parcial_mesa.sql', now(), 'antigravity')
ON CONFLICT (versao) DO NOTHING;
