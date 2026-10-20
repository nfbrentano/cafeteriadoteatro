-- =========================================================
-- MIGRATION: CAF-000038 - PEDIDO ONLINE PARA RETIRADA E ENCOMENDAS PELO LINK
-- =========================================================

-- 1. Colunas de encomenda em produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS antecedencia_min_horas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apenas_encomenda BOOLEAN NOT NULL DEFAULT false;

-- 2. Colunas de retirada e controle em pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS retirada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cliente_telefone TEXT,
  ADD COLUMN IF NOT EXISTS nao_retirado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pronto_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pedidos_retirada_em ON public.pedidos(retirada_em);

-- Atualiza constraint de origem e status para suportar online e totem (CAF-000038 e CAF-000040)
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_origem_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_origem_check
  CHECK (origem IN ('pdv', 'cliente_qr', 'online', 'online_retirada', 'totem'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('aguardando_aprovacao', 'aguardando_pagamento', 'pendente', 'em_preparo', 'concluido', 'entregue', 'cancelado', 'pronto'));

-- Garante que exista a mesa especial 'RETIRADA' e 'BALCAO' para vínculo se mesa_codigo tiver FK
INSERT INTO public.mesas (codigo, descricao, ativo)
VALUES ('RETIRADA', 'Retirada / Encomenda Online', true)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Configurações padrão do Pedido Online
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('pedido_online_ativo', 'true'::jsonb),
  ('pedido_online_tempo_estimado_min', '15'::jsonb),
  ('pedido_online_limite_janela', '5'::jsonb),
  ('pedido_online_antecedencia_kds_min', '20'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 4. RPC: consultar_janelas_ocupadas_online
-- Retorna a ocupação de cada janela de 15 minutos em uma data específica e o limite configurado
CREATE OR REPLACE FUNCTION public.consultar_janelas_ocupadas_online(p_data DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limite INT := 5;
  v_tempo_estimado INT := 15;
  v_ativo BOOLEAN := true;
  v_janelas JSONB;
BEGIN
  SELECT COALESCE((valor)::text::boolean, true)
  INTO v_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_ativo';

  SELECT COALESCE((valor)::text::int, 5)
  INTO v_limite
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_limite_janela';

  SELECT COALESCE((valor)::text::int, 15)
  INTO v_tempo_estimado
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_tempo_estimado_min';

  SELECT COALESCE(
    jsonb_object_agg(janela_hora, qtd),
    '{}'::jsonb
  ) INTO v_janelas
  FROM (
    SELECT
      to_char(
        date_trunc('hour', retirada_em AT TIME ZONE 'America/Sao_Paulo') +
        INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM (retirada_em AT TIME ZONE 'America/Sao_Paulo')) / 15.0),
        'HH24:MI'
      ) AS janela_hora,
      COUNT(*)::int AS qtd
    FROM public.pedidos
    WHERE retirada_em IS NOT NULL
      AND (retirada_em AT TIME ZONE 'America/Sao_Paulo')::date = p_data
      AND status <> 'cancelado'
    GROUP BY 1
  ) sub;

  RETURN jsonb_build_object(
    'ativo', COALESCE(v_ativo, true),
    'limite_janela', COALESCE(v_limite, 5),
    'tempo_estimado_min', COALESCE(v_tempo_estimado, 15),
    'ocupacao', COALESCE(v_janelas, '{}'::jsonb)
  );
END;
$$;

-- 5. RPC: criar_pedido_online (público anon, com recálculo estrito de preços e validação de janelas/antecedência)
CREATE OR REPLACE FUNCTION public.criar_pedido_online(
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config_ativo BOOLEAN := true;
  v_tempo_estimado INT := 15;
  v_limite_janela INT := 5;
  v_pedido_id BIGINT;
  v_numero_pedido INT;
  v_pedido_token UUID;
  v_total NUMERIC(10,2) := 0;
  v_cliente_nome TEXT;
  v_cliente_telefone_raw TEXT;
  v_cliente_telefone_digits TEXT;
  v_cliente_id UUID;
  v_aceita_lgpd BOOLEAN;
  v_observacoes TEXT;
  v_modo_retirada TEXT;
  v_retirada_em TIMESTAMPTZ;
  v_agora TIMESTAMPTZ := now();
  v_max_antecedencia_horas INT := 0;
  v_ocupacao_janela INT := 0;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_adicional_permitido BOOLEAN;
  v_itens_count INT := 0;
  v_ultimo_pedido_em TIMESTAMPTZ;
  v_client_id UUID;
  v_status_retorno TEXT;
BEGIN
  -- 1. Verifica se o pedido online está ativo
  SELECT COALESCE((valor)::text::boolean, true)
  INTO v_config_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_ativo';

  IF v_config_ativo IS FALSE THEN
    RAISE EXCEPTION 'Os pedidos online para retirada estão temporariamente pausados.';
  END IF;

  SELECT COALESCE((valor)::text::int, 15)
  INTO v_tempo_estimado
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_tempo_estimado_min';

  SELECT COALESCE((valor)::text::int, 5)
  INTO v_limite_janela
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_limite_janela';

  -- 2. Idempotência
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    BEGIN
      v_client_id := p_idempotency_key::UUID;
      SELECT id, numero_pedido, pedido_token, status, total, retirada_em
      INTO v_pedido_id, v_numero_pedido, v_pedido_token, v_status_retorno, v_total, v_retirada_em
      FROM public.pedidos
      WHERE client_id = v_client_id;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'sucesso', true,
          'pedido_id', v_pedido_id,
          'numero_pedido', v_numero_pedido,
          'pedido_token', v_pedido_token,
          'status', v_status_retorno,
          'total', v_total,
          'retirada_em', v_retirada_em,
          'idempotente', true
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_client_id := NULL;
    END;
  END IF;

  -- 3. Valida nome e telefone do cliente (formato BR)
  v_cliente_nome := TRIM(COALESCE(p_payload->>'cliente_nome', ''));
  IF length(v_cliente_nome) < 2 THEN
    RAISE EXCEPTION 'Por favor, informe seu nome completo para retirada.';
  END IF;

  v_cliente_telefone_raw := TRIM(COALESCE(p_payload->>'cliente_telefone', ''));
  v_cliente_telefone_digits := regexp_replace(v_cliente_telefone_raw, '\D', '', 'g');
  IF length(v_cliente_telefone_digits) IN (10, 11) THEN
    v_cliente_telefone_digits := '55' || v_cliente_telefone_digits;
  END IF;

  IF length(v_cliente_telefone_digits) NOT IN (12, 13) THEN
    RAISE EXCEPTION 'Informe um número de WhatsApp válido com DDD (ex: 51 99999-9999).';
  END IF;

  v_aceita_lgpd := COALESCE((p_payload->>'aceita_lgpd')::boolean, true);

  -- Rate limit por telefone: 1 pedido a cada 30 segundos
  SELECT MAX(created_at) INTO v_ultimo_pedido_em
  FROM public.pedidos
  WHERE cliente_telefone = v_cliente_telefone_digits AND origem IN ('online', 'online_retirada');

  IF v_ultimo_pedido_em IS NOT NULL AND (v_agora - v_ultimo_pedido_em) < INTERVAL '30 seconds' THEN
    RAISE EXCEPTION 'Aguarde alguns segundos antes de enviar outro pedido.';
  END IF;

  -- 4. Cria ou reaproveita cadastro em public.clientes (CAF-000033)
  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE telefone = v_cliente_telefone_digits
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (nome, telefone, aceita_contato, ativo)
    VALUES (v_cliente_nome, v_cliente_telefone_digits, v_aceita_lgpd, true)
    ON CONFLICT (telefone) DO UPDATE
      SET nome = EXCLUDED.nome,
          aceita_contato = COALESCE(EXCLUDED.aceita_contato, public.clientes.aceita_contato),
          updated_at = now()
    RETURNING id INTO v_cliente_id;
  ELSE
    UPDATE public.clientes
    SET nome = COALESCE(NULLIF(v_cliente_nome, ''), nome),
        aceita_contato = v_aceita_lgpd OR aceita_contato,
        updated_at = now()
    WHERE id = v_cliente_id;
  END IF;

  -- 5. Valida itens e calcula antecedência mínima exigida pelos produtos
  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'O pedido não contém nenhum item.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 20 THEN
    RAISE EXCEPTION 'Máximo de 20 itens por pedido online.';
  END IF;

  v_modo_retirada := COALESCE(p_payload->>'modo_retirada', 'imediato');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT id, nome, COALESCE(antecedencia_min_horas, 0) AS antecedencia_min_horas, COALESCE(apenas_encomenda, false) AS apenas_encomenda
    INTO v_produto_record
    FROM public.produtos
    WHERE id = v_item->>'produto_id' AND ativo = true AND disponivel = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou indisponível: %', v_item->>'produto_id';
    END IF;

    IF v_produto_record.apenas_encomenda AND v_modo_retirada = 'imediato' THEN
      RAISE EXCEPTION 'O item "%" está disponível apenas sob encomenda agendada.', v_produto_record.nome;
    END IF;

    IF v_produto_record.antecedencia_min_horas > v_max_antecedencia_horas THEN
      v_max_antecedencia_horas := v_produto_record.antecedencia_min_horas;
    END IF;
  END LOOP;

  -- 6. Valida horário de retirada
  IF v_modo_retirada = 'agendado' THEN
    BEGIN
      v_retirada_em := (p_payload->>'retirada_em')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Data/hora de agendamento inválida.';
    END;

    IF v_retirada_em IS NULL THEN
      RAISE EXCEPTION 'Informe a data e o horário para retirada do pedido agendado.';
    END IF;

    IF v_max_antecedencia_horas > 0 AND v_retirada_em < (v_agora + (v_max_antecedencia_horas || ' hours')::interval - INTERVAL '5 minutes') THEN
      RAISE EXCEPTION 'Este pedido contém itens que exigem antecedência mínima de % hora(s).', v_max_antecedencia_horas;
    END IF;

    IF v_retirada_em < (v_agora + INTERVAL '10 minutes') THEN
      RAISE EXCEPTION 'O horário agendado deve ser no futuro.';
    END IF;
  ELSE
    -- Modo imediato ("O quanto antes")
    IF v_max_antecedencia_horas > 0 THEN
      RAISE EXCEPTION 'Seu pedido possui itens sob encomenda que exigem no mínimo % hora(s) de antecedência. Escolha um horário agendado.', v_max_antecedencia_horas;
    END IF;
    v_retirada_em := v_agora + (v_tempo_estimado || ' minutes')::interval;
  END IF;

  -- Verifica limite de pedidos na mesma janela de 15 minutos
  SELECT COUNT(*)::int INTO v_ocupacao_janela
  FROM public.pedidos
  WHERE retirada_em IS NOT NULL
    AND status <> 'cancelado'
    AND date_trunc('hour', retirada_em AT TIME ZONE 'America/Sao_Paulo') +
        INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM (retirada_em AT TIME ZONE 'America/Sao_Paulo')) / 15.0)
      = date_trunc('hour', v_retirada_em AT TIME ZONE 'America/Sao_Paulo') +
        INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM (v_retirada_em AT TIME ZONE 'America/Sao_Paulo')) / 15.0);

  IF v_ocupacao_janela >= v_limite_janela THEN
    RAISE EXCEPTION 'A janela de horário escolhida atingiu o limite máximo de pedidos (%). Por favor, selecione outro horário.', v_limite_janela;
  END IF;

  v_observacoes := TRIM(COALESCE(p_payload->>'observacoes', ''));
  v_pedido_token := gen_random_uuid();

  -- 7. Insere o pedido
  INSERT INTO public.pedidos (
    mesa_codigo,
    status,
    observacoes,
    total,
    cliente_id,
    cliente_nome,
    cliente_telefone,
    para_viagem,
    retirada_em,
    origem,
    pedido_token,
    client_id
  ) VALUES (
    'RETIRADA',
    'aguardando_aprovacao',
    v_observacoes,
    0,
    v_cliente_id,
    v_cliente_nome,
    v_cliente_telefone_digits,
    true,
    v_retirada_em,
    'online',
    v_pedido_token,
    v_client_id
  ) RETURNING id, numero_pedido INTO v_pedido_id, v_numero_pedido;

  -- 8. Insere itens recalculando preços a partir do banco
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      IF jsonb_typeof(v_item->'sabores') != 'array' THEN
        RAISE EXCEPTION 'Produto meio a meio requer seleção de sabores';
      END IF;
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

        IF (SELECT COUNT(*) FROM public.produto_adicionais_permitidos WHERE produto_id = v_produto_record.id) > 0 AND NOT v_adicional_permitido THEN
          RAISE EXCEPTION 'Adicional % não permitido para o produto %', v_adicional::text, v_produto_record.nome;
        END IF;

        SELECT preco INTO v_adicional_record
        FROM public.adicionais
        WHERE id = v_adicional::text AND ativo = true;

        IF FOUND THEN
          v_preco_unitario := v_preco_unitario + v_adicional_record.preco;
        END IF;
      END LOOP;
    END IF;

    v_itens_count := GREATEST(1, LEAST(20, COALESCE((v_item->>'quantidade')::int, 1)));

    INSERT INTO public.pedido_itens (
      pedido_id,
      produto_id,
      nome_produto,
      quantidade,
      preco_base,
      preco_unitario,
      observacoes,
      estacao
    ) VALUES (
      v_pedido_id,
      v_produto_record.id,
      v_produto_record.nome,
      v_itens_count,
      v_preco_base,
      v_preco_unitario,
      v_item->>'observacoes',
      v_produto_record.estacao
    ) RETURNING id INTO v_pedido_item_id;

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

  -- 9. Aplica promoções do dia e atualiza total
  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - COALESCE(desconto, 0)), 0)
  INTO v_total
  FROM public.pedido_itens
  WHERE pedido_id = v_pedido_id;

  UPDATE public.pedidos
  SET total = v_total
  WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', v_pedido_id,
    'numero_pedido', v_numero_pedido,
    'pedido_token', v_pedido_token,
    'mesa_codigo', 'RETIRADA',
    'status', 'aguardando_aprovacao',
    'retirada_em', v_retirada_em,
    'total', v_total
  );
END;
$$;

-- 6. Atualiza consultar_status_pedido_cliente para retornar origem, retirada_em, numero_pedido e para_viagem
CREATE OR REPLACE FUNCTION public.consultar_status_pedido_cliente(p_pedido_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido RECORD;
  v_itens JSONB;
BEGIN
  IF p_pedido_token IS NULL THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  SELECT
    p.id,
    p.numero_pedido,
    p.mesa_codigo,
    p.status,
    p.total,
    p.origem,
    p.para_viagem,
    p.retirada_em,
    p.created_at,
    p.updated_at,
    p.motivo_cancelamento,
    p.cliente_nome
  INTO v_pedido
  FROM public.pedidos p
  WHERE p.pedido_token = p_pedido_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
      'produto_id', pi.produto_id,
      'nome', pi.nome_produto,
      'quantidade', pi.quantidade,
      'preco_unitario', pi.preco_unitario,
      'cancelado', pi.cancelado
    )
  ) INTO v_itens
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = v_pedido.id;

  RETURN jsonb_build_object(
    'encontrado', true,
    'id', v_pedido.id,
    'numero_pedido', v_pedido.numero_pedido,
    'mesa_codigo', v_pedido.mesa_codigo,
    'status', v_pedido.status,
    'origem', v_pedido.origem,
    'para_viagem', v_pedido.para_viagem,
    'retirada_em', v_pedido.retirada_em,
    'total', v_pedido.total,
    'created_at', v_pedido.created_at,
    'motivo_cancelamento', v_pedido.motivo_cancelamento,
    'cliente_nome', v_pedido.cliente_nome,
    'itens', COALESCE(v_itens, '[]'::jsonb)
  );
END;
$$;

-- 7. RPC: marcar_pedido_nao_retirado (não-comparecimento com cancelamento, estorno e registro no cliente)
CREATE OR REPLACE FUNCTION public.marcar_pedido_nao_retirado(
  p_pedido_id BIGINT,
  p_motivo TEXT DEFAULT 'Não retirado pelo cliente no horário agendado'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 8. Atualiza v_painel_retirada para incluir pedidos agendados para hoje quando já estiverem em preparo ou prontos
CREATE OR REPLACE VIEW public.v_painel_retirada WITH (security_invoker = false) AS
SELECT 
  id,
  numero_pedido,
  split_part(trim(coalesce(cliente_nome, '')), ' ', 1) AS primeiro_nome,
  status,
  pronto_em,
  concluido_em,
  para_viagem,
  mesa_codigo,
  created_at
FROM public.pedidos
WHERE (
    created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
    OR (retirada_em IS NOT NULL AND (retirada_em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  )
  AND status IN ('pendente', 'em_preparo', 'concluido')
  AND (retirada_em IS NULL OR retirada_em <= now() + INTERVAL '25 minutes');

GRANT SELECT ON public.v_painel_retirada TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_janelas_ocupadas_online(DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pedido_online(JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_status_pedido_cliente(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_pedido_nao_retirado(BIGINT, TEXT) TO authenticated;
