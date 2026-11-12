BEGIN;

-- ==============================================================================
-- Rollback CAF-000111 - Controle de Lotes (PEPS) e Sugestão de Compras
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '111';

DROP FUNCTION IF EXISTS public.obter_consumo_estoque_30d();
DROP FUNCTION IF EXISTS public.dar_baixa_lote_vencido(BIGINT, NUMERIC, TEXT);

DROP TRIGGER IF EXISTS trg_peps_baixa_estoque ON public.estoque_movimentos;
DROP FUNCTION IF EXISTS public.fn_peps_baixar_lotes();

DROP INDEX IF EXISTS public.idx_estoque_movimentos_lote_id;
ALTER TABLE public.estoque_movimentos
  DROP COLUMN IF EXISTS lote_codigo,
  DROP COLUMN IF EXISTS lote_id;

DROP TABLE IF EXISTS public.estoque_lotes CASCADE;

COMMIT;

