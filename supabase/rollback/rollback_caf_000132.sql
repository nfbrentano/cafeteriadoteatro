-- ==============================================================================
-- Rollback CAF-000132
-- ==============================================================================

DROP FUNCTION IF EXISTS public.processar_solicitacao_titular(bigint, text, text);
DROP FUNCTION IF EXISTS public.listar_solicitacoes_titular(text);
DROP FUNCTION IF EXISTS public.solicitar_direito_titular(jsonb);
DROP TABLE IF EXISTS public.solicitacoes_titular;

DELETE FROM public.app_migrations WHERE versao = '132';
