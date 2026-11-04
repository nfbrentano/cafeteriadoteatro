BEGIN;

-- ==============================================================================
-- CAF-000107: Hardening Completo do Supabase Security & Performance Advisors
-- 1. Substituir policies abertas ("Escrita para admins" com USING/CHECK true)
--    por checagem efetiva de cargo admin ou permissão específica.
-- 2. Bloquear DELETE anônimo na tabela contador e consolidar policies duplicadas.
-- 3. Fixar SET search_path = public em 100% das funções do schema public.
-- 4. Habilitar security_invoker = true nas views de catálogo preservando leitura.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Produtos e Categorias: Leitura pública, Escrita restrita a Admin / Produtos
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Escrita para admins" ON public.produtos;
DROP POLICY IF EXISTS "produtos_select_public" ON public.produtos;
DROP POLICY IF EXISTS "produtos_write_admin" ON public.produtos;

CREATE POLICY "produtos_select_public" ON public.produtos
  FOR SELECT
  USING (true);

CREATE POLICY "produtos_write_admin" ON public.produtos
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('produtos')
  )
  WITH CHECK (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('produtos')
  );

GRANT SELECT ON public.produtos TO anon, authenticated;

ALTER TABLE IF EXISTS public.categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Escrita para admins" ON public.categorias;
DROP POLICY IF EXISTS "categorias_select_public" ON public.categorias;
DROP POLICY IF EXISTS "categorias_write_admin" ON public.categorias;

CREATE POLICY "categorias_select_public" ON public.categorias
  FOR SELECT
  USING (true);

CREATE POLICY "categorias_write_admin" ON public.categorias
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('produtos')
  )
  WITH CHECK (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('produtos')
  );

GRANT SELECT ON public.categorias TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Site Settings, Business Hours, Hero Home e Promotions: Escrita só Admin
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON public.site_settings;
DROP POLICY IF EXISTS "Escrita para admins" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_select_public" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_write_admin" ON public.site_settings;

CREATE POLICY "site_settings_select_public" ON public.site_settings
  FOR SELECT
  USING (true);

CREATE POLICY "site_settings_write_admin" ON public.site_settings
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('admin.configuracoes')
  )
  WITH CHECK (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('admin.configuracoes')
  );

GRANT SELECT ON public.site_settings TO anon, authenticated;

ALTER TABLE IF EXISTS public.business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Escrita para admins" ON public.business_hours;
DROP POLICY IF EXISTS "business_hours_admin" ON public.business_hours;
DROP POLICY IF EXISTS "business_hours_select_public" ON public.business_hours;
DROP POLICY IF EXISTS "business_hours_write_admin" ON public.business_hours;

CREATE POLICY "business_hours_select_public" ON public.business_hours
  FOR SELECT
  USING (true);

CREATE POLICY "business_hours_write_admin" ON public.business_hours
  FOR ALL
  TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('admin.configuracoes')
  )
  WITH CHECK (
    public.get_user_role() = 'admin'
    OR public.tem_permissao('admin.configuracoes')
  );

GRANT SELECT ON public.business_hours TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'hero_home') THEN
    EXECUTE 'ALTER TABLE public.hero_home ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Escrita para admins" ON public.hero_home';
    EXECUTE 'DROP POLICY IF EXISTS "hero_home_select_public" ON public.hero_home';
    EXECUTE 'DROP POLICY IF EXISTS "hero_home_write_admin" ON public.hero_home';
    EXECUTE 'CREATE POLICY "hero_home_select_public" ON public.hero_home FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "hero_home_write_admin" ON public.hero_home FOR ALL TO authenticated USING (public.get_user_role() = ''admin'' OR public.tem_permissao(''admin.configuracoes'')) WITH CHECK (public.get_user_role() = ''admin'' OR public.tem_permissao(''admin.configuracoes''))';
    EXECUTE 'GRANT SELECT ON public.hero_home TO anon, authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'promotions') THEN
    EXECUTE 'ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Escrita para admins" ON public.promotions';
    EXECUTE 'DROP POLICY IF EXISTS "promotions_select_public" ON public.promotions';
    EXECUTE 'DROP POLICY IF EXISTS "promotions_write_admin" ON public.promotions';
    EXECUTE 'CREATE POLICY "promotions_select_public" ON public.promotions FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "promotions_write_admin" ON public.promotions FOR ALL TO authenticated USING (public.get_user_role() = ''admin'' OR public.tem_permissao(''produtos'')) WITH CHECK (public.get_user_role() = ''admin'' OR public.tem_permissao(''produtos''))';
    EXECUTE 'GRANT SELECT ON public.promotions TO anon, authenticated';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Tabela contador: Proibir DELETE anônimo e remover policies redundantes
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contador') THEN
    EXECUTE 'ALTER TABLE public.contador ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Permitir inserção e atualização no contador" ON public.contador';
    EXECUTE 'DROP POLICY IF EXISTS "Permitir inserção no contador" ON public.contador';
    EXECUTE 'DROP POLICY IF EXISTS "contador_select_public" ON public.contador';
    EXECUTE 'DROP POLICY IF EXISTS "contador_insert_public" ON public.contador';
    EXECUTE 'DROP POLICY IF EXISTS "contador_update_public" ON public.contador';
    EXECUTE 'DROP POLICY IF EXISTS "contador_admin_delete" ON public.contador';

    EXECUTE 'CREATE POLICY "contador_select_public" ON public.contador FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY "contador_insert_public" ON public.contador FOR INSERT TO anon, authenticated WITH CHECK (id IS NOT NULL)';
    EXECUTE 'CREATE POLICY "contador_update_public" ON public.contador FOR UPDATE TO anon, authenticated USING (id IS NOT NULL) WITH CHECK (id IS NOT NULL)';
    EXECUTE 'CREATE POLICY "contador_admin_delete" ON public.contador FOR DELETE TO authenticated USING (public.get_user_role() = ''admin'')';

    EXECUTE 'REVOKE DELETE ON public.contador FROM anon, public';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.contador TO anon, authenticated';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Fixar SET search_path = public em 100% das funções do schema public
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  ) LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public;', r.proname, r.args);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 5. Habilitar security_invoker = true nas views de catálogo público
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'produto_adicionais_permitidos' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.produto_adicionais_permitidos SET (security_invoker = true)';
    EXECUTE 'GRANT SELECT ON public.produto_adicionais_permitidos TO anon, authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_adicionais_produto' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.v_adicionais_produto SET (security_invoker = true)';
    EXECUTE 'GRANT SELECT ON public.v_adicionais_produto TO anon, authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_cortesias_disponiveis' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.v_cortesias_disponiveis SET (security_invoker = true)';
    EXECUTE 'GRANT SELECT ON public.v_cortesias_disponiveis TO anon, authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_painel_retirada' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.v_painel_retirada SET (security_invoker = true)';
    EXECUTE 'GRANT SELECT ON public.v_painel_retirada TO anon, authenticated';
  END IF;
END $$;

GRANT SELECT ON public.adicionais TO anon, authenticated;
GRANT SELECT ON public.adicional_vinculos TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. Registro de Migração
-- ------------------------------------------------------------------------------
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('107', 'migration_caf_000107_hardening_supabase_advisors.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
