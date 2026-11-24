-- ==============================================================================
-- Migration CAF-000129: Saldo da mesa com fonte única e débitos/créditos do cliente (fiado e cashback) atômicos e idempotentes
-- Data: 2026-11-24
-- Responsabilidades:
-- 1. Gravar valor_abatido em public.fechamentos e backfill nos registros legados (RF01, RNF02 / CA01, CA02, CA03)
-- 2. View public.v_saldo_mesa e RPC public.obter_resumo_conta_mesa como fonte única de verdade (RF02 / CA01, CA02, CA04)
-- 3. Vincular débitos fiado ao fechamento via fechamento_mesa_id em public.cliente_conta_movimentos (RF04 / CA06, CA07)
-- 4. Exclusão da chamada client-side a lancarMovimento e da heurística frágil de 10 minutos (RF03, RF04 / CA05, CA06, CA07)
-- 5. Blindagem atômica de cashback via índice único e ON CONFLICT DO NOTHING (RF06 / CA09, CA10, CA11)
-- 6. Crédito atômico de cashback na mesma transação de fechar_conta_mesa (RF07 / CA12)
-- ==============================================================================

-- 1. Schema Updates: fechamentos.valor_abatido e cliente_conta_movimentos.fechamento_mesa_id
ALTER TABLE public.fechamentos
ADD COLUMN IF NOT EXISTS valor_abatido NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.cliente_conta_movimentos
ADD COLUMN IF NOT EXISTS fechamento_mesa_id UUID REFERENCES public.fechamentos(id) ON DELETE CASCADE;

-- Backfill de valor_abatido em fechamentos legados (RNF02)
UPDATE public.fechamentos
SET valor_abatido = GREATEST(0, total_conta - COALESCE(taxa_servico, 0))
WHERE valor_abatido = 0 OR valor_abatido IS NULL;

-- Relatório de diagnóstico pré-aplicação de mesas abertas com parciais (RNF02)
DO $$
DECLARE
  v_rec RECORD;
  v_count INT := 0;
BEGIN
  FOR v_rec IN
    SELECT p.mesa_codigo, COUNT(p.id) as pedidos_count, COALESCE(SUM(p.total), 0) as total
    FROM public.pedidos p
    WHERE p.status <> 'cancelado'
      AND (p.status_pagamento IS NULL OR p.status_pagamento != 'pago')
      AND p.mesa_codigo IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.fechamento_pedidos fp
        JOIN public.fechamentos f ON f.id = fp.fechamento_id
        WHERE fp.pedido_id = p.id AND f.parcial = true
      )
    GROUP BY p.mesa_codigo
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '[CAF-000129] Mesa aberta com parcial detectada: % (pedidos: %, total: %)',
      v_rec.mesa_codigo, v_rec.pedidos_count, v_rec.total;
  END LOOP;
  IF v_count = 0 THEN
    RAISE NOTICE '[CAF-000129] Nenhuma mesa aberta com parcial em andamento.';
  END IF;
END $$;

-- 2. Índices únicos parciais para idempotência e concorrência estrita (RF04, RF06 / CA06, CA11)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_conta_mov_fechamento_consumo
ON public.cliente_conta_movimentos (cliente_id, fechamento_mesa_id)
WHERE tipo = 'consumo' AND fechamento_mesa_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_conta_mov_cashback_pedido
ON public.cliente_conta_movimentos (pedido_id)
WHERE tipo = 'deposito' AND forma_pagamento = 'cashback';

-- 3. Atualização de public.lancar_movimento_conta com suporte a p_fechamento_mesa_id
DROP FUNCTION IF EXISTS public.lancar_movimento_conta(UUID, TEXT, NUMERIC, BIGINT, BIGINT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.lancar_movimento_conta(UUID, TEXT, NUMERIC, BIGINT, BIGINT, TEXT, TEXT, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.lancar_movimento_conta(
  p_cliente_id UUID,
  p_tipo TEXT,
  p_valor NUMERIC,
  p_pedido_id BIGINT DEFAULT NULL,
  p_fechamento_id BIGINT DEFAULT NULL,
  p_forma_pagamento TEXT DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_bypass_limite BOOLEAN DEFAULT false,
  p_fechamento_mesa_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_cliente RECORD;
  v_saldo_atual NUMERIC(10,2) := 0;
  v_novo_saldo NUMERIC(10,2) := 0;
  v_mov_id BIGINT;
  v_user_nome TEXT;
  v_valor_mov NUMERIC(10,2);
BEGIN
  v_role := public.exigir_cargo('barista', 'admin');

  IF p_valor <= 0 AND p_tipo != 'ajuste' THEN
    RAISE EXCEPTION 'O valor do movimento deve ser maior que zero';
  END IF;

  -- Bloquear linha do cliente para concorrência
  SELECT * INTO v_cliente 
  FROM public.clientes 
  WHERE id = p_cliente_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF NOT v_cliente.conta_habilitada THEN
    RAISE EXCEPTION 'A conta corrente deste cliente não está habilitada';
  END IF;

  -- Calcular sinal:
  -- consumo: débito (valor negativo)
  -- pagamento, deposito, estorno: crédito (valor positivo)
  -- ajuste: usa o sinal fornecido
  IF p_tipo = 'consumo' THEN
    v_valor_mov := -ABS(p_valor);
  ELSIF p_tipo IN ('pagamento', 'deposito', 'estorno') THEN
    v_valor_mov := ABS(p_valor);
  ELSE
    v_valor_mov := p_valor;
  END IF;

  -- Saldo atual
  SELECT COALESCE(SUM(valor), 0.00) INTO v_saldo_atual
  FROM public.cliente_conta_movimentos
  WHERE cliente_id = p_cliente_id;

  v_novo_saldo := v_saldo_atual + v_valor_mov;

  -- Se o novo saldo for menor que o limite negativo permitido (-limite_credito)
  IF v_novo_saldo < -v_cliente.limite_credito THEN
    IF p_bypass_limite THEN
      IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'Acesso negado: apenas administradores podem ignorar o limite de crédito'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Limite de crédito excedido. Saldo atual: R$ %, Limite: R$ %, Tentativa: R$ %', 
        v_saldo_atual, v_cliente.limite_credito, ABS(p_valor);
    END IF;
  END IF;

  -- Identificar usuário operador
  SELECT COALESCE(raw_user_meta_data->>'nome', email) INTO v_user_nome
  FROM auth.users
  WHERE id = auth.uid();

  INSERT INTO public.cliente_conta_movimentos (
    cliente_id, tipo, valor, pedido_id, fechamento_id, fechamento_mesa_id, forma_pagamento, motivo, criado_por, criado_por_nome
  ) VALUES (
    p_cliente_id, p_tipo, v_valor_mov, p_pedido_id, p_fechamento_id, p_fechamento_mesa_id, p_forma_pagamento, p_motivo, auth.uid(), v_user_nome
  ) RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'movimento_id', v_mov_id,
    'saldo_anterior', v_saldo_atual,
    'novo_saldo', v_novo_saldo,
    'limite_disponivel', (v_cliente.limite_credito + v_novo_saldo)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lancar_movimento_conta(UUID, TEXT, NUMERIC, BIGINT, BIGINT, TEXT, TEXT, BOOLEAN, UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.lancar_movimento_conta(UUID, TEXT, NUMERIC, BIGINT, BIGINT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

-- 4. View public.v_saldo_mesa: Fonte única de saldo das mesas (RF02 / CA01, CA02, CA04)
CREATE OR REPLACE VIEW public.v_saldo_mesa AS
WITH pedidos_resumo AS (
  SELECT
    p.mesa_codigo,
    COUNT(p.id)::INT AS pedidos_count,
    COALESCE(SUM(p.total), 0)::NUMERIC(10,2) AS subtotal_geral,
    array_agg(p.id) AS pedido_ids
  FROM public.pedidos p
  WHERE p.status <> 'cancelado'
    AND (p.status_pagamento IS NULL OR p.status_pagamento != 'pago')
    AND p.mesa_codigo IS NOT NULL
  GROUP BY p.mesa_codigo
),
fechamentos_distintos AS (
  SELECT DISTINCT
    pr.mesa_codigo,
    f.id,
    f.valor_abatido
  FROM pedidos_resumo pr
  JOIN public.fechamento_pedidos fp ON fp.pedido_id = ANY(pr.pedido_ids)
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
),
parciais_totais AS (
  SELECT
    mesa_codigo,
    COALESCE(SUM(valor_abatido), 0)::NUMERIC(10,2) AS ja_pago
  FROM fechamentos_distintos
  GROUP BY mesa_codigo
)
SELECT
  pr.mesa_codigo,
  pr.pedidos_count,
  pr.subtotal_geral,
  COALESCE(pt.ja_pago, 0)::NUMERIC(10,2) AS ja_pago,
  GREATEST(0, pr.subtotal_geral - COALESCE(pt.ja_pago, 0))::NUMERIC(10,2) AS saldo_restante
FROM pedidos_resumo pr
LEFT JOIN parciais_totais pt ON pt.mesa_codigo = pr.mesa_codigo;

GRANT SELECT ON public.v_saldo_mesa TO authenticated, service_role;

-- 5. RPC public.obter_resumo_conta_mesa (RF01, RF02 / CA01, CA02, CA03, CA04)
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
  -- Identifica pedidos ativos da mesa
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
      'subtotal_geral', 0.00,
      'ja_pago', 0.00,
      'saldo_restante', 0.00,
      'itens', '[]'::jsonb,
      'pagamentos_parciais', '[]'::jsonb
    );
  END IF;

  -- Já pago em fechamentos parciais vinculado a estes pedidos (baseado em valor_abatido do principal)
  SELECT COALESCE(SUM(f.valor_abatido), 0) INTO v_ja_pago_parcial
  FROM public.fechamentos f
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
      'valor_abatido', f.valor_abatido,
      'taxa_servico', f.taxa_servico,
      'troco', f.troco,
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
GRANT EXECUTE ON FUNCTION public.obter_resumo_conta_mesa(TEXT) TO authenticated, service_role;

-- 6. RPC public.processar_cashback_pedido blindada (RF06 / CA09, CA10, CA11)
CREATE OR REPLACE FUNCTION public.processar_cashback_pedido(
  p_pedido_id BIGINT,
  p_cliente_id UUID DEFAULT NULL,
  p_valor_elegivel NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_pedido TEXT;
  v_status_pagamento TEXT;
  v_cliente_real UUID;
  v_valor_base NUMERIC(10,2) := 0;
  v_percentual NUMERIC(5,2);
  v_minimo NUMERIC(10,2);
  v_cashback NUMERIC(10,2);
  v_novo_saldo NUMERIC(10,2);
  v_ativo BOOLEAN;
  v_mov_id BIGINT;
BEGIN
  PERFORM public.exigir_cargo_ou_permissao('pdv.vender', 'barista', 'admin');

  IF p_pedido_id IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'p_pedido_id é obrigatório.');
  END IF;

  -- 1. Verifica se cashback está ativo
  SELECT COALESCE((valor)::text::boolean, false)
  INTO v_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_ativo';

  IF NOT COALESCE(v_ativo, false) THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback desativado no sistema.');
  END IF;

  -- 2. Verifica pedido existente e seus status
  SELECT status, status_pagamento, cliente_id
  INTO v_status_pedido, v_status_pagamento, v_cliente_real
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Pedido não encontrado.');
  END IF;

  IF v_status_pedido = 'cancelado' THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Pedido cancelado não pode receber cashback.');
  END IF;

  -- CA10 / RF06: Exige status_pagamento = 'pago'
  IF v_status_pagamento IS NULL OR v_status_pagamento != 'pago' THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Pedido ainda não pago.');
  END IF;

  IF v_cliente_real IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Pedido sem cliente vinculado.');
  END IF;

  -- CA09 / RF06: O cliente é estritamente o do pedido. Se p_cliente_id foi fornecido e diverge, rejeita.
  IF p_cliente_id IS NOT NULL AND p_cliente_id <> v_cliente_real THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cliente informado diverge do cliente do pedido.');
  END IF;

  p_cliente_id := v_cliente_real;

  -- 3. Cálculo da base a partir dos pagamentos registrados no banco
  -- 1º: Pagamentos em fechamento_pagamentos
  SELECT COALESCE(SUM(
    GREATEST(0, fp.valor - CASE WHEN fp.forma = 'dinheiro' THEN COALESCE(f.troco, 0) ELSE 0 END)
  ), 0.00)
  INTO v_valor_base
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  JOIN public.fechamento_pedidos fped ON fped.fechamento_id = f.id
  WHERE fped.pedido_id = p_pedido_id
    AND LOWER(fp.forma) IN ('pix', 'dinheiro', 'cartao', 'cartao_credito', 'cartao_debito');

  -- 2º: Se não encontrou em fechamento_pagamentos (ex: pedido direto pago em balcão)
  IF v_valor_base <= 0 THEN
    SELECT COALESCE(
      CASE 
        WHEN LOWER(COALESCE(p.forma_pagamento, '')) IN ('pix', 'dinheiro', 'cartao', 'cartao_credito', 'cartao_debito')
        THEN p.total
        ELSE 0
      END,
      0.00
    )
    INTO v_valor_base
    FROM public.pedidos p
    WHERE p.id = p_pedido_id;
  END IF;

  -- RF06: Sem fallback por valor livre (p_valor_elegivel é ignorado)

  -- Obtém percentual e valor mínimo
  SELECT COALESCE((valor)::text::numeric, 5.0)
  INTO v_percentual
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_percentual';

  SELECT COALESCE((valor)::text::numeric, 10.0)
  INTO v_minimo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_valor_minimo';

  IF v_valor_base < v_minimo THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor abaixo do mínimo para cashback.');
  END IF;

  v_cashback := ROUND((v_valor_base * v_percentual) / 100.0, 2);

  IF v_cashback <= 0 THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor de cashback nulo.');
  END IF;

  -- 4. Inserção atômica com ON CONFLICT DO NOTHING (RF06 / CA11)
  INSERT INTO public.cliente_conta_movimentos (
    cliente_id,
    pedido_id,
    tipo,
    valor,
    motivo,
    forma_pagamento,
    created_at
  ) VALUES (
    p_cliente_id,
    p_pedido_id,
    'deposito',
    v_cashback,
    format('Cashback automático (%s%%) — Pedido #%s', v_percentual, p_pedido_id),
    'cashback',
    now()
  )
  ON CONFLICT (pedido_id) WHERE tipo = 'deposito' AND forma_pagamento = 'cashback'
  DO NOTHING
  RETURNING id INTO v_mov_id;

  IF v_mov_id IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback já creditado para este pedido.');
  END IF;

  -- Atualiza saldo_conta em clientes
  UPDATE public.clientes
  SET saldo_conta = COALESCE(saldo_conta, 0) + v_cashback
  WHERE id = p_cliente_id;

  SELECT COALESCE(SUM(valor), 0.00)
  INTO v_novo_saldo
  FROM public.cliente_conta_movimentos
  WHERE cliente_id = p_cliente_id;

  RETURN jsonb_build_object(
    'creditado', true,
    'valor_cashback', v_cashback,
    'percentual', v_percentual,
    'novo_saldo', v_novo_saldo
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) TO authenticated, service_role;

-- 7. RPC public.registrar_pagamento_parcial_mesa atualizada com valor_abatido e vínculo atômico de fiado
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

  -- 2. Permissões (NULL-safe)
  v_user_role := public.exigir_cargo_ou_permissao('pdv.fechar_conta', 'barista', 'admin');

  -- RF01: Sinais e limites
  IF p_taxa_servico IS NOT NULL AND p_taxa_servico < 0 THEN
    RAISE EXCEPTION 'Taxa de serviço não pode ser negativa.';
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

  -- 4. Somar pagamentos parciais anteriores desta mesa aberta usando valor_abatido (RF01 / CA01, CA02, CA03)
  SELECT COALESCE(SUM(f.valor_abatido), 0) INTO v_ja_pago_parcial
  FROM public.fechamentos f
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_saldo_restante := GREATEST(0, v_subtotal_geral - v_ja_pago_parcial);

  -- 5. Calcular valor principal a abater (itens ou valor livre)
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
    IF p_valor_abatimento IS NULL OR p_valor_abatimento <= 0 THEN
      RAISE EXCEPTION 'Valor a pagar deve ser maior que zero.';
    END IF;
    v_valor_esperado := ROUND(p_valor_abatimento, 2);
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
    IF v_pagamento.valor IS NULL OR v_pagamento.valor <= 0 THEN
      RAISE EXCEPTION 'Valor de pagamento deve ser maior que zero.';
    END IF;

    IF v_pagamento.forma NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida: %. Formas aceitas: pix, dinheiro, cartao_credito, cartao_debito, outros, conta_cliente.', v_pagamento.forma;
    END IF;

    v_total_pago := v_total_pago + v_pagamento.valor;
  END LOOP;

  IF ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 7. Criar registro de fechamento parcial gravando valor_abatido (RF01 / CA01, CA02, CA03)
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, parcial, idempotency_key, valor_abatido
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), true, p_idempotency_key, v_valor_esperado
  ) RETURNING id INTO v_fechamento_id;

  -- 8. Inserir pagamentos e debitar conta do cliente vinculado a fechamento_mesa_id (RF03, RF04 / CA05, CA06, CA07)
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

      -- Verificação atômica por fechamento_mesa_id (sem heurística temporal de 10 minutos)
      SELECT EXISTS (
        SELECT 1
        FROM public.cliente_conta_movimentos m
        WHERE m.cliente_id = v_cliente_id
          AND m.fechamento_mesa_id = v_fechamento_id
          AND m.tipo = 'consumo'
      ) INTO v_ja_debitado;

      IF NOT v_ja_debitado THEN
        PERFORM public.lancar_movimento_conta(
          p_cliente_id := v_cliente_id,
          p_tipo := 'consumo',
          p_valor := ABS(v_pagamento.valor),
          p_pedido_id := v_primeiro_pedido_id,
          p_fechamento_id := NULL,
          p_forma_pagamento := 'conta_cliente',
          p_motivo := 'Pagamento Parcial Mesa ' || p_mesa_codigo,
          p_bypass_limite := false,
          p_fechamento_mesa_id := v_fechamento_id
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
    'total_pago', v_total_a_pagar,
    'saldo_restante', v_novo_saldo,
    'troco', v_troco,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pagamento_parcial_mesa(TEXT, JSONB, JSONB, NUMERIC, NUMERIC, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_parcial_mesa(TEXT, JSONB, JSONB, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

-- 8. RPC public.fechar_conta_mesa atualizada com valor_abatido, débito atômico de fiado e cashback integrado
CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_desconto_manual NUMERIC DEFAULT 0,
  p_desconto_motivo TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_cupom_codigo TEXT DEFAULT NULL,
  p_campanha_id BIGINT DEFAULT NULL,
  p_autorizacao_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_existing_fechamento RECORD;
  v_pedido RECORD;
  v_count_pedidos INT := 0;
  v_subtotal NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_subtotal_restante NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_desconto_final NUMERIC(10,2) := 0;
  v_desconto_por UUID := NULL;
  v_pagamento RECORD;
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_primeiro_pedido_id BIGINT := NULL;
  v_cliente_id UUID := NULL;
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_campanha RECORD;
  v_tem_permissao_desconto BOOLEAN := false;
  v_token RECORD;
  v_ja_debitado BOOLEAN := false;
  v_cashback_result JSONB := NULL;
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
        'idempotent', true,
        'cashback', NULL
      );
    END IF;
  END IF;

  -- 2. Validação de Role e Permissões (NULL-safe)
  v_user_role := public.exigir_cargo_ou_permissao('pdv.fechar_conta', 'barista', 'admin');

  -- RF01 / CA01: Sinais monetários válidos
  IF p_taxa_servico IS NOT NULL AND p_taxa_servico < 0 THEN
    RAISE EXCEPTION 'Taxa de serviço não pode ser negativa.';
  END IF;

  IF p_desconto_manual IS NOT NULL AND p_desconto_manual < 0 THEN
    RAISE EXCEPTION 'Desconto manual não pode ser negativo.';
  END IF;

  -- 3. Calcula subtotal apenas dos pedidos ativos (não cancelados e não pagos) da mesa
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

  -- 3b. Deduz pagamentos parciais já realizados na sessão aberta da mesa usando valor_abatido (RF01 / CA01, CA02, CA03)
  SELECT COALESCE(SUM(f.valor_abatido), 0) INTO v_ja_pago_parcial
  FROM public.fechamentos f
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_subtotal_restante := GREATEST(0, v_subtotal - v_ja_pago_parcial);

  -- RF02 / CA04: Teto da taxa de serviço (20% do subtotal restante)
  IF COALESCE(p_taxa_servico, 0) > (ROUND(v_subtotal_restante * 0.20, 2) + 0.001) THEN
    RAISE EXCEPTION 'Taxa de serviço não pode ultrapassar 20%% do subtotal restante.';
  END IF;

  -- Tratamento de Cupom / Campanha
  IF p_campanha_id IS NOT NULL OR (p_cupom_codigo IS NOT NULL AND length(trim(p_cupom_codigo)) > 0) THEN
    SELECT id, nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa
    INTO v_campanha
    FROM public.campanhas
    WHERE (p_campanha_id IS NOT NULL AND id = p_campanha_id)
       OR (p_campanha_id IS NULL AND UPPER(TRIM(cupom_codigo)) = UPPER(TRIM(p_cupom_codigo)))
    ORDER BY id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cupom inválido ou não encontrado.';
    END IF;

    IF NOT COALESCE(v_campanha.ativa, true) THEN
      RAISE EXCEPTION 'Cupom inativo ou fora da validade.';
    END IF;

    IF v_subtotal_restante < COALESCE(v_campanha.valor_minimo_pedido, 0) THEN
      RAISE EXCEPTION 'Subtotal da mesa (R$ %) é inferior ao pedido mínimo do cupom (R$ %).',
        v_subtotal_restante, v_campanha.valor_minimo_pedido;
    END IF;

    IF LOWER(COALESCE(v_campanha.tipo_desconto, 'percentual')) IN ('percentual', 'percent') THEN
      v_desconto_final := ROUND((v_subtotal_restante * COALESCE(v_campanha.valor_desconto, 0)) / 100.0, 2);
    ELSE
      v_desconto_final := COALESCE(v_campanha.valor_desconto, 0);
    END IF;

    IF v_desconto_final > v_subtotal_restante THEN
      v_desconto_final := v_subtotal_restante;
    END IF;

    p_campanha_id := v_campanha.id;
    p_cupom_codigo := v_campanha.cupom_codigo;
    v_desconto_por := NULL;

  ELSIF COALESCE(p_desconto_manual, 0) > 0 THEN
    IF p_desconto_motivo IS NULL OR length(trim(p_desconto_motivo)) = 0 THEN
      RAISE EXCEPTION 'Motivo do desconto é obrigatório.';
    END IF;

    IF p_desconto_manual > v_subtotal_restante THEN
      RAISE EXCEPTION 'O desconto (R$ %) não pode ser maior que o subtotal da mesa (R$ %).', p_desconto_manual, v_subtotal_restante;
    END IF;

    v_tem_permissao_desconto := public.tem_permissao('pdv.desconto', v_uid);

    IF NOT v_tem_permissao_desconto THEN
      IF p_autorizacao_id IS NULL THEN
        RAISE EXCEPTION 'Usuário sem permissão para aplicar desconto manual.';
      END IF;

      SELECT * INTO v_token
      FROM public.autorizacoes_pin_tokens
      WHERE id = p_autorizacao_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Autorização por PIN não encontrada ou inválida.';
      END IF;

      IF v_token.usado THEN
        RAISE EXCEPTION 'Autorização por PIN já utilizada.';
      END IF;

      IF v_token.expira_em < now() THEN
        RAISE EXCEPTION 'Autorização por PIN expirada.';
      END IF;

      IF v_token.permissao <> 'pdv.desconto' THEN
        RAISE EXCEPTION 'Autorização por PIN não confere permissão de desconto.';
      END IF;

      IF v_token.mesa_codigo IS NOT NULL AND v_token.mesa_codigo <> p_mesa_codigo THEN
        RAISE EXCEPTION 'Autorização por PIN é para outra mesa (% <> %).', v_token.mesa_codigo, p_mesa_codigo;
      END IF;

      IF v_token.valor_limite IS NOT NULL AND p_desconto_manual > (v_token.valor_limite + 0.001) THEN
        RAISE EXCEPTION 'Desconto solicitado (R$ %) excede o valor autorizado pelo supervisor (R$ %).', p_desconto_manual, v_token.valor_limite;
      END IF;

      UPDATE public.autorizacoes_pin_tokens
      SET usado = true, usado_em = now()
      WHERE id = p_autorizacao_id;

      v_desconto_por := v_token.autorizador_id;
    ELSE
      v_desconto_por := v_uid;
    END IF;

    v_desconto_final := p_desconto_manual;
  END IF;

  -- 4. Calcula total com taxa de serviço e desconto sobre o saldo restante
  v_total_a_pagar := ROUND(v_subtotal_restante + COALESCE(p_taxa_servico, 0) - v_desconto_final, 2);
  IF v_total_a_pagar < 0 THEN
    v_total_a_pagar := 0;
  END IF;

  -- 5. Validação dos pagamentos recebidos
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    IF v_total_a_pagar > 0 THEN
      RAISE EXCEPTION 'Nenhuma forma de pagamento informada.';
    END IF;
  ELSE
    FOR v_pagamento IN
      SELECT (elem->>'valor')::NUMERIC AS valor, (elem->>'forma') AS forma
      FROM jsonb_array_elements(p_pagamentos) AS elem
    LOOP
      IF v_pagamento.valor IS NULL OR v_pagamento.valor <= 0 THEN
        RAISE EXCEPTION 'Valor de pagamento deve ser maior que zero.';
      END IF;

      IF v_pagamento.forma NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente') THEN
        RAISE EXCEPTION 'Forma de pagamento inválida: %. Formas aceitas: pix, dinheiro, cartao_credito, cartao_debito, outros, conta_cliente.', v_pagamento.forma;
      END IF;

      v_total_pago := v_total_pago + v_pagamento.valor;
    END LOOP;
  END IF;

  IF v_total_a_pagar > 0 AND ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 6. Cria registro de fechamento em public.fechamentos gravando valor_abatido (RF01 / CA01, CA02, CA03)
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, desconto_manual, desconto_motivo, desconto_por,
    idempotency_key, cupom_codigo, campanha_id, parcial, valor_abatido
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), v_desconto_final, p_desconto_motivo, v_desconto_por,
    p_idempotency_key, p_cupom_codigo, p_campanha_id, false, v_subtotal_restante
  ) RETURNING id INTO v_fechamento_id;

  -- 7. Inserir formas de pagamento e debitar conta do cliente vinculado a fechamento_mesa_id (RF03, RF04 / CA05, CA06, CA07)
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

        -- Verificação atômica por fechamento_mesa_id (sem heurística temporal de 10 minutos)
        SELECT EXISTS (
          SELECT 1
          FROM public.cliente_conta_movimentos m
          WHERE m.cliente_id = v_cliente_id
            AND m.fechamento_mesa_id = v_fechamento_id
            AND m.tipo = 'consumo'
        ) INTO v_ja_debitado;

        IF NOT v_ja_debitado THEN
          PERFORM public.lancar_movimento_conta(
            p_cliente_id := v_cliente_id,
            p_tipo := 'consumo',
            p_valor := ABS(v_pagamento.valor),
            p_pedido_id := v_primeiro_pedido_id,
            p_fechamento_id := NULL,
            p_forma_pagamento := 'conta_cliente',
            p_motivo := 'Fechamento Mesa ' || p_mesa_codigo,
            p_bypass_limite := false,
            p_fechamento_mesa_id := v_fechamento_id
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 8. Atualiza pedidos da mesa para 'pago' e vincula cupom
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

  -- 8b. Marcar todos os itens como integralmente quitados
  UPDATE public.pedido_itens
  SET quantidade_paga = quantidade
  WHERE pedido_id = ANY(v_pedido_ids)
    AND quantidade_paga < quantidade;

  -- 9. Registrar uso de cupom dentro da mesma transação
  IF p_campanha_id IS NOT NULL AND v_primeiro_pedido_id IS NOT NULL THEN
    PERFORM public.registrar_uso_cupom(p_campanha_id, v_primeiro_pedido_id);
  END IF;

  -- 10. RF07 / CA12: Crédito atômico de cashback na mesma transação se cliente vinculado e cashback ativo
  IF v_cliente_id IS NOT NULL AND v_primeiro_pedido_id IS NOT NULL THEN
    BEGIN
      SELECT public.processar_cashback_pedido(
        p_pedido_id := v_primeiro_pedido_id,
        p_cliente_id := v_cliente_id
      ) INTO v_cashback_result;
    EXCEPTION WHEN OTHERS THEN
      v_cashback_result := jsonb_build_object('creditado', false, 'motivo', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'troco', v_troco,
    'total', v_total_a_pagar,
    'idempotent', false,
    'cashback', v_cashback_result
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT, UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT, UUID) TO authenticated, service_role;
