-- ==============================================================================
-- Rollback CAF-000130: Regressões em produção: avaliação pós-pedido, anti-spam do QR e fuso horário
-- Data: 2026-11-24
-- ==============================================================================

DROP FUNCTION IF EXISTS public.fn_relatorio_deslocamento_fuso();

-- Remove registro de migration aplicada
DELETE FROM public.app_migrations WHERE versao = '130';
