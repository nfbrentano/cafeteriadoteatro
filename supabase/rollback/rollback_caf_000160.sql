BEGIN;

-- ==============================================================================
-- Rollback CAF-000160 - RPC get_server_time
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_server_time();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_migrations') THEN
    DELETE FROM public.app_migrations WHERE versao = '160';
  END IF;
END $$;

COMMIT;
