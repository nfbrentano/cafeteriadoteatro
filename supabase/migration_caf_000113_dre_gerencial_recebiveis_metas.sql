-- ==============================================================================
-- MIGRATION: CAF-000113 - DRE GERENCIAL AUTOMÁTICO, CONCILIAÇÃO DE RECEBÍVEIS E METAS DE VENDAS
-- Implementa: CAF-000113
-- Descrição:
--   1. Configurações de metas diárias de faturamento (dia normal e espetáculo).
--   2. RPC obter_dre_gerencial (Receita Bruta, Descontos, Taxas, Receita Líquida,
--      CMV Real de Fichas Técnicas + Perdas de Estoque, Margem de Contribuição,
--      Despesas Operacionais Fixas/Variáveis por Regime Caixa vs Competência e Lucro Líquido).
--   3. RPC obter_previsao_recebiveis (Projeção de liquidação D+0, D+1, D+30 líquido de taxas).
--   4. RPC obter_meta_progresso_dia (Atingimento da meta diária no fuso America/Sao_Paulo).
-- ==============================================================================

-- 1. Chaves de configuração em configuracoes_sistema
INSERT INTO public.configuracoes_sistema (chave, valor, updated_at)
VALUES
  ('meta_faturamento_dia_normal', '1500.00'::jsonb, timezone('America/Sao_Paulo', now())),
  ('meta_faturamento_dia_espetaculo', '3000.00'::jsonb, timezone('America/Sao_Paulo', now()))
ON CONFLICT (chave) DO NOTHING;

-- 2. RPC: Demonstrativo de Resultado do Exercício (DRE Gerencial)
CREATE OR REPLACE FUNCTION public.obter_dre_gerencial(
  p_inicio DATE,
  p_fim DATE,
  p_regime TEXT DEFAULT 'caixa'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_inicio TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  
  v_faturamento_bruto NUMERIC(10,2) := 0;
  v_descontos NUMERIC(10,2) := 0;
  v_taxas_pagamento NUMERIC(10,2) := 0;
  v_receita_liquida NUMERIC(10,2) := 0;
  
  v_cmv_itens NUMERIC(10,2) := 0;
  v_perdas_estoque NUMERIC(10,2) := 0;
  v_cmv_total NUMERIC(10,2) := 0;
  
  v_margem_contribuicao NUMERIC(10,2) := 0;
  v_margem_percentual NUMERIC(5,2) := 0;
  
  v_total_despesas_fixas NUMERIC(10,2) := 0;
  v_total_despesas_variaveis NUMERIC(10,2) := 0;
  v_total_despesas NUMERIC(10,2) := 0;
  
  v_resultado_liquido NUMERIC(10,2) := 0;
  v_resultado_percentual NUMERIC(5,2) := 0;
  
  v_despesas_categorias JSONB := '[]'::JSONB;
BEGIN
  v_role := public.get_user_role();
  IF COALESCE(v_role, '') != 'admin' AND NOT public.tem_permissao('admin.financeiro') THEN
    RAISE EXCEPTION 'Acesso negado: permissão admin.financeiro necessária';
  END IF;

  -- Janela de tempo em timezone America/Sao_Paulo
  v_inicio := make_timestamptz(
    EXTRACT(YEAR FROM p_inicio)::INT,
    EXTRACT(MONTH FROM p_inicio)::INT,
    EXTRACT(DAY FROM p_inicio)::INT,
    0, 0, 0, 'America/Sao_Paulo'
  );
  v_fim := make_timestamptz(
    EXTRACT(YEAR FROM p_fim)::INT,
    EXTRACT(MONTH FROM p_fim)::INT,
    EXTRACT(DAY FROM p_fim)::INT,
    23, 59, 59, 'America/Sao_Paulo'
  ) + interval '999999 microseconds';

  -- 1. Faturamento Bruto e Descontos Concedidos
  SELECT 
    COALESCE(ROUND(SUM(
      p.total + COALESCE(p.desconto_cupom, 0)
    ), 2), 0),
    COALESCE(ROUND(SUM(COALESCE(p.desconto_cupom, 0)), 2), 0)
  INTO v_faturamento_bruto, v_descontos
  FROM public.pedidos p
  WHERE p.status != 'cancelado'
    AND p.status_pagamento = 'pago'
    AND p.created_at >= v_inicio
    AND p.created_at <= v_fim;

  SELECT v_descontos + COALESCE(ROUND(SUM(COALESCE(f.desconto_manual, 0)), 2), 0)
  INTO v_descontos
  FROM public.fechamentos f
  WHERE f.created_at >= v_inicio
    AND f.created_at <= v_fim;

  -- 2. Taxas de Meios de Pagamento (Cartão/Pix)
  SELECT COALESCE(ROUND(SUM(valor_taxa), 2), 0)
  INTO v_taxas_pagamento
  FROM (
    SELECT COALESCE(fp.taxa_valor, 0) AS valor_taxa
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    WHERE f.created_at >= v_inicio AND f.created_at <= v_fim
    UNION ALL
    SELECT COALESCE(p.taxa_pagamento_valor, 0) AS valor_taxa
    FROM public.pedidos p
    LEFT JOIN public.fechamento_pedidos fped ON fped.pedido_id = p.id
    WHERE fped.pedido_id IS NULL
      AND p.status_pagamento = 'pago'
      AND p.status != 'cancelado'
      AND p.created_at >= v_inicio AND p.created_at <= v_fim
  ) sub_taxas;

  -- 3. Receita Operacional Líquida
  v_receita_liquida := ROUND(v_faturamento_bruto - v_descontos - v_taxas_pagamento, 2);

  -- 4. CMV Total (Fichas Técnicas dos Itens Vendidos + Perdas de Estoque)
  SELECT COALESCE(ROUND(SUM(
    pi.quantidade * COALESCE(pi.custo_unitario, 0)
  ), 2), 0)
  INTO v_cmv_itens
  FROM public.pedido_itens pi
  JOIN public.pedidos p ON p.id = pi.pedido_id
  WHERE p.status != 'cancelado'
    AND p.status_pagamento = 'pago'
    AND pi.cancelado = false
    AND p.created_at >= v_inicio
    AND p.created_at <= v_fim;

  SELECT COALESCE(ROUND(SUM(
    em.quantidade * COALESCE(em.custo_unitario, 0)
  ), 2), 0)
  INTO v_perdas_estoque
  FROM public.estoque_movimentos em
  WHERE em.tipo = 'perda'
    AND em.created_at >= v_inicio
    AND em.created_at <= v_fim;

  v_cmv_total := ROUND(v_cmv_itens + v_perdas_estoque, 2);

  -- 5. Margem de Contribuição
  v_margem_contribuicao := ROUND(v_receita_liquida - v_cmv_total, 2);
  IF v_faturamento_bruto > 0 THEN
    v_margem_percentual := ROUND((v_margem_contribuicao / v_faturamento_bruto * 100.0), 2);
  ELSE
    v_margem_percentual := 0;
  END IF;

  -- 6. Despesas Operacionais (Fixas e Variáveis, ignorando taxas de maquininha duplicadas)
  IF p_regime = 'competencia' THEN
    SELECT COALESCE(jsonb_agg(sub_cat), '[]'::JSONB) INTO v_despesas_categorias
    FROM (
      SELECT 
        c.nome AS categoria,
        COALESCE(c.tipo, 'fixa') AS tipo,
        COUNT(d.id)::INT AS quantidade,
        ROUND(SUM(COALESCE(d.valor, 0)), 2) AS total,
        CASE WHEN v_faturamento_bruto > 0 THEN
          ROUND((SUM(COALESCE(d.valor, 0)) / v_faturamento_bruto * 100.0), 2)
        ELSE 0 END AS percentual_receita
      FROM public.despesas d
      JOIN public.despesa_categorias c ON c.id = d.categoria_id
      WHERE d.vencimento >= p_inicio AND d.vencimento <= p_fim
        AND NOT (lower(c.nome) LIKE '%taxa%' OR lower(c.nome) LIKE '%maquininha%' OR lower(d.descricao) LIKE '%taxas de meios de pagamento%')
      GROUP BY c.nome, c.tipo
      ORDER BY total DESC
    ) sub_cat;
  ELSE
    SELECT COALESCE(jsonb_agg(sub_cat), '[]'::JSONB) INTO v_despesas_categorias
    FROM (
      SELECT 
        c.nome AS categoria,
        COALESCE(c.tipo, 'fixa') AS tipo,
        COUNT(d.id)::INT AS quantidade,
        ROUND(SUM(COALESCE(d.valor_pago, d.valor)), 2) AS total,
        CASE WHEN v_faturamento_bruto > 0 THEN
          ROUND((SUM(COALESCE(d.valor_pago, d.valor)) / v_faturamento_bruto * 100.0), 2)
        ELSE 0 END AS percentual_receita
      FROM public.despesas d
      JOIN public.despesa_categorias c ON c.id = d.categoria_id
      WHERE d.pago_em >= p_inicio AND d.pago_em <= p_fim
        AND NOT (lower(c.nome) LIKE '%taxa%' OR lower(c.nome) LIKE '%maquininha%' OR lower(d.descricao) LIKE '%taxas de meios de pagamento%')
      GROUP BY c.nome, c.tipo
      ORDER BY total DESC
    ) sub_cat;
  END IF;

  SELECT 
    COALESCE(SUM(CASE WHEN (elem->>'tipo') = 'fixa' THEN (elem->>'total')::NUMERIC ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (elem->>'tipo') = 'variavel' THEN (elem->>'total')::NUMERIC ELSE 0 END), 0)
  INTO v_total_despesas_fixas, v_total_despesas_variaveis
  FROM jsonb_array_elements(v_despesas_categorias) AS elem;

  v_total_despesas := ROUND(v_total_despesas_fixas + v_total_despesas_variaveis, 2);

  -- 7. Resultado Operacional Líquido
  v_resultado_liquido := ROUND(v_margem_contribuicao - v_total_despesas, 2);
  IF v_faturamento_bruto > 0 THEN
    v_resultado_percentual := ROUND((v_resultado_liquido / v_faturamento_bruto * 100.0), 2);
  ELSE
    v_resultado_percentual := 0;
  END IF;

  RETURN jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'regime', p_regime,
    'faturamento_bruto', v_faturamento_bruto,
    'faturamento_bruto_pct', 100.00,
    'descontos', v_descontos,
    'descontos_pct', CASE WHEN v_faturamento_bruto > 0 THEN ROUND((v_descontos / v_faturamento_bruto * 100.0), 2) ELSE 0 END,
    'taxas_pagamento', v_taxas_pagamento,
    'taxas_pagamento_pct', CASE WHEN v_faturamento_bruto > 0 THEN ROUND((v_taxas_pagamento / v_faturamento_bruto * 100.0), 2) ELSE 0 END,
    'receita_liquida', v_receita_liquida,
    'receita_liquida_pct', CASE WHEN v_faturamento_bruto > 0 THEN ROUND((v_receita_liquida / v_faturamento_bruto * 100.0), 2) ELSE 0 END,
    'cmv_itens', v_cmv_itens,
    'cmv_perdas', v_perdas_estoque,
    'cmv_total', v_cmv_total,
    'cmv_total_pct', CASE WHEN v_faturamento_bruto > 0 THEN ROUND((v_cmv_total / v_faturamento_bruto * 100.0), 2) ELSE 0 END,
    'margem_contribuicao', v_margem_contribuicao,
    'margem_contribuicao_pct', v_margem_percentual,
    'despesas_fixas', v_total_despesas_fixas,
    'despesas_fixas_pct', CASE WHEN v_faturamento_bruto > 0 THEN ROUND((v_total_despesas_fixas / v_faturamento_bruto * 100.0), 2) ELSE 0 END,
    'despesas_variaveis', v_total_despesas_variaveis,
    'despesas_variaveis_pct', CASE WHEN v_faturamento_bruto > 0 THEN ROUND((v_total_despesas_variaveis / v_faturamento_bruto * 100.0), 2) ELSE 0 END,
    'despesas_total', v_total_despesas,
    'despesas_total_pct', CASE WHEN v_faturamento_bruto > 0 THEN ROUND((v_total_despesas / v_faturamento_bruto * 100.0), 2) ELSE 0 END,
    'despesas_categorias', v_despesas_categorias,
    'resultado_liquido', v_resultado_liquido,
    'resultado_liquido_pct', v_resultado_percentual
  );
END;
$$;

-- 3. RPC: Previsão de Recebíveis e Conciliação de Taxas
CREATE OR REPLACE FUNCTION public.obter_previsao_recebiveis(
  p_data_inicio DATE DEFAULT (timezone('America/Sao_Paulo', now()))::DATE,
  p_dias_futuros INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_hoje DATE;
  v_limite DATE;
  v_total_hoje NUMERIC(10,2) := 0;
  v_total_7d NUMERIC(10,2) := 0;
  v_total_30d NUMERIC(10,2) := 0;
  v_lista JSONB := '[]'::JSONB;
BEGIN
  v_role := public.get_user_role();
  IF COALESCE(v_role, '') != 'admin' AND NOT public.tem_permissao('admin.financeiro') THEN
    RAISE EXCEPTION 'Acesso negado: permissão admin.financeiro necessária';
  END IF;

  v_hoje := COALESCE(p_data_inicio, (timezone('America/Sao_Paulo', now()))::DATE);
  v_limite := v_hoje + (COALESCE(p_dias_futuros, 30) || ' days')::INTERVAL;

  WITH pagamentos_projetados AS (
    -- Pagamentos registrados via fechamento de mesa
    SELECT 
      (f.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE AS data_venda,
      fp.forma,
      COALESCE(fpt.prazo_recebimento_dias, 0) AS prazo_dias,
      ((f.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE + (COALESCE(fpt.prazo_recebimento_dias, 0) || ' days')::INTERVAL)::DATE AS data_prevista,
      COALESCE(fp.valor, 0) AS valor_bruto,
      COALESCE(fp.taxa_valor, 0) AS taxa_valor,
      COALESCE(fp.valor_liquido, GREATEST(0, fp.valor - COALESCE(fp.taxa_valor, 0))) AS valor_liquido
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    LEFT JOIN public.formas_pagamento_taxas fpt ON fpt.forma = CASE 
      WHEN fp.forma = 'credito' THEN 'cartao_credito'
      WHEN fp.forma = 'debito' THEN 'cartao_debito'
      ELSE fp.forma
    END

    UNION ALL

    -- Pagamentos diretos de pedidos (balcão/totem/online sem fechamento_pedidos)
    SELECT 
      (p.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE AS data_venda,
      p.forma_pagamento AS forma,
      COALESCE(fpt.prazo_recebimento_dias, 0) AS prazo_dias,
      ((p.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE + (COALESCE(fpt.prazo_recebimento_dias, 0) || ' days')::INTERVAL)::DATE AS data_prevista,
      COALESCE(p.total, 0) AS valor_bruto,
      COALESCE(p.taxa_pagamento_valor, 0) AS taxa_valor,
      COALESCE(p.valor_liquido, GREATEST(0, p.total - COALESCE(p.taxa_pagamento_valor, 0))) AS valor_liquido
    FROM public.pedidos p
    LEFT JOIN public.fechamento_pedidos fped ON fped.pedido_id = p.id
    LEFT JOIN public.formas_pagamento_taxas fpt ON fpt.forma = CASE 
      WHEN p.forma_pagamento = 'credito' THEN 'cartao_credito'
      WHEN p.forma_pagamento = 'debito' THEN 'cartao_debito'
      ELSE p.forma_pagamento
    END
    WHERE fped.pedido_id IS NULL
      AND p.status_pagamento = 'pago'
      AND p.status != 'cancelado'
  ),
  agrupado AS (
    SELECT 
      data_prevista,
      data_venda,
      forma,
      prazo_dias,
      ROUND(SUM(valor_bruto), 2) AS valor_bruto,
      ROUND(SUM(taxa_valor), 2) AS taxa_valor,
      ROUND(SUM(valor_liquido), 2) AS valor_liquido
    FROM pagamentos_projetados
    WHERE data_prevista >= v_hoje AND data_prevista <= v_limite
    GROUP BY data_prevista, data_venda, forma, prazo_dias
    ORDER BY data_prevista ASC, valor_liquido DESC
  )
  SELECT 
    COALESCE(SUM(CASE WHEN data_prevista = v_hoje THEN valor_liquido ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN data_prevista <= (v_hoje + interval '7 days')::DATE THEN valor_liquido ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN data_prevista <= (v_hoje + interval '30 days')::DATE THEN valor_liquido ELSE 0 END), 0),
    COALESCE(jsonb_agg(row_to_json(agrupado)), '[]'::JSONB)
  INTO v_total_hoje, v_total_7d, v_total_30d, v_lista
  FROM agrupado;

  RETURN jsonb_build_object(
    'data_base', v_hoje,
    'total_hoje', v_total_hoje,
    'total_7dias', v_total_7d,
    'total_30dias', v_total_30d,
    'recebiveis', v_lista
  );
END;
$$;

-- 4. RPC: Progresso da Meta Diária (Dia Normal vs. Dia de Espetáculo)
CREATE OR REPLACE FUNCTION public.obter_meta_progresso_dia()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_hoje DATE;
  v_inicio TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  v_is_espetaculo BOOLEAN := false;
  v_meta NUMERIC(10,2) := 1500.00;
  v_vendas_hoje NUMERIC(10,2) := 0;
  v_percentual NUMERIC(5,1) := 0;
  v_falta NUMERIC(10,2) := 0;
BEGIN
  v_role := public.get_user_role();
  IF v_role IS NOT NULL AND v_role NOT IN ('admin', 'barista') AND NOT public.tem_permissao('admin.financeiro') THEN
    RAISE EXCEPTION 'Acesso negado: permissão necessária';
  END IF;

  v_hoje := (timezone('America/Sao_Paulo', now()))::DATE;
  v_inicio := timezone('America/Sao_Paulo', make_timestamptz(
    EXTRACT(YEAR FROM v_hoje)::INT,
    EXTRACT(MONTH FROM v_hoje)::INT,
    EXTRACT(DAY FROM v_hoje)::INT,
    0, 0, 0, 'America/Sao_Paulo'
  ));
  v_fim := v_inicio + interval '1 day';

  -- 1. Verifica se hoje está com o Modo Dia de Espetáculo ativo
  SELECT COALESCE((valor)::text::boolean, false)
  INTO v_is_espetaculo
  FROM public.configuracoes_sistema
  WHERE chave = 'espetaculo_ativo';

  -- 2. Lê a meta configurada
  IF v_is_espetaculo THEN
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9.]', '', 'g'), '')::NUMERIC, 3000.00)
    INTO v_meta
    FROM public.configuracoes_sistema
    WHERE chave = 'meta_faturamento_dia_espetaculo';
  ELSE
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9.]', '', 'g'), '')::NUMERIC, 1500.00)
    INTO v_meta
    FROM public.configuracoes_sistema
    WHERE chave = 'meta_faturamento_dia_normal';
  END IF;

  IF v_meta <= 0 THEN
    v_meta := 1500.00;
  END IF;

  -- 3. Total de vendas pagas de hoje
  SELECT COALESCE(ROUND(SUM(total), 2), 0)
  INTO v_vendas_hoje
  FROM public.pedidos
  WHERE status != 'cancelado'
    AND status_pagamento = 'pago'
    AND created_at >= v_inicio
    AND created_at < v_fim;

  v_percentual := ROUND((v_vendas_hoje / v_meta * 100.0)::NUMERIC, 1);
  v_falta := GREATEST(0, ROUND(v_meta - v_vendas_hoje, 2));

  RETURN jsonb_build_object(
    'data', v_hoje,
    'is_espetaculo', v_is_espetaculo,
    'meta_valor', v_meta,
    'vendas_hoje', v_vendas_hoje,
    'percentual_atingido', v_percentual,
    'falta_para_meta', v_falta
  );
END;
$$;

-- 5. Conceder permissões de execução
REVOKE EXECUTE ON FUNCTION public.obter_dre_gerencial(DATE, DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.obter_dre_gerencial(DATE, DATE, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.obter_previsao_recebiveis(DATE, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.obter_previsao_recebiveis(DATE, INT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.obter_meta_progresso_dia() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.obter_meta_progresso_dia() TO authenticated;

-- 6. Registro na tabela app_migrations
INSERT INTO public.app_migrations (versao, arquivo, aplicada_em, aplicada_por)
VALUES ('113', 'migration_caf_000113_dre_gerencial_recebiveis_metas.sql', timezone('utc', now()), current_user)
ON CONFLICT (versao) DO NOTHING;
