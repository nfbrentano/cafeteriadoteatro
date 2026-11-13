-- ==============================================================================
-- MIGRATION: CAF-000115 - OBSERVABILIDADE: CAPTURA DE ERROS DO FRONT E PAINEL DE SAÚDE
-- Implementa: CAF-000115
-- Descrição:
--   1. Tabela erros_cliente com RLS ativado (leitura exclusiva para admin).
--   2. Inserção controlada através da RPC segura registrar_erro_cliente.
--   3. RPC obter_resumo_erros_cliente para agrupamento e estatísticas no Admin.
--   4. RPC limpar_erros_antigos para expurgo automático/manual de registros > 30 dias.
--   5. Registro na tabela app_migrations (versão 115).
-- ==============================================================================

-- 1. Criação da tabela erros_cliente
CREATE TABLE IF NOT EXISTS public.erros_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tela TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'uncaught_error', -- 'uncaught_error', 'unhandled_rejection', 'rpc_error'
  mensagem TEXT NOT NULL,
  stack TEXT,
  rpc_nome TEXT,
  erro_codigo TEXT,
  versao_app TEXT,
  user_agent TEXT,
  usuario_id UUID,
  usuario_email TEXT,
  metadados JSONB DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Índices de performance para relatórios, agrupamentos e limpeza
CREATE INDEX IF NOT EXISTS idx_erros_cliente_criado_em ON public.erros_cliente (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_erros_cliente_tela ON public.erros_cliente (tela);
CREATE INDEX IF NOT EXISTS idx_erros_cliente_tipo ON public.erros_cliente (tipo);

-- 2. Habilitação de RLS e Políticas de Acesso
ALTER TABLE public.erros_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erros_cliente_select_admin" ON public.erros_cliente;
CREATE POLICY "erros_cliente_select_admin" ON public.erros_cliente
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'admin');

-- Bloqueia inserções, atualizações e exclusões diretas por anon e authenticated
REVOKE INSERT, UPDATE, DELETE ON public.erros_cliente FROM anon, authenticated;
GRANT SELECT ON public.erros_cliente TO authenticated;

-- 3. RPC para registro resiliente e sanitizado de erros (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.registrar_erro_cliente(
  p_tela TEXT,
  p_mensagem TEXT,
  p_tipo TEXT DEFAULT 'uncaught_error',
  p_stack TEXT DEFAULT NULL,
  p_versao TEXT DEFAULT NULL,
  p_rpc_nome TEXT DEFAULT NULL,
  p_erro_codigo TEXT DEFAULT NULL,
  p_metadados JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_msg TEXT;
  v_stack TEXT;
BEGIN
  -- Limita tamanhos para proteção contra estouro de payload
  v_msg := LEFT(COALESCE(p_mensagem, 'Erro sem mensagem'), 1000);
  v_stack := LEFT(COALESCE(p_stack, ''), 3000);

  -- Tenta obter o usuário logado com tratamento de exceção seguro
  BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
      SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
    v_user_email := NULL;
  END;

  INSERT INTO public.erros_cliente (
    tela,
    tipo,
    mensagem,
    stack,
    rpc_nome,
    erro_codigo,
    versao_app,
    user_agent,
    usuario_id,
    usuario_email,
    metadados,
    criado_em
  ) VALUES (
    LEFT(COALESCE(p_tela, 'desconhecida'), 100),
    LEFT(COALESCE(p_tipo, 'uncaught_error'), 50),
    v_msg,
    NULLIF(v_stack, ''),
    LEFT(NULLIF(p_rpc_nome, ''), 100),
    LEFT(NULLIF(p_erro_codigo, ''), 50),
    LEFT(COALESCE(p_versao, '1.0.0'), 50),
    LEFT(COALESCE(p_metadados->>'userAgent', ''), 300),
    v_user_id,
    v_user_email,
    COALESCE(p_metadados, '{}'::jsonb),
    timezone('utc', now())
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  -- Falhas na gravação do erro nunca devem propagar exceção para a tela
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. RPC para obter resumo agrupado de erros no painel Admin (apenas admin)
CREATE OR REPLACE FUNCTION public.obter_resumo_erros_cliente(
  p_horas INT DEFAULT 24,
  p_tela TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_corte TIMESTAMPTZ;
  v_total_erros INT := 0;
  v_telas_afetadas INT := 0;
  v_grupos JSONB := '[]'::jsonb;
  v_recentes JSONB := '[]'::jsonb;
BEGIN
  v_role := public.get_user_role();
  IF COALESCE(v_role, '') != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem visualizar erros do sistema';
  END IF;

  v_corte := timezone('utc', now()) - (COALESCE(p_horas, 24) || ' hours')::INTERVAL;

  -- Totais consolidados
  SELECT COUNT(*), COUNT(DISTINCT tela)
  INTO v_total_erros, v_telas_afetadas
  FROM public.erros_cliente
  WHERE criado_em >= v_corte
    AND (p_tela IS NULL OR p_tela = '' OR p_tela = 'todas' OR tela = p_tela);

  -- Grupos agregados por mensagem, tela e tipo
  SELECT jsonb_agg(g) INTO v_grupos
  FROM (
    SELECT
      tela,
      tipo,
      mensagem,
      rpc_nome,
      COUNT(*)::INT AS total_ocorrencias,
      MIN(criado_em) AS primeira_ocorrencia,
      MAX(criado_em) AS ultima_ocorrencia,
      MAX(versao_app) AS versao_app,
      (ARRAY_AGG(stack ORDER BY criado_em DESC))[1] AS stack_recente
    FROM public.erros_cliente
    WHERE criado_em >= v_corte
      AND (p_tela IS NULL OR p_tela = '' OR p_tela = 'todas' OR tela = p_tela)
    GROUP BY tela, tipo, mensagem, rpc_nome
    ORDER BY total_ocorrencias DESC, MAX(criado_em) DESC
    LIMIT 100
  ) g;

  -- Amostra dos 25 registros mais recentes
  SELECT jsonb_agg(r) INTO v_recentes
  FROM (
    SELECT
      id,
      tela,
      tipo,
      mensagem,
      stack,
      rpc_nome,
      erro_codigo,
      versao_app,
      usuario_email,
      criado_em
    FROM public.erros_cliente
    WHERE criado_em >= v_corte
      AND (p_tela IS NULL OR p_tela = '' OR p_tela = 'todas' OR tela = p_tela)
    ORDER BY criado_em DESC
    LIMIT 25
  ) r;

  RETURN jsonb_build_object(
    'periodo_horas', p_horas,
    'tela_filtro', p_tela,
    'total_erros', COALESCE(v_total_erros, 0),
    'telas_afetadas', COALESCE(v_telas_afetadas, 0),
    'grupos', COALESCE(v_grupos, '[]'::jsonb),
    'recentes', COALESCE(v_recentes, '[]'::jsonb)
  );
END;
$$;

-- 5. RPC para limpeza de erros com mais de N dias (padrão 30 dias)
CREATE OR REPLACE FUNCTION public.limpar_erros_antigos(
  p_dias INT DEFAULT 30
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_deletados INT := 0;
BEGIN
  v_role := public.get_user_role();
  IF COALESCE(v_role, '') != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem expurgar logs de erro';
  END IF;

  DELETE FROM public.erros_cliente
  WHERE criado_em < timezone('utc', now()) - (GREATEST(COALESCE(p_dias, 30), 1) || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deletados = ROW_COUNT;
  RETURN v_deletados;
END;
$$;

-- 6. Concessões de execução
GRANT EXECUTE ON FUNCTION public.registrar_erro_cliente(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.obter_resumo_erros_cliente(INT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.obter_resumo_erros_cliente(INT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.limpar_erros_antigos(INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.limpar_erros_antigos(INT) TO authenticated;

-- 7. Registro na tabela de controle de migrations
INSERT INTO public.app_migrations (versao, arquivo, aplicada_em, aplicada_por)
VALUES ('115', 'migration_caf_000115_erros_cliente.sql', timezone('utc', now()), current_user)
ON CONFLICT (versao) DO NOTHING;

