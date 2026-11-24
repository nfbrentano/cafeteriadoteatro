-- ==============================================================================
-- Rollback CAF-000133
-- ==============================================================================

DROP FUNCTION IF EXISTS public.cancelar_pedido(bigint, text);
DROP FUNCTION IF EXISTS public.fn_desescapar_html(text);

DELETE FROM public.app_migrations WHERE versao = '133';
