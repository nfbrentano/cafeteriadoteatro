BEGIN;

-- ==============================================================================
-- Rollback CAF-000107 - Hardening Supabase Advisors
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '107';

-- Reverte views para security_invoker padrão se existirem
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_adicionais_produto' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.v_adicionais_produto RESET (security_invoker)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_cliente_saldo' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.v_cliente_saldo RESET (security_invoker)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_cortesias_disponiveis' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.v_cortesias_disponiveis RESET (security_invoker)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'v_painel_retirada' AND c.relkind = 'v') THEN
    EXECUTE 'ALTER VIEW public.v_painel_retirada RESET (security_invoker)';
  END IF;
END $$;

COMMIT;

