BEGIN;

-- ==============================================================================
-- Rollback CAF-000106 - Habilitar RLS e Policies em Todas as Tabelas Públicas
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '106';

-- Remove policies criadas na 106
DROP POLICY IF EXISTS "cardapio_eventos_select_staff" ON public.cardapio_eventos_diarios;
DROP POLICY IF EXISTS "cortesia_regras_select_ativo" ON public.cortesia_regras;
DROP POLICY IF EXISTS "cortesia_regras_admin_all" ON public.cortesia_regras;
DROP POLICY IF EXISTS "produto_insumos_admin_all" ON public.produto_insumos;
DROP POLICY IF EXISTS "produto_insumos_select_staff" ON public.produto_insumos;
DROP POLICY IF EXISTS "sync_checkpoints_select_staff" ON public.sync_checkpoints;
DROP POLICY IF EXISTS "sync_checkpoints_admin_all" ON public.sync_checkpoints;
DROP POLICY IF EXISTS "sync_historico_select_staff" ON public.sync_historico;
DROP POLICY IF EXISTS "sync_historico_admin_all" ON public.sync_historico;
DROP POLICY IF EXISTS "totens_admin_all" ON public.totens;
DROP POLICY IF EXISTS "totens_select_totem_app" ON public.totens;

COMMIT;

