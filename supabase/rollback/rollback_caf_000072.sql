BEGIN;

-- Rollback CAF-000072
DELETE FROM public.app_migrations WHERE versao = '072';

ALTER TABLE public.pedidos DROP COLUMN IF EXISTS pedido_origem_id;

COMMIT;
