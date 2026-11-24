-- ==============================================================================
-- Migração CAF-000160: RPC get_server_time para Sincronização de Relógio
--
-- Problema:
--   O KDS (cozinha.js) tentava sincronizar o relógio fazendo um fetch desprotegido
--   em /auth/v1/health sem apikey, resultando em erro 401 Unauthorized no console.
--
-- Solução:
--   Criar a RPC get_server_time() retornando o timestamp atual do PostgreSQL (now()),
--   com permissão pública concedida para anon e authenticated, permitindo sincronização
--   nativa, precisa e segura através do cliente Supabase oficial.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT now();
$$;

REVOKE EXECUTE ON FUNCTION public.get_server_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated, service_role;

-- Registra a migração 160 em public.app_migrations
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('160', 'migration_caf_000160_get_server_time.sql')
ON CONFLICT (versao) DO UPDATE SET arquivo = EXCLUDED.arquivo;
