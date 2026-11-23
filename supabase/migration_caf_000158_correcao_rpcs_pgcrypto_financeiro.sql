-- Migration CAF-000158: Correção das RPCs get_resumo_financeiro (404 sem parâmetros) e admin_create_user (pgcrypto gen_salt)
-- Implementa: CAF-000158

BEGIN;

-- 1. Garantir que a extensão pgcrypto existe no schema extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Registrar versão da migração em app_migrations se existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_migrations') THEN
    INSERT INTO public.app_migrations (versao, arquivo)
    VALUES ('158', 'migration_caf_000158_correcao_rpcs_pgcrypto_financeiro.sql')
    ON CONFLICT (versao) DO NOTHING;
  END IF;
END $$;

-- 3. Atualizar public.get_resumo_financeiro com defaults para p_mes e p_ano e aliases de retorno
CREATE OR REPLACE FUNCTION public.get_resumo_financeiro(
  p_mes INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT,
  p_ano INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_vencidas_total NUMERIC(10,2) := 0;
  v_vencidas_qtd INT := 0;
  v_vence_7d_total NUMERIC(10,2) := 0;
  v_vence_7d_qtd INT := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_total_faturamento NUMERIC(10,2) := 0;
  v_resultado NUMERIC(10,2) := 0;
  v_despesas_por_cat JSONB := '[]'::JSONB;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_data_inicio := make_date(p_ano, p_mes, 1);
  v_data_fim := (v_data_inicio + interval '1 month' - interval '1 day')::DATE;

  -- 1. Contas vencidas não pagas (em qualquer data até ontem)
  SELECT 
    COALESCE(SUM(valor), 0),
    COUNT(*)
  INTO v_vencidas_total, v_vencidas_qtd
  FROM public.despesas
  WHERE pago_em IS NULL AND vencimento < CURRENT_DATE;

  -- 2. Contas a vencer nos próximos 7 dias (a partir de hoje)
  SELECT 
    COALESCE(SUM(valor), 0),
    COUNT(*)
  INTO v_vence_7d_total, v_vence_7d_qtd
  FROM public.despesas
  WHERE pago_em IS NULL 
    AND vencimento >= CURRENT_DATE 
    AND vencimento <= (CURRENT_DATE + interval '7 days')::DATE;

  -- 3. Total pago no mês selecionado
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0)
  INTO v_total_pago
  FROM public.despesas
  WHERE pago_em >= v_data_inicio AND pago_em <= v_data_fim;

  -- 4. Faturamento bruto do mês (pedidos concluídos/pagos no período)
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_faturamento
  FROM public.pedidos
  WHERE status != 'cancelado' 
    AND status_pagamento = 'pago'
    AND created_at::DATE >= v_data_inicio 
    AND created_at::DATE <= v_data_fim;

  -- 5. Resultado operacional (Faturamento - Despesas Pagas)
  v_resultado := v_total_faturamento - v_total_pago;

  -- 6. Despesas do mês agrupadas por categoria
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_despesas_por_cat
  FROM (
    SELECT 
      c.nome AS categoria,
      c.tipo,
      COUNT(d.id)::INT AS quantidade,
      ROUND(SUM(COALESCE(d.valor_pago, d.valor)), 2) AS total
    FROM public.despesas d
    JOIN public.despesa_categorias c ON c.id = d.categoria_id
    WHERE d.pago_em >= v_data_inicio AND d.pago_em <= v_data_fim
    GROUP BY c.nome, c.tipo
    ORDER BY total DESC
  ) sub;

  RETURN jsonb_build_object(
    'mes', p_mes,
    'ano', p_ano,
    'vencidas_total', v_vencidas_total,
    'vencidas_qtd', v_vencidas_qtd,
    'total_vencidas', v_vencidas_total,
    'qtd_vencidas', v_vencidas_qtd,
    'vence_7d_total', v_vence_7d_total,
    'vence_7d_qtd', v_vence_7d_qtd,
    'total_a_vencer_7d', v_vence_7d_total,
    'qtd_a_vencer_7d', v_vence_7d_qtd,
    'total_pago', v_total_pago,
    'total_despesas_pagas', v_total_pago,
    'total_faturamento', v_total_faturamento,
    'resultado_operacional', v_resultado,
    'despesas_por_categoria', v_despesas_por_cat
  );
END;
$$;

-- Permissões get_resumo_financeiro
REVOKE EXECUTE ON FUNCTION public.get_resumo_financeiro(INT, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_resumo_financeiro(INT, INT) TO authenticated;

-- 3b. Sobrecarga sem parâmetros de get_resumo_financeiro para compatibilidade com chamadas sem body do PostgREST
CREATE OR REPLACE FUNCTION public.get_resumo_financeiro()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_resumo_financeiro(
    EXTRACT(MONTH FROM CURRENT_DATE)::INT,
    EXTRACT(YEAR FROM CURRENT_DATE)::INT
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_resumo_financeiro() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_resumo_financeiro() TO authenticated;

-- 4. Eliminar sobrecarga antiga de 4 parâmetros se existir
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT);

-- 5. Atualizar public.admin_create_user qualificando extensions.crypt e extensions.gen_salt
CREATE OR REPLACE FUNCTION public.admin_create_user(
  email TEXT,
  password TEXT,
  nome TEXT,
  role_param TEXT,
  pode_dar_desconto_param BOOLEAN DEFAULT false
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_user_id UUID;
  encrypted_pw TEXT;
BEGIN
  -- Validar se quem chama é admin
  IF public.get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem criar usuários.';
  END IF;

  -- Gerar UUID e hash da senha com pgcrypto do schema extensions
  new_user_id := gen_random_uuid();
  encrypted_pw := extensions.crypt(password, extensions.gen_salt('bf'));

  -- Inserir no auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, 
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', email, encrypted_pw, now(),
    now(), now(), '{"provider":"email","providers":["email"]}', 
    json_build_object('nome', nome, 'role', role_param, 'pode_dar_desconto', pode_dar_desconto_param)::jsonb,
    now(), now(), '', '', '', ''
  );
  
  -- Insert no identities
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    new_user_id, new_user_id, new_user_id::text, 
    json_build_object('sub', new_user_id::text, 'email', email), 
    'email', now(), now(), now()
  );

  RETURN json_build_object('id', new_user_id, 'email', email, 'nome', nome, 'role', role_param);
END;
$$;

-- Permissões admin_create_user: restrito a usuários autenticados (guard interno exige role admin)
REVOKE EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- 6. Garantir que funções de totem e QR que usam digest/gen_random_bytes também encontrem extensions
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN ('validar_sessao_totem', 'parear_totem', 'gerar_qr_pedido_cliente', 'regerar_qr_token_pedido')
  ) LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, extensions;', r.proname, r.args);
  END LOOP;
END $$;

-- 7. Forçar recarregamento imediato do cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
