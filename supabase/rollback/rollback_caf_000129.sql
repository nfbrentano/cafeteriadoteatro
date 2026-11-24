-- ==============================================================================
-- Rollback CAF-000129: Saldo da mesa com fonte única e débitos/créditos do cliente (fiado e cashback) atômicos e idempotentes
-- Data: 2026-11-24
-- ==============================================================================

DROP INDEX IF EXISTS public.uq_cliente_conta_mov_cashback_pedido;
DROP INDEX IF EXISTS public.uq_cliente_conta_mov_fechamento_consumo;
DROP VIEW IF EXISTS public.v_saldo_mesa;

-- Remove registro de migration aplicada
DELETE FROM public.app_migrations WHERE versao = '129';
