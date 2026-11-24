-- ==============================================================================
-- ROLLBACK CAF-000126: Autorização NULL-safe e revogação de anon nas RPCs SECURITY DEFINER
-- ==============================================================================

BEGIN;

-- 1. Restaurar privilégios padrão no schema public
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- 2. Conceder EXECUTE novamente a anon e PUBLIC nas funções afetadas (se necessário em rollback de emergência)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  ) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, PUBLIC;', r.func_sig);
  END LOOP;
END;
$$;

-- 3. Remover helpers introduzidos nesta migration
DROP FUNCTION IF EXISTS public.exigir_cargo_ou_permissao(TEXT, VARIADIC TEXT[]);
DROP FUNCTION IF EXISTS public.exigir_permissao(TEXT);
DROP FUNCTION IF EXISTS public.exigir_cargo(VARIADIC TEXT[]);

COMMIT;
