BEGIN;

-- Rollback CAF-000078
DELETE FROM public.app_migrations WHERE versao = '078';

DROP INDEX IF EXISTS public.idx_despesas_documento;
ALTER TABLE public.despesas DROP COLUMN IF EXISTS documento;

COMMIT;
