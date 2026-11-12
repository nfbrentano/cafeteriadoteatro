BEGIN;

-- ==============================================================================
-- Rollback CAF-000108 - Integridade Operacional Mesa, Caixa e pago_em
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '108';

DROP TRIGGER IF EXISTS trg_pedidos_set_pago_em ON public.pedidos;
DROP FUNCTION IF EXISTS public.fn_pedidos_set_pago_em();

ALTER TABLE public.pedidos
  DROP COLUMN IF EXISTS pago_em;

COMMIT;

