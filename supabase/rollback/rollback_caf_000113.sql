BEGIN;

-- ==============================================================================
-- Rollback CAF-000113 - DRE Gerencial, Recebíveis e Metas de Turno
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '113';

DROP FUNCTION IF EXISTS public.obter_dre_gerencial(DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.obter_previsao_recebiveis(DATE, INT);
DROP FUNCTION IF EXISTS public.obter_meta_progresso_dia();

DELETE FROM public.configuracoes_sistema 
WHERE chave IN ('meta_faturamento_dia_normal', 'meta_faturamento_dia_espetaculo');

COMMIT;

