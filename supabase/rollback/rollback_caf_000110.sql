BEGIN;

-- ==============================================================================
-- Rollback CAF-000110 - Combos e Kits Configuráveis
-- ==============================================================================

DELETE FROM public.app_migrations WHERE versao = '110';

DROP TRIGGER IF EXISTS trg_baixa_estoque_combo_escolhas ON public.pedido_item_combo_escolhas;
DROP FUNCTION IF EXISTS public.fn_baixa_estoque_combo_escolha();
DROP FUNCTION IF EXISTS public.validar_e_calcular_combo(TEXT, JSONB);

DROP TABLE IF EXISTS public.pedido_item_combo_escolhas CASCADE;
DROP TABLE IF EXISTS public.combo_grupo_opcoes CASCADE;
DROP TABLE IF EXISTS public.combo_grupos CASCADE;

-- Restaura constraint anterior de tipo_montagem em produtos
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produtos_tipo_montagem_check'
      AND conrelid = 'public.produtos'::regclass
  ) THEN
    ALTER TABLE public.produtos DROP CONSTRAINT produtos_tipo_montagem_check;
  END IF;

  ALTER TABLE public.produtos
    ADD CONSTRAINT produtos_tipo_montagem_check
    CHECK (tipo_montagem IN ('padrao', 'meio_a_meio'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

COMMIT;

