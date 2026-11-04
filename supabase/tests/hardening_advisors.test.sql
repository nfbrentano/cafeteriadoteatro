-- hardening_advisors.test.sql — CAF-000107: Hardening Supabase Security & Performance Advisors (pgTAP)
BEGIN;
SELECT plan(8);

-- 1. CA01: produtos possui policy de escrita restrita a admin/permissão (sem Escrita para admins aberta)
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'produtos' AND policyname = 'Escrita para admins'),
  0,
  'Policy legada aberta "Escrita para admins" em produtos deve ter sido removida'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'produtos'
      AND policyname = 'produtos_write_admin'
  ),
  'Deve existir policy produtos_write_admin exigindo admin ou permissão produtos'
);

-- 2. CA02: site_settings não possui policies de escrita com qual = true
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_settings' AND cmd = 'ALL' AND qual = 'true'),
  0,
  'Zero policies ALL abertas (qual=true) na tabela site_settings'
);

-- 3. CA03: anon não possui privilégio DELETE na tabela contador
SELECT is(
  has_table_privilege('anon', 'public.contador', 'DELETE'),
  false,
  'Role anon não pode executar DELETE na tabela contador'
);

-- 4. CA04: 100% das funções em public possuem search_path configurado
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      ))
  ),
  0,
  'Zero funções no schema public com search_path mutável (function_search_path_mutable)'
);

-- 5. CA05: Views públicas de catálogo permitem leitura para anon
SELECT ok(
  has_table_privilege('anon', 'public.v_adicionais_produto', 'SELECT'),
  'View v_adicionais_produto deve continuar legível para anon no cardápio digital'
);

-- 6. CA06: business_hours não possui policy aberta com qual = true para escrita
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_hours' AND cmd = 'ALL' AND qual = 'true'),
  0,
  'Zero policies ALL abertas (qual=true) na tabela business_hours'
);

-- 7. Registro da migration 107
SELECT ok(
  EXISTS (SELECT 1 FROM public.app_migrations WHERE versao = '107'),
  'Migration 107 deve estar registrada em app_migrations'
);

SELECT * FROM finish();
ROLLBACK;
