-- =========================================================
-- MIGRATION: CAF-000024 - RELATÓRIOS DO ADMIN
-- =========================================================

-- Adiciona a coluna para contabilizar o tempo de fila (quando o pedido entra em preparo)
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS iniciado_em TIMESTAMPTZ;

-- Função RPC para buscar dados do relatório do admin
CREATE OR REPLACE FUNCTION public.get_admin_reports(
  p_inicio TIMESTAMPTZ,
  p_fim TIMESTAMPTZ,
  p_categoria_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_cortesias JSONB;
  v_mais_vendidos JSONB;
  v_pagamentos JSONB;
  v_promocoes JSONB;
  v_tempo_preparo JSONB;
  v_horarios_pico_hora JSONB;
  v_horarios_pico_dia JSONB;
  v_ticket_medio JSONB;
BEGIN
  -- Validar role (apenas admin pode rodar)
  v_user_role := public.get_user_role();
  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  -- 1. Cortesias concedidas
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_cortesias
  FROM (
    SELECT
      pi_origem.nome_produto AS prato_liberador,
      SUM(pi_cortesia.quantidade) AS total_cortesias,
      SUM(pi_cortesia.quantidade * pi_cortesia.preco_unitario) AS valor_abonado
    FROM public.pedido_itens pi_cortesia
    JOIN public.pedido_itens pi_origem ON pi_cortesia.cortesia_de_item_id = pi_origem.id
    JOIN public.pedidos p ON p.id = pi_cortesia.pedido_id
    WHERE pi_cortesia.cortesia_de_item_id IS NOT NULL
      AND pi_cortesia.cancelado = false
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
    WHERE pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
      AND (p_categoria_id IS NULL OR p_categoria_id = '' OR pi.categoria_id = p_categoria_id)
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
      -- Pagamentos novos (via fechamentos)
      SELECT fp.forma, fp.valor
      FROM public.fechamento_pagamentos fp
      JOIN public.fechamentos f ON f.id = fp.fechamento_id
      WHERE f.created_at >= p_inicio AND f.created_at <= p_fim
      UNION ALL
      -- Pagamentos antigos ou isolados (via pedidos diretamente, que não têm fechamento associado)
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

  -- 5. Tempo de preparo
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

  RETURN jsonb_build_object(
    'cortesias', v_cortesias,
    'mais_vendidos', v_mais_vendidos,
    'pagamentos', v_pagamentos,
    'promocoes', v_promocoes,
    'tempo_preparo', v_tempo_preparo,
    'horarios_pico_hora', v_horarios_pico_hora,
    'horarios_pico_dia', v_horarios_pico_dia,
    'resumo', v_ticket_medio
  );
END;
$$;
