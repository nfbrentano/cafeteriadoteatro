BEGIN;

-- Rollback CAF-000075
DELETE FROM public.app_migrations WHERE versao = '075';

DROP FUNCTION IF EXISTS public.fn_validar_adicionais_item(TEXT, JSONB);

-- Restaura produto_adicionais_permitidos se veio de tabela renomeada
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'produto_adicionais_permitidos_legado'
  ) THEN
    DROP VIEW IF EXISTS public.produto_adicionais_permitidos;
    ALTER TABLE public.produto_adicionais_permitidos_legado RENAME TO produto_adicionais_permitidos;
  END IF;
END $$;

COMMIT;
