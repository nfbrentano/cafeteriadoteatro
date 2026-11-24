BEGIN;

-- ==============================================================================
-- Rollback CAF-000152 - Alergênicos e restrições alimentares
-- ==============================================================================

DROP VIEW IF EXISTS public.v_produtos_revisao_alergenicos;
DROP VIEW IF EXISTS public.v_produto_alergenicos;

DROP TRIGGER IF EXISTS trg_sync_pedidos_alergias ON public.pedidos;
DROP FUNCTION IF EXISTS public.fn_sync_pedidos_alergias();

DROP TABLE IF EXISTS public.produto_alergenicos CASCADE;
DROP TABLE IF EXISTS public.estoque_item_alergenicos CASCADE;
DROP TABLE IF EXISTS public.restricoes_alimentares CASCADE;
DROP TABLE IF EXISTS public.alergenicos CASCADE;

ALTER TABLE public.produtos
  DROP COLUMN IF EXISTS alergenicos_revisado_em,
  DROP COLUMN IF EXISTS alergenicos_revisado_por,
  DROP COLUMN IF EXISTS contaminacao_cruzada_aviso,
  DROP COLUMN IF EXISTS restricoes_alimentares;

ALTER TABLE public.pedidos
  DROP COLUMN IF EXISTS alergias_cliente;

DELETE FROM public.configuracoes_sistema WHERE chave = 'aviso_contaminacao_cruzada';
DELETE FROM public.site_settings WHERE key = 'aviso_contaminacao_cruzada';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_migrations') THEN
    DELETE FROM public.app_migrations WHERE versao = '152';
  END IF;
END $$;

COMMIT;
