BEGIN;

-- Rollback CAF-000079
DELETE FROM public.app_migrations WHERE versao = '079';

-- Restaura versão da CAF-000044 de fn_calcular_totais_caixa_interno
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
  v_itens JSONB := '[]'::jsonb;
  v_pagamentos_map JSONB := '{}'::jsonb;
BEGIN
  SELECT c.aberto_em, c.fechado_em, c.fundo_troco
  INTO v_aberto_em, v_fechado_em, v_fundo_troco
  FROM public.caixas c WHERE c.id = p_caixa_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Caixa não encontrado'; END IF;
  v_limite_fim := COALESCE(v_fechado_em, NOW());

  SELECT COALESCE(SUM(valor), 0) INTO v_sangrias FROM public.caixa_movimentos WHERE caixa_id = p_caixa_id AND tipo = 'sangria';
  SELECT COALESCE(SUM(valor), 0) INTO v_suprimentos FROM public.caixa_movimentos WHERE caixa_id = p_caixa_id AND tipo = 'suprimento';

  WITH formas_base AS (
    SELECT unnest(ARRAY['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente']) AS forma
  ),
  vendas_fechamento AS (
    SELECT
      CASE WHEN fp.forma = 'credito' THEN 'cartao_credito' WHEN fp.forma = 'debito' THEN 'cartao_debito' ELSE COALESCE(fp.forma, 'outros') END AS forma,
      SUM(fp.valor) AS valor_bruto
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    WHERE f.created_at >= v_aberto_em AND f.created_at <= v_limite_fim
    GROUP BY 1
  ),
  trocos_fechamento AS (
    SELECT COALESCE(SUM(f.troco), 0) AS total_troco
    FROM public.fechamentos f
    WHERE f.created_at >= v_aberto_em AND f.created_at <= v_limite_fim AND f.troco > 0
      AND EXISTS (SELECT 1 FROM public.fechamento_pagamentos fp2 WHERE fp2.fechamento_id = f.id AND fp2.forma = 'dinheiro')
  ),
  vendas_balcao AS (
    SELECT
      CASE WHEN p.forma_pagamento = 'credito' THEN 'cartao_credito' WHEN p.forma_pagamento = 'debito' THEN 'cartao_debito' ELSE COALESCE(p.forma_pagamento, 'outros') END AS forma,
      SUM(p.total) AS valor_bruto
    FROM public.pedidos p
    WHERE p.status != 'cancelado' AND p.status_pagamento = 'pago' AND p.created_at >= v_aberto_em AND p.created_at <= v_limite_fim
      AND NOT EXISTS (SELECT 1 FROM public.fechamento_pedidos fped WHERE fped.pedido_id = p.id)
    GROUP BY 1
  ),
  consolidado AS (
    SELECT
      fb.forma,
      GREATEST(0, ROUND(COALESCE(vf.valor_bruto, 0) + COALESCE(vb.valor_bruto, 0) - CASE WHEN fb.forma = 'dinheiro' THEN COALESCE((SELECT total_troco FROM trocos_fechamento), 0) ELSE 0 END, 2))::NUMERIC(10,2) AS total_vendas
    FROM formas_base fb
    LEFT JOIN vendas_fechamento vf ON vf.forma = fb.forma
    LEFT JOIN vendas_balcao vb ON vb.forma = fb.forma
  )
  SELECT
    COALESCE((SELECT c.total_vendas FROM consolidado c WHERE c.forma = 'dinheiro'), 0),
    COALESCE(SUM(CASE WHEN c.forma != 'conta_cliente' THEN c.total_vendas ELSE 0 END), 0),
    COALESCE(jsonb_agg(jsonb_build_object('forma', c.forma, 'total_vendas', c.total_vendas)), '[]'::jsonb),
    COALESCE(jsonb_object_agg(c.forma, c.total_vendas), '{}'::jsonb)
  INTO v_vendas_dinheiro, v_total_bruto, v_itens, v_pagamentos_map
  FROM consolidado c;

  v_dinheiro_esperado := ROUND(v_fundo_troco + v_suprimentos - v_sangrias + v_vendas_dinheiro, 2);

  RETURN jsonb_build_object(
    'caixa_id', p_caixa_id,
    'fundo_troco', v_fundo_troco,
    'sangrias', v_sangrias,
    'suprimentos', v_suprimentos,
    'vendas_dinheiro', v_vendas_dinheiro,
    'dinheiro_esperado', v_dinheiro_esperado,
    'total_bruto', v_total_bruto,
    'itens', v_itens,
    'pagamentos', v_pagamentos_map
  );
END;
$$;

COMMIT;
