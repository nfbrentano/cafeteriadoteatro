BEGIN;

-- Rollback CAF-000083
DELETE FROM public.app_migrations WHERE versao = '083';

DROP FUNCTION IF EXISTS public.reabrir_caixa(UUID, TEXT);

ALTER TABLE public.caixas
  DROP COLUMN IF EXISTS motivo_reabertura,
  DROP COLUMN IF EXISTS reaberto_em,
  DROP COLUMN IF EXISTS reaberto_por;

COMMIT;
