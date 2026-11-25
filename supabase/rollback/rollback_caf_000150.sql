-- Rollback CAF-000150: Sugestão de itens (upsell) no QR, pedido online e PDV

BEGIN;

DROP FUNCTION IF EXISTS public.get_metricas_sugestoes(DATE, DATE);
DROP FUNCTION IF EXISTS public.obter_pares_mais_vendidos(TEXT[], INT);

DROP VIEW IF EXISTS public.totem_sugestoes;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sugestoes_regras' AND table_type = 'BASE TABLE') THEN
    ALTER TABLE public.sugestoes_regras RENAME TO totem_sugestoes;
  END IF;
END $$;

DELETE FROM public.app_migrations WHERE versao = '150';

COMMIT;
