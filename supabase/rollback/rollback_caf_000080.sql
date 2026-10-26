BEGIN;

-- Rollback CAF-000080
DELETE FROM public.app_migrations WHERE versao = '080';

DROP FUNCTION IF EXISTS public.fn_inicio_dia_sp(DATE);
DROP FUNCTION IF EXISTS public.fn_fim_dia_sp(DATE);
DROP FUNCTION IF EXISTS public.fn_simular_correcao_fuso_historico();

-- Restaura versão da CAF-000038 de v_painel_retirada
DROP VIEW IF EXISTS public.v_painel_retirada;
CREATE OR REPLACE VIEW public.v_painel_retirada WITH (security_invoker = false) AS
SELECT 
  id,
  numero_pedido,
  split_part(trim(coalesce(cliente_nome, '')), ' ', 1) AS primeiro_nome,
  status,
  pronto_em,
  mesa_codigo,
  para_viagem,
  created_at
FROM public.pedidos
WHERE status IN ('pendente', 'em_preparo', 'concluido');

GRANT SELECT ON public.v_painel_retirada TO anon, authenticated;

COMMIT;
