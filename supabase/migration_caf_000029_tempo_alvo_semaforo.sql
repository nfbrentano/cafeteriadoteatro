-- ==============================================================================
-- CAF-000025: Tempo alvo de preparo por categoria/produto e semáforo no KDS
-- ==============================================================================

-- 1. Coluna de tempo alvo em categorias (em minutos)
ALTER TABLE categorias 
ADD COLUMN IF NOT EXISTS tempo_alvo_min INT DEFAULT 15;

-- 2. Coluna de tempo alvo em produtos (em minutos, NULL = herda da categoria)
ALTER TABLE produtos 
ADD COLUMN IF NOT EXISTS tempo_alvo_min INT DEFAULT NULL;

-- 3. Configuração padrão global no site_settings
INSERT INTO site_settings (key, value, updated_at)
VALUES ('tempo_alvo_padrao_min', '15', NOW())
ON CONFLICT (key) DO NOTHING;

-- 4. Definir valores iniciais sensatos para as categorias existentes
UPDATE categorias SET tempo_alvo_min = 5 WHERE id IN ('cafes-quentes', 'cafes-especiais', 'chocolate-quente', 'balcao');
UPDATE categorias SET tempo_alvo_min = 7 WHERE id IN ('cafes-gelados', 'bebidas-geladas', 'sucos-vitaminas', 'bebidas-alcoolicas');
UPDATE categorias SET tempo_alvo_min = 8 WHERE id IN ('milk-shakes');
UPDATE categorias SET tempo_alvo_min = 10 WHERE id IN ('torradas-lanches', 'croissants');
UPDATE categorias SET tempo_alvo_min = 15 WHERE id IN ('crepes-salgados', 'crepes-doces', 'baguetes', 'tacas-acai', 'saladas', 'sem-lactose-gluten');

-- 5. Atualizar get_admin_reports para incluir tempo médio de preparo x meta por categoria
CREATE OR REPLACE FUNCTION public.get_admin_reports(
  p_inicio TIMESTAMPTZ,
  p_fim TIMESTAMPTZ,
  p_categoria_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cortesias JSONB;
  v_mais_vendidos JSONB;
  v_pagamentos JSONB;
  v_promocoes JSONB;
  v_tempo_preparo JSONB;
  v_horarios_pico_hora JSONB;
  v_horarios_pico_dia JSONB;
  v_ticket_medio JSONB;
  v_tempo_por_categoria JSONB;
BEGIN
  -- 1. Cortesias
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_cortesias
  FROM (
    SELECT 
      pi_origem.nome_produto AS prato_origem,
      COUNT(pi.id) AS total_cortesias,
      SUM(pi.preco_unitario * pi.quantidade) AS valor_abonado
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    LEFT JOIN public.pedido_itens pi_origem ON pi_origem.id = pi.cortesia_de_item_id
    WHERE pi.cortesia_de_item_id IS NOT NULL
      AND pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY pi_origem.nome_produto
    ORDER BY total_cortesias DESC
  ) t;

  -- 2. Mais Vendidos
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_mais_vendidos
  FROM (
    SELECT 
      pi.nome_produto,
      SUM(pi.quantidade) AS quantidade_vendida,
      SUM(pi.quantidade * pi.preco_unitario) AS faturamento
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    LEFT JOIN public.produtos prod ON prod.id = pi.produto_id
    WHERE pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
      AND (p_categoria_id IS NULL OR p_categoria_id = '' OR prod.categoria_id = p_categoria_id)
    GROUP BY pi.nome_produto
    ORDER BY quantidade_vendida DESC
    LIMIT 100
  ) t;

  -- 3. Pagamentos
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_pagamentos
  FROM (
    SELECT
      forma,
      SUM(valor) AS total_valor
    FROM (
      SELECT fp.forma, fp.valor
      FROM public.fechamento_pagamentos fp
      JOIN public.fechamentos f ON f.id = fp.fechamento_id
      WHERE f.created_at >= p_inicio AND f.created_at <= p_fim
      UNION ALL
      SELECT p.forma_pagamento AS forma, p.total AS valor
      FROM public.pedidos p
      LEFT JOIN public.fechamento_pedidos fped ON fped.pedido_id = p.id
      WHERE fped.pedido_id IS NULL
        AND p.status_pagamento = 'pago'
        AND p.status != 'cancelado'
        AND p.forma_pagamento IS NOT NULL
        AND p.created_at >= p_inicio AND p.created_at <= p_fim
    ) todas_formas
    GROUP BY forma
    ORDER BY total_valor DESC
  ) t;

  -- 4. Promoções
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_promocoes
  FROM (
    SELECT 
      prom.nome AS promocao_nome,
      COUNT(pi.id) AS vezes_aplicada,
      SUM(pi.desconto) AS desconto_total
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    JOIN public.promocoes prom ON prom.id = pi.promocao_id
    WHERE pi.promocao_id IS NOT NULL
      AND pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY prom.nome
    ORDER BY desconto_total DESC
  ) t;

  -- 5. Tempo de preparo geral
  SELECT row_to_json(t) INTO v_tempo_preparo
  FROM (
    SELECT 
      COALESCE(AVG(EXTRACT(EPOCH FROM (iniciado_em - created_at))/60), 0) AS media_fila_minutos,
      COALESCE(AVG(EXTRACT(EPOCH FROM (concluido_em - iniciado_em))/60), 0) AS media_preparo_minutos
    FROM public.pedidos
    WHERE status IN ('concluido', 'entregue')
      AND iniciado_em IS NOT NULL
      AND concluido_em IS NOT NULL
      AND created_at >= p_inicio
      AND created_at <= p_fim
  ) t;

  -- 6. Horários de pico - Por Hora
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_horarios_pico_hora
  FROM (
    SELECT 
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Sao_Paulo')) AS hora,
      COUNT(id) AS total_pedidos
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
    GROUP BY hora
    ORDER BY hora ASC
  ) t;

  -- 7. Horários de pico - Por Dia
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_horarios_pico_dia
  FROM (
    SELECT 
      EXTRACT(DOW FROM (created_at AT TIME ZONE 'America/Sao_Paulo')) AS dia_semana,
      COUNT(id) AS total_pedidos
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
    GROUP BY dia_semana
    ORDER BY dia_semana ASC
  ) t;

  -- 8. Ticket Médio e Resumo Geral
  SELECT row_to_json(t) INTO v_ticket_medio
  FROM (
    SELECT 
      COALESCE(SUM(total), 0) AS faturamento_total,
      COUNT(id) AS pedidos_validos,
      CASE 
        WHEN COUNT(id) > 0 THEN COALESCE(SUM(total), 0) / COUNT(id)
        ELSE 0 
      END AS ticket_medio
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
  ) t;

  -- 9. Tempo de preparo x Tempo alvo por categoria
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_tempo_por_categoria
  FROM (
    SELECT 
      c.id AS categoria_id,
      c.nome AS categoria_nome,
      c.icone AS categoria_icone,
      COALESCE(c.tempo_alvo_min, 15) AS tempo_alvo_min,
      COUNT(pi.id) AS total_itens_concluidos,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (pi.pronto_em - p.created_at))/60), 0)::numeric, 1) AS media_preparo_minutos
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    JOIN public.produtos prod ON prod.id = pi.produto_id
    JOIN public.categorias c ON c.id = prod.categoria_id
    WHERE pi.pronto_em IS NOT NULL
      AND pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY c.id, c.nome, c.icone, c.tempo_alvo_min
    ORDER BY media_preparo_minutos DESC
  ) t;

  RETURN jsonb_build_object(
    'cortesias', v_cortesias,
    'mais_vendidos', v_mais_vendidos,
    'pagamentos', v_pagamentos,
    'promocoes', v_promocoes,
    'tempo_preparo', v_tempo_preparo,
    'tempo_por_categoria', v_tempo_por_categoria,
    'horarios_pico_hora', v_horarios_pico_hora,
    'horarios_pico_dia', v_horarios_pico_dia,
    'resumo', v_ticket_medio
  );
END;
$$;

-- Comentários descritivos
COMMENT ON COLUMN categorias.tempo_alvo_min IS 'Tempo alvo ideal de preparo em minutos para produtos desta categoria';
COMMENT ON COLUMN produtos.tempo_alvo_min IS 'Tempo alvo específico do produto em minutos. Se NULL, herda da categoria';
