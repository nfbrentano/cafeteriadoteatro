-- =========================================================
-- MIGRATION: CAF-000023 - TAXA DE SERVIÇO E DESCONTO MANUAL
-- =========================================================

-- 1. Tabela fechamentos: novas colunas
ALTER TABLE public.fechamentos ADD COLUMN IF NOT EXISTS taxa_servico NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fechamentos ADD COLUMN IF NOT EXISTS desconto_manual NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fechamentos ADD COLUMN IF NOT EXISTS desconto_motivo TEXT;
ALTER TABLE public.fechamentos ADD COLUMN IF NOT EXISTS desconto_por UUID REFERENCES auth.users(id);

-- 2. Tabela perfis: permissão de desconto
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS pode_dar_desconto BOOLEAN NOT NULL DEFAULT false;

-- Permitir update de perfis para admin
DROP POLICY IF EXISTS "perfis_update_admin" ON public.perfis;
CREATE POLICY "perfis_update_admin" ON public.perfis FOR UPDATE USING (public.get_user_role() = 'admin');

-- Admins existentes já ganham a permissão
UPDATE public.perfis SET pode_dar_desconto = true WHERE role = 'admin';

-- 3. Atualizar a trigger de criação de usuário para extrair a nova role
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, role, pode_dar_desconto)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'nome', 
    COALESCE(new.raw_user_meta_data->>'role', 'barista'),
    COALESCE((new.raw_user_meta_data->>'pode_dar_desconto')::boolean, false)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atualizar admin_create_user
CREATE OR REPLACE FUNCTION public.admin_create_user(
  email TEXT,
  password TEXT,
  nome TEXT,
  role_param TEXT,
  pode_dar_desconto_param BOOLEAN DEFAULT false
) RETURNS json AS $$
DECLARE
  new_user_id UUID;
  encrypted_pw TEXT;
BEGIN
  -- Validar se quem chama é admin
  IF public.get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem criar usuários.';
  END IF;

  -- Gerar UUID e hash da senha
  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Atualizar fechar_conta_mesa
CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(
  p_mesa_codigo TEXT, 
  p_pagamentos JSONB,
  p_taxa_servico NUMERIC(10,2) DEFAULT 0,
  p_desconto_manual NUMERIC(10,2) DEFAULT 0,
  p_desconto_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_pode_dar_desconto BOOLEAN;
  v_subtotal NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento JSONB;
  v_fechamento_id UUID;
  v_pedido RECORD;
  v_count_pedidos INT := 0;
  v_uid UUID := auth.uid();
BEGIN
  -- Verificar Role e Permissões
  SELECT role, pode_dar_desconto INTO v_user_role, v_pode_dar_desconto
  FROM public.perfis WHERE id = v_uid;

  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_desconto_manual > 0 AND NOT (v_user_role = 'admin' OR v_pode_dar_desconto = true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para aplicar desconto manual';
  END IF;

  IF p_desconto_manual > 0 AND (p_desconto_motivo IS NULL OR length(trim(p_desconto_motivo)) = 0) THEN
    RAISE EXCEPTION 'Motivo do desconto é obrigatório';
  END IF;

  -- 1. Calcular o total de pedidos em aberto
  SELECT COALESCE(SUM(total), 0), COUNT(id)
  INTO v_subtotal, v_count_pedidos
  FROM public.pedidos
  WHERE mesa_codigo = p_mesa_codigo
    AND (status_pagamento IS NULL OR status_pagamento != 'pago');

  IF v_count_pedidos = 0 THEN
    RAISE EXCEPTION 'Não há pedidos a pagar nesta mesa.';
  END IF;

  -- 2. Calcular total final: (Subtotal - Desconto) + Taxa
  v_total_a_pagar := (v_subtotal - p_desconto_manual) + p_taxa_servico;

  IF v_total_a_pagar < 0 THEN
    RAISE EXCEPTION 'O desconto não pode deixar a conta negativa.';
  END IF;

  -- 3. Calcular a soma dos pagamentos enviados
  FOR v_pagamento IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    v_total_pago := v_total_pago + (v_pagamento->>'valor')::NUMERIC(10,2);
  END LOOP;

  IF v_total_pago < v_total_a_pagar THEN
    RAISE EXCEPTION 'O valor dos pagamentos (R$ %) é inferior ao total a pagar (R$ %).', v_total_pago, v_total_a_pagar;
  END IF;

  -- Troco geral da conta
  v_troco := v_total_pago - v_total_a_pagar;

  -- 4. Inserir o Fechamento
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por, 
    taxa_servico, desconto_manual, desconto_motivo, desconto_por
  )
  VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid, 
    p_taxa_servico, p_desconto_manual, p_desconto_motivo, CASE WHEN p_desconto_manual > 0 THEN v_uid ELSE NULL END
  )
  RETURNING id INTO v_fechamento_id;

  -- 5. Inserir os Pagamentos
  FOR v_pagamento IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
    VALUES (v_fechamento_id, v_pagamento->>'forma', (v_pagamento->>'valor')::NUMERIC(10,2));
  END LOOP;

  -- 6. Vincular Pedidos e Marcar como Pago
  FOR v_pedido IN (
    SELECT id FROM public.pedidos 
    WHERE mesa_codigo = p_mesa_codigo AND (status_pagamento IS NULL OR status_pagamento != 'pago')
  ) LOOP
    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_pedido.id);
    
    UPDATE public.pedidos
    SET status_pagamento = 'pago'
    WHERE id = v_pedido.id;
  END LOOP;

  -- 7. Retornar dados do fechamento
  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'subtotal', v_subtotal,
    'taxa_servico', p_taxa_servico,
    'desconto_manual', p_desconto_manual,
    'total_conta', v_total_a_pagar,
    'total_pago', v_total_pago,
    'troco', v_troco
  );
END;
$$;
