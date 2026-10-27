BEGIN;

-- ==============================================================================
-- CAF-000106: Resolução de Vulnerabilidade Crítica Supabase Security Advisor
-- Habilitar Row-Level Security (RLS) e Policies em Todas as Tabelas Públicas
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. cardapio_eventos_diarios (Menu Analytics)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cardapio_eventos_diarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cardapio_eventos_select_staff" ON public.cardapio_eventos_diarios;
CREATE POLICY "cardapio_eventos_select_staff" ON public.cardapio_eventos_diarios
  FOR SELECT
  TO authenticated
  USING (
    public.tem_permissao('relatorios') 
    OR public.get_user_role() = 'admin'
  );

REVOKE INSERT, UPDATE, DELETE ON public.cardapio_eventos_diarios FROM anon, authenticated, public;
GRANT SELECT ON public.cardapio_eventos_diarios TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_evento_cardapio(TEXT, TEXT, TEXT, DATE) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. cortesia_regras (Regras de Cortesias Promocionais)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cortesia_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cortesia_regras_select" ON public.cortesia_regras;
DROP POLICY IF EXISTS "cortesia_regras_select_ativo" ON public.cortesia_regras;
DROP POLICY IF EXISTS "cortesia_regras_admin_all" ON public.cortesia_regras;

-- Leitura pública para regras ativas (cardápio e PDV); admin visualiza todas
CREATE POLICY "cortesia_regras_select_ativo" ON public.cortesia_regras
  FOR SELECT
  USING (
    ativo = true 
    OR public.get_user_role() = 'admin'
  );

-- Escrita restrita exclusivamente a administradores
CREATE POLICY "cortesia_regras_admin_all" ON public.cortesia_regras
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

GRANT SELECT ON public.cortesia_regras TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. promocoes (Promoções do Dia / Ofertas)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.promocoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promocoes_select" ON public.promocoes;
DROP POLICY IF EXISTS "promocoes_select_ativo" ON public.promocoes;
DROP POLICY IF EXISTS "promocoes_admin_all" ON public.promocoes;

-- Leitura pública de promoções ativas no cardápio e PDV; admin visualiza todas
CREATE POLICY "promocoes_select_ativo" ON public.promocoes
  FOR SELECT
  USING (
    ativo = true 
    OR public.get_user_role() = 'admin'
  );

-- Escrita restrita a administradores
CREATE POLICY "promocoes_admin_all" ON public.promocoes
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

GRANT SELECT ON public.promocoes TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. promocao_itens (Itens vinculados a promoções)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.promocao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promocao_itens_select" ON public.promocao_itens;
DROP POLICY IF EXISTS "promocao_itens_admin_all" ON public.promocao_itens;

-- Leitura irrestrita para resolução de descontos no cardápio e PDV
CREATE POLICY "promocao_itens_select" ON public.promocao_itens
  FOR SELECT
  USING (true);

-- Escrita restrita a administradores
CREATE POLICY "promocao_itens_admin_all" ON public.promocao_itens
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

GRANT SELECT ON public.promocao_itens TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. pedido_impressoes (Trava e Log de Impressão KDS)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedido_impressoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_impressoes_select_staff" ON public.pedido_impressoes;
CREATE POLICY "pedido_impressoes_select_staff" ON public.pedido_impressoes
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = ANY (ARRAY['barista', 'cozinha', 'garcom', 'gerente', 'admin'])
    OR public.tem_permissao('pdv.vender')
    OR public.tem_permissao('kds')
  );

REVOKE INSERT, UPDATE, DELETE ON public.pedido_impressoes FROM anon, authenticated, public;
GRANT SELECT ON public.pedido_impressoes TO authenticated;
GRANT EXECUTE ON FUNCTION public.travar_impressao_pedido(BIGINT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. pedido_item_sabores (Sabores Meio a Meio em Pedidos)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedido_item_sabores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_item_sabores_select" ON public.pedido_item_sabores;
DROP POLICY IF EXISTS "pedido_item_sabores_staff" ON public.pedido_item_sabores;

-- Leitura pública para visualização no KDS e acompanhamento do pedido
CREATE POLICY "pedido_item_sabores_select" ON public.pedido_item_sabores
  FOR SELECT
  USING (true);

-- Inserção/atualização direta restrita a equipe de atendimento (barista, garçom, admin)
CREATE POLICY "pedido_item_sabores_staff" ON public.pedido_item_sabores
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() = ANY (ARRAY['barista', 'garcom', 'admin'])
    OR public.tem_permissao('pdv.vender')
  )
  WITH CHECK (
    public.get_user_role() = ANY (ARRAY['barista', 'garcom', 'admin'])
    OR public.tem_permissao('pdv.vender')
  );

GRANT SELECT ON public.pedido_item_sabores TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Salvaguarda Dinâmica Geral: Habilitar RLS em 100% das Tabelas Públicas
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND rowsecurity = false
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 8. Registro de Migração
-- ------------------------------------------------------------------------------
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('106', 'migration_caf_000106_habilitar_rls_todas_tabelas.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
