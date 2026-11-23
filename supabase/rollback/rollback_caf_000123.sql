BEGIN;

-- ==============================================================================
-- Rollback CAF-000123 — Pix Dinâmico com Confirmação Automática
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '123';

DROP FUNCTION IF EXISTS public.resolver_cobranca_pix_conferencia(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.listar_cobrancas_pix_conferencia(TEXT);
DROP FUNCTION IF EXISTS public.expirar_cobrancas_pix_vencidas();
DROP FUNCTION IF EXISTS public.processar_webhook_pix(TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.criar_cobranca_pix(BIGINT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_deve_exigir_pix_kds();

DELETE FROM public.configuracoes_sistema
WHERE chave IN (
  'pix_dinamico_ativo',
  'pix_psp_provedor',
  'pix_exigir_pagamento_kds',
  'pix_expiracao_totem_min',
  'pix_expiracao_pdv_min',
  'pix_expiracao_online_min'
);

DROP TABLE IF EXISTS public.pix_cobrancas CASCADE;

COMMIT;
