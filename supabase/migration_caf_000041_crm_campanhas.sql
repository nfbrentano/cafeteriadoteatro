-- =========================================================
-- MIGRATION: CAF-000041 - CRM: SEGMENTAÇÃO RFV, TAGS E CAMPANHAS WHATSAPP
-- =========================================================

-- 1. Índice de desempenho em pedidos(cliente_id, created_at)
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_created_at
  ON public.pedidos(cliente_id, created_at DESC);

-- 2. Parâmetros configuráveis de segmentação e anti-spam em configuracoes_sistema
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('crm_dias_ativo', '30'::jsonb),
  ('crm_dias_perdido', '90'::jsonb),
  ('crm_pedidos_fiel_90d', '4'::jsonb),
  ('crm_antispam_dias', '7'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 3. Tabelas de Tags de Clientes
CREATE TABLE IF NOT EXISTS public.cliente_tags (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  cor TEXT NOT NULL DEFAULT '#c9973a',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_tags_auth_all" ON public.cliente_tags;
CREATE POLICY "cliente_tags_auth_all"
  ON public.cliente_tags
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.cliente_tags (nome, cor)
VALUES
  ('VIP', '#eab308'),
  ('Funcionário Univates', '#3b82f6'),
  ('Assinante do Teatro', '#a855f7'),
  ('Vegano', '#22c55e')
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cliente_tag_vinculos (
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES public.cliente_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_tag_vinculos_tag ON public.cliente_tag_vinculos(tag_id);

ALTER TABLE public.cliente_tag_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_tag_vinculos_auth_all" ON public.cliente_tag_vinculos;
CREATE POLICY "cliente_tag_vinculos_auth_all"
  ON public.cliente_tag_vinculos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Tabelas de Campanhas e Envios (com controle de anti-spam e conversão)
CREATE TABLE IF NOT EXISTS public.campanhas (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  segmento_filtro TEXT,
  tag_id_filtro BIGINT REFERENCES public.cliente_tags(id) ON DELETE SET NULL,
  produto_id_filtro TEXT,
  cupom_codigo TEXT,
  mensagem_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campanhas_auth_all" ON public.campanhas;
CREATE POLICY "campanhas_auth_all"
  ON public.campanhas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.campanha_envios (
  id BIGSERIAL PRIMARY KEY,
  campanha_id BIGINT NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  telefone_enviado TEXT,
  mensagem_enviada TEXT,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_campanha_envios_cliente_data
  ON public.campanha_envios(cliente_id, enviado_em DESC);

ALTER TABLE public.campanha_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campanha_envios_auth_all" ON public.campanha_envios;
CREATE POLICY "campanha_envios_auth_all"
  ON public.campanha_envios
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. View v_clientes_rfv: classificação automática e produto favorito por cliente
CREATE OR REPLACE VIEW public.v_clientes_rfv AS
WITH cfg AS (
  SELECT
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_dias_ativo'), 30) AS dias_ativo,
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_dias_perdido'), 90) AS dias_perdido,
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_pedidos_fiel_90d'), 4) AS min_fiel,
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_antispam_dias'), 7) AS dias_antispam
),
pedidos_validos AS (
  SELECT
    p.id,
    p.cliente_id,
    COALESCE(p.total, 0)::numeric(10,2) AS valor,
    p.created_at
  FROM public.pedidos p
  WHERE p.cliente_id IS NOT NULL
    AND COALESCE(p.status, '') <> 'cancelado'
),
metricas_cliente AS (
  SELECT
    pv.cliente_id,
    MIN(pv.created_at) AS primeira_compra,
    MAX(pv.created_at) AS ultima_compra,
    COUNT(*)::int AS total_pedidos,
    COALESCE(SUM(pv.valor), 0)::numeric(10,2) AS total_gasto,
    COUNT(*) FILTER (WHERE pv.created_at >= (now() - INTERVAL '90 days'))::int AS pedidos_90d,
    COALESCE(SUM(pv.valor) FILTER (WHERE pv.created_at >= (now() - INTERVAL '90 days')), 0)::numeric(10,2) AS gasto_90d,
    -- Métricas de 30 dias atrás para comparar variação com o mês anterior
    MIN(pv.created_at) FILTER (WHERE pv.created_at < (now() - INTERVAL '30 days')) AS primeira_compra_ant,
    MAX(pv.created_at) FILTER (WHERE pv.created_at < (now() - INTERVAL '30 days')) AS ultima_compra_ant,
    COUNT(*) FILTER (
      WHERE pv.created_at < (now() - INTERVAL '30 days')
        AND pv.created_at >= (now() - INTERVAL '120 days')
    )::int AS pedidos_90d_ant
  FROM pedidos_validos pv
  GROUP BY pv.cliente_id
),
prod_fav AS (
  SELECT DISTINCT ON (pv.cliente_id)
    pv.cliente_id,
    pi.nome_produto AS produto_favorito
  FROM pedidos_validos pv
  JOIN public.pedido_itens pi ON pi.pedido_id = pv.id
  WHERE COALESCE(pi.cancelado, false) = false
    AND pi.nome_produto IS NOT NULL
  GROUP BY pv.cliente_id, pi.nome_produto
  ORDER BY pv.cliente_id, SUM(COALESCE(pi.quantidade, 1)) DESC, MAX(pv.created_at) DESC
),
prods_comprados AS (
  SELECT
    pv.cliente_id,
    ARRAY_AGG(DISTINCT pi.produto_id) FILTER (WHERE pi.produto_id IS NOT NULL) AS produtos_comprados_ids
  FROM pedidos_validos pv
  JOIN public.pedido_itens pi ON pi.pedido_id = pv.id
  WHERE COALESCE(pi.cancelado, false) = false
  GROUP BY pv.cliente_id
),
ultimo_envio AS (
  SELECT
    ce.cliente_id,
    MAX(ce.enviado_em) AS ultimo_disparo_campanha
  FROM public.campanha_envios ce
  GROUP BY ce.cliente_id
)
SELECT
  c.id AS cliente_id,
  c.nome,
  split_part(trim(c.nome), ' ', 1) AS primeiro_nome,
  c.telefone,
  c.email,
  c.aceita_contato,
  c.ativo,
  c.anonimizado,
  mc.primeira_compra,
  mc.ultima_compra,
  CASE
    WHEN mc.ultima_compra IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (now() - mc.ultima_compra))::int
  END AS dias_sem_comprar,
  COALESCE(mc.total_pedidos, 0) AS total_pedidos,
  COALESCE(mc.total_gasto, 0)::numeric(10,2) AS total_gasto,
  COALESCE(mc.pedidos_90d, 0) AS pedidos_90d,
  COALESCE(mc.gasto_90d, 0)::numeric(10,2) AS gasto_90d,
  pf.produto_favorito,
  COALESCE(pc.produtos_comprados_ids, ARRAY[]::text[]) AS produtos_comprados_ids,
  ue.ultimo_disparo_campanha,
  CASE
    WHEN ue.ultimo_disparo_campanha IS NOT NULL
     AND ue.ultimo_disparo_campanha >= (now() - (cfg.dias_antispam || ' days')::interval)
    THEN true
    ELSE false
  END AS bloqueado_antispam,
  -- Segmento Atual
  CASE
    WHEN mc.ultima_compra IS NULL THEN 'Perdido'
    WHEN mc.primeira_compra >= (now() - (cfg.dias_ativo || ' days')::interval) THEN 'Novo'
    WHEN mc.ultima_compra >= (now() - (cfg.dias_ativo || ' days')::interval)
     AND COALESCE(mc.pedidos_90d, 0) >= cfg.min_fiel THEN 'Fiel'
    WHEN mc.ultima_compra >= (now() - (cfg.dias_ativo || ' days')::interval) THEN 'Ativo'
    WHEN mc.ultima_compra >= (now() - (cfg.dias_perdido || ' days')::interval) THEN 'Em risco'
    ELSE 'Perdido'
  END AS segmento,
  -- Segmento Mês Anterior (30 dias atrás)
  CASE
    WHEN mc.ultima_compra_ant IS NULL THEN NULL
    WHEN mc.primeira_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_ativo || ' days')::interval) THEN 'Novo'
    WHEN mc.ultima_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_ativo || ' days')::interval)
     AND COALESCE(mc.pedidos_90d_ant, 0) >= cfg.min_fiel THEN 'Fiel'
    WHEN mc.ultima_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_ativo || ' days')::interval) THEN 'Ativo'
    WHEN mc.ultima_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_perdido || ' days')::interval) THEN 'Em risco'
    ELSE 'Perdido'
  END AS segmento_mes_anterior
FROM public.clientes c
CROSS JOIN cfg
LEFT JOIN metricas_cliente mc ON mc.cliente_id = c.id
LEFT JOIN prod_fav pf ON pf.cliente_id = c.id
LEFT JOIN prods_comprados pc ON pc.cliente_id = c.id
LEFT JOIN ultimo_envio ue ON ue.cliente_id = c.id;

-- 6. View v_campanhas_conversao: relatório de envios e compras nos 7 dias seguintes
CREATE OR REPLACE VIEW public.v_campanhas_conversao AS
SELECT
  cp.id AS campanha_id,
  cp.nome,
  cp.segmento_filtro,
  cp.tag_id_filtro,
  cp.produto_id_filtro,
  cp.cupom_codigo,
  cp.mensagem_template,
  cp.created_at,
  COUNT( DISTINCT ce.id )::int AS total_enviados,
  COUNT( DISTINCT CASE
    WHEN p.id IS NOT NULL THEN ce.cliente_id
    ELSE NULL
  END )::int AS clientes_converteram_7d,
  COALESCE(SUM( DISTINCT CASE
    WHEN p.id IS NOT NULL THEN COALESCE(p.total, 0)
    ELSE 0
  END ), 0)::numeric(10,2) AS faturamento_gerado_7d
FROM public.campanhas cp
LEFT JOIN public.campanha_envios ce ON ce.campanha_id = cp.id
LEFT JOIN public.pedidos p
  ON p.cliente_id = ce.cliente_id
 AND COALESCE(p.status, '') <> 'cancelado'
 AND p.created_at >= ce.enviado_em
 AND p.created_at <= (ce.enviado_em + INTERVAL '7 days')
GROUP BY cp.id;

GRANT SELECT ON public.v_clientes_rfv TO authenticated;
GRANT SELECT ON public.v_campanhas_conversao TO authenticated;
