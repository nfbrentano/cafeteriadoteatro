-- ==============================================================================
-- CAF-000126: Autorização NULL-safe e revogação de anon nas RPCs SECURITY DEFINER
-- ==============================================================================
-- 1. Criação das funções auxiliares de verificação de cargo e permissão (NULL-safe)
-- 2. Hardening do trigger handle_new_user e remoção do overload de admin_create_user
-- 3. Atualização das RPCs com guards NULL-safe e SET search_path = public
-- 4. Revogação de EXECUTE para anon e PUBLIC em todas as SECURITY DEFINER fora da allowlist
-- 5. Hardening de privilégios padrão (ALTER DEFAULT PRIVILEGES)
-- ==============================================================================

-- 1. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO (NULL-SAFE)

CREATE OR REPLACE FUNCTION public.exigir_cargo(VARIADIC p_cargos TEXT[])
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_ativo BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado'
      USING ERRCODE = '42501';
  END IF;

  SELECT role, COALESCE(ativo, true)
  INTO v_role, v_ativo
  FROM public.perfis
  WHERE id = v_uid;

  IF v_role IS NULL OR v_ativo IS FALSE THEN
    RAISE EXCEPTION 'Acesso negado: perfil inexistente ou inativo'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_role = ANY(p_cargos)) THEN
    RAISE EXCEPTION 'Acesso negado: cargo insuficiente (necessário: %)', array_to_string(p_cargos, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN v_role;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exigir_cargo(VARIADIC TEXT[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.exigir_cargo(VARIADIC TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.exigir_permissao(p_permissao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.tem_permissao(p_permissao, v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: permissão insuficiente (%)', p_permissao
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exigir_permissao(TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.exigir_permissao(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.exigir_cargo_ou_permissao(p_permissao TEXT, VARIADIC p_cargos TEXT[])
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_ativo BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado'
      USING ERRCODE = '42501';
  END IF;

  SELECT role, COALESCE(ativo, true)
  INTO v_role, v_ativo
  FROM public.perfis
  WHERE id = v_uid;

  IF v_role IS NULL OR v_ativo IS FALSE THEN
    RAISE EXCEPTION 'Acesso negado: perfil inexistente ou inativo'
      USING ERRCODE = '42501';
  END IF;

  IF (v_role = ANY(p_cargos)) OR (p_permissao IS NOT NULL AND public.tem_permissao(p_permissao, v_uid)) THEN
    RETURN v_role;
  END IF;

  RAISE EXCEPTION 'Acesso negado: privilégios insuficientes'
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exigir_cargo_ou_permissao(TEXT, VARIADIC TEXT[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.exigir_cargo_ou_permissao(TEXT, VARIADIC TEXT[]) TO authenticated;


-- 2. HARDENING DO TRIGGER handle_new_user E admin_create_user

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NUNCA confia em role ou pode_dar_desconto de raw_user_meta_data
  -- Novos usuários criados via signup padrão sempre recebem 'barista' e pode_dar_desconto = false
  INSERT INTO public.perfis (id, nome, role, pode_dar_desconto)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1), 'Usuário'), 
    'barista',
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome;

  RETURN new;
END;
$$;

-- Eliminar overload legado de 4 parâmetros de admin_create_user
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT);

-- Manter e proteger o overload oficial de 5 parâmetros
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
  -- Validar se quem chama é admin de forma NULL-safe
  PERFORM public.exigir_cargo('admin');

  IF role_param NOT IN ('barista', 'cozinha', 'admin') THEN
    RAISE EXCEPTION 'Role inválida: %', role_param;
  END IF;

  -- Gerar UUID e hash da senha com pgcrypto (compatível com schema extensions ou public)
  new_user_id := gen_random_uuid();
  BEGIN
    encrypted_pw := extensions.crypt(password, extensions.gen_salt('bf'));
  EXCEPTION WHEN undefined_function OR undefined_table OR invalid_schema_name THEN
    encrypted_pw := crypt(password, gen_salt('bf'));
  END;

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

  -- Atualiza explicitamente o perfil com o cargo e permissão definidos pelo admin
  UPDATE public.perfis
  SET role = role_param,
      pode_dar_desconto = pode_dar_desconto_param,
      nome = COALESCE(admin_create_user.nome, perfis.nome)
  WHERE id = new_user_id;

  RETURN json_build_object('id', new_user_id, 'email', email, 'nome', nome, 'role', role_param);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;


-- RPC: adicionar_itens_pedido
CREATE OR REPLACE FUNCTION public.adicionar_itens_pedido(p_pedido_id BIGINT, p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_total NUMERIC(10,2);
  v_cortesia_de_id BIGINT;
  v_adicional_permitido BOOLEAN;
  v_status_pedido TEXT;
  v_novo_item_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_reaberto BOOLEAN := false;
  v_now TIMESTAMPTZ := timezone('America/Sao_Paulo', now());
BEGIN
  PERFORM public.exigir_cargo('barista', 'admin');

  -- 1. Verificar se pedido existe e se está cancelado
  SELECT status INTO v_status_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id;
  END IF;

  IF v_status_pedido = 'cancelado' THEN
    RAISE EXCEPTION 'Não é permitido adicionar itens a um pedido cancelado';
  END IF;

  -- 2. Inserir itens com flag lancado_depois = true
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record 
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF NOT FOUND THEN 
      RAISE EXCEPTION 'Produto não encontrado, inativo ou esgotado: %', v_item->>'produto_id'; 
    END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record 
        FROM public.produtos 
        WHERE id = v_sabor->>'produto_id' AND ativo = true AND disponivel = true;
        
        IF NOT FOUND THEN 
          RAISE EXCEPTION 'Sabor não encontrado ou esgotado: %', v_sabor->>'produto_id'; 
        END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT EXISTS (
          SELECT 1 FROM public.produto_adicionais_permitidos
          WHERE produto_id = v_produto_record.id AND adicional_id = v_adicional::text
        ) INTO v_adicional_permitido;

        IF NOT v_adicional_permitido THEN
          RAISE EXCEPTION 'Adicional % não permitido para o produto %', v_adicional::text, v_produto_record.id;
        END IF;

        SELECT preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text AND ativo = true;
        IF FOUND THEN 
          v_preco_unitario := v_preco_unitario + v_adicional_record.preco; 
        END IF;
      END LOOP;
    END IF;

    v_cortesia_de_id := (v_item->>'cortesia_de_item_id')::BIGINT;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, 
      observacoes, cortesia_de_item_id, estacao, lancado_depois, impresso_em
    ) VALUES (
      p_pedido_id, v_produto_record.id, v_produto_record.nome, (v_item->>'quantidade')::int,
      v_preco_base, v_preco_unitario, v_item->>'observacoes', v_cortesia_de_id,
      v_produto_record.estacao, true, NULL
    ) RETURNING id INTO v_pedido_item_id;

    v_novo_item_ids := array_append(v_novo_item_ids, v_pedido_item_id);

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id';
        INSERT INTO public.pedido_item_sabores (pedido_item_id, lado, produto_id, nome, preco) 
        VALUES (v_pedido_item_id, v_sabor->>'lado', v_sabor_record.id, v_sabor_record.nome, ROUND(v_sabor_record.preco * 0.5, 2));
      END LOOP;
    END IF;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text;
        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (pedido_item_id, adicional_id, nome, preco) 
          VALUES (v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 3. Reabertura do pedido se estava concluido ou entregue
  IF v_status_pedido IN ('concluido', 'entregue') THEN
    UPDATE public.pedidos
    SET status = 'em_preparo',
        concluido_em = NULL,
        concluido_por = NULL,
        updated_at = v_now
    WHERE id = p_pedido_id;

    v_reaberto := true;

    -- Registrar evento no log de auditoria
    BEGIN
      INSERT INTO public.pedido_eventos (
        pedido_id, acao, de, para, motivo, usuario_id, usuario_nome
      ) VALUES (
        p_pedido_id,
        'reaberto',
        v_status_pedido,
        'em_preparo',
        'Reaberto por item adicionado após conclusão',
        auth.uid(),
        public.fn_resolver_nome_usuario(auth.uid(), 'Sistema')
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  PERFORM public.aplicar_promocoes_pedido(p_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - desconto), 0) INTO v_total
  FROM public.pedido_itens WHERE pedido_id = p_pedido_id AND cancelado = false;

  UPDATE public.pedidos SET total = v_total WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'id', p_pedido_id, 
    'total', v_total,
    'reaberto', v_reaberto,
    'itens_adicionados', v_novo_item_ids
  );
END;
$$;

-- RPC: criar_pedido
CREATE OR REPLACE FUNCTION public.criar_pedido(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_pedido_id BIGINT;
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_mesa_codigo TEXT;
  v_obs_geral TEXT;
  v_forma_pagamento TEXT;
  v_status_pagamento TEXT;
  v_cliente_nome TEXT;
  v_cliente_id UUID := NULL;
  v_para_viagem BOOLEAN;
  v_client_id UUID;
  v_prioridade SMALLINT;
  v_prioridade_motivo TEXT;
  v_inseridos BIGINT[];
  v_item_index INT := 0;
  v_cortesia_de_index INT;
BEGIN
  -- Verificar Role
  PERFORM public.exigir_cargo('barista', 'admin');

  v_client_id := (p_payload->>'client_id')::UUID;

  -- Idempotência
  IF v_client_id IS NOT NULL THEN
    SELECT id, total INTO v_pedido_id, v_total FROM public.pedidos WHERE client_id = v_client_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_pedido_id, 'total', v_total, 'idempotent', true);
    END IF;
  END IF;

  v_mesa_codigo := p_payload->>'mesa_codigo';
  IF v_mesa_codigo IS NULL OR v_mesa_codigo = '' THEN
    v_mesa_codigo := 'BALCAO';
  END IF;

  v_obs_geral := p_payload->>'observacoes';
  v_forma_pagamento := p_payload->>'forma_pagamento';
  v_status_pagamento := COALESCE(p_payload->>'status_pagamento', 'pendente');
  v_cliente_nome := p_payload->>'cliente_nome';
  IF p_payload->>'cliente_id' IS NOT NULL AND p_payload->>'cliente_id' <> '' THEN
    v_cliente_id := (p_payload->>'cliente_id')::UUID;
  END IF;
  v_para_viagem := COALESCE((p_payload->>'para_viagem')::BOOLEAN, false);
  v_prioridade := COALESCE((p_payload->>'prioridade')::SMALLINT, 0);
  v_prioridade_motivo := p_payload->>'prioridade_motivo';

  -- Validação de forma de pagamento na conta
  IF v_forma_pagamento = 'conta_cliente' AND v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Pagamento na conta do cliente requer a seleção de um cliente cadastrado';
  END IF;

  INSERT INTO public.pedidos (
    mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, 
    total, cliente_nome, cliente_id, para_viagem, client_id, prioridade, prioridade_motivo
  ) VALUES (
    v_mesa_codigo, v_obs_geral, v_forma_pagamento, v_status_pagamento, auth.uid(),
    COALESCE(auth.jwt()->>'name', auth.jwt()->>'email', 'Barista'),
    0, v_cliente_nome, v_cliente_id, v_para_viagem, v_client_id, v_prioridade, v_prioridade_motivo
  ) RETURNING id INTO v_pedido_id;

  -- Inserir itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.estacao, p.tipo_montagem, c.nome as categoria_nome
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado, inativo ou esgotado: %', v_item->>'produto_id';
    END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      IF jsonb_typeof(v_item->'sabores') != 'array' THEN
        RAISE EXCEPTION 'Produto meio a meio requer array de sabores';
      END IF;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id' AND ativo = true AND disponivel = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'Sabor não encontrado ou esgotado: %', v_sabor->>'produto_id'; END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text AND ativo = true;
        IF FOUND THEN v_preco_unitario := v_preco_unitario + v_adicional_record.preco; END IF;
      END LOOP;
    END IF;

    v_cortesia_de_index := (v_item->>'cortesia_de_item_index')::INT;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes, cortesia_de_item_id, estacao
    ) VALUES (
      v_pedido_id, v_produto_record.id, v_produto_record.nome, (v_item->>'quantidade')::int,
      v_preco_base, v_preco_unitario, v_item->>'observacoes',
      CASE WHEN v_cortesia_de_index IS NOT NULL THEN v_inseridos[v_cortesia_de_index + 1] ELSE NULL END,
      v_produto_record.estacao
    ) RETURNING id INTO v_pedido_item_id;

    v_inseridos := array_append(v_inseridos, v_pedido_item_id);

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id';
        INSERT INTO public.pedido_item_sabores (pedido_item_id, lado, produto_id, nome, preco) 
        VALUES (v_pedido_item_id, v_sabor->>'lado', v_sabor_record.id, v_sabor_record.nome, ROUND(v_sabor_record.preco * 0.5, 2));
      END LOOP;
    END IF;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text;
        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (pedido_item_id, adicional_id, nome, preco) 
          VALUES (v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco);
        END IF;
      END LOOP;
    END IF;

    v_item_index := v_item_index + 1;
  END LOOP;

  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - desconto), 0) INTO v_total
  FROM public.pedido_itens WHERE pedido_id = v_pedido_id;

  UPDATE public.pedidos SET total = v_total WHERE id = v_pedido_id;

  -- Se for pago na conta do cliente, efetuar lançamento automático de consumo
  IF v_forma_pagamento = 'conta_cliente' AND v_status_pagamento = 'pago' AND v_total > 0 THEN
    PERFORM public.lancar_movimento_conta(
      p_cliente_id := v_cliente_id,
      p_tipo := 'consumo',
      p_valor := v_total,
      p_pedido_id := v_pedido_id,
      p_fechamento_id := NULL,
      p_forma_pagamento := 'conta_cliente',
      p_motivo := 'Consumo Pedido #' || v_pedido_id
    );
  END IF;

  RETURN jsonb_build_object('id', v_pedido_id, 'total', v_total);
END;
$$;

-- RPC: lancar_movimento_conta
CREATE OR REPLACE FUNCTION public.lancar_movimento_conta(
  p_cliente_id UUID,
  p_tipo TEXT,
  p_valor NUMERIC,
  p_pedido_id BIGINT DEFAULT NULL,
  p_fechamento_id BIGINT DEFAULT NULL,
  p_forma_pagamento TEXT DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_bypass_limite BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_cliente RECORD;
  v_saldo_atual NUMERIC(10,2) := 0;
  v_novo_saldo NUMERIC(10,2) := 0;
  v_mov_id BIGINT;
  v_user_nome TEXT;
  v_valor_mov NUMERIC(10,2);
BEGIN
  v_role := public.exigir_cargo('barista', 'admin');

  IF p_valor <= 0 AND p_tipo != 'ajuste' THEN
    RAISE EXCEPTION 'O valor do movimento deve ser maior que zero';
  END IF;

  -- Bloquear linha do cliente para concorrência
  SELECT * INTO v_cliente 
  FROM public.clientes 
  WHERE id = p_cliente_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF NOT v_cliente.conta_habilitada THEN
    RAISE EXCEPTION 'A conta corrente deste cliente não está habilitada';
  END IF;

  -- Calcular sinal:
  -- consumo: débito (valor negativo)
  -- pagamento, deposito, estorno: crédito (valor positivo)
  -- ajuste: usa o sinal fornecido
  IF p_tipo = 'consumo' THEN
    v_valor_mov := -ABS(p_valor);
  ELSIF p_tipo IN ('pagamento', 'deposito', 'estorno') THEN
    v_valor_mov := ABS(p_valor);
  ELSE
    v_valor_mov := p_valor;
  END IF;

  -- Saldo atual
  SELECT COALESCE(SUM(valor), 0.00) INTO v_saldo_atual
  FROM public.cliente_conta_movimentos
  WHERE cliente_id = p_cliente_id;

  v_novo_saldo := v_saldo_atual + v_valor_mov;

  -- Se o novo saldo for menor que o limite negativo permitido (-limite_credito)
  IF v_novo_saldo < -v_cliente.limite_credito THEN
    IF p_bypass_limite THEN
      IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'Acesso negado: apenas administradores podem ignorar o limite de crédito'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Limite de crédito excedido. Saldo atual: R$ %, Limite: R$ %, Tentativa: R$ %', 
        v_saldo_atual, v_cliente.limite_credito, ABS(p_valor);
    END IF;
  END IF;

  -- Identificar usuário operador
  SELECT COALESCE(raw_user_meta_data->>'nome', email) INTO v_user_nome
  FROM auth.users
  WHERE id = auth.uid();

  INSERT INTO public.cliente_conta_movimentos (
    cliente_id, tipo, valor, pedido_id, fechamento_id, forma_pagamento, motivo, criado_por, criado_por_nome
  ) VALUES (
    p_cliente_id, p_tipo, v_valor_mov, p_pedido_id, p_fechamento_id, p_forma_pagamento, p_motivo, auth.uid(), v_user_nome
  ) RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'movimento_id', v_mov_id,
    'saldo_anterior', v_saldo_atual,
    'novo_saldo', v_novo_saldo,
    'limite_disponivel', (v_cliente.limite_credito + v_novo_saldo)
  );
END;
$$;

-- RPC: buscar_clientes_pdv
CREATE OR REPLACE FUNCTION public.buscar_clientes_pdv(
  p_termo TEXT,
  p_limite INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  telefone TEXT,
  aceita_contato BOOLEAN,
  conta_habilitada BOOLEAN,
  saldo NUMERIC(10,2),
  limite_credito NUMERIC(10,2),
  limite_disponivel NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_digits TEXT;
BEGIN
  PERFORM public.exigir_cargo('barista', 'admin');

  v_digits := regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g');

  RETURN QUERY
  SELECT 
    c.id, 
    c.nome, 
    c.telefone, 
    c.aceita_contato,
    c.conta_habilitada,
    COALESCE(vs.saldo, 0.00) AS saldo,
    c.limite_credito,
    COALESCE(vs.limite_disponivel, c.limite_credito) AS limite_disponivel
  FROM public.clientes c
  LEFT JOIN public.v_cliente_saldo vs ON vs.cliente_id = c.id
  WHERE c.ativo = true 
    AND c.anonimizado = false
    AND (
      lower(c.nome) LIKE '%' || lower(trim(p_termo)) || '%'
      OR (length(v_digits) >= 3 AND c.telefone LIKE '%' || v_digits || '%')
    )
  ORDER BY 
    CASE 
      WHEN lower(c.nome) LIKE lower(trim(p_termo)) || '%' THEN 1
      ELSE 2
    END,
    c.nome ASC
  LIMIT p_limite;
END;
$$;

-- RPC: obter_extrato_cliente
CREATE OR REPLACE FUNCTION public.obter_extrato_cliente(
  p_cliente_id UUID,
  p_limite INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_cliente RECORD;
  v_saldo RECORD;
  v_movimentos JSONB := '[]'::JSONB;
BEGIN
  PERFORM public.exigir_cargo('barista', 'admin');

  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  SELECT * INTO v_saldo FROM public.v_cliente_saldo WHERE cliente_id = p_cliente_id;

  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_movimentos
  FROM (
    SELECT 
      m.id,
      m.tipo,
      m.valor,
      m.pedido_id,
      m.forma_pagamento,
      m.motivo,
      m.criado_por_nome,
      m.created_at
    FROM public.cliente_conta_movimentos m
    WHERE m.cliente_id = p_cliente_id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT p_limite
  ) sub;

  RETURN jsonb_build_object(
    'cliente_id', v_cliente.id,
    'cliente_nome', v_cliente.nome,
    'cliente_telefone', v_cliente.telefone,
    'conta_habilitada', v_cliente.conta_habilitada,
    'limite_credito', v_cliente.limite_credito,
    'dia_vencimento', v_cliente.dia_vencimento,
    'saldo', COALESCE(v_saldo.saldo, 0.00),
    'limite_disponivel', COALESCE(v_saldo.limite_disponivel, v_cliente.limite_credito),
    'movimentos', v_movimentos
  );
END;
$$;

-- RPC: obter_ficha_cliente
CREATE OR REPLACE FUNCTION public.obter_ficha_cliente(p_cliente_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_cliente RECORD;
  v_total_gasto NUMERIC(10,2) := 0;
  v_total_visitas INT := 0;
  v_ticket_medio NUMERIC(10,2) := 0;
  v_primeira_visita TIMESTAMPTZ := NULL;
  v_ultima_visita TIMESTAMPTZ := NULL;
  v_top_produtos JSONB := '[]'::JSONB;
  v_ultimos_pedidos JSONB := '[]'::JSONB;
BEGIN
  PERFORM public.exigir_cargo('barista', 'admin');

  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  -- Resumo de compras
  SELECT 
    COALESCE(SUM(total), 0),
    COUNT(*),
    MIN(created_at),
    MAX(created_at)
  INTO 
    v_total_gasto,
    v_total_visitas,
    v_primeira_visita,
    v_ultima_visita
  FROM public.pedidos
  WHERE cliente_id = p_cliente_id AND status != 'cancelado';

  IF v_total_visitas > 0 THEN
    v_ticket_medio := ROUND(v_total_gasto / v_total_visitas, 2);
  END IF;

  -- Top 5 produtos preferidos
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_top_produtos
  FROM (
    SELECT 
      pi.nome_produto,
      SUM(pi.quantidade)::INT AS quantidade_total,
      ROUND(SUM(pi.quantidade * pi.preco_unitario - pi.desconto), 2) AS valor_total
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE p.cliente_id = p_cliente_id AND p.status != 'cancelado'
    GROUP BY pi.nome_produto
    ORDER BY quantidade_total DESC, valor_total DESC
    LIMIT 5
  ) sub;

  -- Últimos 10 pedidos
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_ultimos_pedidos
  FROM (
    SELECT 
      p.id,
      p.numero_pedido,
      p.total,
      p.status,
      p.status_pagamento,
      p.forma_pagamento,
      p.mesa_codigo,
      p.para_viagem,
      p.created_at,
      COALESCE((
        SELECT string_agg(pi.quantidade || 'x ' || pi.nome_produto, ', ')
        FROM public.pedido_itens pi
        WHERE pi.pedido_id = p.id
      ), '') AS itens_resumo
    FROM public.pedidos p
    WHERE p.cliente_id = p_cliente_id
    ORDER BY p.created_at DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'cliente', row_to_json(v_cliente),
    'resumo', jsonb_build_object(
      'total_gasto', v_total_gasto,
      'total_visitas', v_total_visitas,
      'ticket_medio', v_ticket_medio,
      'primeira_visita', v_primeira_visita,
      'ultima_visita', v_ultima_visita
    ),
    'top_produtos', v_top_produtos,
    'ultimos_pedidos', v_ultimos_pedidos
  );
END;
$$;

-- RPC: mesclar_clientes
CREATE OR REPLACE FUNCTION public.mesclar_clientes(
  p_cliente_origem_id UUID,
  p_cliente_destino_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_qtd_pedidos INT;
BEGIN
  PERFORM public.exigir_cargo('admin');

  IF p_cliente_origem_id = p_cliente_destino_id THEN
    RAISE EXCEPTION 'Cliente de origem e destino não podem ser iguais';
  END IF;

  -- Mover pedidos
  UPDATE public.pedidos
  SET cliente_id = p_cliente_destino_id
  WHERE cliente_id = p_cliente_origem_id;

  GET DIAGNOSTICS v_qtd_pedidos = ROW_COUNT;

  -- Desativar cliente de origem
  UPDATE public.clientes
  SET ativo = false,
      observacoes = COALESCE(observacoes, '') || ' [Mesclado com cliente ' || p_cliente_destino_id::text || ' em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ']',
      updated_at = now()
  WHERE id = p_cliente_origem_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedidos_migrados', v_qtd_pedidos
  );
END;
$$;

-- RPC: anonimizar_cliente
CREATE OR REPLACE FUNCTION public.anonimizar_cliente(p_cliente_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  PERFORM public.exigir_cargo('admin');

  UPDATE public.clientes
  SET nome = 'Cliente Anonimizado',
      telefone = NULL,
      email = NULL,
      data_nascimento = NULL,
      observacoes = NULL,
      aceita_contato = false,
      anonimizado = true,
      ativo = false,
      updated_at = now()
  WHERE id = p_cliente_id;

  -- Manter pedidos.cliente_id intacto para relatórios e contabilidade,
  -- mas o cliente_nome no pedido histórico pode ser ajustado para proteção dos dados
  UPDATE public.pedidos
  SET cliente_nome = 'Cliente Anonimizado'
  WHERE cliente_id = p_cliente_id;

  RETURN jsonb_build_object('sucesso', true, 'anonimizado', true);
END;
$$;

-- RPC: baixar_despesa
CREATE OR REPLACE FUNCTION public.baixar_despesa(
  p_despesa_id BIGINT,
  p_pago_em DATE,
  p_valor_pago NUMERIC,
  p_forma_pagamento TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_despesa RECORD;
  v_prox_vencimento DATE;
  v_prox_id BIGINT := NULL;
  v_user_nome TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem baixar despesas';
  END IF;

  SELECT * INTO v_despesa FROM public.despesas WHERE id = p_despesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada';
  END IF;

  IF p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'O valor pago deve ser maior que zero';
  END IF;

  -- Atualizar a despesa atual como paga
  UPDATE public.despesas
  SET 
    pago_em = COALESCE(p_pago_em, CURRENT_DATE),
    valor_pago = p_valor_pago,
    forma_pagamento = p_forma_pagamento,
    updated_at = now()
  WHERE id = p_despesa_id;

  -- Se for mensal e ainda não gerou a próxima parcela
  IF v_despesa.recorrencia = 'mensal' AND NOT v_despesa.proxima_recorrencia_criada THEN
    v_prox_vencimento := (v_despesa.vencimento + interval '1 month')::DATE;

    SELECT COALESCE(raw_user_meta_data->>'nome', email) INTO v_user_nome
    FROM auth.users
    WHERE id = auth.uid();

    INSERT INTO public.despesas (
      descricao, fornecedor_id, categoria_id, valor, vencimento, 
      pago_em, valor_pago, forma_pagamento, origem, recorrencia, 
      proxima_recorrencia_criada, observacoes, criado_por, criado_por_nome
    ) VALUES (
      v_despesa.descricao, v_despesa.fornecedor_id, v_despesa.categoria_id, v_despesa.valor, v_prox_vencimento,
      NULL, NULL, NULL, v_despesa.origem, 'mensal',
      false, v_despesa.observacoes, auth.uid(), v_user_nome
    ) RETURNING id INTO v_prox_id;

    UPDATE public.despesas SET proxima_recorrencia_criada = true WHERE id = p_despesa_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'despesa_id', p_despesa_id,
    'proxima_despesa_id', v_prox_id,
    'proximo_vencimento', v_prox_vencimento
  );
END;
$$;

-- Eliminar sobrecarga ambígua sem parâmetros de get_resumo_financeiro
DROP FUNCTION IF EXISTS public.get_resumo_financeiro();

-- RPC: get_resumo_financeiro (params com defaults)
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
  PERFORM public.exigir_cargo('admin');

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

-- RPC: get_fluxo_caixa
CREATE OR REPLACE FUNCTION public.get_fluxo_caixa(
  p_inicio DATE,
  p_fim DATE
)
RETURNS TABLE (
  data DATE,
  entradas NUMERIC(10,2),
  saidas NUMERIC(10,2),
  saldo_dia NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  PERFORM public.exigir_cargo('admin');

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(p_inicio, p_fim, '1 day'::interval)::DATE AS dia
  ),
  vendas AS (
    SELECT 
      created_at::DATE AS dia,
      COALESCE(SUM(total), 0) AS total_vendas
    FROM public.pedidos
    WHERE status != 'cancelado' 
      AND status_pagamento = 'pago'
      AND created_at::DATE >= p_inicio AND created_at::DATE <= p_fim
    GROUP BY created_at::DATE
  ),
  despesas_pagas AS (
    SELECT 
      pago_em AS dia,
      COALESCE(SUM(COALESCE(valor_pago, valor)), 0) AS total_despesas
    FROM public.despesas
    WHERE pago_em IS NOT NULL
      AND pago_em >= p_inicio AND pago_em <= p_fim
    GROUP BY pago_em
  )
  SELECT 
    d.dia AS data,
    COALESCE(v.total_vendas, 0.00)::NUMERIC(10,2) AS entradas,
    COALESCE(dp.total_despesas, 0.00)::NUMERIC(10,2) AS saidas,
    (COALESCE(v.total_vendas, 0.00) - COALESCE(dp.total_despesas, 0.00))::NUMERIC(10,2) AS saldo_dia
  FROM dias d
  LEFT JOIN vendas v ON v.dia = d.dia
  LEFT JOIN despesas_pagas dp ON dp.dia = d.dia
  ORDER BY d.dia ASC;
END;
$$;

-- RPC: get_admin_reports
CREATE OR REPLACE FUNCTION public.get_admin_reports(
  p_inicio TIMESTAMPTZ,
  p_fim TIMESTAMPTZ,
  p_categoria_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_cortesias JSONB;
  v_mais_vendidos JSONB;
  v_pagamentos JSONB;
  v_promocoes JSONB;
  v_tempo_preparo JSONB;
  v_tempo_por_categoria JSONB;
  v_horarios_pico_hora JSONB;
  v_horarios_pico_dia JSONB;
  v_ticket_medio JSONB;
  v_margem_produtos JSONB;
  v_cmv_resumo JSONB;
  v_total_taxas_periodo NUMERIC(10,2) := 0;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role != 'admin' AND NOT public.tem_permissao('admin.relatorios') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  -- 1. Cortesias concedidas
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_cortesias
  FROM (
    SELECT
      pi_origem.nome_produto AS prato_liberador,
      SUM(pi_cortesia.quantidade) AS total_cortesias,
      SUM(pi_cortesia.quantidade * pi_cortesia.preco_unitario) AS valor_abonado,
      SUM(pi_cortesia.quantidade * COALESCE(pi_cortesia.custo_unitario, 0)) AS custo_cortesias
    FROM public.pedido_itens pi_cortesia
    JOIN public.pedido_itens pi_origem ON pi_cortesia.cortesia_de_item_id = pi_origem.id
    JOIN public.pedidos p ON p.id = pi_cortesia.pedido_id
    WHERE pi_cortesia.cortesia_de_item_id IS NOT NULL
      AND pi_cortesia.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY pi_origem.nome_produto
    ORDER BY total_cortesias DESC
  ) t;

  -- 2. Mais Vendidos
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_mais_vendidos
  FROM (
    SELECT
      pi.nome_produto,
      SUM(pi.quantidade) AS quantidade_vendida,
      SUM(pi.quantidade * pi.preco_unitario) AS faturamento
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
      AND (p_categoria_id IS NULL OR p_categoria_id = '' OR pi.categoria_id = p_categoria_id)
    GROUP BY pi.nome_produto
    ORDER BY quantidade_vendida DESC
    LIMIT 100
  ) t;

  -- 3. Pagamentos (Bruto, Taxa Histórica e Líquido)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_pagamentos
  FROM (
    SELECT
      forma,
      ROUND(SUM(valor_bruto), 2) AS total_valor,
      ROUND(SUM(valor_bruto), 2) AS total_bruto,
      ROUND(SUM(valor_taxa), 2) AS total_taxa,
      ROUND(SUM(GREATEST(0, valor_bruto - valor_taxa)), 2) AS total_liquido
    FROM (
      SELECT
        CASE
          WHEN fp.forma = 'credito' THEN 'cartao_credito'
          WHEN fp.forma = 'debito' THEN 'cartao_debito'
          ELSE COALESCE(fp.forma, 'outros')
        END AS forma,
        GREATEST(
          0,
          fp.valor - CASE WHEN fp.forma = 'dinheiro' THEN COALESCE(f.troco, 0) ELSE 0 END
        ) AS valor_bruto,
        COALESCE(fp.taxa_valor, 0) AS valor_taxa
      FROM public.fechamento_pagamentos fp
      JOIN public.fechamentos f ON f.id = fp.fechamento_id
      WHERE f.created_at >= p_inicio AND f.created_at <= p_fim
      UNION ALL
      SELECT
        CASE
          WHEN p.forma_pagamento = 'credito' THEN 'cartao_credito'
          WHEN p.forma_pagamento = 'debito' THEN 'cartao_debito'
          ELSE COALESCE(p.forma_pagamento, 'outros')
        END AS forma,
        p.total AS valor_bruto,
        COALESCE(p.taxa_pagamento_valor, 0) AS valor_taxa
      FROM public.pedidos p
      LEFT JOIN public.fechamento_pedidos fped ON fped.pedido_id = p.id
      WHERE fped.pedido_id IS NULL
        AND p.status_pagamento = 'pago'
        AND p.status != 'cancelado'
        AND p.forma_pagamento IS NOT NULL
        AND p.created_at >= p_inicio AND p.created_at <= p_fim
    ) todas_formas
    GROUP BY forma
    ORDER BY total_valor DESC
  ) t;

  SELECT COALESCE(SUM((elem->>'total_taxa')::NUMERIC(10,2)), 0)
  INTO v_total_taxas_periodo
  FROM jsonb_array_elements(v_pagamentos) elem;

  -- 4. Promoções
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_promocoes
  FROM (
    SELECT
      prom.nome AS promocao_nome,
      COUNT(pi.id) AS vezes_aplicada,
      SUM(pi.desconto) AS desconto_total,
      SUM(pi.quantidade * pi.preco_unitario) AS faturamento,
      SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS custo_total,
      SUM(pi.quantidade * pi.preco_unitario) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS lucro_com_desconto,
      (SUM(pi.quantidade * pi.preco_unitario) + SUM(COALESCE(pi.desconto, 0))) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS lucro_sem_desconto
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    JOIN public.promocoes prom ON prom.id = pi.promocao_id
    WHERE pi.promocao_id IS NOT NULL
      AND pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY prom.nome
    ORDER BY desconto_total DESC
  ) t;

  -- 5. Tempo de preparo
  SELECT row_to_json(t) INTO v_tempo_preparo
  FROM (
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (iniciado_em - created_at))/60), 0) AS media_fila_minutos,
      COALESCE(AVG(EXTRACT(EPOCH FROM (concluido_em - iniciado_em))/60), 0) AS media_preparo_minutos
    FROM public.pedidos
    WHERE status IN ('concluido', 'entregue')
      AND iniciado_em IS NOT NULL
      AND concluido_em IS NOT NULL
      AND created_at >= p_inicio
      AND created_at <= p_fim
  ) t;

  -- 5b. Tempo por categoria (CAF-000029)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_tempo_por_categoria
  FROM (
    SELECT
      c.id AS categoria_id,
      c.nome AS categoria_nome,
      c.icone AS categoria_icone,
      COALESCE(c.tempo_alvo_min, 15) AS tempo_alvo_min,
      COUNT(pi.id) AS total_itens_concluidos,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (pi.pronto_em - p.created_at))/60), 0)::numeric, 1) AS media_preparo_minutos
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    JOIN public.produtos prod ON prod.id = pi.produto_id
    JOIN public.categorias c ON c.id = prod.categoria_id
    WHERE pi.pronto_em IS NOT NULL
      AND pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY c.id, c.nome, c.icone, c.tempo_alvo_min
    ORDER BY media_preparo_minutos DESC
  ) t;

  -- 6. Horários de pico - Por Hora
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_horarios_pico_hora
  FROM (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Sao_Paulo')) AS hora,
      COUNT(id) AS total_pedidos,
      SUM(total) AS faturamento
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
    GROUP BY hora
    ORDER BY hora ASC
  ) t;

  -- 7. Horários de pico - Por Dia
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_horarios_pico_dia
  FROM (
    SELECT
      EXTRACT(DOW FROM (created_at AT TIME ZONE 'America/Sao_Paulo')) AS dia,
      COUNT(id) AS total_pedidos,
      SUM(total) AS faturamento
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
    GROUP BY dia
    ORDER BY dia ASC
  ) t;

  -- 8. Ticket Médio e Resumo Geral (com taxas e faturamento líquido)
  SELECT row_to_json(t) INTO v_ticket_medio
  FROM (
    SELECT
      COALESCE(SUM(total), 0) AS faturamento_total,
      v_total_taxas_periodo AS taxas_pagamento_total,
      GREATEST(0, COALESCE(SUM(total), 0) - v_total_taxas_periodo) AS faturamento_liquido,
      COUNT(id) AS pedidos_validos,
      CASE
        WHEN COUNT(id) > 0 THEN COALESCE(SUM(total), 0) / COUNT(id)
        ELSE 0
      END AS ticket_medio
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
  ) t;

  -- 9. Margem e Lucro por Produto (CAF-000032)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_margem_produtos
  FROM (
    SELECT
      pi.produto_id,
      pi.nome_produto,
      SUM(pi.quantidade) AS quantidade_vendida,
      SUM(pi.quantidade * pi.preco_unitario) AS faturamento,
      SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS custo_total,
      SUM(pi.quantidade * pi.preco_unitario) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS lucro_bruto,
      CASE
        WHEN SUM(pi.quantidade * pi.preco_unitario) > 0
        THEN ROUND(((SUM(pi.quantidade * pi.preco_unitario) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0))) / SUM(pi.quantidade * pi.preco_unitario) * 100)::numeric, 1)
        ELSE 0
      END AS margem_percentual
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
      AND (p_categoria_id IS NULL OR p_categoria_id = '' OR pi.categoria_id = p_categoria_id)
    GROUP BY pi.produto_id, pi.nome_produto
    ORDER BY faturamento DESC
  ) t;

  -- 10. Resumo de CMV e Lucro Bruto do Período (CAF-000032)
  SELECT row_to_json(t) INTO v_cmv_resumo
  FROM (
    WITH totais AS (
      SELECT
        COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0) AS faturamento_total,
        COALESCE(SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)), 0) AS custo_total
      FROM public.pedido_itens pi
      JOIN public.pedidos p ON p.id = pi.pedido_id
      WHERE pi.cancelado = false
        AND p.status != 'cancelado'
        AND p.created_at >= p_inicio
        AND p.created_at <= p_fim
    ),
    cortesias AS (
      SELECT
        COALESCE(SUM(pi_cortesia.quantidade * COALESCE(pi_cortesia.custo_unitario, 0)), 0) AS custo_cortesias
      FROM public.pedido_itens pi_cortesia
      JOIN public.pedidos p ON p.id = pi_cortesia.pedido_id
      WHERE pi_cortesia.cortesia_de_item_id IS NOT NULL
        AND pi_cortesia.cancelado = false
        AND p.status != 'cancelado'
        AND p.created_at >= p_inicio
        AND p.created_at <= p_fim
    )
    SELECT
      totais.faturamento_total,
      totais.custo_total AS cmv_total,
      (totais.faturamento_total - totais.custo_total) AS lucro_bruto_total,
      v_total_taxas_periodo AS taxas_pagamento_total,
      (totais.faturamento_total - totais.custo_total - v_total_taxas_periodo) AS lucro_liquido_apos_taxas,
      CASE
        WHEN totais.faturamento_total > 0
        THEN ROUND((totais.custo_total / totais.faturamento_total * 100)::numeric, 1)
        ELSE 0
      END AS cmv_percentual,
      CASE
        WHEN totais.faturamento_total > 0
        THEN ROUND(((totais.faturamento_total - totais.custo_total) / totais.faturamento_total * 100)::numeric, 1)
        ELSE 0
      END AS margem_media_percentual,
      cortesias.custo_cortesias
    FROM totais, cortesias
  ) t;

  RETURN jsonb_build_object(
    'cortesias', v_cortesias,
    'mais_vendidos', v_mais_vendidos,
    'pagamentos', v_pagamentos,
    'promocoes', v_promocoes,
    'tempo_preparo', v_tempo_preparo,
    'tempo_por_categoria', v_tempo_por_categoria,
    'horarios_pico_hora', v_horarios_pico_hora,
    'horarios_pico_dia', v_horarios_pico_dia,
    'resumo', v_ticket_medio,
    'margem_produtos', v_margem_produtos,
    'cmv_resumo', v_cmv_resumo
  );
END;
$$;

-- RPC: lancar_taxas_pagamento_despesa
CREATE OR REPLACE FUNCTION public.lancar_taxas_pagamento_despesa(
  p_ano INT,
  p_mes INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_inicio TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  v_data_ref DATE;
  v_total_taxas NUMERIC(10,2) := 0;
  v_cat_id INT;
  v_despesa_id BIGINT;
  v_desc TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' AND NOT public.tem_permissao('admin.financeiro') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  v_data_ref := (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::DATE;
  v_inicio := make_timestamptz(p_ano, p_mes, 1, 0, 0, 0, 'America/Sao_Paulo');
  v_fim := (v_inicio + interval '1 month' - interval '1 microsecond');

  SELECT ROUND(COALESCE(SUM(valor_taxa), 0), 2)
  INTO v_total_taxas
  FROM (
    SELECT COALESCE(fp.taxa_valor, 0) AS valor_taxa
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    WHERE f.created_at >= v_inicio AND f.created_at <= v_fim
    UNION ALL
    SELECT COALESCE(p.taxa_pagamento_valor, 0) AS valor_taxa
    FROM public.pedidos p
    LEFT JOIN public.fechamento_pedidos fped ON fped.pedido_id = p.id
    WHERE fped.pedido_id IS NULL
      AND p.status_pagamento = 'pago'
      AND p.status != 'cancelado'
      AND p.created_at >= v_inicio AND p.created_at <= v_fim
  ) sub;

  IF v_total_taxas <= 0 THEN
    RAISE EXCEPTION 'Não há taxas de pagamento acumuladas em %/% para lançar.', LPAD(p_mes::text, 2, '0'), p_ano;
  END IF;

  -- Obter ou criar categoria "Taxas de Cartão / Maquininha"
  SELECT id INTO v_cat_id
  FROM public.despesa_categorias
  WHERE lower(nome) LIKE '%taxa%' OR lower(nome) LIKE '%maquininha%' OR lower(nome) LIKE '%financeir%'
  ORDER BY (CASE WHEN lower(nome) LIKE '%taxa%' THEN 0 ELSE 1 END)
  LIMIT 1;

  IF v_cat_id IS NULL THEN
    INSERT INTO public.despesa_categorias (nome, tipo)
    VALUES ('Taxas de Pagamento / Maquininha', 'variavel')
    RETURNING id INTO v_cat_id;
  END IF;

  v_desc := format('Taxas de meios de pagamento (%s/%s)', LPAD(p_mes::text, 2, '0'), p_ano);

  -- Verificar se já existe lançamento para o mês e atualizar ou inserir
  SELECT id INTO v_despesa_id
  FROM public.despesas
  WHERE descricao = v_desc
  LIMIT 1;

  IF v_despesa_id IS NOT NULL THEN
    UPDATE public.despesas
    SET valor = v_total_taxas,
        valor_pago = v_total_taxas,
        vencimento = v_data_ref,
        pago_em = v_data_ref
    WHERE id = v_despesa_id;
  ELSE
    INSERT INTO public.despesas (
      descricao, categoria_id, valor, vencimento, pago_em, valor_pago, forma_pagamento, recorrencia, observacoes, criado_por
    ) VALUES (
      v_desc, v_cat_id, v_total_taxas, v_data_ref, v_data_ref, v_total_taxas, 'outros', 'nenhuma',
      'Gerado automaticamente a partir das taxas de pagamento registradas nas vendas do mês (CAF-000039).',
      auth.uid()
    )
    RETURNING id INTO v_despesa_id;
  END IF;

  RETURN jsonb_build_object(
    'despesa_id', v_despesa_id,
    'descricao', v_desc,
    'valor', v_total_taxas
  );
END;
$$;

-- RPC: get_totais_caixa
CREATE OR REPLACE FUNCTION public.get_totais_caixa(p_caixa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_cfg JSONB;
  v_cega BOOLEAN;
  v_totais JSONB;
  v_fechado_em TIMESTAMPTZ;
BEGIN
  v_role := public.exigir_cargo_ou_permissao('caixa.abrir_fechar', 'barista', 'admin');

  v_cfg := public.fn_get_config_caixa();
  v_cega := COALESCE((v_cfg->>'conferencia_cega')::BOOLEAN, true);

  v_totais := public.fn_calcular_totais_caixa_interno(p_caixa_id);
  v_fechado_em := (v_totais->>'fechado_em')::TIMESTAMPTZ;

  -- Se conferência cega está ligada, o caixa ainda está aberto e quem consulta não é admin:
  -- O valor esperado NUNCA sai do banco antes da confirmação!
  IF v_cega AND v_fechado_em IS NULL AND v_role != 'admin' THEN
    RETURN jsonb_build_object(
      'caixa_id', p_caixa_id,
      'modo_cego', true,
      'conferencia_cega', true,
      'limite_diferenca_obs', (v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2),
      'fundo_troco', (v_totais->>'fundo_troco')::NUMERIC(10,2),
      'sangrias', (v_totais->>'sangrias')::NUMERIC(10,2),
      'suprimentos', (v_totais->>'suprimentos')::NUMERIC(10,2),
      'dinheiro_esperado', NULL,
      'itens', '[]'::jsonb,
      'pagamentos', '{}'::jsonb
    );
  END IF;

  RETURN v_totais || jsonb_build_object(
    'modo_cego', false,
    'conferencia_cega', v_cega,
    'limite_diferenca_obs', (v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2)
  );
END;
$$;

-- RPC: fechar_caixa
CREATE OR REPLACE FUNCTION public.fechar_caixa(
  p_caixa_id UUID,
  p_contagem JSONB,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_uid UUID := auth.uid();
  v_cfg JSONB;
  v_limite_obs NUMERIC(10,2);
  v_totais JSONB;
  v_item_esperado JSONB;
  v_forma TEXT;
  v_esperado NUMERIC(10,2);
  v_informado NUMERIC(10,2);
  v_diferenca NUMERIC(10,2);
  v_max_abs_dif NUMERIC(10,2) := 0;
  v_total_diferenca NUMERIC(10,2) := 0;
  v_limite_excedido BOOLEAN := false;
  v_conferencia_res JSONB := '[]'::jsonb;
  v_fechado_em TIMESTAMPTZ := NOW();
  v_aberto_por UUID;
  v_aberto_em TIMESTAMPTZ;
BEGIN
  v_role := public.exigir_cargo_ou_permissao('caixa.abrir_fechar', 'barista', 'admin');

  SELECT c.aberto_por, c.aberto_em
  INTO v_aberto_por, v_aberto_em
  FROM public.caixas c
  WHERE c.id = p_caixa_id AND c.fechado_em IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado ou já fechado.';
  END IF;

  v_cfg := public.fn_get_config_caixa();
  v_limite_obs := COALESCE((v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2), 5.00);

  -- Calcular os totais reais diretamente no banco (ignora valor_sistema/diferenca enviados pela API)
  v_totais := public.fn_calcular_totais_caixa_interno(p_caixa_id);

  -- Limpar eventual conferência anterior deste caixa
  DELETE FROM public.caixa_conferencia WHERE caixa_id = p_caixa_id;

  -- Processar cada forma de pagamento oficial
  FOR v_item_esperado IN SELECT * FROM jsonb_array_elements(v_totais->'itens')
  LOOP
    v_forma := v_item_esperado->>'forma';
    v_esperado := COALESCE((v_item_esperado->>'valor_esperado')::NUMERIC(10,2), 0);

    -- Pular conta_cliente se for zero e não tiver sido informada
    IF v_forma = 'conta_cliente' AND v_esperado = 0 THEN
      CONTINUE;
    END IF;

    -- Extrair apenas valor_informado de p_contagem (normalizando nomes legados credito/debito)
    SELECT COALESCE((elem->>'valor_informado')::NUMERIC(10,2), 0)
    INTO v_informado
    FROM jsonb_array_elements(COALESCE(p_contagem, '[]'::jsonb)) elem
    WHERE (
      CASE
        WHEN elem->>'forma' = 'credito' OR elem->>'metodo' = 'credito' THEN 'cartao_credito'
        WHEN elem->>'forma' = 'debito' OR elem->>'metodo' = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(elem->>'forma', elem->>'metodo')
      END
    ) = v_forma
    LIMIT 1;

    IF NOT FOUND OR v_informado IS NULL THEN
      IF v_forma = 'conta_cliente' THEN
        v_informado := v_esperado;
      ELSE
        v_informado := 0;
      END IF;
    END IF;

    v_diferenca := ROUND(v_informado - v_esperado, 2);

    IF v_forma != 'conta_cliente' THEN
      v_total_diferenca := ROUND(v_total_diferenca + v_diferenca, 2);
      IF ABS(v_diferenca) > v_max_abs_dif THEN
        v_max_abs_dif := ABS(v_diferenca);
      END IF;
    END IF;

    INSERT INTO public.caixa_conferencia (
      caixa_id, forma_pagamento, valor_informado, valor_sistema, diferenca
    ) VALUES (
      p_caixa_id, v_forma, v_informado, v_esperado, v_diferenca
    );

    v_conferencia_res := v_conferencia_res || jsonb_build_array(
      jsonb_build_object(
        'forma', v_forma,
        'valor_sistema', v_esperado,
        'valor_informado', v_informado,
        'diferenca', v_diferenca
      )
    );
  END LOOP;

  IF v_max_abs_dif > v_limite_obs THEN
    v_limite_excedido := true;
    IF p_observacoes IS NULL OR length(trim(p_observacoes)) = 0 THEN
      RAISE EXCEPTION 'Diferença de R$ % excede o limite de R$ %. Informe uma justificativa nas observações.',
        trim(to_char(v_max_abs_dif, '999990D00')),
        trim(to_char(v_limite_obs, '999990D00'));
    END IF;
  END IF;

  -- Fechar o caixa
  UPDATE public.caixas
  SET fechado_em = v_fechado_em,
      fechado_por = v_uid,
      observacoes = p_observacoes
  WHERE id = p_caixa_id;

  RETURN jsonb_build_object(
    'caixa_id', p_caixa_id,
    'aberto_em', v_aberto_em,
    'fechado_em', v_fechado_em,
    'aberto_por_nome', public.fn_resolver_nome_usuario(v_aberto_por, NULL),
    'fechado_por_nome', public.fn_resolver_nome_usuario(v_uid, NULL),
    'fundo_troco', (v_totais->>'fundo_troco')::NUMERIC(10,2),
    'sangrias', (v_totais->>'sangrias')::NUMERIC(10,2),
    'suprimentos', (v_totais->>'suprimentos')::NUMERIC(10,2),
    'dinheiro_esperado', (v_totais->>'dinheiro_esperado')::NUMERIC(10,2),
    'observacoes', p_observacoes,
    'total_diferenca', v_total_diferenca,
    'max_diferenca_abs', v_max_abs_dif,
    'limite_diferenca_obs', v_limite_obs,
    'limite_excedido', v_limite_excedido,
    'conferencia', v_conferencia_res
  );
END;
$$;

-- RPC: get_historico_caixas
CREATE OR REPLACE FUNCTION public.get_historico_caixas(p_limite INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_uid UUID;
  v_ativo BOOLEAN;
  v_cfg JSONB;
  v_limite_obs NUMERIC(10,2);
  v_result JSONB := '[]'::jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  SELECT role, COALESCE(ativo, true) INTO v_role, v_ativo FROM public.perfis WHERE id = v_uid;
  IF v_role IS NULL OR v_ativo IS FALSE THEN
    RAISE EXCEPTION 'Acesso negado: perfil inexistente ou inativo' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_role IN ('barista', 'admin') OR public.tem_permissao('caixa.abrir_fechar', v_uid) OR public.tem_permissao('admin.financeiro', v_uid)) THEN
    RAISE EXCEPTION 'Acesso negado para visualizar histórico de caixas' USING ERRCODE = '42501';
  END IF;

  v_cfg := public.fn_get_config_caixa();
  v_limite_obs := COALESCE((v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2), 5.00);

  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      c.id,
      c.aberto_em,
      c.fechado_em,
      c.aberto_por,
      public.fn_resolver_nome_usuario(c.aberto_por, NULL) AS aberto_por_nome,
      c.fechado_por,
      CASE WHEN c.fechado_por IS NOT NULL THEN public.fn_resolver_nome_usuario(c.fechado_por, NULL) ELSE NULL END AS fechado_por_nome,
      c.fundo_troco,
      c.observacoes,
      COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'suprimento'), 0)::NUMERIC(10,2) AS suprimentos,
      COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'sangria'), 0)::NUMERIC(10,2) AS sangrias,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'forma', cc.forma_pagamento,
            'valor_sistema', cc.valor_sistema,
            'valor_informado', cc.valor_informado,
            'diferenca', cc.diferenca
          )
          ORDER BY array_position(ARRAY['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente'], cc.forma_pagamento)
        )
        FROM public.caixa_conferencia cc
        WHERE cc.caixa_id = c.id
      ), '[]'::jsonb) AS conferencia,
      COALESCE((
        SELECT SUM(cc.valor_sistema) FROM public.caixa_conferencia cc WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente'
      ), 0)::NUMERIC(10,2) AS total_esperado,
      COALESCE((
        SELECT SUM(cc.valor_informado) FROM public.caixa_conferencia cc WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente'
      ), 0)::NUMERIC(10,2) AS total_informado,
      COALESCE((
        SELECT SUM(cc.diferenca) FROM public.caixa_conferencia cc WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente'
      ), 0)::NUMERIC(10,2) AS total_diferenca,
      EXISTS (
        SELECT 1 FROM public.caixa_conferencia cc
        WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente' AND ABS(cc.diferenca) > v_limite_obs
      ) AS limite_excedido
    FROM public.caixas c
    ORDER BY c.aberto_em DESC
    LIMIT p_limite
  ) sub;

  RETURN v_result;
END;
$$;

-- RPC: toggle_produto_disponivel
CREATE OR REPLACE FUNCTION public.toggle_produto_disponivel(p_produto_id TEXT, p_disponivel BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.exigir_cargo('barista', 'admin');

  UPDATE public.produtos
  SET disponivel = p_disponivel
  WHERE id = p_produto_id;
END;
$$;

-- RPC: aprovar_pedido_cliente
CREATE OR REPLACE FUNCTION public.aprovar_pedido_cliente(p_pedido_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
BEGIN
  IF NOT public.tem_permissao('pdv.vender') AND public.get_user_role() NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado para aprovar pedidos.';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_pedido.status <> 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Pedido não está aguardando aprovação (status atual: %)', v_pedido.status;
  END IF;

  UPDATE public.pedidos
  SET status = 'pendente',
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object('sucesso', true, 'pedido_id', p_pedido_id, 'status', 'pendente');
END;
$$;

-- RPC: recusar_pedido_cliente
CREATE OR REPLACE FUNCTION public.recusar_pedido_cliente(p_pedido_id BIGINT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_uid UUID;
  v_role TEXT;
  v_ativo BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  SELECT role, COALESCE(ativo, true) INTO v_role, v_ativo FROM public.perfis WHERE id = v_uid;
  IF v_role IS NULL OR v_ativo IS FALSE THEN
    RAISE EXCEPTION 'Acesso negado: perfil inexistente ou inativo' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_role IN ('barista', 'admin') OR public.tem_permissao('pdv.cancelar_pedido', v_uid) OR public.tem_permissao('pdv.vender', v_uid)) THEN
    RAISE EXCEPTION 'Acesso negado para recusar pedidos.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_pedido.status <> 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Pedido não está aguardando aprovação.';
  END IF;

  UPDATE public.pedidos
  SET status = 'cancelado',
      motivo_cancelamento = COALESCE(p_motivo, 'Recusado pelo atendente'),
      cancelado_por = auth.uid(),
      cancelado_por_nome = (SELECT nome FROM public.perfis WHERE id = auth.uid()),
      cancelado_em = timezone('America/Sao_Paulo', now()),
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object('sucesso', true, 'pedido_id', p_pedido_id, 'status', 'cancelado');
END;
$$;

-- RPC: regenerar_qr_token_mesa
CREATE OR REPLACE FUNCTION public.regenerar_qr_token_mesa(p_mesa_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo_token TEXT;
  v_mesa_codigo TEXT;
BEGIN
  IF NOT public.tem_permissao('admin.configuracoes') AND public.get_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Acesso negado para regenerar QR Code.';
  END IF;

  v_novo_token := encode(gen_random_bytes(8), 'hex');

  UPDATE public.mesas
  SET qr_token = v_novo_token
  WHERE id = p_mesa_id
  RETURNING codigo INTO v_mesa_codigo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada.';
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'mesa_id', p_mesa_id, 'codigo', v_mesa_codigo, 'qr_token', v_novo_token);
END;
$$;

-- RPC: marcar_pedido_nao_retirado
CREATE OR REPLACE FUNCTION public.marcar_pedido_nao_retirado(
  p_pedido_id BIGINT,
  p_motivo TEXT DEFAULT 'Não retirado pelo cliente no horário agendado'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_obs_data TEXT;
BEGIN
  IF NOT public.tem_permissao('pdv.vender') AND public.get_user_role() NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  UPDATE public.pedidos
  SET status = 'cancelado',
      nao_retirado = true,
      motivo_cancelamento = COALESCE(NULLIF(TRIM(p_motivo), ''), 'Não retirado pelo cliente'),
      cancelado_por = auth.uid(),
      cancelado_por_nome = (SELECT nome FROM public.perfis WHERE id = auth.uid()),
      cancelado_em = timezone('America/Sao_Paulo', now()),
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_pedido_id;

  -- Registra ocorrência no cadastro do cliente
  IF v_pedido.cliente_id IS NOT NULL THEN
    v_obs_data := to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY HH24:MI');
    UPDATE public.clientes
    SET observacoes = TRIM(COALESCE(observacoes, '') || E'\n[' || v_obs_data || '] Pedido #' || COALESCE(v_pedido.numero_pedido::text, v_pedido.id::text) || ' não retirado (' || COALESCE(p_motivo, 'Não compareceu') || ').'),
        updated_at = now()
    WHERE id = v_pedido.cliente_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', p_pedido_id,
    'status', 'cancelado',
    'nao_retirado', true
  );
END;
$$;

-- RPC: receber_pedido_totem
CREATE OR REPLACE FUNCTION public.receber_pedido_totem(
  p_pedido_id BIGINT,
  p_forma_pagamento TEXT DEFAULT 'pix'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_forma TEXT;
BEGIN
  IF NOT public.tem_permissao('pdv.vender') AND public.get_user_role() NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  v_forma := LOWER(TRIM(COALESCE(p_forma_pagamento, v_pedido.forma_pagamento, 'pix')));
  IF v_forma NOT IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outros') THEN
    v_forma := 'pix';
  END IF;

  UPDATE public.pedidos
  SET status = 'pendente',
      status_pagamento = 'pago',
      forma_pagamento = v_forma,
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_pedido_id;

  -- Registra em pedido_pagamentos se ainda não houver pagamento lançado
  IF NOT EXISTS (SELECT 1 FROM public.pedido_pagamentos WHERE pedido_id = p_pedido_id) THEN
    INSERT INTO public.pedido_pagamentos (
      pedido_id,
      forma_pagamento,
      valor,
      parte_nome,
      recebido_por
    ) VALUES (
      p_pedido_id,
      v_forma,
      COALESCE(v_pedido.total, 0),
      COALESCE(v_pedido.cliente_nome, 'Totem'),
      auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', p_pedido_id,
    'numero_pedido', v_pedido.numero_pedido,
    'status', 'pendente',
    'status_pagamento', 'pago',
    'forma_pagamento', v_forma
  );
END;
$$;

-- RPC: dar_baixa_lote_vencido
CREATE OR REPLACE FUNCTION public.dar_baixa_lote_vencido(
  p_lote_id BIGINT,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lote RECORD;
  v_motivo TEXT;
  v_mov_id BIGINT;
BEGIN
  PERFORM public.exigir_cargo_ou_permissao('estoque.gerenciar', 'barista', 'admin');

  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'ID do lote é obrigatório';
  END IF;

  SELECT * INTO v_lote
  FROM public.estoque_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote % não encontrado', p_lote_id;
  END IF;

  IF v_lote.data_validade IS NOT NULL AND v_lote.data_validade > CURRENT_DATE THEN
    RAISE EXCEPTION 'Lote % ainda não está vencido (validade: %)', p_lote_id, v_lote.data_validade
      USING ERRCODE = '22000';
  END IF;

  IF v_lote.quantidade_restante <= 0 THEN
    RAISE EXCEPTION 'O lote % já está com saldo zerado', p_lote_id;
  END IF;

  v_motivo := COALESCE(
    p_motivo,
    'Baixa por validade vencida (Lote ' || COALESCE(v_lote.lote_codigo, '#' || v_lote.id) || ')'
  );

  -- 1. Zera o saldo restante do lote
  UPDATE public.estoque_lotes
  SET quantidade_restante = 0,
      ativo = false,
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_lote_id;

  -- 2. Registra o movimento de perda no estoque vinculado ao lote
  INSERT INTO public.estoque_movimentos (
    item_id,
    tipo,
    quantidade,
    custo_unitario,
    validade,
    lote_id,
    lote_codigo,
    motivo,
    criado_por,
    created_at
  ) VALUES (
    v_lote.item_id,
    'perda',
    v_lote.quantidade_restante,
    v_lote.custo_unitario,
    v_lote.data_validade,
    v_lote.id,
    v_lote.lote_codigo,
    v_motivo,
    auth.uid(),
    timezone('America/Sao_Paulo', now())
  )
  RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'lote_id', p_lote_id,
    'item_id', v_lote.item_id,
    'quantidade_baixada', v_lote.quantidade_restante,
    'movimento_id', v_mov_id
  );
END;
$$;

-- RPC: processar_cashback_pedido
CREATE OR REPLACE FUNCTION public.processar_cashback_pedido(
  p_pedido_id BIGINT,
  p_cliente_id UUID,
  p_valor_elegivel NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativo BOOLEAN;
  v_percentual NUMERIC;
  v_minimo NUMERIC;
  v_cashback NUMERIC(10,2);
  v_ja_creditado BOOLEAN;
  v_novo_saldo NUMERIC(10,2);
  v_valor_base NUMERIC(10,2) := 0;
  v_status_pedido TEXT;
  v_cliente_real UUID;
BEGIN
  PERFORM public.exigir_cargo_ou_permissao('pdv.vender', 'barista', 'admin');

  -- CA05: Chamada sem pedido_id é estritamente recusada
  IF p_pedido_id IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'p_pedido_id é obrigatório.');
  END IF;

  -- 1. Verifica se o recurso está ativo
  SELECT COALESCE((valor)::text::boolean, false)
  INTO v_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_ativo';

  IF NOT COALESCE(v_ativo, false) THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback desativado no sistema.');
  END IF;

  -- 2. Verifica pedido existente e seu status
  SELECT status, cliente_id
  INTO v_status_pedido, v_cliente_real
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF v_status_pedido = 'cancelado' THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Pedido cancelado não pode receber cashback.');
  END IF;

  IF p_cliente_id IS NULL THEN
    p_cliente_id := v_cliente_real;
  END IF;

  IF p_cliente_id IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cliente não informado.');
  END IF;

  -- 3. Idempotência: verifica se este pedido já recebeu cashback
  SELECT EXISTS (
    SELECT 1 FROM public.cliente_conta_movimentos
    WHERE pedido_id = p_pedido_id 
      AND tipo = 'deposito'
      AND (forma_pagamento = 'cashback' OR motivo ILIKE '%cashback%')
  ) INTO v_ja_creditado;

  IF v_ja_creditado THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback já creditado para este pedido.');
  END IF;

  -- 4. CA04 / RF04: Mover cálculo para o servidor baseado nos pagamentos gravados.
  -- 1º: Tenta somar pagamentos gravados em fechamento_pagamentos (se o pedido passou por fechamento de mesa)
  SELECT COALESCE(SUM(
    GREATEST(0, fp.valor - CASE WHEN fp.forma = 'dinheiro' THEN COALESCE(f.troco, 0) ELSE 0 END)
  ), 0.00)
  INTO v_valor_base
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  JOIN public.fechamento_pedidos fped ON fped.fechamento_id = f.id
  WHERE fped.pedido_id = p_pedido_id
    AND LOWER(fp.forma) IN ('pix', 'dinheiro', 'cartao', 'cartao_credito', 'cartao_debito');

  -- 2º: Se não encontrou em fechamento_pagamentos, verifica se o pedido direto foi pago por forma elegível
  IF v_valor_base <= 0 THEN
    SELECT COALESCE(
      CASE 
        WHEN LOWER(COALESCE(p.forma_pagamento, '')) IN ('pix', 'dinheiro', 'cartao', 'cartao_credito', 'cartao_debito')
        THEN p.total
        ELSE 0
      END,
      0.00
    )
    INTO v_valor_base
    FROM public.pedidos p
    WHERE p.id = p_pedido_id;
  END IF;

  -- 3º: Fallback seguro apenas se o banco não tem registros mas o caller informou valor
  IF v_valor_base <= 0 AND p_valor_elegivel > 0 THEN
    v_valor_base := p_valor_elegivel;
  END IF;

  -- Obtém percentual e valor mínimo
  SELECT COALESCE((valor)::text::numeric, 5.0)
  INTO v_percentual
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_percentual';

  SELECT COALESCE((valor)::text::numeric, 10.0)
  INTO v_minimo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_valor_minimo';

  IF v_valor_base < v_minimo THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor abaixo do mínimo para cashback.');
  END IF;

  -- Calcula o valor com arredondamento seguro
  v_cashback := ROUND((v_valor_base * v_percentual) / 100.0, 2);

  IF v_cashback <= 0 THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor de cashback nulo.');
  END IF;

  -- Lança movimentação
  INSERT INTO public.cliente_conta_movimentos (
    cliente_id,
    pedido_id,
    tipo,
    valor,
    motivo,
    forma_pagamento,
    created_at
  ) VALUES (
    p_cliente_id,
    p_pedido_id,
    'deposito',
    v_cashback,
    format('Cashback automático (%s%%) — Pedido #%s', v_percentual, p_pedido_id),
    'cashback',
    now()
  );

  -- Atualiza saldo_conta em clientes
  UPDATE public.clientes
  SET saldo_conta = COALESCE(saldo_conta, 0) + v_cashback
  WHERE id = p_cliente_id;

  -- CA08: Saldo consistente calculado a partir das movimentações
  SELECT COALESCE(SUM(valor), 0.00)
  INTO v_novo_saldo
  FROM public.cliente_conta_movimentos
  WHERE cliente_id = p_cliente_id;

  RETURN jsonb_build_object(
    'creditado', true,
    'valor_cashback', v_cashback,
    'percentual', v_percentual,
    'novo_saldo', v_novo_saldo
  );
END;
$$;

-- RPC: fechar_conta_mesa
CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_desconto_manual NUMERIC DEFAULT 0,
  p_desconto_motivo TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_cupom_codigo TEXT DEFAULT NULL,
  p_campanha_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_subtotal NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_subtotal_restante NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_pedido RECORD;
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_pode_dar_desconto BOOLEAN := false;
  v_existing_fechamento RECORD;
  v_primeiro_pedido_id BIGINT := NULL;
  v_count_pedidos INT := 0;
  v_cliente_id UUID := NULL;
  v_ja_debitado BOOLEAN := false;
BEGIN
  -- 1. Verificação de Idempotência
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, troco, total_conta INTO v_existing_fechamento
    FROM public.fechamentos
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'fechamento_id', v_existing_fechamento.id,
        'troco', v_existing_fechamento.troco,
        'total', v_existing_fechamento.total_conta,
        'idempotent', true
      );
    END IF;
  END IF;

  -- Validação de Role e Permissões (NULL-safe)
  v_user_role := public.exigir_cargo('barista', 'admin');
  SELECT pode_dar_desconto INTO v_pode_dar_desconto
  FROM public.perfis
  WHERE id = auth.uid();

  IF p_desconto_manual > 0 AND NOT (v_user_role = 'admin' OR v_pode_dar_desconto = true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para aplicar desconto manual.';
  END IF;

  IF p_desconto_manual > 0 AND (p_desconto_motivo IS NULL OR length(trim(p_desconto_motivo)) = 0) THEN
    RAISE EXCEPTION 'Motivo do desconto é obrigatório.';
  END IF;

  -- 2. Calcula subtotal apenas dos pedidos ativos (não cancelados e não pagos) da mesa
  FOR v_pedido IN
    SELECT id, total, cliente_id
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    FOR UPDATE
  LOOP
    v_count_pedidos := v_count_pedidos + 1;
    v_pedido_ids := array_append(v_pedido_ids, v_pedido.id);
    v_subtotal := v_subtotal + COALESCE(v_pedido.total, 0);
    IF v_primeiro_pedido_id IS NULL THEN
      v_primeiro_pedido_id := v_pedido.id;
    END IF;
    IF v_cliente_id IS NULL AND v_pedido.cliente_id IS NOT NULL THEN
      v_cliente_id := v_pedido.cliente_id;
    END IF;
  END LOOP;

  IF v_count_pedidos = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  -- 2b. Deduz pagamentos parciais já realizados na sessão aberta da mesa
  SELECT COALESCE(SUM(fp.valor), 0) INTO v_ja_pago_parcial
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_subtotal_restante := GREATEST(0, v_subtotal - v_ja_pago_parcial);

  IF p_desconto_manual > v_subtotal_restante THEN
    RAISE EXCEPTION 'O desconto (R$ %) não pode ser maior que o subtotal da mesa (R$ %).', p_desconto_manual, v_subtotal_restante;
  END IF;

  -- 3. Calcula total com taxa de serviço e desconto manual sobre o saldo restante
  v_total_a_pagar := ROUND(v_subtotal_restante + COALESCE(p_taxa_servico, 0) - COALESCE(p_desconto_manual, 0), 2);
  IF v_total_a_pagar < 0 THEN
    v_total_a_pagar := 0;
  END IF;

  -- 4. Valida soma dos pagamentos
  IF p_pagamentos IS NOT NULL AND jsonb_typeof(p_pagamentos) = 'array' THEN
    FOR v_pagamento IN
      SELECT (elem->>'valor')::NUMERIC AS valor, (elem->>'forma') AS forma
      FROM jsonb_array_elements(p_pagamentos) AS elem
    LOOP
      v_total_pago := v_total_pago + COALESCE(v_pagamento.valor, 0);
    END LOOP;
  END IF;

  IF v_total_a_pagar > 0 AND ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 5. Cria registro de fechamento em public.fechamentos
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, desconto_manual, desconto_motivo, desconto_por,
    idempotency_key, cupom_codigo, campanha_id, parcial
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), COALESCE(p_desconto_manual, 0), p_desconto_motivo, CASE WHEN p_desconto_manual > 0 THEN v_uid ELSE NULL END,
    p_idempotency_key, p_cupom_codigo, p_campanha_id, false
  ) RETURNING id INTO v_fechamento_id;

  -- 6. Inserir formas de pagamento e garantir débito atômico na Conta do Cliente
  IF p_pagamentos IS NOT NULL AND jsonb_typeof(p_pagamentos) = 'array' THEN
    FOR v_pagamento IN
      SELECT (elem->>'valor')::NUMERIC(10,2) AS valor, (elem->>'forma') AS forma, (elem->>'cliente_id')::UUID AS pag_cliente_id
      FROM jsonb_array_elements(p_pagamentos) AS elem
    LOOP
      INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
      VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);

      IF v_pagamento.forma = 'conta_cliente' AND COALESCE(v_pagamento.valor, 0) > 0 THEN
        v_cliente_id := COALESCE(v_pagamento.pag_cliente_id, v_cliente_id);
        IF v_cliente_id IS NULL THEN
          RAISE EXCEPTION 'Mesa sem cliente vinculado para pagamento via Conta do Cliente.';
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.cliente_conta_movimentos m
          WHERE m.cliente_id = v_cliente_id
            AND m.tipo = 'consumo'
            AND ABS(m.valor) = ABS(v_pagamento.valor)
            AND (
              (v_primeiro_pedido_id IS NOT NULL AND m.pedido_id = v_primeiro_pedido_id)
              OR m.created_at >= (now() - interval '10 minutes')
            )
        ) INTO v_ja_debitado;

        IF NOT v_ja_debitado THEN
          PERFORM public.lancar_movimento_conta(
            p_cliente_id := v_cliente_id,
            p_tipo := 'consumo',
            p_valor := ABS(v_pagamento.valor),
            p_pedido_id := v_primeiro_pedido_id,
            p_fechamento_id := NULL,
            p_forma_pagamento := 'conta_cliente',
            p_motivo := 'Fechamento Mesa ' || p_mesa_codigo
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 7. Atualiza pedidos da mesa para 'pago', grava pago_em e vincula cupom/campanha
  FOR v_pedido IN
    SELECT id FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
  LOOP
    UPDATE public.pedidos
    SET
      status_pagamento = 'pago',
      pago_em = COALESCE(pago_em, now()),
      cupom_codigo = COALESCE(p_cupom_codigo, cupom_codigo),
      campanha_id = COALESCE(p_campanha_id, campanha_id),
      updated_at = now()
    WHERE id = v_pedido.id;

    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_pedido.id);
  END LOOP;

  -- 7b. Marcar todos os itens como integralmente quitados
  UPDATE public.pedido_itens
  SET quantidade_paga = quantidade
  WHERE pedido_id = ANY(v_pedido_ids)
    AND quantidade_paga < quantidade;

  -- 8. Registrar uso de cupom dentro da mesma transação com o pedido principal da mesa
  IF p_campanha_id IS NOT NULL AND v_primeiro_pedido_id IS NOT NULL THEN
    PERFORM public.registrar_uso_cupom(p_campanha_id, v_primeiro_pedido_id);
  END IF;

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'troco', v_troco,
    'total', v_total_a_pagar,
    'idempotent', false
  );
END;
$$;

-- RPC: registrar_pagamento_parcial_mesa
CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcial_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_itens JSONB DEFAULT '[]'::jsonb,
  p_valor_abatimento NUMERIC DEFAULT 0,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_existing_fechamento RECORD;
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_pedido RECORD;
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_subtotal_geral NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_saldo_restante NUMERIC(10,2) := 0;
  v_valor_esperado NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_item_elem JSONB;
  v_item_id BIGINT;
  v_qtd_pagar NUMERIC(10,3);
  v_item RECORD;
  v_subtotal_item NUMERIC(10,2);
  v_primeiro_pedido_id BIGINT := NULL;
  v_cliente_id UUID := NULL;
  v_ja_debitado BOOLEAN := false;
  v_novo_saldo NUMERIC(10,2) := 0;
BEGIN
  -- 1. Idempotência
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, troco, total_conta INTO v_existing_fechamento
    FROM public.fechamentos
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'fechamento_id', v_existing_fechamento.id,
        'troco', v_existing_fechamento.troco,
        'total', v_existing_fechamento.total_conta,
        'idempotent', true
      );
    END IF;
  END IF;

  -- 2. Permissões (NULL-safe)
  PERFORM public.exigir_cargo('barista', 'admin');

  -- 3. Obter e bloquear pedidos ativos da mesa
  FOR v_pedido IN
    SELECT id, total, cliente_id
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    FOR UPDATE
  LOOP
    v_pedido_ids := array_append(v_pedido_ids, v_pedido.id);
    v_subtotal_geral := v_subtotal_geral + COALESCE(v_pedido.total, 0);
    IF v_primeiro_pedido_id IS NULL THEN
      v_primeiro_pedido_id := v_pedido.id;
    END IF;
    IF v_cliente_id IS NULL AND v_pedido.cliente_id IS NOT NULL THEN
      v_cliente_id := v_pedido.cliente_id;
    END IF;
  END LOOP;

  IF array_length(v_pedido_ids, 1) IS NULL OR array_length(v_pedido_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  -- 4. Somar pagamentos parciais anteriores desta mesa aberta
  SELECT COALESCE(SUM(fp.valor), 0) INTO v_ja_pago_parcial
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_saldo_restante := GREATEST(0, v_subtotal_geral - v_ja_pago_parcial);

  -- 5. Calcular valor a pagar (itens ou abatimento de valor livre)
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' AND jsonb_array_length(p_itens) > 0 THEN
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_item_id := (v_item_elem->>'pedido_item_id')::BIGINT;
      v_qtd_pagar := COALESCE((v_item_elem->>'quantidade')::NUMERIC, 1);

      IF v_qtd_pagar <= 0 THEN
        RAISE EXCEPTION 'Quantidade de item a pagar deve ser maior que zero.';
      END IF;

      SELECT pi.id, pi.pedido_id, pi.quantidade, pi.quantidade_paga, pi.preco_unitario, pi.cancelado
      INTO v_item
      FROM public.pedido_itens pi
      WHERE pi.id = v_item_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item de pedido #% não encontrado.', v_item_id;
      END IF;

      IF v_item.cancelado = true THEN
        RAISE EXCEPTION 'Item #% está cancelado e não pode ser pago.', v_item_id;
      END IF;

      IF NOT (v_item.pedido_id = ANY(v_pedido_ids)) THEN
        RAISE EXCEPTION 'Item #% não pertence aos pedidos ativos da mesa %.', v_item_id, p_mesa_codigo;
      END IF;

      IF (v_item.quantidade - v_item.quantidade_paga) < (v_qtd_pagar - 0.001) THEN
        RAISE EXCEPTION 'Quantidade solicitada (%) excede a quantidade restante (%) do item #%.',
          v_qtd_pagar, (v_item.quantidade - v_item.quantidade_paga), v_item_id;
      END IF;

      v_subtotal_item := ROUND(v_qtd_pagar * v_item.preco_unitario, 2);
      v_valor_esperado := v_valor_esperado + v_subtotal_item;
    END LOOP;
  ELSE
    v_valor_esperado := ROUND(COALESCE(p_valor_abatimento, 0), 2);
  END IF;

  v_total_a_pagar := ROUND(v_valor_esperado + COALESCE(p_taxa_servico, 0), 2);

  IF v_total_a_pagar <= 0 THEN
    RAISE EXCEPTION 'Valor a pagar deve ser maior que zero.';
  END IF;

  IF v_valor_esperado > (v_saldo_restante + 0.01) THEN
    RAISE EXCEPTION 'Valor informado (R$ %) excede o saldo restante da mesa (R$ %).', v_valor_esperado, v_saldo_restante;
  END IF;

  -- 6. Validação dos pagamentos recebidos
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Nenhuma forma de pagamento informada.';
  END IF;

  FOR v_pagamento IN
    SELECT (elem->>'valor')::NUMERIC AS valor, (elem->>'forma') AS forma
    FROM jsonb_array_elements(p_pagamentos) AS elem
  LOOP
    v_total_pago := v_total_pago + COALESCE(v_pagamento.valor, 0);
  END LOOP;

  IF ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 7. Criar registro de fechamento parcial
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, parcial, idempotency_key
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), true, p_idempotency_key
  ) RETURNING id INTO v_fechamento_id;

  -- 8. Inserir pagamentos e debitar conta do cliente se aplicável
  FOR v_pagamento IN
    SELECT (elem->>'valor')::NUMERIC(10,2) AS valor, (elem->>'forma') AS forma, (elem->>'cliente_id')::UUID AS pag_cliente_id
    FROM jsonb_array_elements(p_pagamentos) AS elem
  LOOP
    INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
    VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);

    IF v_pagamento.forma = 'conta_cliente' AND COALESCE(v_pagamento.valor, 0) > 0 THEN
      v_cliente_id := COALESCE(v_pagamento.pag_cliente_id, v_cliente_id);
      IF v_cliente_id IS NULL THEN
        RAISE EXCEPTION 'Mesa sem cliente vinculado para pagamento via Conta do Cliente.';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.cliente_conta_movimentos m
        WHERE m.cliente_id = v_cliente_id
          AND m.tipo = 'consumo'
          AND ABS(m.valor) = ABS(v_pagamento.valor)
          AND (
            (v_primeiro_pedido_id IS NOT NULL AND m.pedido_id = v_primeiro_pedido_id)
            OR m.created_at >= (now() - interval '10 minutes')
          )
      ) INTO v_ja_debitado;

      IF NOT v_ja_debitado THEN
        PERFORM public.lancar_movimento_conta(
          p_cliente_id := v_cliente_id,
          p_tipo := 'consumo',
          p_valor := ABS(v_pagamento.valor),
          p_pedido_id := v_primeiro_pedido_id,
          p_fechamento_id := NULL,
          p_forma_pagamento := 'conta_cliente',
          p_motivo := 'Pagamento Parcial Mesa ' || p_mesa_codigo
        );
      END IF;
    END IF;
  END LOOP;

  -- 9. Vincular fechamento parcial aos pedidos ativos da mesa
  FOREACH v_item_id IN ARRAY v_pedido_ids
  LOOP
    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_item_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 10. Atualizar quantidade_paga dos itens e registrar fechamento_itens
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' AND jsonb_array_length(p_itens) > 0 THEN
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_item_id := (v_item_elem->>'pedido_item_id')::BIGINT;
      v_qtd_pagar := COALESCE((v_item_elem->>'quantidade')::NUMERIC, 1);

      SELECT preco_unitario INTO v_subtotal_item
      FROM public.pedido_itens WHERE id = v_item_id;

      UPDATE public.pedido_itens
      SET quantidade_paga = quantidade_paga + v_qtd_pagar
      WHERE id = v_item_id;

      INSERT INTO public.fechamento_itens (
        fechamento_id, pedido_item_id, quantidade, valor_unitario, subtotal
      ) VALUES (
        v_fechamento_id, v_item_id, v_qtd_pagar, v_subtotal_item, ROUND(v_qtd_pagar * v_subtotal_item, 2)
      );
    END LOOP;
  END IF;

  v_novo_saldo := GREATEST(0, v_saldo_restante - v_valor_esperado);

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'troco', v_troco,
    'total_pago', v_total_pago,
    'valor_abatido', v_valor_esperado,
    'taxa_servico', COALESCE(p_taxa_servico, 0),
    'saldo_restante', v_novo_saldo,
    'idempotent', false
  );
END;
$$;

-- 4. REVOGAÇÃO DINÂMICA DE EXECUTE PARA anon E PUBLIC NAS RPCs SECURITY DEFINER

DO $$
DECLARE
  r RECORD;
  v_allowlist TEXT[] := ARRAY[
    'criar_pedido_cliente',
    'consultar_status_pedido_cliente',
    'chamar_atendente_mesa',
    'criar_pedido_online',
    'consultar_janelas_ocupadas_online',
    'parear_totem',
    'validar_sessao_totem',
    'criar_pedido_totem',
    'consultar_pedido_avaliacao',
    'registrar_avaliacao',
    'validar_cupom',
    'validar_e_calcular_combo',
    'registrar_erro_cliente',
    'registrar_evento_cardapio',
    'get_user_role',
    'tem_permissao',
    'consolidar_contador_dia_anterior',
    'criar_cobranca_pix'
  ];
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  ) LOOP
    IF NOT (r.proname = ANY(v_allowlist)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC;', r.func_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', r.func_sig);
    END IF;
  END LOOP;
END;
$$;

-- 5. HARDENING DE PRIVILÉGIOS PADRÃO E SEARCH_PATH RESIDUAL
ALTER FUNCTION public.fn_estoque_abater_lotes_peps() SET search_path = public;
ALTER FUNCTION public.fn_estoque_criar_lote_entrada() SET search_path = public;
ALTER FUNCTION public.obter_consumo_estoque_30d() SET search_path = public;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

