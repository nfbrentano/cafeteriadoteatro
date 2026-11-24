-- ==============================================================================
-- Migration CAF-000130: Regressões em produção: avaliação pós-pedido, anti-spam do QR e fuso horário
-- Versão: 130
-- ==============================================================================

-- 1. Padronização de DEFAULTS de colunas TIMESTAMPTZ para now() (RF06, CA07, CA08)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Varre todas as colunas TIMESTAMPTZ em public que usam timezone('America/Sao_Paulo', now())
  FOR r IN (
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp with time zone'
      AND column_default ILIKE '%timezone%America/Sao_Paulo%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT now()', r.table_name, r.column_name);
  END LOOP;
END $$;

-- 2. Atualização das funções vigentes substituindo timezone('America/Sao_Paulo', now()) por now() (RF04, RF06, CA04, CA05, CA06, CA07, CA08)
CREATE OR REPLACE FUNCTION public.adicionar_itens_pedido(p_pedido_id bigint, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_now TIMESTAMPTZ := now();
  v_qtd INT;
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
    -- RF04 / CA06: Limite de quantidade 1..99
    v_qtd := (v_item->>'quantidade')::INT;
    IF v_qtd IS NULL OR v_qtd < 1 OR v_qtd > 99 THEN
      RAISE EXCEPTION 'Quantidade do item deve estar entre 1 e 99.';
    END IF;

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
      p_pedido_id, v_produto_record.id, v_produto_record.nome, v_qtd,
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
$function$;

CREATE OR REPLACE FUNCTION public.alterar_prioridade_pedido(p_pedido_id bigint, p_prioridade smallint, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role TEXT;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'cozinha', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.pedidos
  SET prioridade = p_prioridade,
      prioridade_motivo = CASE WHEN p_prioridade = 1 THEN p_motivo ELSE NULL END,
      updated_at = now()
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  RETURN jsonb_build_object('id', p_pedido_id, 'prioridade', p_prioridade, 'prioridade_motivo', p_motivo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.aprovar_pedido_cliente(p_pedido_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      updated_at = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object('sucesso', true, 'pedido_id', p_pedido_id, 'status', 'pendente');
END;
$function$;

CREATE OR REPLACE FUNCTION public.atender_chamado_mesa(p_chamado_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.mesa_chamados
  SET status = 'atendido',
      atendido_em = now(),
      atendido_por = auth.uid()
  WHERE id = p_chamado_id;

  RETURN jsonb_build_object('sucesso', true, 'chamado_id', p_chamado_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_nfce(p_nota_id uuid, p_motivo text, p_pin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nota RECORD;
  v_user_role TEXT := public.get_user_role();
  v_tem_permissao BOOLEAN := false;
  v_operador_nome TEXT := 'Supervisor';
  v_pin_valido RECORD;
BEGIN
  SELECT * INTO v_nota
  FROM public.notas_fiscais
  WHERE id = p_nota_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota fiscal % não encontrada.', p_nota_id;
  END IF;

  IF v_nota.status = 'cancelada' THEN
    RETURN jsonb_build_object('sucesso', true, 'nota_id', p_nota_id, 'status', 'cancelada', 'ja_cancelada', true);
  END IF;

  IF v_nota.status != 'autorizada' AND v_nota.status != 'contingencia' THEN
    RAISE EXCEPTION 'Apenas notas autorizadas ou em contingência podem ser canceladas. Status atual: %', v_nota.status;
  END IF;

  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 15 THEN
    RAISE EXCEPTION 'O motivo de cancelamento deve conter no mínimo 15 caracteres conforme exigência fiscal.';
  END IF;

  -- Verificação de autorização (CA08): perfil admin/gerente, ou validação de PIN de supervisor
  IF v_user_role IN ('admin', 'gerente') OR public.tem_permissao('admin.geral') THEN
    v_tem_permissao := true;
  ELSIF p_pin IS NOT NULL AND LENGTH(TRIM(p_pin)) >= 4 THEN
    BEGIN
      SELECT p.id, p.nome INTO v_pin_valido
      FROM public.perfis p
      WHERE p.pin_hash = public.fn_hash_pin(p_pin)
        AND p.ativo = true
        AND (p.cargo_id IN (SELECT id FROM public.cargos WHERE nome ILIKE '%admin%' OR nome ILIKE '%gerente%' OR nome ILIKE '%superv%')
             OR p.nome ILIKE '%admin%');

      IF FOUND THEN
        v_tem_permissao := true;
        v_operador_nome := v_pin_valido.nome;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_tem_permissao := false;
    END;
  END IF;

  IF NOT v_tem_permissao THEN
    RAISE EXCEPTION 'Permissão negada para cancelamento de nota fiscal. PIN de supervisor ou perfil administrativo obrigatório.';
  END IF;

  UPDATE public.notas_fiscais
  SET status = 'cancelada',
      motivo_cancelamento = p_motivo,
      cancelada_em = now(),
      cancelada_por = auth.uid(),
      cancelada_por_nome = v_operador_nome,
      updated_at = now()
  WHERE id = p_nota_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'nota_id', p_nota_id,
    'status', 'cancelada',
    'cancelada_em', now(),
    'cancelada_por_nome', v_operador_nome
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.chamar_atendente_mesa(p_qr_token text, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mesa RECORD;
  v_chamado_id BIGINT;
  v_recente TIMESTAMPTZ;
BEGIN
  IF p_tipo NOT IN ('atendente', 'conta') THEN
    RAISE EXCEPTION 'Tipo de chamado inválido: %', p_tipo;
  END IF;

  SELECT * INTO v_mesa
  FROM public.mesas
  WHERE qr_token = p_qr_token AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada ou QR code inválido.';
  END IF;

  -- Rate limit: 1 chamado por minuto por mesa do mesmo tipo
  SELECT MAX(created_at) INTO v_recente
  FROM public.mesa_chamados
  WHERE mesa_codigo = v_mesa.codigo AND tipo = p_tipo AND status = 'pendente';

  IF v_recente IS NOT NULL AND (now() - v_recente) < INTERVAL '60 seconds' THEN
    RETURN jsonb_build_object('sucesso', true, 'repetido', true, 'mensagem', 'Chamado já registrado. O atendente já foi avisado.');
  END IF;

  INSERT INTO public.mesa_chamados (mesa_codigo, tipo, status)
  VALUES (v_mesa.codigo, p_tipo, 'pendente')
  RETURNING id INTO v_chamado_id;

  RETURN jsonb_build_object('sucesso', true, 'chamado_id', v_chamado_id, 'mesa_codigo', v_mesa.codigo, 'tipo', p_tipo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.concluir_estacao(p_pedido_id bigint, p_estacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role TEXT;
  v_now TIMESTAMPTZ := now();
  v_novo_status TEXT;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('cozinha', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_estacao IS NOT NULL AND p_estacao NOT IN ('bar', 'cozinha') THEN
    RAISE EXCEPTION 'Estação inválida: %', p_estacao;
  END IF;

  -- Se pedido ainda não tinha iniciado_em, garantir registro
  UPDATE public.pedidos
  SET iniciado_em = COALESCE(iniciado_em, v_now)
  WHERE id = p_pedido_id AND iniciado_em IS NULL;

  -- Marcar pronto_em e pronto_por nos itens da estação especificada (ou todos se NULL)
  -- Nota: O trigger trg_checar_conclusao_pedido avaliará a conclusão global do pedido
  UPDATE public.pedido_itens
  SET pronto_em = COALESCE(pronto_em, v_now),
      pronto_por = COALESCE(pronto_por, auth.uid()),
      iniciado_em = COALESCE(iniciado_em, v_now)
  WHERE pedido_id = p_pedido_id
    AND cancelado = false
    AND (p_estacao IS NULL OR estacao = p_estacao);

  SELECT status INTO v_novo_status FROM public.pedidos WHERE id = p_pedido_id;
  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', v_novo_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_cobranca_pix(p_pedido_id bigint DEFAULT NULL::bigint, p_mesa_codigo text DEFAULT NULL::text, p_valor numeric DEFAULT NULL::numeric, p_canal text DEFAULT 'totem'::text, p_txid text DEFAULT NULL::text, p_brcode text DEFAULT NULL::text, p_provedor text DEFAULT 'sandbox'::text, p_expiracao_min integer DEFAULT NULL::integer, p_parte_nome text DEFAULT NULL::text, p_fechamento_payload jsonb DEFAULT NULL::jsonb, p_psp_transacao_id text DEFAULT NULL::text, p_qr_code_base64 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_canal TEXT;
  v_provedor TEXT;
  v_valor NUMERIC(10,2);
  v_expiracao_min INT;
  v_expira_em TIMESTAMPTZ;
  v_txid TEXT;
  v_brcode TEXT;
  v_cobranca_id UUID;
BEGIN
  v_canal := LOWER(TRIM(COALESCE(p_canal, 'totem')));
  IF v_canal NOT IN ('totem', 'online', 'pdv', 'cliente_qr') THEN
    v_canal := 'totem';
  END IF;

  v_provedor := LOWER(TRIM(COALESCE(p_provedor, 'sandbox')));
  IF v_provedor NOT IN ('mercadopago', 'asaas', 'sandbox', 'estatico') THEN
    v_provedor := 'sandbox';
  END IF;

  -- Expirar pendentes vencidas antes de gerar nova cobrança
  UPDATE public.pix_cobrancas
  SET status = 'expirada',
      updated_at = now()
  WHERE status = 'pendente'
    AND expira_em <= now();

  -- Resolver valor
  v_valor := ROUND(COALESCE(p_valor, 0), 2);
  IF v_valor <= 0 AND p_pedido_id IS NOT NULL THEN
    SELECT COALESCE(total, 0) INTO v_valor
    FROM public.pedidos
    WHERE id = p_pedido_id;
  END IF;

  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'Valor da cobrança Pix deve ser maior que zero.';
  END IF;

  -- Cancelar cobranças anteriores ainda pendentes para o mesmo pedido ou mesa/parte (CA09)
  IF p_pedido_id IS NOT NULL THEN
    UPDATE public.pix_cobrancas
    SET status = 'cancelada',
        motivo_conferencia = COALESCE(motivo_conferencia, 'Substituída por nova cobrança Pix'),
        updated_at = now()
    WHERE pedido_id = p_pedido_id
      AND status = 'pendente';
  ELSIF p_mesa_codigo IS NOT NULL AND v_canal = 'pdv' THEN
    UPDATE public.pix_cobrancas
    SET status = 'cancelada',
        motivo_conferencia = COALESCE(motivo_conferencia, 'Substituída por nova cobrança Pix na mesa'),
        updated_at = now()
    WHERE mesa_codigo = p_mesa_codigo
      AND canal = 'pdv'
      AND COALESCE(parte_nome, '') = COALESCE(p_parte_nome, '')
      AND status = 'pendente';
  END IF;

  -- Resolver validade configurada por canal
  IF p_expiracao_min IS NOT NULL AND p_expiracao_min > 0 THEN
    v_expiracao_min := p_expiracao_min;
  ELSIF v_canal = 'online' THEN
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9]', '', 'g'), '')::int, 30)
    INTO v_expiracao_min
    FROM public.configuracoes_sistema
    WHERE chave = 'pix_expiracao_online_min';
    v_expiracao_min := COALESCE(v_expiracao_min, 30);
  ELSIF v_canal = 'pdv' THEN
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9]', '', 'g'), '')::int, 10)
    INTO v_expiracao_min
    FROM public.configuracoes_sistema
    WHERE chave = 'pix_expiracao_pdv_min';
    v_expiracao_min := COALESCE(v_expiracao_min, 10);
  ELSE
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9]', '', 'g'), '')::int, 10)
    INTO v_expiracao_min
    FROM public.configuracoes_sistema
    WHERE chave = 'pix_expiracao_totem_min';
    v_expiracao_min := COALESCE(v_expiracao_min, 10);
  END IF;

  v_expiracao_min := GREATEST(1, LEAST(1440, v_expiracao_min));
  v_expira_em := now() + (v_expiracao_min || ' minutes')::interval;

  v_txid := regexp_replace(UPPER(TRIM(COALESCE(p_txid, ''))), '[^A-Z0-9]', '', 'g');
  IF v_txid = '' THEN
    v_txid := 'PIX' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 20));
  END IF;
  v_txid := LEFT(v_txid, 25);

  v_brcode := COALESCE(NULLIF(TRIM(p_brcode), ''), 'PIX:' || v_txid);

  INSERT INTO public.pix_cobrancas (
    pedido_id,
    mesa_codigo,
    parte_nome,
    canal,
    provedor,
    txid,
    psp_transacao_id,
    valor,
    brcode,
    qr_code_base64,
    status,
    expira_em,
    fechamento_payload
  ) VALUES (
    p_pedido_id,
    p_mesa_codigo,
    p_parte_nome,
    v_canal,
    v_provedor,
    v_txid,
    NULLIF(TRIM(COALESCE(p_psp_transacao_id, '')), ''),
    v_valor,
    v_brcode,
    p_qr_code_base64,
    'pendente',
    v_expira_em,
    p_fechamento_payload
  ) RETURNING id INTO v_cobranca_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'cobranca_id', v_cobranca_id,
    'pedido_id', p_pedido_id,
    'mesa_codigo', p_mesa_codigo,
    'canal', v_canal,
    'provedor', v_provedor,
    'txid', v_txid,
    'valor', v_valor,
    'status', 'pendente',
    'expira_em', v_expira_em,
    'expiracao_min', v_expiracao_min,
    'brcode', v_brcode,
    'qr_code_base64', p_qr_code_base64
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_pedido_cliente(p_qr_token text, p_payload jsonb, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mesa RECORD;
  v_pedido_id BIGINT;
  v_pedido_token UUID;
  v_total NUMERIC(10,2) := 0;
  v_cliente_nome TEXT;
  v_observacoes TEXT;
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
  v_config_ativo BOOLEAN;
  v_client_id UUID;
  v_status_retorno TEXT;
BEGIN
  -- 1. Verifica se autoatendimento está ativo
  SELECT COALESCE((valor->>'ativo')::boolean, (valor)::boolean, true)
  INTO v_config_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_cliente_ativo';

  IF v_config_ativo IS FALSE THEN
    RAISE EXCEPTION 'O autoatendimento por QR Code está temporariamente desativado.';
  END IF;

  -- 2. Valida o QR token da mesa
  IF p_qr_token IS NULL OR TRIM(p_qr_token) = '' THEN
    RAISE EXCEPTION 'QR Code inválido ou não informado.';
  END IF;

  SELECT * INTO v_mesa
  FROM public.mesas
  WHERE qr_token = p_qr_token AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada, QR Code expirado ou mesa inativa.';
  END IF;

  -- 3. Idempotência (se fornecido client_id / idempotency_key)
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    BEGIN
      v_client_id := p_idempotency_key::UUID;
      SELECT id, pedido_token, status, total
      INTO v_pedido_id, v_pedido_token, v_status_retorno, v_total
      FROM public.pedidos
      WHERE client_id = v_client_id;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'sucesso', true,
          'pedido_id', v_pedido_id,
          'pedido_token', v_pedido_token,
          'mesa_codigo', v_mesa.codigo,
          'status', v_status_retorno,
          'total', v_total,
          'idempotente', true
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_client_id := NULL;
    END;
  END IF;

  -- 4. Rate limiting: máx 1 pedido a cada 30 segundos para a mesma mesa
  SELECT MAX(created_at) INTO v_ultimo_pedido_em
  FROM public.pedidos
  WHERE mesa_codigo = v_mesa.codigo AND origem = 'cliente_qr';

  IF v_ultimo_pedido_em IS NOT NULL AND (now() - v_ultimo_pedido_em) < INTERVAL '30 seconds' THEN
    RAISE EXCEPTION 'Por favor, aguarde alguns instantes antes de enviar outro pedido para esta mesa.';
  END IF;

  -- 5. Validação de quantidade de itens
  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'O pedido não contém nenhum item.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 15 THEN
    RAISE EXCEPTION 'Máximo de 15 itens por pedido no autoatendimento.';
  END IF;

  v_cliente_nome := TRIM(COALESCE(p_payload->>'cliente_nome', 'Cliente'));
  IF v_cliente_nome = '' THEN v_cliente_nome := 'Cliente'; END IF;
  v_observacoes := TRIM(COALESCE(p_payload->>'observacoes', ''));
  v_pedido_token := gen_random_uuid();

  -- 6. Cria o pedido com status 'aguardando_aprovacao' e origem 'cliente_qr'
  INSERT INTO public.pedidos (
    mesa_codigo,
    status,
    observacoes,
    total,
    cliente_nome,
    origem,
    pedido_token,
    client_id
  ) VALUES (
    v_mesa.codigo,
    'aguardando_aprovacao',
    v_observacoes,
    0,
    v_cliente_nome,
    'cliente_qr',
    v_pedido_token,
    v_client_id
  ) RETURNING id INTO v_pedido_id;

  -- 7. Insere itens recalculando preços a partir do banco de dados (proteção contra manipulação)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado, inativo ou esgotado: %', v_item->>'produto_id';
    END IF;

    -- Montagem meio a meio
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

    -- Validação de adicionais
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

    -- Quantidade
    v_itens_count := GREATEST(1, LEAST(10, COALESCE((v_item->>'quantidade')::int, 1)));

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

    -- Registra sabores se meio a meio
    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id';
        INSERT INTO public.pedido_item_sabores (pedido_item_id, lado, produto_id, nome, preco)
        VALUES (v_pedido_item_id, v_sabor->>'lado', v_sabor_record.id, v_sabor_record.nome, ROUND(v_sabor_record.preco * 0.5, 2));
      END LOOP;
    END IF;

    -- Registra adicionais do item
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

  -- 8. Aplica promoções ativas do dia se houver
  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  -- 9. Atualiza total do pedido
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
    'pedido_token', v_pedido_token,
    'mesa_codigo', v_mesa.codigo,
    'status', 'aguardando_aprovacao',
    'total', v_total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.dar_baixa_lote_vencido(p_lote_id bigint, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      updated_at = now()
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
    now()
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
$function$;

CREATE OR REPLACE FUNCTION public.expirar_cobrancas_pix_vencidas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT := 0;
BEGIN
  WITH atualizadas AS (
    UPDATE public.pix_cobrancas
    SET status = 'expirada',
        updated_at = now()
    WHERE status = 'pendente'
      AND expira_em <= now()
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_count FROM atualizadas;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expirar_pedidos_totem_vencidos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_min INT := 15;
  v_count INT := 0;
BEGIN
  SELECT COALESCE((valor)::text::int, 15)
  INTO v_min
  FROM public.configuracoes_sistema
  WHERE chave = 'totem_expiracao_pagamento_min';

  WITH cancelados AS (
    UPDATE public.pedidos
    SET status = 'cancelado',
        motivo_cancelamento = 'Expirado automaticamente (pagamento não realizado em ' || v_min || ' min no totem)',
        cancelado_em = now(),
        updated_at = now()
    WHERE origem = 'totem'
      AND status = 'aguardando_pagamento'
      AND created_at < (now() - (v_min || ' minutes')::interval)
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_count FROM cancelados;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit_pedido_itens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_user_nome TEXT;
BEGIN
    -- Caso INSERT (item adicionado)
    IF TG_OP = 'INSERT' THEN
        v_user_id := auth.uid();
        v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

        INSERT INTO public.pedido_eventos (
            pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
        ) VALUES (
            NEW.pedido_id, NEW.id, 'item_adicionado', NULL,
            CONCAT(NEW.quantidade, 'x ', NEW.nome_produto),
            NEW.observacoes, v_user_id, v_user_nome, now()
        );
        RETURN NEW;
    END IF;

    -- Caso UPDATE (item cancelado)
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.cancelado IS DISTINCT FROM true AND NEW.cancelado = true) THEN
            v_user_id := COALESCE(NEW.cancelado_por, auth.uid());
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.pedido_id, NEW.id, 'item_cancelado',
                CONCAT(NEW.quantidade, 'x ', NEW.nome_produto),
                'cancelado',
                NEW.motivo_cancelamento,
                v_user_id, v_user_nome, now()
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit_pedidos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_user_nome TEXT;
BEGIN
    -- Caso INSERT (pedido criado)
    IF TG_OP = 'INSERT' THEN
        v_user_id := COALESCE(NEW.criado_por, auth.uid());
        v_user_nome := public.fn_resolver_nome_usuario(v_user_id, NEW.criado_por_nome);

        INSERT INTO public.pedido_eventos (
            pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
        ) VALUES (
            NEW.id, NULL, 'criado', NULL, NEW.status, 
            CASE 
                WHEN NEW.prioridade = 1 THEN CONCAT('⚡ Prioritário (', COALESCE(NEW.prioridade_motivo, 'Sem motivo'), ') - ', COALESCE(NEW.observacoes, ''))
                ELSE NEW.observacoes 
            END,
            v_user_id, v_user_nome, NEW.created_at
        );
        RETURN NEW;
    END IF;

    -- Caso UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- 1) Mudança de Status
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            IF NEW.status = 'cancelado' THEN
                v_user_id := COALESCE(NEW.cancelado_por, auth.uid());
                v_user_nome := public.fn_resolver_nome_usuario(v_user_id, NEW.cancelado_por_nome);

                INSERT INTO public.pedido_eventos (
                    pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
                ) VALUES (
                    NEW.id, NULL, 'cancelado', OLD.status, 'cancelado', NEW.motivo_cancelamento, v_user_id, v_user_nome, now()
                );
            ELSE
                IF NEW.status = 'concluido' THEN
                    v_user_id := COALESCE(NEW.concluido_por, auth.uid());
                ELSIF NEW.status = 'entregue' THEN
                    v_user_id := COALESCE(NEW.entregue_por, auth.uid());
                ELSE
                    v_user_id := auth.uid();
                END IF;
                v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

                INSERT INTO public.pedido_eventos (
                    pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
                ) VALUES (
                    NEW.id, NULL, 'status_alterado', OLD.status, NEW.status, NULL, v_user_id, v_user_nome, now()
                );
            END IF;
        END IF;

        -- 2) Mudança de Prioridade (CAF-000029 / CAF-000104)
        IF OLD.prioridade IS DISTINCT FROM NEW.prioridade THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'prioridade_alterada',
                CASE WHEN OLD.prioridade = 1 THEN 'prioritário' ELSE 'normal' END,
                CASE WHEN NEW.prioridade = 1 THEN 'prioritário' ELSE 'normal' END,
                NEW.prioridade_motivo,
                v_user_id, v_user_nome, now()
            );
        END IF;

        -- 3) Transferência de Mesa
        IF OLD.mesa_codigo IS DISTINCT FROM NEW.mesa_codigo THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'mesa_transferida', OLD.mesa_codigo, NEW.mesa_codigo, 'Transferência de mesa', v_user_id, v_user_nome, now()
            );
        END IF;

        -- 4) Confirmação de Pagamento
        IF (OLD.status_pagamento IS DISTINCT FROM NEW.status_pagamento AND NEW.status_pagamento = 'pago')
           OR (OLD.forma_pagamento IS DISTINCT FROM NEW.forma_pagamento AND NEW.status_pagamento = 'pago' AND OLD.status_pagamento != 'pago') THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'pagamento', COALESCE(OLD.status_pagamento, 'pendente'), 'pago',
                CONCAT('Forma: ', COALESCE(NEW.forma_pagamento, 'não informada')),
                v_user_id, v_user_nome, now()
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_baixa_estoque_adicional()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estoque_item_id BIGINT;
  v_qtd_pai INT := 1;
  v_ft RECORD;
  v_has_ficha BOOLEAN := false;
  v_custo_adic NUMERIC(10,4);
BEGIN
  SELECT COALESCE(quantidade, 1) INTO v_qtd_pai
  FROM public.pedido_itens
  WHERE id = NEW.pedido_item_id;

  -- 1. Baixar insumos se houver ficha técnica
  FOR v_ft IN
    SELECT estoque_item_id, quantidade
    FROM public.fichas_tecnicas
    WHERE adicional_id = NEW.adicional_id
  LOOP
    v_has_ficha := true;
    INSERT INTO public.estoque_movimentos (
      item_id, tipo, quantidade, pedido_item_id, motivo, criado_por, created_at
    ) VALUES (
      v_ft.estoque_item_id,
      'saida_venda',
      (v_qtd_pai * COALESCE(NEW.quantidade, 1) * v_ft.quantidade),
      NEW.pedido_item_id,
      'Adicional ' || NEW.nome,
      auth.uid(),
      now()
    );
  END LOOP;

  -- 2. Se não houver ficha, verificar estoque_item_id direto
  IF NOT v_has_ficha THEN
    SELECT estoque_item_id INTO v_estoque_item_id
    FROM public.adicionais
    WHERE id = NEW.adicional_id;

    IF v_estoque_item_id IS NOT NULL THEN
      INSERT INTO public.estoque_movimentos (
        item_id, tipo, quantidade, pedido_item_id, motivo, criado_por, created_at
      ) VALUES (
        v_estoque_item_id,
        'saida_venda',
        (v_qtd_pai * COALESCE(NEW.quantidade, 1)),
        NEW.pedido_item_id,
        'Adicional ' || NEW.nome,
        auth.uid(),
        now()
      );
    END IF;
  END IF;

  -- 3. Atualizar custo unitário gravado no adicional do pedido
  v_custo_adic := public.fn_calcular_custo_adicional(NEW.adicional_id);
  IF v_custo_adic > 0 THEN
    UPDATE public.pedido_item_adicionais
    SET custo = v_custo_adic
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_baixa_estoque_meio_a_meio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd_pai INT := 1;
  v_ft RECORD;
  v_has_ficha BOOLEAN := false;
  v_estoque_item_id BIGINT;
  v_nome_produto TEXT;
  v_custo_total_sabores NUMERIC(10,4) := 0;
BEGIN
  -- Busca quantidade do item pai
  SELECT COALESCE(quantidade, 1) INTO v_qtd_pai
  FROM public.pedido_itens
  WHERE id = NEW.pedido_item_id;

  SELECT nome, estoque_item_id INTO v_nome_produto, v_estoque_item_id
  FROM public.produtos
  WHERE id = NEW.produto_id;

  -- 1. Baixa 50% de cada insumo da ficha técnica do sabor
  FOR v_ft IN
    SELECT estoque_item_id, quantidade
    FROM public.fichas_tecnicas
    WHERE produto_id = NEW.produto_id
  LOOP
    v_has_ficha := true;
    INSERT INTO public.estoque_movimentos (
      item_id, tipo, quantidade, pedido_item_id, motivo, criado_por, created_at
    ) VALUES (
      v_ft.estoque_item_id,
      'saida_venda',
      (v_qtd_pai * 0.5 * v_ft.quantidade),
      NEW.pedido_item_id,
      'Meio a Meio (' || NEW.lado || '): ' || COALESCE(v_nome_produto, NEW.nome),
      auth.uid(),
      now()
    );
  END LOOP;

  -- 2. Se sabor não tem ficha mas tem estoque_item_id direto
  IF NOT v_has_ficha AND v_estoque_item_id IS NOT NULL THEN
    INSERT INTO public.estoque_movimentos (
      item_id, tipo, quantidade, pedido_item_id, motivo, criado_por, created_at
    ) VALUES (
      v_estoque_item_id,
      'saida_venda',
      (v_qtd_pai * 0.5),
      NEW.pedido_item_id,
      'Meio a Meio (' || NEW.lado || '): ' || COALESCE(v_nome_produto, NEW.nome),
      auth.uid(),
      now()
    );
  END IF;

  -- 3. Recalcular e atualizar o custo_unitario no item pai (soma de 0.5 * custo de cada sabor)
  SELECT COALESCE(SUM(ROUND(public.fn_calcular_custo_produto(pis.produto_id) * 0.5, 4)), 0)
  INTO v_custo_total_sabores
  FROM public.pedido_item_sabores pis
  WHERE pis.pedido_item_id = NEW.pedido_item_id;

  IF v_custo_total_sabores > 0 THEN
    UPDATE public.pedido_itens
    SET custo_unitario = v_custo_total_sabores
    WHERE id = NEW.pedido_item_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_baixa_estoque_pedido_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estoque_item_id BIGINT;
  v_tipo_montagem TEXT;
  v_ft RECORD;
  v_has_ficha BOOLEAN := false;
BEGIN
  IF NEW.cancelado = true THEN
    RETURN NEW;
  END IF;

  SELECT tipo_montagem, estoque_item_id INTO v_tipo_montagem, v_estoque_item_id
  FROM public.produtos
  WHERE id = NEW.produto_id;

  -- Se for meio a meio, a baixa será feita pela tabela pedido_item_sabores
  IF v_tipo_montagem = 'meio_a_meio' THEN
    RETURN NEW;
  END IF;

  -- 1. Verifica se há ficha técnica para o produto
  FOR v_ft IN
    SELECT estoque_item_id, quantidade
    FROM public.fichas_tecnicas
    WHERE produto_id = NEW.produto_id
  LOOP
    v_has_ficha := true;
    INSERT INTO public.estoque_movimentos (
      item_id, tipo, quantidade, pedido_item_id, motivo, criado_por, created_at
    ) VALUES (
      v_ft.estoque_item_id,
      'saida_venda',
      (NEW.quantidade * v_ft.quantidade),
      NEW.id,
      'Venda ' || NEW.nome_produto || ' (Item #' || NEW.id || ')',
      auth.uid(),
      now()
    );
  END LOOP;

  -- 2. Se não houver ficha, verificar produto de revenda direta
  IF NOT v_has_ficha AND v_estoque_item_id IS NOT NULL THEN
    INSERT INTO public.estoque_movimentos (
      item_id, tipo, quantidade, pedido_item_id, motivo, criado_por, created_at
    ) VALUES (
      v_estoque_item_id,
      'saida_venda',
      NEW.quantidade,
      NEW.id,
      'Venda Revenda ' || NEW.nome_produto || ' (Item #' || NEW.id || ')',
      auth.uid(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_checar_conclusao_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido_id BIGINT;
  v_total_itens INT;
  v_itens_prontos INT;
  v_status_atual TEXT;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF v_pedido_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Obter status atual do pedido com bloqueio FOR UPDATE para garantir concorrência segura
  SELECT status INTO v_status_atual
  FROM public.pedidos
  WHERE id = v_pedido_id
  FOR UPDATE;

  IF NOT FOUND OR v_status_atual = 'cancelado' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Contar itens não cancelados e itens marcados como prontos
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE pronto_em IS NOT NULL)
  INTO v_total_itens, v_itens_prontos
  FROM public.pedido_itens
  WHERE pedido_id = v_pedido_id AND cancelado = false;

  -- Caso 1: Todos os itens ativos estão prontos (e existe ao menos 1 item ativo)
  IF v_total_itens > 0 AND v_itens_prontos = v_total_itens THEN
    IF v_status_atual != 'concluido' AND v_status_atual != 'entregue' THEN
      UPDATE public.pedidos
      SET status = 'concluido',
          concluido_em = COALESCE(concluido_em, now()),
          concluido_por = COALESCE(auth.uid(), concluido_por),
          updated_at = now()
      WHERE id = v_pedido_id;
    END IF;
  -- Caso 2: Nem todos os itens estão prontos
  ELSE
    -- Se estava 'concluido' ou 'entregue', reverter para 'em_preparo'
    IF v_status_atual IN ('concluido', 'entregue') THEN
      UPDATE public.pedidos
      SET status = 'em_preparo',
          concluido_em = NULL,
          concluido_por = NULL,
          updated_at = now()
      WHERE id = v_pedido_id;
    -- Se estava 'pendente' e já há algum item pronto, avançar para 'em_preparo'
    ELSIF v_status_atual = 'pendente' AND v_itens_prontos > 0 THEN
      UPDATE public.pedidos
      SET status = 'em_preparo',
          iniciado_em = COALESCE(iniciado_em, now()),
          updated_at = now()
      WHERE id = v_pedido_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_abater_lotes_peps()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd_a_abater NUMERIC(12,3);
  v_lote RECORD;
  v_delta NUMERIC(12,3);
BEGIN
  -- Aplica-se a saídas de venda, perdas manuais e ajustes negativos
  IF NEW.tipo IN ('saida_venda', 'perda') OR (NEW.tipo = 'ajuste' AND NEW.quantidade < 0) THEN
    -- Se a saída já estiver explicitamente vinculada a um lote específico (ex.: baixa manual de lote),
    -- ela já foi tratada diretamente pela RPC/lógica de lote, evitando duplo abatimento
    IF NEW.lote_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_qtd_a_abater := ABS(NEW.quantidade);

    -- Itera sobre os lotes ativos com saldo restante do item em ordem PEPS:
    -- Validade mais próxima primeiro (NULLS LAST), depois data de criação
    FOR v_lote IN
      SELECT id, quantidade_restante
      FROM public.estoque_lotes
      WHERE item_id = NEW.item_id
        AND quantidade_restante > 0
        AND ativo = true
      ORDER BY data_validade ASC NULLS LAST, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_qtd_a_abater <= 0;

      v_delta := LEAST(v_lote.quantidade_restante, v_qtd_a_abater);

      UPDATE public.estoque_lotes
      SET quantidade_restante = quantidade_restante - v_delta,
          ativo = (quantidade_restante - v_delta > 0),
          updated_at = now()
      WHERE id = v_lote.id;

      v_qtd_a_abater := v_qtd_a_abater - v_delta;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_criar_lote_entrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_novo_lote_id BIGINT;
BEGIN
  -- Apenas para entradas com quantidade positiva
  IF NEW.tipo = 'entrada' AND NEW.quantidade > 0 THEN
    -- Se tiver data de validade OU código de lote informado, cria o registro em estoque_lotes
    IF NEW.validade IS NOT NULL OR NEW.lote_codigo IS NOT NULL THEN
      INSERT INTO public.estoque_lotes (
        item_id,
        lote_codigo,
        data_validade,
        quantidade_inicial,
        quantidade_restante,
        custo_unitario,
        movimento_entrada_id,
        ativo,
        created_at,
        updated_at
      ) VALUES (
        NEW.item_id,
        NEW.lote_codigo,
        NEW.validade,
        NEW.quantidade,
        NEW.quantidade,
        NEW.custo_unitario,
        NEW.id,
        true,
        COALESCE(NEW.created_at, now()),
        now()
      )
      RETURNING id INTO v_novo_lote_id;

      -- Associa o lote gerado ao movimento se ainda não estiver associado
      IF NEW.lote_id IS NULL THEN
        UPDATE public.estoque_movimentos
        SET lote_id = v_novo_lote_id
        WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_recalcular_saldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id BIGINT;
  v_novo_saldo NUMERIC(12,3);
  v_custo_medio_atual NUMERIC(10,4);
  v_saldo_anterior NUMERIC(12,3);
BEGIN
  v_item_id := COALESCE(NEW.item_id, OLD.item_id);

  SELECT quantidade, custo_medio INTO v_saldo_anterior, v_custo_medio_atual
  FROM public.estoque_itens
  WHERE id = v_item_id;

  -- Somar movimentos:
  -- 'entrada' e 'estorno' somam
  -- 'saida_venda' e 'perda' subtraem
  -- 'ajuste' adiciona delta
  SELECT COALESCE(SUM(
    CASE 
      WHEN tipo IN ('entrada', 'estorno') THEN quantidade
      WHEN tipo IN ('saida_venda', 'perda') THEN -quantidade
      WHEN tipo = 'ajuste' THEN quantidade
      ELSE 0
    END
  ), 0)
  INTO v_novo_saldo
  FROM public.estoque_movimentos
  WHERE item_id = v_item_id;

  -- Se for uma nova ENTRADA com custo_unitario informado, recalcular o Custo Médio Ponderado:
  IF TG_OP = 'INSERT' AND NEW.tipo = 'entrada' AND NEW.custo_unitario IS NOT NULL AND NEW.custo_unitario > 0 THEN
    IF v_saldo_anterior IS NOT NULL AND v_saldo_anterior > 0 AND v_custo_medio_atual > 0 THEN
      v_custo_medio_atual := ((v_saldo_anterior * v_custo_medio_atual) + (NEW.quantidade * NEW.custo_unitario)) / (v_saldo_anterior + NEW.quantidade);
    ELSE
      v_custo_medio_atual := NEW.custo_unitario;
    END IF;
  END IF;

  UPDATE public.estoque_itens
  SET quantidade = v_novo_saldo,
      custo_medio = COALESCE(v_custo_medio_atual, custo_medio),
      updated_at = now()
  WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_sincronizar_disponibilidade_produto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Caso 1: Saldo zerou ou ficou negativo
  IF NEW.quantidade <= 0 AND (OLD.quantidade > 0 OR OLD.quantidade IS NULL) THEN
    -- Desativar produtos de revenda vinculados que estavam disponíveis
    UPDATE public.produtos
    SET disponivel = false,
        esgotado_automatico = true,
        updated_at = now()
    WHERE estoque_item_id = NEW.id AND disponivel = true;
  END IF;

  -- Caso 2: Saldo voltou a ficar positivo
  IF NEW.quantidade > 0 AND OLD.quantidade <= 0 THEN
    -- Reativar apenas os produtos que foram esgotados automaticamente pelo estoque
    UPDATE public.produtos
    SET disponivel = true,
        esgotado_automatico = false,
        updated_at = now()
    WHERE estoque_item_id = NEW.id AND esgotado_automatico = true AND disponivel = false;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estorno_estoque_pedido_cancelado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelado' AND (OLD.status != 'cancelado' OR OLD.status IS NULL) THEN
    -- Cancelar todos os itens ativos que ainda não foram cancelados (dispara o trg_estorno_estoque_pedido_item)
    UPDATE public.pedido_itens
    SET cancelado = true,
        motivo_cancelamento = COALESCE(NEW.motivo_cancelamento, 'Pedido cancelado'),
        cancelado_em = COALESCE(cancelado_em, now()),
        cancelado_por = COALESCE(cancelado_por, auth.uid())
    WHERE pedido_id = NEW.id AND cancelado = false;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_estorno_estoque_pedido_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov_rec RECORD;
BEGIN
  -- Quando o item é cancelado
  IF NEW.cancelado = true AND (OLD.cancelado = false OR OLD.cancelado IS NULL) THEN
    FOR v_mov_rec IN
      SELECT item_id, quantidade
      FROM public.estoque_movimentos
      WHERE pedido_item_id = NEW.id AND tipo = 'saida_venda'
    LOOP
      INSERT INTO public.estoque_movimentos (
        item_id, tipo, quantidade, pedido_item_id, motivo, criado_por, created_at
      ) VALUES (
        v_mov_rec.item_id,
        'estorno',
        v_mov_rec.quantidade,
        NEW.id,
        COALESCE(NEW.motivo_cancelamento, 'Item cancelado'),
        auth.uid(),
        now()
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.iniciar_estacao(p_pedido_id bigint, p_estacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role TEXT;
  v_now TIMESTAMPTZ := now();
  v_novo_status TEXT;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('cozinha', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_estacao IS NOT NULL AND p_estacao NOT IN ('bar', 'cozinha') THEN
    RAISE EXCEPTION 'Estação inválida: %', p_estacao;
  END IF;

  -- 1. Marcar iniciado_em nos itens da estação
  UPDATE public.pedido_itens
  SET iniciado_em = COALESCE(iniciado_em, v_now)
  WHERE pedido_id = p_pedido_id
    AND cancelado = false
    AND (p_estacao IS NULL OR estacao = p_estacao);

  -- 2. Atualizar status do pedido se pendente
  UPDATE public.pedidos
  SET status = 'em_preparo',
      iniciado_em = COALESCE(iniciado_em, v_now),
      updated_at = v_now
  WHERE id = p_pedido_id AND status = 'pendente';

  SELECT status INTO v_novo_status FROM public.pedidos WHERE id = p_pedido_id;
  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', v_novo_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_itens_impressos(p_item_ids bigint[])
 RETURNS bigint[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_updated_ids BIGINT[];
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) = 0 THEN
    RETURN ARRAY[]::BIGINT[];
  END IF;

  WITH updated AS (
    UPDATE public.pedido_itens
    SET impresso_em = v_now
    WHERE id = ANY(p_item_ids) AND impresso_em IS NULL
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::BIGINT[]) INTO v_updated_ids FROM updated;

  RETURN v_updated_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_pedido_nao_retirado(p_pedido_id bigint, p_motivo text DEFAULT 'Não retirado pelo cliente no horário agendado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      cancelado_em = now(),
      updated_at = now()
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
$function$;

CREATE OR REPLACE FUNCTION public.obter_consumo_estoque_30d()
 RETURNS TABLE(item_id bigint, total_saidas_30d numeric, consumo_medio_diario numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    em.item_id,
    COALESCE(SUM(em.quantidade), 0) AS total_saidas_30d,
    ROUND(COALESCE(SUM(em.quantidade), 0) / 30.0, 3) AS consumo_medio_diario
  FROM public.estoque_movimentos em
  WHERE em.tipo IN ('saida_venda', 'perda')
    AND em.created_at >= (now() - INTERVAL '30 days')
  GROUP BY em.item_id;
$function$;

CREATE OR REPLACE FUNCTION public.processar_webhook_pix(p_txid text, p_psp_transacao_id text DEFAULT NULL::text, p_valor_pago numeric DEFAULT NULL::numeric, p_taxa_psp numeric DEFAULT NULL::numeric, p_provedor text DEFAULT 'mercadopago'::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_txid TEXT := UPPER(TRIM(COALESCE(p_txid, '')));
  v_psp_id TEXT := NULLIF(TRIM(COALESCE(p_psp_transacao_id, '')), '');
  v_cobranca RECORD;
  v_existing_tx RECORD;
  v_taxa_pct NUMERIC(5,2) := 0;
  v_taxa_fixa NUMERIC(10,2) := 0;
  v_taxa_valor NUMERIC(10,2) := 0;
  v_valor_liquido NUMERIC(10,2) := 0;
  v_pago_em TIMESTAMPTZ := now();
  v_fechamento_res JSONB := NULL;
  v_fechamento_id UUID := NULL;
  v_pagamentos_fech JSONB := NULL;
  v_qtd_pedidos_abertos INT := 0;
  v_valor_pago_num NUMERIC(10,2);
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.get_user_role() NOT IN ('admin', 'barista')
     AND NOT public.tem_permissao('pdv.vender') THEN
    RAISE EXCEPTION 'Acesso negado ao processamento de webhook Pix.';
  END IF;

  -- Idempotência pelo psp_transacao_id se já tiver quitado alguma cobrança (CA04)
  IF v_psp_id IS NOT NULL THEN
    SELECT id, pedido_id, fechamento_id, status, txid
    INTO v_existing_tx
    FROM public.pix_cobrancas
    WHERE psp_transacao_id = v_psp_id
      AND status = 'pago'
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'sucesso', true,
        'idempotente', true,
        'status', 'pago',
        'cobranca_id', v_existing_tx.id,
        'pedido_id', v_existing_tx.pedido_id,
        'fechamento_id', v_existing_tx.fechamento_id,
        'txid', v_existing_tx.txid
      );
    END IF;
  END IF;

  SELECT * INTO v_cobranca
  FROM public.pix_cobrancas
  WHERE txid = v_txid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'status', 'nao_encontrada',
      'motivo', 'COBRANCA_NAO_ENCONTRADA',
      'txid', v_txid
    );
  END IF;

  -- Idempotência pela própria cobrança já paga (CA04)
  IF v_cobranca.status = 'pago' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'idempotente', true,
      'status', 'pago',
      'cobranca_id', v_cobranca.id,
      'pedido_id', v_cobranca.pedido_id,
      'fechamento_id', v_cobranca.fechamento_id,
      'txid', v_cobranca.txid
    );
  END IF;

  v_valor_pago_num := ROUND(COALESCE(p_valor_pago, 0), 2);

  -- Cobrança expirada ou cancelada não pode quitar o pedido (CA09 / RF07)
  IF v_cobranca.status IN ('expirada', 'cancelada') OR v_cobranca.expira_em <= now() THEN
    UPDATE public.pix_cobrancas
    SET status = 'divergente',
        valor_pago = v_valor_pago_num,
        psp_transacao_id = COALESCE(NULLIF(v_psp_id, ''), psp_transacao_id),
        motivo_conferencia = 'Pagamento recebido após expiração ou substituição da cobrança.',
        webhook_payload = COALESCE(p_payload, '{}'::jsonb),
        updated_at = now()
    WHERE id = v_cobranca.id;

    RETURN jsonb_build_object(
      'sucesso', false,
      'status', 'divergente',
      'motivo', 'COBRANCA_EXPIRADA',
      'cobranca_id', v_cobranca.id,
      'pedido_id', v_cobranca.pedido_id
    );
  END IF;

  -- Divergência de valor não quita o pedido e marca para conferência no Admin (CA05 / RF07)
  IF ABS(v_valor_pago_num - v_cobranca.valor) > 0.009 THEN
    UPDATE public.pix_cobrancas
    SET status = 'divergente',
        valor_pago = v_valor_pago_num,
        psp_transacao_id = COALESCE(NULLIF(v_psp_id, ''), psp_transacao_id),
        motivo_conferencia = format('Valor pago (R$ %s) diverge do cobrado (R$ %s).', v_valor_pago_num, v_cobranca.valor),
        webhook_payload = COALESCE(p_payload, '{}'::jsonb),
        updated_at = now()
    WHERE id = v_cobranca.id;

    RETURN jsonb_build_object(
      'sucesso', false,
      'status', 'divergente',
      'motivo', 'VALOR_DIVERGENTE',
      'cobranca_id', v_cobranca.id,
      'pedido_id', v_cobranca.pedido_id,
      'valor_esperado', v_cobranca.valor,
      'valor_pago', v_valor_pago_num
    );
  END IF;

  -- Calcula taxa PSP real ou herda taxa configurada em formas_pagamento_taxas (CA10)
  IF p_taxa_psp IS NOT NULL AND p_taxa_psp >= 0 THEN
    v_taxa_valor := LEAST(v_valor_pago_num, ROUND(p_taxa_psp, 2));
    IF v_valor_pago_num > 0 THEN
      v_taxa_pct := ROUND((v_taxa_valor / v_valor_pago_num) * 100.0, 2);
    END IF;
    v_taxa_fixa := 0;
  ELSE
    SELECT COALESCE(taxa_percentual, 0), COALESCE(taxa_fixa, 0)
    INTO v_taxa_pct, v_taxa_fixa
    FROM public.formas_pagamento_taxas
    WHERE forma = 'pix';

    v_taxa_valor := LEAST(v_valor_pago_num, ROUND((v_valor_pago_num * (COALESCE(v_taxa_pct, 0) / 100.0)) + COALESCE(v_taxa_fixa, 0), 2));
  END IF;

  v_valor_liquido := GREATEST(0, ROUND(v_valor_pago_num - v_taxa_valor, 2));

  UPDATE public.pix_cobrancas
  SET status = 'pago',
      valor_pago = v_valor_pago_num,
      taxa_psp_percentual = COALESCE(v_taxa_pct, 0),
      taxa_psp_fixa = COALESCE(v_taxa_fixa, 0),
      taxa_psp_valor = v_taxa_valor,
      valor_liquido = v_valor_liquido,
      psp_transacao_id = COALESCE(NULLIF(v_psp_id, ''), psp_transacao_id),
      provedor = COALESCE(NULLIF(LOWER(TRIM(p_provedor)), ''), provedor),
      pago_em = v_pago_em,
      webhook_payload = COALESCE(p_payload, '{}'::jsonb),
      updated_at = now()
  WHERE id = v_cobranca.id;

  -- Caso 1: Pedido direto (Totem / Online / QR Cliente)
  IF v_cobranca.pedido_id IS NOT NULL THEN
    UPDATE public.pedidos
    SET status = CASE
          WHEN status IN ('aguardando_pagamento', 'aguardando_aprovacao') THEN 'pendente'
          ELSE status
        END,
        status_pagamento = 'pago',
        forma_pagamento = 'pix',
        pago_em = COALESCE(pago_em, v_pago_em),
        taxa_pagamento_percentual = COALESCE(v_taxa_pct, 0),
        taxa_pagamento_fixa = COALESCE(v_taxa_fixa, 0),
        taxa_pagamento_valor = v_taxa_valor,
        valor_liquido = v_valor_liquido,
        updated_at = now()
    WHERE id = v_cobranca.pedido_id
      AND status <> 'cancelado';
  END IF;

  -- Caso 2: Fechamento de conta de mesa no PDV (CA08)
  IF v_cobranca.canal = 'pdv'
     AND v_cobranca.mesa_codigo IS NOT NULL
     AND COALESCE((v_cobranca.fechamento_payload->>'auto_fechar')::boolean, true) THEN
    SELECT COUNT(*)::int INTO v_qtd_pedidos_abertos
    FROM public.pedidos
    WHERE mesa_codigo = v_cobranca.mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento <> 'pago');

    IF v_qtd_pedidos_abertos > 0 THEN
      IF jsonb_typeof(v_cobranca.fechamento_payload->'pagamentos') = 'array'
         AND jsonb_array_length(v_cobranca.fechamento_payload->'pagamentos') > 0 THEN
        v_pagamentos_fech := v_cobranca.fechamento_payload->'pagamentos';
      ELSE
        v_pagamentos_fech := jsonb_build_array(
          jsonb_build_object('forma', 'pix', 'valor', v_cobranca.valor)
        );
      END IF;

      v_fechamento_res := public.fechar_conta_mesa(
        p_mesa_codigo := v_cobranca.mesa_codigo,
        p_pagamentos := v_pagamentos_fech,
        p_taxa_servico := COALESCE((v_cobranca.fechamento_payload->>'taxa_servico')::numeric, 0),
        p_desconto_manual := COALESCE((v_cobranca.fechamento_payload->>'desconto_manual')::numeric, 0),
        p_desconto_motivo := NULLIF(v_cobranca.fechamento_payload->>'desconto_motivo', ''),
        p_idempotency_key := COALESCE(NULLIF(v_cobranca.fechamento_payload->>'idempotency_key', ''), 'PIX-' || v_cobranca.txid),
        p_cupom_codigo := NULLIF(v_cobranca.fechamento_payload->>'cupom_codigo', ''),
        p_campanha_id := NULLIF(v_cobranca.fechamento_payload->>'campanha_id', '')::bigint
      );

      v_fechamento_id := NULLIF(v_fechamento_res->>'fechamento_id', '')::uuid;

      IF v_fechamento_id IS NOT NULL THEN
        IF v_taxa_valor > 0 THEN
          UPDATE public.fechamento_pagamentos
          SET taxa_percentual = COALESCE(v_taxa_pct, 0),
              taxa_fixa = COALESCE(v_taxa_fixa, 0),
              taxa_valor = v_taxa_valor,
              valor_liquido = GREATEST(0, ROUND(valor - v_taxa_valor, 2))
          WHERE fechamento_id = v_fechamento_id
            AND forma = 'pix';
        END IF;

        UPDATE public.pix_cobrancas
        SET fechamento_id = v_fechamento_id,
            updated_at = now()
        WHERE id = v_cobranca.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'idempotente', false,
    'status', 'pago',
    'cobranca_id', v_cobranca.id,
    'pedido_id', v_cobranca.pedido_id,
    'fechamento_id', v_fechamento_id,
    'txid', v_cobranca.txid,
    'valor', v_valor_pago_num,
    'taxa_psp', v_taxa_valor,
    'valor_liquido', v_valor_liquido
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.receber_pedido_totem(p_pedido_id bigint, p_forma_pagamento text DEFAULT 'pix'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      updated_at = now()
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
$function$;

CREATE OR REPLACE FUNCTION public.recusar_pedido_cliente(p_pedido_id bigint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      cancelado_em = now(),
      updated_at = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object('sucesso', true, 'pedido_id', p_pedido_id, 'status', 'cancelado');
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_emissao_nfce(p_fechamento_id uuid, p_consumidor_cpf_cnpj text DEFAULT NULL::text, p_consumidor_nome text DEFAULT NULL::text, p_itens jsonb DEFAULT '[]'::jsonb, p_formas_pagamento jsonb DEFAULT '[]'::jsonb, p_chave_acesso text DEFAULT NULL::text, p_numero bigint DEFAULT NULL::bigint, p_serie integer DEFAULT 1, p_status text DEFAULT 'autorizada'::text, p_protocolo text DEFAULT NULL::text, p_motivo_status text DEFAULT NULL::text, p_qr_code_url text DEFAULT NULL::text, p_danfe_url text DEFAULT NULL::text, p_xml_url text DEFAULT NULL::text, p_ambiente text DEFAULT 'homologacao'::text, p_provedor text DEFAULT 'sandbox'::text, p_payload_envio jsonb DEFAULT NULL::jsonb, p_resposta_provedor jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nota_existente RECORD;
  v_fechamento RECORD;
  v_proximo_numero BIGINT;
  v_serie INT := COALESCE(p_serie, 1);
  v_chave TEXT := p_chave_acesso;
  v_protocolo TEXT := p_protocolo;
  v_nova_nota RECORD;
  v_valor_total NUMERIC(10,2) := 0;
  v_valor_produtos NUMERIC(10,2) := 0;
  v_valor_desconto NUMERIC(10,2) := 0;
  v_cpf_cnpj_limpo TEXT := NULLIF(regexp_replace(COALESCE(p_consumidor_cpf_cnpj, ''), '[^0-9]', '', 'g'), '');
BEGIN
  -- 1. Idempotência (CA04): se já existir nota autorizada para este fechamento, retorna a nota existente
  SELECT * INTO v_nota_existente
  FROM public.notas_fiscais
  WHERE fechamento_id = p_fechamento_id
    AND status = 'autorizada'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_emitida', true,
      'nota', row_to_json(v_nota_existente)
    );
  END IF;

  -- 2. Carrega fechamento para dados complementares
  SELECT * INTO v_fechamento
  FROM public.fechamentos
  WHERE id = p_fechamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento % inexistente.', p_fechamento_id;
  END IF;

  -- 3. Define número e série sequencial
  IF p_numero IS NOT NULL THEN
    v_proximo_numero := p_numero;
  ELSE
    SELECT COALESCE((valor::text)::BIGINT, 1)
    INTO v_proximo_numero
    FROM public.configuracoes_sistema
    WHERE chave = 'nfce_proximo_numero';

    IF v_proximo_numero IS NULL THEN
      v_proximo_numero := 1;
    END IF;

    -- Atualiza próximo número no banco
    UPDATE public.configuracoes_sistema
    SET valor = to_jsonb(v_proximo_numero + 1),
        updated_at = now()
    WHERE chave = 'nfce_proximo_numero';
  END IF;

  -- 4. Chave de acesso de 44 dígitos
  IF v_chave IS NULL OR LENGTH(v_chave) != 44 THEN
    v_chave := public.fn_gerar_chave_acesso_nfce(
      p_uf := '43',
      p_cnpj := '00000000000191',
      p_serie := v_serie,
      p_numero := v_proximo_numero,
      p_tipo_emissao := CASE WHEN p_status = 'contingencia' THEN 9 ELSE 1 END
    );
  END IF;

  -- Protocolo padrão de homologação caso não fornecido
  IF v_protocolo IS NULL AND p_status = 'autorizada' THEN
    v_protocolo := '143' || to_char(timezone('America/Sao_Paulo', now()), 'YY') || LPAD(v_proximo_numero::text, 10, '0');
  END IF;

  -- 5. Totais
  v_valor_total := COALESCE(v_fechamento.total_conta, 0);
  v_valor_desconto := COALESCE(v_fechamento.desconto_manual, 0);
  v_valor_produtos := v_valor_total + v_valor_desconto;

  -- 6. Insere registro em public.notas_fiscais
  INSERT INTO public.notas_fiscais (
    fechamento_id,
    mesa_codigo,
    numero,
    serie,
    chave_acesso,
    protocolo,
    status,
    motivo_status,
    consumidor_cpf_cnpj,
    consumidor_nome,
    valor_produtos,
    valor_desconto,
    valor_total,
    formas_pagamento,
    itens,
    qr_code_url,
    danfe_url,
    xml_url,
    ambiente,
    provedor,
    payload_envio,
    resposta_provedor
  ) VALUES (
    p_fechamento_id,
    v_fechamento.mesa_codigo,
    v_proximo_numero,
    v_serie,
    v_chave,
    v_protocolo,
    p_status,
    p_motivo_status,
    v_cpf_cnpj_limpo,
    p_consumidor_nome,
    v_valor_produtos,
    v_valor_desconto,
    v_valor_total,
    COALESCE(p_formas_pagamento, '[]'::jsonb),
    COALESCE(p_itens, '[]'::jsonb),
    COALESCE(p_qr_code_url, 'https://dfe-portal.svrs.rs.gov.br/nfce/qrCode?p=' || v_chave || '|2|1|1|' || MD5(v_chave)),
    p_danfe_url,
    p_xml_url,
    COALESCE(p_ambiente, 'homologacao'),
    COALESCE(p_provedor, 'sandbox'),
    p_payload_envio,
    p_resposta_provedor
  ) RETURNING * INTO v_nova_nota;

  RETURN jsonb_build_object(
    'sucesso', true,
    'ja_emitida', false,
    'nota', row_to_json(v_nova_nota)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_evento_cardapio(p_canal text, p_tipo_evento text, p_produto_id text DEFAULT NULL::text, p_data date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje DATE;
BEGIN
  -- 1. Whitelist de canais permitidos
  IF p_canal NOT IN ('mesa', 'retirada', 'totem', 'vitrine', 'geral', 'online', 'cardapio_digital', 'web') THEN
    RAISE EXCEPTION 'Canal de analytics inválido: %', p_canal;
  END IF;

  -- 2. Whitelist de tipos de eventos
  IF p_tipo_evento NOT IN ('sessao_cardapio', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'filter_cat', 'search', 'view_cardapio', 'checkout_start', 'view_categoria', 'click_produto', 'adicionar_carrinho', 'remover_carrinho') THEN
    RAISE EXCEPTION 'Tipo de evento de analytics inválido: %', p_tipo_evento;
  END IF;

  -- 3. Validar se produto existe (se informado)
  IF p_produto_id IS NOT NULL AND TRIM(p_produto_id) <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = p_produto_id) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', p_produto_id;
    END IF;
  ELSE
    p_produto_id := NULL;
  END IF;

  -- 4. Força sempre a data corrente de São Paulo no servidor (ignora p_data adulterado do cliente)
  v_hoje := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.cardapio_eventos_diarios (data, canal, tipo_evento, produto_id, total_eventos, updated_at)
  VALUES (v_hoje, p_canal, p_tipo_evento, p_produto_id, 1, now())
  ON CONFLICT (data, canal, tipo_evento, produto_id)
  DO UPDATE SET
    total_eventos = public.cardapio_eventos_diarios.total_eventos + 1,
    updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolver_cobranca_pix_conferencia(p_cobranca_id uuid, p_acao text DEFAULT 'cancelar'::text, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acao TEXT := LOWER(TRIM(COALESCE(p_acao, 'cancelar')));
  v_cobranca RECORD;
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.get_user_role() NOT IN ('admin', 'barista')
     AND NOT public.tem_permissao('admin.financeiro') THEN
    RAISE EXCEPTION 'Acesso negado para resolver divergência Pix.';
  END IF;

  SELECT * INTO v_cobranca
  FROM public.pix_cobrancas
  WHERE id = p_cobranca_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança Pix não encontrada.';
  END IF;

  IF v_acao = 'aprovar' THEN
    UPDATE public.pix_cobrancas
    SET status = 'pago',
        pago_em = COALESCE(pago_em, now()),
        motivo_conferencia = COALESCE(NULLIF(TRIM(p_observacao), ''), COALESCE(motivo_conferencia, '') || ' [Aprovado manualmente]'),
        updated_at = now()
    WHERE id = p_cobranca_id;

    IF v_cobranca.pedido_id IS NOT NULL THEN
      UPDATE public.pedidos
      SET status = CASE WHEN status IN ('aguardando_pagamento', 'aguardando_aprovacao') THEN 'pendente' ELSE status END,
          status_pagamento = 'pago',
          forma_pagamento = 'pix',
          pago_em = COALESCE(pago_em, now()),
          updated_at = now()
      WHERE id = v_cobranca.pedido_id AND status <> 'cancelado';
    END IF;
  ELSE
    UPDATE public.pix_cobrancas
    SET status = 'cancelada',
        motivo_conferencia = COALESCE(NULLIF(TRIM(p_observacao), ''), COALESCE(motivo_conferencia, '') || ' [Resolvido/Cancelado]'),
        updated_at = now()
    WHERE id = p_cobranca_id;
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'cobranca_id', p_cobranca_id, 'acao', v_acao);
END;
$function$;

-- 3. Relatório somente leitura de registros afetados por fuso histórico (RF08, CA09)
CREATE OR REPLACE FUNCTION public.fn_relatorio_deslocamento_fuso()
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
  RETURN QUERY
  SELECT 'estoque_lotes'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.estoque_lotes
  WHERE created_at < now();

  RETURN QUERY
  SELECT 'estoque_movimentos'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.estoque_movimentos
  WHERE created_at < now();

  RETURN QUERY
  SELECT 'autorizacoes_pin_log'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.autorizacoes_pin_log
  WHERE created_at < now();

  RETURN QUERY
  SELECT 'campanha_usos'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.campanha_usos
  WHERE created_at < now();

  RETURN QUERY
  SELECT 'pix_cobrancas'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.pix_cobrancas
  WHERE created_at < now();

  RETURN QUERY
  SELECT 'notas_fiscais'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.notas_fiscais
  WHERE created_at < now();

  RETURN QUERY
  SELECT 'pedidos'::text, 'created_at'::text, COUNT(*)::bigint
  FROM public.pedidos
  WHERE created_at < '2026-10-21 00:00:00Z';
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_relatorio_deslocamento_fuso() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_relatorio_deslocamento_fuso() FROM PUBLIC, anon;
