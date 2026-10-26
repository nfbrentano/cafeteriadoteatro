BEGIN;

-- Rollback CAF-000074
DELETE FROM public.app_migrations WHERE versao = '074';

DROP INDEX IF EXISTS public.idx_produtos_fornecedor_padrao;
ALTER TABLE public.produtos DROP COLUMN IF EXISTS fornecedor_padrao_id;
DELETE FROM public.configuracoes_sistema WHERE chave = 'ficha_margem_minima_percentual';

COMMIT;
