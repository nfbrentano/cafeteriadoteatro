-- ==============================================================================
-- CAF-000132: LGPD e exportações: consentimento, Consent Mode, privacidade, canal do titular e escape CSV
-- ==============================================================================

-- 1. Remoção de colunas sem finalidade na tabela acessos (RF07 / CA10)
ALTER TABLE public.acessos DROP COLUMN IF EXISTS ip;
ALTER TABLE public.acessos DROP COLUMN IF EXISTS user_agent;

-- 2. Tabela de solicitações de direitos do titular (RF06 / CA08, CA09)
CREATE TABLE IF NOT EXISTS public.solicitacoes_titular (
  id BIGSERIAL PRIMARY KEY,
  protocolo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('copia_dados', 'exclusao_anonimizacao')),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  motivo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_analise', 'concluido', 'rejeitado')),
  resposta_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executado_em TIMESTAMPTZ,
  executado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_titular_telefone ON public.solicitacoes_titular(telefone);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_titular_status ON public.solicitacoes_titular(status);

ALTER TABLE public.solicitacoes_titular ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas admins visualizam solicitacoes_titular" ON public.solicitacoes_titular;
CREATE POLICY "Apenas admins visualizam solicitacoes_titular"
ON public.solicitacoes_titular
FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin')
WITH CHECK (public.get_user_role() = 'admin');

-- 3. RPC pública para solicitação de direitos pelo titular (RF06 / CA08, CA09)
CREATE OR REPLACE FUNCTION public.solicitar_direito_titular(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo TEXT;
  v_nome TEXT;
  v_telefone_raw TEXT;
  v_telefone_digits TEXT;
  v_motivo TEXT;
  v_protocolo TEXT;
  v_solicitacoes_recentes INT := 0;
  v_solicitacao_id BIGINT;
BEGIN
  v_tipo := LOWER(TRIM(COALESCE(p_payload->>'tipo', '')));
  IF v_tipo NOT IN ('copia_dados', 'exclusao_anonimizacao') THEN
    RAISE EXCEPTION 'Tipo de solicitação inválido. Opções permitidas: copia_dados, exclusao_anonimizacao.';
  END IF;

  v_nome := TRIM(COALESCE(p_payload->>'nome', ''));
  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Por favor, informe seu nome completo.';
  END IF;

  v_telefone_raw := TRIM(COALESCE(p_payload->>'telefone', ''));
  v_telefone_digits := regexp_replace(v_telefone_raw, '\D', '', 'g');
  IF length(v_telefone_digits) IN (10, 11) THEN
    v_telefone_digits := '55' || v_telefone_digits;
  END IF;

  IF length(v_telefone_digits) NOT IN (12, 13) THEN
    RAISE EXCEPTION 'Informe um número de WhatsApp válido com DDD (ex: 51 99999-9999).';
  END IF;

  v_motivo := LEFT(TRIM(COALESCE(p_payload->>'motivo', '')), 500);

  -- Rate limit: máx 3 solicitações por telefone nas últimas 24 horas (RF06, RNF02, CA09)
  SELECT COUNT(*)::int INTO v_solicitacoes_recentes
  FROM public.solicitacoes_titular
  WHERE telefone = v_telefone_digits
    AND created_at >= (now() - INTERVAL '24 hours');

  IF v_solicitacoes_recentes >= 3 THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'protocolo', 'LGPD-PENDENTE',
      'mensagem', 'Limite diário de solicitações atingido para este contato. Caso necessário, aguarde 24 horas ou entre em contato diretamente com o nosso Encarregado de Dados.'
    );
  END IF;

  v_protocolo := 'LGPD-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 6));

  INSERT INTO public.solicitacoes_titular (
    protocolo,
    tipo,
    nome,
    telefone,
    motivo,
    status
  ) VALUES (
    v_protocolo,
    v_tipo,
    v_nome,
    v_telefone_digits,
    v_motivo,
    'pendente'
  ) RETURNING id INTO v_solicitacao_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'protocolo', v_protocolo,
    'mensagem', 'Sua solicitação foi registrada com sucesso sob o protocolo ' || v_protocolo || '. Nossa equipe processará seu pedido em até 15 dias conforme prevê a LGPD.'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.solicitar_direito_titular(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_direito_titular(jsonb) TO anon, authenticated;

-- 4. RPCs administrativas para gestão de solicitações de titulares (RF06 / CA08)
CREATE OR REPLACE FUNCTION public.listar_solicitacoes_titular(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado JSONB;
BEGIN
  PERFORM public.exigir_cargo('admin');

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_resultado
  FROM public.solicitacoes_titular t
  WHERE (p_status IS NULL OR t.status = p_status);

  RETURN v_resultado;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.listar_solicitacoes_titular(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_solicitacoes_titular(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.processar_solicitacao_titular(
  p_id bigint,
  p_acao text,
  p_resposta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_solicitacao RECORD;
  v_cliente RECORD;
  v_dados_exportacao JSONB;
BEGIN
  PERFORM public.exigir_cargo('admin');

  SELECT * INTO v_solicitacao
  FROM public.solicitacoes_titular
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação % não encontrada.', p_id;
  END IF;

  IF p_acao = 'anonimizar' THEN
    SELECT id, nome, telefone INTO v_cliente
    FROM public.clientes
    WHERE telefone = v_solicitacao.telefone AND ativo = true
    LIMIT 1;

    IF FOUND THEN
      PERFORM public.anonimizar_cliente(v_cliente.id);
    END IF;

    UPDATE public.solicitacoes_titular
    SET status = 'concluido',
        executado_em = now(),
        executado_por = auth.uid(),
        resposta_admin = COALESCE(p_resposta, 'Dados pessoais anonimizados com sucesso conforme solicitação do titular.')
    WHERE id = p_id;

    RETURN jsonb_build_object('sucesso', true, 'acao', 'anonimizar', 'cliente_encontrado', FOUND);

  ELSIF p_acao = 'exportar' THEN
    SELECT id, nome, telefone, email, data_nascimento, created_at, aceita_contato, anonimizado
    INTO v_cliente
    FROM public.clientes
    WHERE telefone = v_solicitacao.telefone
    LIMIT 1;

    IF NOT FOUND THEN
      v_dados_exportacao := jsonb_build_object(
        'titular', jsonb_build_object('telefone', v_solicitacao.telefone, 'mensagem', 'Nenhum cadastro ativo localizado no sistema de clientes.')
      );
    ELSE
      SELECT jsonb_build_object(
        'cadastro', to_jsonb(v_cliente),
        'pedidos', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', p.id,
            'numero_pedido', p.numero_pedido,
            'created_at', p.created_at,
            'total', p.total,
            'status', p.status,
            'forma_pagamento', p.forma_pagamento
          ) ORDER BY p.created_at DESC)
          FROM public.pedidos p
          WHERE p.cliente_id = v_cliente.id OR p.cliente_telefone = v_solicitacao.telefone
        ), '[]'::jsonb)
      ) INTO v_dados_exportacao;
    END IF;

    UPDATE public.solicitacoes_titular
    SET status = 'concluido',
        executado_em = now(),
        executado_por = auth.uid(),
        resposta_admin = COALESCE(p_resposta, 'Relatório de dados pessoais compilado para o titular.')
    WHERE id = p_id;

    RETURN jsonb_build_object('sucesso', true, 'acao', 'exportar', 'dados', v_dados_exportacao);

  ELSIF p_acao = 'rejeitar' THEN
    UPDATE public.solicitacoes_titular
    SET status = 'rejeitado',
        executado_em = now(),
        executado_por = auth.uid(),
        resposta_admin = COALESCE(p_resposta, 'Solicitação rejeitada pelo administrador.')
    WHERE id = p_id;

    RETURN jsonb_build_object('sucesso', true, 'acao', 'rejeitar');

  ELSE
    RAISE EXCEPTION 'Ação desconhecida: %. Opções válidas: anonimizar, exportar, rejeitar.', p_acao;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.processar_solicitacao_titular(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_solicitacao_titular(bigint, text, text) TO authenticated;

-- 5. Atualizar public.criar_pedido_online (RF01, RF02, RF03 / CA01, CA02, CA03, CA04)
CREATE OR REPLACE FUNCTION public.criar_pedido_online(
  p_payload jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config_ativo BOOLEAN := true;
  v_tempo_estimado INT := 15;
  v_limite_janela INT := 5;
  v_pedido_id BIGINT;
  v_numero_pedido INT;
  v_pedido_token UUID;
  v_subtotal NUMERIC(10,2) := 0;
  v_total NUMERIC(10,2) := 0;
  v_desconto_cupom NUMERIC(10,2) := 0;
  v_campanha_id BIGINT;
  v_cupom_codigo TEXT;
  v_cupom_res JSONB;
  v_cliente_nome TEXT;
  v_cliente_telefone_raw TEXT;
  v_cliente_telefone_digits TEXT;
  v_cliente_id UUID;
  v_aceita_marketing BOOLEAN := false;
  v_observacoes TEXT;
  v_modo_retirada TEXT;
  v_forma_pagamento TEXT;
  v_status_inicial TEXT := 'aguardando_aprovacao';
  v_exigir_pix BOOLEAN := false;
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
  v_pedidos_pendentes_online INT := 0;
  v_lock_key BIGINT;
BEGIN
  -- 1. Verifica se pedidos online estão ativos
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

  -- 3. Limite global de pedidos online aguardando aprovação (RF08: máx 30)
  SELECT COUNT(*)::int INTO v_pedidos_pendentes_online
  FROM public.pedidos
  WHERE origem IN ('online', 'online_retirada')
    AND status IN ('aguardando_aprovacao', 'pendente');

  IF v_pedidos_pendentes_online >= 30 THEN
    RAISE EXCEPTION 'A cafeteria atingiu a capacidade máxima temporária de pedidos online pendentes. Por favor, tente novamente em alguns instantes.';
  END IF;

  -- 4. Validação de dados do cliente
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

  -- Opt-in explícito para marketing: padrão FALSE (RF02, RF03 / CA02, CA03, CA04)
  -- Nota: ignora aceita_lgpd obrigatório legado e lê exclusivamente aceita_marketing explícito
  v_aceita_marketing := COALESCE((p_payload->>'aceita_marketing')::boolean, false);

  -- 5. Rate limiting por telefone
  SELECT MAX(created_at) INTO v_ultimo_pedido_em
  FROM public.pedidos
  WHERE cliente_telefone = v_cliente_telefone_digits AND origem IN ('online', 'online_retirada');

  IF v_ultimo_pedido_em IS NOT NULL AND (v_agora - v_ultimo_pedido_em) < INTERVAL '30 seconds' THEN
    RAISE EXCEPTION 'Aguarde alguns segundos antes de enviar outro pedido.';
  END IF;

  -- 6. Vinculação de cliente com consentimento explícito e seguro (RF03 / CA02, CA03, CA04)
  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE telefone = v_cliente_telefone_digits
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    -- Novo cliente: grava aceita_contato baseado estritamente em aceita_marketing (default false)
    INSERT INTO public.clientes (nome, telefone, aceita_contato, ativo)
    VALUES (v_cliente_nome, v_cliente_telefone_digits, v_aceita_marketing, true)
    ON CONFLICT (telefone) DO NOTHING
    RETURNING id INTO v_cliente_id;

    IF v_cliente_id IS NULL THEN
      SELECT id INTO v_cliente_id FROM public.clientes WHERE telefone = v_cliente_telefone_digits;
    END IF;
  ELSE
    -- Cliente existente: só atualiza para true se o cliente marcou explicitamente nesta compra.
    -- Nunca reverte para false por omissão, nem marca true se faltar o campo (CA04).
    IF v_aceita_marketing IS TRUE THEN
      UPDATE public.clientes
      SET aceita_contato = true
      WHERE id = v_cliente_id;
    END IF;
  END IF;

  -- 7. Validação de itens
  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'O pedido não contém nenhum item.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 20 THEN
    RAISE EXCEPTION 'Máximo de 20 itens por pedido online.';
  END IF;

  v_modo_retirada := COALESCE(p_payload->>'modo_retirada', 'imediato');
  v_forma_pagamento := NULLIF(LOWER(TRIM(COALESCE(p_payload->>'forma_pagamento', ''))), '');

  v_exigir_pix := (v_forma_pagamento = 'pix' OR COALESCE((p_payload->>'exigir_pagamento_pix')::boolean, false))
                  AND public.fn_deve_exigir_pix_kds();
  IF v_exigir_pix THEN
    v_status_inicial := 'aguardando_pagamento';
  ELSE
    v_status_inicial := 'aguardando_aprovacao';
  END IF;

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

  -- 8. Validação de horário de funcionamento e cálculo de retirada_em (RF04 / CA05, CA06)
  IF v_modo_retirada = 'agendado' THEN
    BEGIN
      v_retirada_em := (p_payload->>'retirada_em')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Data/hora de agendamento inválida.';
    END;

    IF v_retirada_em IS NULL THEN
      RAISE EXCEPTION 'Informe a data e o horário para retirada do pedido agendado.';
    END IF;

    IF NOT public.loja_esta_aberta(v_retirada_em) THEN
      RAISE EXCEPTION 'O horário selecionado para retirada está fora do horário de funcionamento da cafeteria.';
    END IF;

    IF v_max_antecedencia_horas > 0 AND v_retirada_em < (v_agora + (v_max_antecedencia_horas || ' hours')::interval - INTERVAL '5 minutes') THEN
      RAISE EXCEPTION 'Este pedido contém itens que exigem antecedência mínima de % hora(s).', v_max_antecedencia_horas;
    END IF;

    IF v_retirada_em < (v_agora + INTERVAL '10 minutes') THEN
      RAISE EXCEPTION 'O horário agendado deve ser no futuro.';
    END IF;
  ELSE
    -- Imediato: valida se loja está aberta agora
    IF NOT public.loja_esta_aberta(v_agora) THEN
      RAISE EXCEPTION 'A cafeteria está fechada no momento. Pedidos online para retirada imediata não estão disponíveis.';
    END IF;

    IF v_max_antecedencia_horas > 0 THEN
      RAISE EXCEPTION 'Seu pedido possui itens sob encomenda que exigem no mínimo % hora(s) de antecedência. Escolha um horário agendado.', v_max_antecedencia_horas;
    END IF;
    v_retirada_em := v_agora + (v_tempo_estimado || ' minutes')::interval;
  END IF;

  -- 9. Advisory lock por janela de 15 min e verificação de capacidade (RF09 / CA12)
  v_lock_key := hashtext('retirada_janela_' || to_char(
    date_trunc('hour', v_retirada_em AT TIME ZONE 'America/Sao_Paulo') +
    INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM (v_retirada_em AT TIME ZONE 'America/Sao_Paulo')) / 15.0),
    'YYYY-MM-DD_HH24:MI'
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

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

  -- Truncamento de observações em 500 caracteres (RF10 / CA13)
  v_observacoes := LEFT(TRIM(COALESCE(p_payload->>'observacoes', '')), 500);
  v_pedido_token := gen_random_uuid();

  -- 10. Criação do pedido
  INSERT INTO public.pedidos (
    mesa_codigo,
    status,
    status_pagamento,
    forma_pagamento,
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
    v_status_inicial,
    'pendente',
    v_forma_pagamento,
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

  -- 11. Inserção dos itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND disponivel = true;

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
      LEFT(TRIM(COALESCE(v_item->>'observacoes', '')), 500),
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

  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  -- 12. Calcula subtotal e processa cupom de desconto no servidor (RF01 / CA01, CA02)
  SELECT COALESCE(SUM(quantidade * preco_unitario - COALESCE(desconto, 0)), 0)
  INTO v_subtotal
  FROM public.pedido_itens
  WHERE pedido_id = v_pedido_id;

  v_total := v_subtotal;
  v_cupom_codigo := UPPER(TRIM(COALESCE(p_payload->>'cupom_codigo', '')));

  IF v_cupom_codigo <> '' THEN
    v_cupom_res := public.validar_cupom(v_cupom_codigo, v_subtotal, v_cliente_id);
    IF NOT COALESCE((v_cupom_res->>'valido')::boolean, false) THEN
      RAISE EXCEPTION 'Cupom inválido ou expirado: %', COALESCE(v_cupom_res->>'mensagem', 'Não autorizado.');
    END IF;

    v_desconto_cupom := COALESCE((v_cupom_res->>'desconto_calculado')::numeric, 0);
    v_campanha_id := (v_cupom_res->>'campanha_id')::bigint;
    v_total := GREATEST(0, v_subtotal - v_desconto_cupom);

    UPDATE public.pedidos
    SET total = v_total,
        desconto_cupom = v_desconto_cupom,
        campanha_id = v_campanha_id,
        cupom_codigo = v_cupom_res->>'cupom_codigo'
    WHERE id = v_pedido_id;

    -- Registra uso atomicamente vinculado ao cliente
    INSERT INTO public.campanha_usos (campanha_id, pedido_id, cliente_id, valor_receita, created_at)
    VALUES (v_campanha_id, v_pedido_id, v_cliente_id, v_total, now());

    UPDATE public.campanhas
    SET usos_registrados = (SELECT COUNT(*) FROM public.campanha_usos WHERE campanha_id = v_campanha_id),
        receita_atribuida = (SELECT COALESCE(SUM(valor_receita), 0) FROM public.campanha_usos WHERE campanha_id = v_campanha_id)
    WHERE id = v_campanha_id;
  ELSE
    UPDATE public.pedidos
    SET total = v_total
    WHERE id = v_pedido_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', v_pedido_id,
    'numero_pedido', v_numero_pedido,
    'pedido_token', v_pedido_token,
    'mesa_codigo', 'RETIRADA',
    'status', v_status_inicial,
    'status_pagamento', 'pendente',
    'forma_pagamento', v_forma_pagamento,
    'retirada_em', v_retirada_em,
    'total', v_total,
    'exigir_pagamento', v_exigir_pix
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.criar_pedido_online(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido_online(jsonb, text) TO anon, authenticated;

-- Registra a migração 132 em public.app_migrations
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('132', 'migration_caf_000132_lgpd_consentimento_privacidade.sql')
ON CONFLICT (versao) DO UPDATE SET arquivo = EXCLUDED.arquivo;
