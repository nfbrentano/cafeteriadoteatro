BEGIN;

-- ==============================================================================
-- CAF-000080 — Fuso horário consistente (America/Sao_Paulo) e corte do dia operacional
-- ==============================================================================

-- 1. Funções utilitárias no banco para início e fim do dia em São Paulo
CREATE OR REPLACE FUNCTION public.fn_inicio_dia_sp(p_data DATE DEFAULT NULL)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (COALESCE(p_data, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)::text || ' 00:00:00 America/Sao_Paulo')::timestamptz;
$$;

CREATE OR REPLACE FUNCTION public.fn_fim_dia_sp(p_data DATE DEFAULT NULL)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (COALESCE(p_data, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)::text || ' 23:59:59.999 America/Sao_Paulo')::timestamptz;
$$;

GRANT EXECUTE ON FUNCTION public.fn_inicio_dia_sp(DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fim_dia_sp(DATE) TO anon, authenticated;

-- 2. Recriação da view v_painel_retirada com corte robusto do dia em São Paulo (B6)
DROP VIEW IF EXISTS public.v_painel_retirada;
CREATE OR REPLACE VIEW public.v_painel_retirada WITH (security_invoker = false) AS
SELECT 
  numero_pedido,
  split_part(trim(coalesce(cliente_nome, '')), ' ', 1) AS primeiro_nome,
  status,
  pronto_em
FROM public.pedidos
WHERE (
    created_at >= public.fn_inicio_dia_sp()
    OR (retirada_em IS NOT NULL AND retirada_em >= public.fn_inicio_dia_sp() AND retirada_em <= public.fn_fim_dia_sp())
  )
  AND status IN ('pendente', 'em_preparo', 'concluido')
  AND (retirada_em IS NULL OR retirada_em <= now() + INTERVAL '25 minutes');

GRANT SELECT ON public.v_painel_retirada TO anon, authenticated;

-- 3. Padronização de DEFAULTS de colunas TIMESTAMPTZ para now() em vez de timezone('America/Sao_Paulo', now())
DO $$
BEGIN
  -- pedidos
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'created_at') THEN
    ALTER TABLE public.pedidos ALTER COLUMN created_at SET DEFAULT now();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'updated_at') THEN
    ALTER TABLE public.pedidos ALTER COLUMN updated_at SET DEFAULT now();
  END IF;

  -- pedido_itens
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedido_itens' AND column_name = 'created_at') THEN
    ALTER TABLE public.pedido_itens ALTER COLUMN created_at SET DEFAULT now();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedido_itens' AND column_name = 'updated_at') THEN
    ALTER TABLE public.pedido_itens ALTER COLUMN updated_at SET DEFAULT now();
  END IF;

  -- mesa_chamados
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mesa_chamados' AND column_name = 'created_at') THEN
    ALTER TABLE public.mesa_chamados ALTER COLUMN created_at SET DEFAULT now();
  END IF;

  -- cardapio_eventos_diarios
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cardapio_eventos_diarios' AND column_name = 'created_at') THEN
    ALTER TABLE public.cardapio_eventos_diarios ALTER COLUMN created_at SET DEFAULT now();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cardapio_eventos_diarios' AND column_name = 'updated_at') THEN
    ALTER TABLE public.cardapio_eventos_diarios ALTER COLUMN updated_at SET DEFAULT now();
  END IF;
END $$;

-- 4. Função para auditoria e simulação de correção de registros históricos (RF06 / CA08)
CREATE OR REPLACE FUNCTION public.fn_simular_correcao_fuso_historico()
RETURNS TABLE (
  tabela TEXT,
  coluna TEXT,
  total_linhas_afetadas BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retorna a contagem de registros que foram gravados com deslocamento histórico
  RETURN QUERY
  SELECT 'pedidos'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.pedidos
  WHERE created_at < '2026-10-21 00:00:00Z'
    AND EXTRACT(TIMEZONE FROM created_at) = 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_simular_correcao_fuso_historico() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_simular_correcao_fuso_historico() TO authenticated;

-- Registro de aplicação (RF04)
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('080', 'migration_caf_000080_fuso_horario.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
