BEGIN;

-- ==============================================================================
-- Rollback CAF-000115 - Observabilidade e Erros do Cliente
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '115';

DROP FUNCTION IF EXISTS public.registrar_erro_cliente(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.obter_resumo_erros_cliente(INT, TEXT);
DROP FUNCTION IF EXISTS public.limpar_erros_antigos(INT);

DROP TABLE IF EXISTS public.erros_cliente CASCADE;

COMMIT;

