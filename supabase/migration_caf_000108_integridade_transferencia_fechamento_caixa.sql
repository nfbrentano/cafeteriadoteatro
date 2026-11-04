BEGIN;

-- ==============================================================================
-- CAF-000108 — Correção de Integridade Operacional:
-- 1. Transferência de Mesa incluindo pedidos já entregues e ainda não pagos
-- 2. Fechamento Atômico/Idempotente com Conta do Cliente e suporte a cortesia R$ 0
-- 3. Coluna pago_em em pedidos e corte temporal de pagamento no Caixa
-- ==============================================================================

-- 1. Coluna pago_em em public.pedidos + Trigger automático
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ;

UPDATE public.pedidos
SET pago_em = COALESCE(updated_at, created_at)
WHERE status_pagamento = 'pago'
  AND pago_em IS NULL;

CREATE OR REPLACE FUNCTION public.fn_pedidos_set_pago_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_pagamento = 'pago' AND (TG_OP = 'INSERT' OR OLD.status_pagamento IS DISTINCT FROM 'pago' OR NEW.pago_em IS NULL) THEN
    NEW.pago_em := COALESCE(NEW.pago_em, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_set_pago_em ON public.pedidos;
CREATE TRIGGER trg_pedidos_set_pago_em
  BEFORE INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pedidos_set_pago_em();

-- 2. Transferência de mesa completa (inclui pedidos já entregues na mesa porém ainda não pagos)
CREATE OR REPLACE FUNCTION public.transferir_mesa(
    p_origem TEXT,
    p_destino TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    IF NOT (public.tem_permissao('pdv.transferir_mesa', auth.uid()) OR public.get_user_role() IN ('admin', 'barista')) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não possui permissão para transferir mesas.';
    END IF;

    IF p_origem IS NULL OR p_destino IS NULL OR TRIM(p_origem) = '' OR TRIM(p_destino) = '' THEN
        RAISE EXCEPTION 'Mesa de origem e mesa de destino são obrigatórias.';
    END IF;

    IF TRIM(p_origem) = TRIM(p_destino) THEN
        RAISE EXCEPTION 'Mesa de origem e destino devem ser diferentes.';
    END IF;

    UPDATE public.pedidos
    SET mesa_codigo = TRIM(p_destino),
        updated_at = NOW()
    WHERE mesa_codigo = TRIM(p_origem)
      AND status != 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago');

    GET DIAGNOSTICS v_count = ROW_COUNT;

    BEGIN
        INSERT INTO public.auditoria_operacional (
            usuario_id,
            acao,
            tabela,
            registro_id,
            detalhes,
            created_at
        ) VALUES (
            auth.uid(),
            'TRANSFERENCIA_MESA',
            'pedidos',
            TRIM(p_origem) || '->' || TRIM(p_destino),
            jsonb_build_object(
                'origem', TRIM(p_origem),
                'destino', TRIM(p_destino),
                'pedidos_transferidos', v_count
            ),
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'sucesso', true,
        'origem', TRIM(p_origem),
        'destino', TRIM(p_destino),
        'pedidos_transferidos', v_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transferir_mesa(TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.transferir_mesa(TEXT, TEXT) TO authenticated;

-- 3. Fechamento de conta da mesa com verificação por quantidade de pedidos, pago_em e débito idempotente
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
  v_fechamento_id BIGINT;
  v_subtotal NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_pedido RECORD;
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

  -- 6. Inserir formas de pagamento e garantir débito atômico/idempotente na Conta do Cliente
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

-- 4. Atualizar fn_calcular_totais_caixa_interno para filtrar vendas_balcao pelo instante do pagamento
CREATE OR REPLACE FUNCTION public.fn_calcular_totais_caixa_interno(p_caixa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aberto_em TIMESTAMPTZ;
  v_fechado_em TIMESTAMPTZ;
  v_limite_fim TIMESTAMPTZ;
  v_fundo_troco NUMERIC(10,2) := 0;
  v_sangrias NUMERIC(10,2) := 0;
  v_suprimentos NUMERIC(10,2) := 0;
  v_vendas_dinheiro NUMERIC(10,2) := 0;
  v_dinheiro_esperado NUMERIC(10,2) := 0;
  v_total_bruto NUMERIC(10,2) := 0;
  v_total_taxas NUMERIC(10,2) := 0;
  v_total_liquido NUMERIC(10,2) := 0;
  v_total_depositos_clientes NUMERIC(10,2) := 0;
  v_itens JSONB := '[]'::jsonb;
  v_pagamentos_map JSONB := '{}'::jsonb;
BEGIN
  SELECT c.aberto_em, c.fechado_em, c.fundo_troco
  INTO v_aberto_em, v_fechado_em, v_fundo_troco
  FROM public.caixas c
  WHERE c.id = p_caixa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado';
  END IF;

  v_limite_fim := COALESCE(v_fechado_em, NOW());

  -- Somar sangrias e suprimentos
  SELECT COALESCE(SUM(m.valor), 0) INTO v_sangrias
  FROM public.caixa_movimentos m
  WHERE m.caixa_id = p_caixa_id AND m.tipo = 'sangria';

  SELECT COALESCE(SUM(m.valor), 0) INTO v_suprimentos
  FROM public.caixa_movimentos m
  WHERE m.caixa_id = p_caixa_id AND m.tipo = 'suprimento';

  -- Somar depósitos de conta de cliente ocorridos no período
  SELECT COALESCE(SUM(m.valor), 0) INTO v_total_depositos_clientes
  FROM public.cliente_conta_movimentos m
  WHERE m.created_at >= v_aberto_em AND m.created_at <= v_limite_fim
    AND m.tipo IN ('deposito', 'pagamento_fatura')
    AND m.valor > 0;

  -- Somar vendas do período:
  -- (A) fechamento_pagamentos de fechamentos de mesa (descontando troco em dinheiro)
  -- (B) pedidos de balcão/viagem/online pagos no turno (por COALESCE(p.pago_em, p.updated_at, p.created_at))
  -- (C) depósitos de clientes na forma de pagamento correspondente
  WITH formas_base AS (
    SELECT unnest(ARRAY['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente']) AS forma
  ),
  vendas_fechamento AS (
    SELECT
      CASE
        WHEN fp.forma = 'credito' THEN 'cartao_credito'
        WHEN fp.forma = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(fp.forma, 'outros')
      END AS forma,
      SUM(fp.valor) AS valor_bruto,
      SUM(COALESCE(fp.taxa_valor, 0)) AS valor_taxa
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    WHERE f.created_at >= v_aberto_em AND f.created_at <= v_limite_fim
    GROUP BY 1
  ),
  trocos_fechamento AS (
    SELECT COALESCE(SUM(f.troco), 0) AS total_troco
    FROM public.fechamentos f
    WHERE f.created_at >= v_aberto_em AND f.created_at <= v_limite_fim
      AND f.troco > 0
      AND EXISTS (
        SELECT 1 FROM public.fechamento_pagamentos fp2
        WHERE fp2.fechamento_id = f.id AND fp2.forma = 'dinheiro'
      )
  ),
  vendas_balcao AS (
    SELECT
      CASE
        WHEN p.forma_pagamento = 'credito' THEN 'cartao_credito'
        WHEN p.forma_pagamento = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(p.forma_pagamento, 'outros')
      END AS forma,
      SUM(p.total) AS valor_bruto,
      SUM(COALESCE(p.taxa_pagamento_valor, 0)) AS valor_taxa
    FROM public.pedidos p
    WHERE p.status != 'cancelado'
      AND p.status_pagamento = 'pago'
      AND COALESCE(p.pago_em, p.updated_at, p.created_at) >= v_aberto_em
      AND COALESCE(p.pago_em, p.updated_at, p.created_at) <= v_limite_fim
      AND NOT EXISTS (
        SELECT 1 FROM public.fechamento_pedidos fped
        WHERE fped.pedido_id = p.id
      )
    GROUP BY 1
  ),
  depositos_cliente AS (
    SELECT
      CASE
        WHEN m.forma_pagamento = 'credito' THEN 'cartao_credito'
        WHEN m.forma_pagamento = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(m.forma_pagamento, 'dinheiro')
      END AS forma,
      SUM(m.valor) AS total_deposito
    FROM public.cliente_conta_movimentos m
    WHERE m.created_at >= v_aberto_em AND m.created_at <= v_limite_fim
      AND m.tipo IN ('deposito', 'pagamento_fatura')
      AND m.valor > 0
    GROUP BY 1
  ),
  consolidado AS (
    SELECT
      fb.forma,
      GREATEST(
        0,
        ROUND(
          COALESCE(vf.valor_bruto, 0)
          + COALESCE(vb.valor_bruto, 0)
          + COALESCE(dc.total_deposito, 0)
          - CASE WHEN fb.forma = 'dinheiro' THEN COALESCE((SELECT total_troco FROM trocos_fechamento), 0) ELSE 0 END,
          2
        )
      )::NUMERIC(10,2) AS total_vendas,
      ROUND(COALESCE(vf.valor_taxa, 0) + COALESCE(vb.valor_taxa, 0), 2)::NUMERIC(10,2) AS total_taxa,
      ROUND(COALESCE(dc.total_deposito, 0), 2)::NUMERIC(10,2) AS total_deposito
    FROM formas_base fb
    LEFT JOIN vendas_fechamento vf ON vf.forma = fb.forma
    LEFT JOIN vendas_balcao vb ON vb.forma = fb.forma
    LEFT JOIN depositos_cliente dc ON dc.forma = fb.forma
  )
  SELECT
    COALESCE((SELECT c.total_vendas FROM consolidado c WHERE c.forma = 'dinheiro'), 0),
    COALESCE(SUM(CASE WHEN c.forma != 'conta_cliente' THEN c.total_vendas ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.forma != 'conta_cliente' THEN c.total_taxa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.forma != 'conta_cliente' THEN GREATEST(0, c.total_vendas - c.total_taxa) ELSE 0 END), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'forma', c.forma,
          'metodo', c.forma,
          'total_vendas', c.total_vendas,
          'total', c.total_vendas,
          'total_taxa', c.total_taxa,
          'total_taxas', c.total_taxa,
          'total_depositos', c.total_deposito,
          'total_liquido', GREATEST(0, ROUND(c.total_vendas - c.total_taxa, 2)),
          'valor_esperado', CASE
            WHEN c.forma = 'dinheiro' THEN ROUND(v_fundo_troco + v_suprimentos - v_sangrias + c.total_vendas, 2)
            ELSE c.total_vendas
          END
        )
        ORDER BY array_position(ARRAY['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente'], c.forma)
      ),
      '[]'::jsonb
    ),
    COALESCE(jsonb_object_agg(c.forma, c.total_vendas), '{}'::jsonb)
  INTO v_vendas_dinheiro, v_total_bruto, v_total_taxas, v_total_liquido, v_itens, v_pagamentos_map
  FROM consolidado c;

  v_dinheiro_esperado := ROUND(v_fundo_troco + v_suprimentos - v_sangrias + v_vendas_dinheiro, 2);

  RETURN jsonb_build_object(
    'caixa_id', p_caixa_id,
    'aberto_em', v_aberto_em,
    'fechado_em', v_fechado_em,
    'fundo_troco', v_fundo_troco,
    'sangrias', v_sangrias,
    'suprimentos', v_suprimentos,
    'total_depositos_clientes', v_total_depositos_clientes,
    'vendas_dinheiro', v_vendas_dinheiro,
    'dinheiro_esperado', v_dinheiro_esperado,
    'total_bruto', v_total_bruto,
    'total_taxas', v_total_taxas,
    'total_liquido', v_total_liquido,
    'itens', v_itens,
    'pagamentos', v_pagamentos_map
  );
END;
$$;

INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('108', 'migration_caf_000108_integridade_transferencia_fechamento_caixa.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
