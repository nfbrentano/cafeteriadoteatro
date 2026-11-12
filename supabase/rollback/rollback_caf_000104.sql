BEGIN;

-- ==============================================================================
-- Rollback CAF-000104 - Correção das Colunas prioridade e prioridade_motivo
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '104';

DROP FUNCTION IF EXISTS public.alterar_prioridade_pedido(BIGINT, SMALLINT, TEXT);

DROP INDEX IF EXISTS public.idx_pedidos_prioridade_created;

ALTER TABLE public.pedidos
  DROP COLUMN IF EXISTS prioridade_motivo,
  DROP COLUMN IF EXISTS prioridade;

COMMIT;

