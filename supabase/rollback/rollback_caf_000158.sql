BEGIN;

-- ==============================================================================
-- Rollback CAF-000158 - Correção das RPCs get_resumo_financeiro e admin_create_user
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_resumo_financeiro();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_migrations') THEN
    DELETE FROM public.app_migrations WHERE versao = '158';
  END IF;
END $$;

-- Restaurar get_resumo_financeiro sem defaults
CREATE OR REPLACE FUNCTION public.get_resumo_financeiro(
  p_mes INT,
  p_ano INT
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

  SELECT COALESCE(SUM(valor), 0), COUNT(*)
  INTO v_vencidas_total, v_vencidas_qtd
  FROM public.despesas
  WHERE pago_em IS NULL AND vencimento < CURRENT_DATE;

  SELECT COALESCE(SUM(valor), 0), COUNT(*)
  INTO v_vence_7d_total, v_vence_7d_qtd
  FROM public.despesas
  WHERE pago_em IS NULL 
    AND vencimento >= CURRENT_DATE 
    AND vencimento <= (CURRENT_DATE + interval '7 days')::DATE;

  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0)
  INTO v_total_pago
  FROM public.despesas
  WHERE pago_em >= v_data_inicio AND pago_em <= v_data_fim;

  SELECT COALESCE(SUM(total), 0)
  INTO v_total_faturamento
  FROM public.pedidos
  WHERE status != 'cancelado' 
    AND status_pagamento = 'pago'
    AND created_at::DATE >= v_data_inicio 
    AND created_at::DATE <= v_data_fim;

  v_resultado := v_total_faturamento - v_total_pago;

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
    'vence_7d_total', v_vence_7d_total,
    'vence_7d_qtd', v_vence_7d_qtd,
    'total_pago', v_total_pago,
    'total_faturamento', v_total_faturamento,
    'resultado_operacional', v_resultado,
    'despesas_por_categoria', v_despesas_por_cat
  );
END;
$$;

-- Restaurar admin_create_user com search_path = public
CREATE OR REPLACE FUNCTION public.admin_create_user(
  email TEXT,
  password TEXT,
  nome TEXT,
  role_param TEXT,
  pode_dar_desconto_param BOOLEAN DEFAULT false
) RETURNS json 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_user_id UUID;
  encrypted_pw TEXT;
BEGIN
  IF public.get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem criar usuários.';
  END IF;

  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

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

COMMIT;
