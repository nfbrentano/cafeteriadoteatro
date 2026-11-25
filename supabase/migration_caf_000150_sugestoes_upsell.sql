-- ==============================================================================
-- Migration CAF-000150: Sugestão de itens (upsell) no QR, pedido online e PDV
-- ==============================================================================

BEGIN;

-- 1. Transição / Criação da tabela sugestoes_regras a partir de totem_sugestoes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'totem_sugestoes' AND table_type = 'BASE TABLE') THEN
    ALTER TABLE public.totem_sugestoes RENAME TO sugestoes_regras;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sugestoes_regras' AND column_name = 'canal') THEN
      ALTER TABLE public.sugestoes_regras ADD COLUMN canal TEXT NOT NULL DEFAULT 'todos';
      ALTER TABLE public.sugestoes_regras ADD CONSTRAINT chk_sugestoes_regras_canal CHECK (canal IN ('todos', 'totem', 'mesa', 'retirada', 'pdv'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sugestoes_regras' AND column_name = 'prioridade') THEN
      ALTER TABLE public.sugestoes_regras ADD COLUMN prioridade INT NOT NULL DEFAULT 1;
    END IF;

    -- Cria view de compatibilidade para código ou consultas legadas
    CREATE OR REPLACE VIEW public.totem_sugestoes AS
      SELECT id, gatilho_categoria_id, gatilho_produto_id, produto_sugerido_id, frase_destaque, ordem, ativo, created_at, canal, prioridade
      FROM public.sugestoes_regras;
  ELSE
    CREATE TABLE IF NOT EXISTS public.sugestoes_regras (
      id SERIAL PRIMARY KEY,
      gatilho_categoria_id TEXT REFERENCES public.categorias(id) ON DELETE CASCADE,
      gatilho_produto_id TEXT REFERENCES public.produtos(id) ON DELETE CASCADE,
      produto_sugerido_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
      frase_destaque TEXT DEFAULT 'Combina perfeitamente com seu pedido!',
      ordem INT NOT NULL DEFAULT 1,
      prioridade INT NOT NULL DEFAULT 1,
      canal TEXT NOT NULL DEFAULT 'todos' CHECK (canal IN ('todos', 'totem', 'mesa', 'retirada', 'pdv')),
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE VIEW public.totem_sugestoes AS
      SELECT id, gatilho_categoria_id, gatilho_produto_id, produto_sugerido_id, frase_destaque, ordem, ativo, created_at, canal, prioridade
      FROM public.sugestoes_regras;
  END IF;
END $$;

-- 2. Índices e RLS
CREATE INDEX IF NOT EXISTS idx_sugestoes_regras_ativo_canal ON public.sugestoes_regras(ativo, canal);
CREATE INDEX IF NOT EXISTS idx_sugestoes_regras_gatilhos ON public.sugestoes_regras(gatilho_categoria_id, gatilho_produto_id);

ALTER TABLE public.sugestoes_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sugestoes_regras_read_all" ON public.sugestoes_regras;
CREATE POLICY "sugestoes_regras_read_all"
  ON public.sugestoes_regras
  FOR SELECT
  TO anon, authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "sugestoes_regras_admin_write" ON public.sugestoes_regras;
CREATE POLICY "sugestoes_regras_admin_write"
  ON public.sugestoes_regras
  FOR ALL
  TO authenticated
  USING (public.tem_permissao('config.sistema') OR public.get_user_role() = 'admin')
  WITH CHECK (public.tem_permissao('config.sistema') OR public.get_user_role() = 'admin');

GRANT SELECT ON public.sugestoes_regras TO anon, authenticated;
GRANT ALL ON public.sugestoes_regras TO authenticated;
GRANT SELECT ON public.totem_sugestoes TO anon, authenticated;
GRANT ALL ON public.totem_sugestoes TO authenticated;

-- 3. Atualizar cardapio_eventos_diarios para suportar eventos de upsell e canal PDV
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cardapio_eventos_diarios' AND column_name = 'regra_id') THEN
    ALTER TABLE public.cardapio_eventos_diarios ADD COLUMN regra_id INT REFERENCES public.sugestoes_regras(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.cardapio_eventos_diarios DROP CONSTRAINT IF EXISTS cardapio_eventos_diarios_tipo_evento_check;
ALTER TABLE public.cardapio_eventos_diarios ADD CONSTRAINT cardapio_eventos_diarios_tipo_evento_check
  CHECK (tipo_evento IN ('sessao_cardapio', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'sugestao_exibida', 'sugestao_aceita'));

ALTER TABLE public.cardapio_eventos_diarios DROP CONSTRAINT IF EXISTS cardapio_eventos_diarios_canal_check;
ALTER TABLE public.cardapio_eventos_diarios ADD CONSTRAINT cardapio_eventos_diarios_canal_check
  CHECK (canal IN ('mesa', 'retirada', 'totem', 'vitrine', 'geral', 'pdv'));

ALTER TABLE public.cardapio_eventos_diarios DROP CONSTRAINT IF EXISTS uq_cardapio_evento_diario;
ALTER TABLE public.cardapio_eventos_diarios ADD CONSTRAINT uq_cardapio_evento_diario
  UNIQUE NULLS NOT DISTINCT (data, canal, tipo_evento, produto_id, regra_id);

-- 4. Atualizar RPC registrar_evento_cardapio com parâmetro opcional p_regra_id
CREATE OR REPLACE FUNCTION public.registrar_evento_cardapio(
  p_canal TEXT,
  p_tipo_evento TEXT,
  p_produto_id TEXT DEFAULT NULL,
  p_data DATE DEFAULT CURRENT_DATE,
  p_regra_id INT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.cardapio_eventos_diarios (data, canal, tipo_evento, produto_id, regra_id, total_eventos, updated_at)
  VALUES (COALESCE(p_data, CURRENT_DATE), p_canal, p_tipo_evento, p_produto_id, p_regra_id, 1, now())
  ON CONFLICT (data, canal, tipo_evento, produto_id, regra_id)
  DO UPDATE SET
    total_eventos = public.cardapio_eventos_diarios.total_eventos + 1,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.registrar_evento_cardapio(TEXT, TEXT, TEXT, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_evento_cardapio(TEXT, TEXT, TEXT, DATE, INT) TO anon, authenticated;

-- 5. RPC para buscar produtos mais vendidos em conjunto nos últimos 30 dias (Fallback por dados - RF07 / CA09)
CREATE OR REPLACE FUNCTION public.obter_pares_mais_vendidos(
  p_produto_ids TEXT[],
  p_limite INT DEFAULT 5
)
RETURNS TABLE (
  produto_id TEXT,
  coocorrencias BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pi2.produto_id,
    COUNT(DISTINCT pi2.pedido_id) AS coocorrencias
  FROM public.pedido_itens pi1
  JOIN public.pedido_itens pi2 ON pi1.pedido_id = pi2.pedido_id
  JOIN public.pedidos p ON p.id = pi1.pedido_id
  WHERE pi1.produto_id = ANY(p_produto_ids)
    AND NOT (pi2.produto_id = ANY(p_produto_ids))
    AND COALESCE(pi1.cancelado, false) = false
    AND COALESCE(pi2.cancelado, false) = false
    AND p.created_at >= (now() - INTERVAL '30 days')
    AND p.status != 'cancelado'
  GROUP BY pi2.produto_id
  ORDER BY coocorrencias DESC
  LIMIT p_limite;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.obter_pares_mais_vendidos(TEXT[], INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_pares_mais_vendidos(TEXT[], INT) TO authenticated;

-- 6. RPC para métricas de conversão de sugestões no painel admin (RF06 / CA08)
CREATE OR REPLACE FUNCTION public.get_metricas_sugestoes(
  p_data_inicio DATE DEFAULT CURRENT_DATE - 30,
  p_data_fim DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  regra_id INT,
  canal TEXT,
  produto_id TEXT,
  produto_nome TEXT,
  total_exibicoes BIGINT,
  total_aceites BIGINT,
  taxa_aceitacao NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH agregados AS (
    SELECT
      e.regra_id,
      e.canal,
      e.produto_id,
      SUM(CASE WHEN e.tipo_evento = 'sugestao_exibida' THEN e.total_eventos ELSE 0 END)::BIGINT AS exibicoes,
      SUM(CASE WHEN e.tipo_evento = 'sugestao_aceita' THEN e.total_eventos ELSE 0 END)::BIGINT AS aceites
    FROM public.cardapio_eventos_diarios e
    WHERE e.data BETWEEN p_data_inicio AND p_data_fim
      AND e.tipo_evento IN ('sugestao_exibida', 'sugestao_aceita')
    GROUP BY e.regra_id, e.canal, e.produto_id
  )
  SELECT
    a.regra_id,
    a.canal,
    a.produto_id,
    COALESCE(p.nome, a.produto_id) AS produto_nome,
    a.exibicoes,
    a.aceites,
    CASE WHEN a.exibicoes > 0
      THEN ROUND((a.aceites::NUMERIC / a.exibicoes::NUMERIC) * 100, 1)
      ELSE 0
    END AS taxa_aceitacao
  FROM agregados a
  LEFT JOIN public.produtos p ON p.id = a.produto_id
  ORDER BY a.exibicoes DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_metricas_sugestoes(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_metricas_sugestoes(DATE, DATE) TO authenticated;

-- Registra a migration
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('150', 'migration_caf_000150_sugestoes_upsell.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
