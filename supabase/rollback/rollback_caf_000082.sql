BEGIN;

-- Rollback CAF-000082
DELETE FROM public.app_migrations WHERE versao = '082';

DROP FUNCTION IF EXISTS public.loja_esta_aberta();
DROP FUNCTION IF EXISTS public.travar_impressao_pedido(BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.chamar_atendente_mesa(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.registrar_evento_cardapio(TEXT, TEXT, TEXT, DATE);

COMMIT;
