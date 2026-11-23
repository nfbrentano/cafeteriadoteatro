-- Rollback da CAF-000124: Emissão de NFC-e no fechamento da conta via provedor fiscal
BEGIN;

DROP FUNCTION IF EXISTS public.listar_notas_fiscais(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cancelar_nfce(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.registrar_emissao_nfce(UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BIGINT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.obter_dados_fiscais_fechamento(UUID);
DROP FUNCTION IF EXISTS public.fn_gerar_chave_acesso_nfce(TEXT, TEXT, INT, BIGINT, INT, TEXT);

DROP TABLE IF EXISTS public.notas_fiscais CASCADE;

ALTER TABLE public.produtos
  DROP COLUMN IF EXISTS ncm,
  DROP COLUMN IF EXISTS cfop,
  DROP COLUMN IF EXISTS csosn,
  DROP COLUMN IF EXISTS origem,
  DROP COLUMN IF EXISTS unidade_tributavel;

ALTER TABLE public.categorias
  DROP COLUMN IF EXISTS ncm_padrao,
  DROP COLUMN IF EXISTS cfop_padrao,
  DROP COLUMN IF EXISTS csosn_padrao;

DELETE FROM public.configuracoes_sistema WHERE chave LIKE 'nfce_%';

COMMIT;
