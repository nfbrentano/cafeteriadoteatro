-- ============================================================================
-- MIGRATION CAF-000079: Pix no Admin e Taxas no Fechamento de Caixa
-- ============================================================================
-- 1. Unifica o cálculo de totais de caixa (CAF-000044) com o detalhamento
--    de taxas congeladas e valor líquido por forma de pagamento (CAF-000039).
-- 2. Garante que taxas sejam lidas dos registros históricos (fechamento_pagamentos.taxa_valor
--    e pedidos.taxa_pagamento_valor), mantendo o histórico congelado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calcular_totais_caixa_interno(p_caixa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Somar vendas do período:
  -- (A) fechamento_pagamentos de fechamentos de mesa (descontando troco em dinheiro)
  -- (B) pedidos de balcão/viagem pagos diretamente que não pertencem a fechamentos de mesa
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
      AND p.created_at >= v_aberto_em
      AND p.created_at <= v_limite_fim
      AND NOT EXISTS (
        SELECT 1 FROM public.fechamento_pedidos fped
        WHERE fped.pedido_id = p.id
      )
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
          - CASE WHEN fb.forma = 'dinheiro' THEN COALESCE((SELECT total_troco FROM trocos_fechamento), 0) ELSE 0 END,
          2
        )
      )::NUMERIC(10,2) AS total_vendas,
      ROUND(COALESCE(vf.valor_taxa, 0) + COALESCE(vb.valor_taxa, 0), 2)::NUMERIC(10,2) AS total_taxa
    FROM formas_base fb
    LEFT JOIN vendas_fechamento vf ON vf.forma = fb.forma
    LEFT JOIN vendas_balcao vb ON vb.forma = fb.forma
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
