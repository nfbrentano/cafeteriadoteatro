BEGIN;

-- ==============================================================================
-- Rollback CAF-000112 - Fechamento Parcial de Mesa e Pagamento por Item
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '112';

DROP FUNCTION IF EXISTS public.registrar_pagamento_parcial_mesa(TEXT, JSONB, JSONB, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.estornar_pagamento_parcial_mesa(UUID, TEXT);
DROP FUNCTION IF EXISTS public.obter_resumo_conta_mesa(TEXT);

DROP TABLE IF EXISTS public.fechamento_itens CASCADE;

ALTER TABLE public.fechamentos
  DROP COLUMN IF EXISTS parcial;

ALTER TABLE public.pedido_itens
  DROP COLUMN IF EXISTS quantidade_paga;

COMMIT;

