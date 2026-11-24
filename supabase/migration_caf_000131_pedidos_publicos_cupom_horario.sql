-- ==============================================================================
-- CAF-000131: Pedidos públicos: cupom aplicado no servidor, horário de funcionamento e proteção contra abuso
-- ==============================================================================

-- 1. Alterar public.campanhas adicionando colunas de vigência e limites de uso (RF03)
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS valido_de TIMESTAMPTZ;
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS valido_ate TIMESTAMPTZ;
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS max_usos INTEGER;
ALTER TABLE public.campanhas ADD COLUMN IF NOT EXISTS max_usos_por_cliente INTEGER;

-- 2. Alterar public.campanha_usos adicionando cliente_id (RF03)
ALTER TABLE public.campanha_usos ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campanha_usos_cliente ON public.campanha_usos(campanha_id, cliente_id);

-- 3. Atualizar public.loja_esta_aberta para ler estritamente de public.business_hours (RF04)
DROP FUNCTION IF EXISTS public.loja_esta_aberta();
DROP FUNCTION IF EXISTS public.loja_esta_aberta(timestamptz);

CREATE OR REPLACE FUNCTION public.loja_esta_aberta(p_quando timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bh public.business_hours%ROWTYPE;
  v_dow INT;
  v_hora_sp TIME;
  v_abertura TIME;
  v_fechamento TIME;
BEGIN
  -- Lê estritamente da tabela business_hours (fonte única da verdade)
  SELECT * INTO v_bh
  FROM public.business_hours
  ORDER BY id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Extrai dia da semana e hora no fuso horário de São Paulo (-03:00)
  -- 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado
  v_dow := EXTRACT(DOW FROM (p_quando AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_hora_sp := (p_quando AT TIME ZONE 'America/Sao_Paulo')::time;

  IF v_dow IN (1, 2, 3, 4) THEN
    -- Segunda a Quinta
    v_abertura := NULLIF(TRIM(v_bh.seg_qui_abre), '')::time;
    v_fechamento := NULLIF(TRIM(v_bh.seg_qui_fecha), '')::time;
  ELSIF v_dow = 5 THEN
    -- Sexta-feira
    v_abertura := NULLIF(TRIM(v_bh.sex_abre), '')::time;
    v_fechamento := NULLIF(TRIM(v_bh.sex_fecha), '')::time;
  ELSIF v_dow IN (6, 0) THEN
    -- Sábado ou Domingo: respeita a flag sab_dom_ativo
    IF NOT COALESCE(v_bh.sab_dom_ativo, false) THEN
      RETURN false;
    END IF;
    v_abertura := NULLIF(TRIM(v_bh.sab_dom_abre), '')::time;
    v_fechamento := NULLIF(TRIM(v_bh.sab_dom_fecha), '')::time;
  ELSE
    RETURN false;
  END IF;

  IF v_abertura IS NULL OR v_fechamento IS NULL THEN
    RETURN false;
  END IF;

  RETURN (v_hora_sp >= v_abertura AND v_hora_sp <= v_fechamento);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.loja_esta_aberta(timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.loja_esta_aberta(timestamptz) TO authenticated;

-- 4. Atualizar public.validar_cupom com vigência e limites de uso (RF03)
DROP FUNCTION IF EXISTS public.validar_cupom(text, numeric);
DROP FUNCTION IF EXISTS public.validar_cupom(text, numeric, uuid);

CREATE OR REPLACE FUNCTION public.validar_cupom(
  p_cupom_codigo text,
  p_subtotal numeric DEFAULT 0,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campanha RECORD;
  v_cupom_limpo TEXT;
  v_desconto_calc NUMERIC(10,2) := 0;
  v_total_usos INT := 0;
  v_usos_cliente INT := 0;
BEGIN
  v_cupom_limpo := UPPER(TRIM(COALESCE(p_cupom_codigo, '')));
  
  IF v_cupom_limpo = '' THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Código de cupom não informado.');
  END IF;

  SELECT id, nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa,
         valido_de, valido_ate, max_usos, max_usos_por_cliente
  INTO v_campanha
  FROM public.campanhas
  WHERE UPPER(TRIM(cupom_codigo)) = v_cupom_limpo
  ORDER BY id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Cupom inválido ou não encontrado.');
  END IF;

  IF NOT COALESCE(v_campanha.ativa, true) THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Este cupom não está mais ativo.');
  END IF;

  -- Validação de período de vigência
  IF v_campanha.valido_de IS NOT NULL AND now() < v_campanha.valido_de THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Este cupom ainda não está válido.');
  END IF;

  IF v_campanha.valido_ate IS NOT NULL AND now() > v_campanha.valido_ate THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Este cupom está expirado.');
  END IF;

  -- Validação de limite máximo de usos da campanha
  IF v_campanha.max_usos IS NOT NULL AND v_campanha.max_usos > 0 THEN
    SELECT COUNT(*)::int INTO v_total_usos
    FROM public.campanha_usos
    WHERE campanha_id = v_campanha.id;

    IF v_total_usos >= v_campanha.max_usos THEN
      RETURN jsonb_build_object('valido', false, 'mensagem', 'Limite máximo de usos deste cupom foi atingido.');
    END IF;
  END IF;

  -- Validação de limite de usos por cliente
  IF v_campanha.max_usos_por_cliente IS NOT NULL AND v_campanha.max_usos_por_cliente > 0 AND p_cliente_id IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_usos_cliente
    FROM public.campanha_usos
    WHERE campanha_id = v_campanha.id AND cliente_id = p_cliente_id;

    IF v_usos_cliente >= v_campanha.max_usos_por_cliente THEN
      RETURN jsonb_build_object('valido', false, 'mensagem', 'Limite de usos por cliente para este cupom foi atingido.');
    END IF;
  END IF;

  -- Validação de valor mínimo de pedido
  IF p_subtotal < COALESCE(v_campanha.valor_minimo_pedido, 0) THEN
    RETURN jsonb_build_object(
      'valido', false,
      'mensagem', format('Pedido mínimo de R$ %s para este cupom (subtotal atual: R$ %s).',
        to_char(v_campanha.valor_minimo_pedido, 'FM999G990D00'),
        to_char(p_subtotal, 'FM999G990D00')
      )
    );
  END IF;

  -- Cálculo do desconto no servidor
  IF LOWER(COALESCE(v_campanha.tipo_desconto, 'percentual')) IN ('percentual', 'percent', '%', 'porcentagem') THEN
    v_desconto_calc := ROUND((p_subtotal * COALESCE(v_campanha.valor_desconto, 0)) / 100.0, 2);
  ELSE
    v_desconto_calc := ROUND(COALESCE(v_campanha.valor_desconto, 0), 2);
  END IF;

  IF v_desconto_calc > p_subtotal THEN
    v_desconto_calc := p_subtotal;
  END IF;

  RETURN jsonb_build_object(
    'valido', true,
    'mensagem', 'Cupom aplicado com sucesso!',
    'campanha_id', v_campanha.id,
    'campanha_nome', v_campanha.nome,
    'cupom_codigo', v_campanha.cupom_codigo,
    'tipo_desconto', v_campanha.tipo_desconto,
    'valor_desconto', v_campanha.valor_desconto,
    'desconto_calculado', v_desconto_calc
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validar_cupom(text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_cupom(text, numeric, uuid) TO anon, authenticated;

-- 5. Atualizar public.registrar_uso_cupom
CREATE OR REPLACE FUNCTION public.registrar_uso_cupom(p_campanha_id bigint, p_pedido_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido RECORD;
BEGIN
  IF auth.role() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Não autorizado para registrar uso de cupom.';
  END IF;

  IF p_campanha_id IS NULL THEN
    RAISE EXCEPTION 'Campanha ID é obrigatório para registrar uso de cupom.';
  END IF;

  IF p_pedido_id IS NULL THEN
    RAISE EXCEPTION 'Pedido ID é obrigatório para registrar uso de cupom.';
  END IF;

  SELECT id, status, total, campanha_id, cliente_id INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado.', p_pedido_id;
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é permitido registrar uso de cupom para pedido cancelado.';
  END IF;

  INSERT INTO public.campanha_usos (campanha_id, pedido_id, cliente_id, valor_receita, created_at)
  VALUES (p_campanha_id, p_pedido_id, v_pedido.cliente_id, COALESCE(v_pedido.total, 0), now())
  ON CONFLICT (pedido_id) DO NOTHING;

  UPDATE public.campanhas
  SET
    usos_registrados = (SELECT COUNT(*) FROM public.campanha_usos WHERE campanha_id = p_campanha_id),
    receita_atribuida = (SELECT COALESCE(SUM(valor_receita), 0) FROM public.campanha_usos WHERE campanha_id = p_campanha_id)
  WHERE id = p_campanha_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.registrar_uso_cupom(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_uso_cupom(bigint, bigint) TO authenticated;

-- 6. Atualizar public.criar_pedido_cliente (RF01, RF05, RF08, RF10)
CREATE OR REPLACE FUNCTION public.criar_pedido_cliente(
  p_qr_token text,
  p_payload jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
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
  v_subtotal NUMERIC(10,2) := 0;
  v_desconto_cupom NUMERIC(10,2) := 0;
  v_campanha_id BIGINT;
  v_cupom_codigo TEXT;
  v_cupom_res JSONB;
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
  v_exigir_horario BOOLEAN;
  v_client_id UUID;
  v_status_retorno TEXT;
  v_pedidos_pendentes_mesa INT := 0;
BEGIN
  -- 1. Verifica se autoatendimento está ativo
  SELECT COALESCE((valor->>'ativo')::boolean, (valor)::boolean, true)
  INTO v_config_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_cliente_ativo';

  IF v_config_ativo IS FALSE THEN
    RAISE EXCEPTION 'O autoatendimento por QR Code está temporariamente desativado.';
  END IF;

  -- 2. Verifica horário de funcionamento se configurado (RF05)
  SELECT COALESCE((valor->>'ativo')::boolean, (valor)::boolean, false)
  INTO v_exigir_horario
  FROM public.configuracoes_sistema
  WHERE chave IN ('pedido_cliente_exigir_horario', 'loja_exigir_horario_qr')
  LIMIT 1;

  IF v_exigir_horario IS TRUE THEN
    IF NOT public.loja_esta_aberta(now()) THEN
      RAISE EXCEPTION 'A cafeteria está fechada no momento para autoatendimento.';
    END IF;
  END IF;

  -- 3. Valida o QR token da mesa
  IF p_qr_token IS NULL OR TRIM(p_qr_token) = '' THEN
    RAISE EXCEPTION 'QR Code inválido ou não informado.';
  END IF;

  SELECT * INTO v_mesa
  FROM public.mesas
  WHERE qr_token = p_qr_token AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada, QR Code expirado ou mesa inativa.';
  END IF;

  -- 4. Idempotência
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

  -- 5. Limite de pedidos pendentes para a mesma mesa (RF08 / CA11: máx 3)
  SELECT COUNT(*)::int INTO v_pedidos_pendentes_mesa
  FROM public.pedidos
  WHERE mesa_codigo = v_mesa.codigo
    AND status IN ('aguardando_aprovacao', 'pendente');

  IF v_pedidos_pendentes_mesa >= 3 THEN
    RAISE EXCEPTION 'Esta mesa já possui 3 pedidos aguardando aprovação. Aguarde a confirmação pela equipe antes de enviar novos itens.';
  END IF;

  -- 6. Rate limiting: máx 1 pedido a cada 30 segundos para a mesma mesa
  SELECT MAX(created_at) INTO v_ultimo_pedido_em
  FROM public.pedidos
  WHERE mesa_codigo = v_mesa.codigo AND origem = 'cliente_qr';

  IF v_ultimo_pedido_em IS NOT NULL AND (now() - v_ultimo_pedido_em) < INTERVAL '30 seconds' THEN
    RAISE EXCEPTION 'Por favor, aguarde alguns instantes antes de enviar outro pedido para esta mesa.';
  END IF;

  -- 7. Validação de quantidade de itens
  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'O pedido não contém nenhum item.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 15 THEN
    RAISE EXCEPTION 'Máximo de 15 itens por pedido no autoatendimento.';
  END IF;

  v_cliente_nome := TRIM(COALESCE(p_payload->>'cliente_nome', 'Cliente'));
  IF v_cliente_nome = '' THEN v_cliente_nome := 'Cliente'; END IF;

  -- Truncamento de observações em 500 caracteres (RF10 / CA13)
  v_observacoes := LEFT(TRIM(COALESCE(p_payload->>'observacoes', '')), 500);
  v_pedido_token := gen_random_uuid();

  -- 8. Cria o pedido com status 'aguardando_aprovacao' e origem 'cliente_qr'
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

  -- 9. Insere itens recalculando preços a partir do banco de dados
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

  -- 10. Aplica promoções ativas do dia se houver
  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  -- 11. Calcula subtotal e processa cupom de desconto no servidor (RF01 / CA01, CA02)
  SELECT COALESCE(SUM(quantidade * preco_unitario - COALESCE(desconto, 0)), 0)
  INTO v_subtotal
  FROM public.pedido_itens
  WHERE pedido_id = v_pedido_id;

  v_total := v_subtotal;
  v_cupom_codigo := UPPER(TRIM(COALESCE(p_payload->>'cupom_codigo', '')));

  IF v_cupom_codigo <> '' THEN
    v_cupom_res := public.validar_cupom(v_cupom_codigo, v_subtotal, NULL);
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

    -- Registra uso atomicamente na transação
    INSERT INTO public.campanha_usos (campanha_id, pedido_id, cliente_id, valor_receita, created_at)
    VALUES (v_campanha_id, v_pedido_id, NULL, v_total, now());

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
    'pedido_token', v_pedido_token,
    'mesa_codigo', v_mesa.codigo,
    'status', 'aguardando_aprovacao',
    'total', v_total
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.criar_pedido_cliente(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido_cliente(text, jsonb, text) TO anon, authenticated;

-- 7. Atualizar public.criar_pedido_online (RF01, RF04, RF07, RF08, RF09, RF10)
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
  v_aceita_lgpd BOOLEAN;
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

  v_aceita_lgpd := COALESCE((p_payload->>'aceita_lgpd')::boolean, true);

  -- 5. Rate limiting por telefone
  SELECT MAX(created_at) INTO v_ultimo_pedido_em
  FROM public.pedidos
  WHERE cliente_telefone = v_cliente_telefone_digits AND origem IN ('online', 'online_retirada');

  IF v_ultimo_pedido_em IS NOT NULL AND (v_agora - v_ultimo_pedido_em) < INTERVAL '30 seconds' THEN
    RAISE EXCEPTION 'Aguarde alguns segundos antes de enviar outro pedido.';
  END IF;

  -- 6. Vinculação de cliente sem sobrescrever cadastro existente (RF07 / CA10)
  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE telefone = v_cliente_telefone_digits
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (nome, telefone, aceita_contato, ativo)
    VALUES (v_cliente_nome, v_cliente_telefone_digits, v_aceita_lgpd, true)
    ON CONFLICT (telefone) DO NOTHING
    RETURNING id INTO v_cliente_id;

    IF v_cliente_id IS NULL THEN
      SELECT id INTO v_cliente_id FROM public.clientes WHERE telefone = v_cliente_telefone_digits;
    END IF;
  ELSE
    -- Cliente existente: NUNCA altera nome nem aceita_contato em pedido anônimo (RF07)
    NULL;
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

-- 8. Atualizar public.criar_pedido_totem (RF01, RF05, RF10)
CREATE OR REPLACE FUNCTION public.criar_pedido_totem(
  p_token text,
  p_payload jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token_hash TEXT;
  v_totem RECORD;
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
  v_para_viagem BOOLEAN := false;
  v_forma_pagamento TEXT := 'pix';
  v_observacoes TEXT;
  v_status_inicial TEXT := 'aguardando_pagamento';
  v_exigir_pagamento BOOLEAN := true;
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
  v_client_id UUID;
  v_status_retorno TEXT;
  v_exigir_horario BOOLEAN;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'TOTEM_REVOGADO: Totem não autenticado.';
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_totem
  FROM public.totens
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF NOT FOUND OR v_totem.ativo IS FALSE THEN
    RAISE EXCEPTION 'TOTEM_REVOGADO: Este totem foi desativado pelo administrador.';
  END IF;

  -- Verifica horário de funcionamento se configurado (RF05)
  SELECT COALESCE((valor->>'ativo')::boolean, (valor)::boolean, false)
  INTO v_exigir_horario
  FROM public.configuracoes_sistema
  WHERE chave IN ('pedido_totem_exigir_horario', 'loja_exigir_horario_totem')
  LIMIT 1;

  IF v_exigir_horario IS TRUE THEN
    IF NOT public.loja_esta_aberta(now()) THEN
      RAISE EXCEPTION 'O totem está fora do horário de funcionamento da cafeteria.';
    END IF;
  END IF;

  UPDATE public.totens
  SET ultimo_acesso = now()
  WHERE id = v_totem.id;

  PERFORM public.expirar_pedidos_totem_vencidos();

  -- Idempotência
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    BEGIN
      v_client_id := p_idempotency_key::UUID;
      SELECT id, numero_pedido, pedido_token, status, total
      INTO v_pedido_id, v_numero_pedido, v_pedido_token, v_status_retorno, v_total
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
          'idempotente', true
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_client_id := NULL;
    END;
  END IF;

  v_cliente_nome := TRIM(COALESCE(p_payload->>'cliente_nome', ''));
  IF length(v_cliente_nome) < 2 THEN
    RAISE EXCEPTION 'Por favor, informe seu primeiro nome para chamada no painel.';
  END IF;

  v_para_viagem := COALESCE((p_payload->>'para_viagem')::boolean, false);
  v_forma_pagamento := LOWER(TRIM(COALESCE(p_payload->>'forma_pagamento', 'pix')));
  IF v_forma_pagamento NOT IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outros') THEN
    v_forma_pagamento := 'pix';
  END IF;

  v_exigir_pagamento := public.fn_deve_exigir_pix_kds();
  IF v_exigir_pagamento THEN
    v_status_inicial := 'aguardando_pagamento';
  ELSE
    v_status_inicial := 'pendente';
  END IF;

  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos 1 item ao pedido.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 25 THEN
    RAISE EXCEPTION 'Máximo de 25 itens por pedido no totem.';
  END IF;

  -- Truncamento de observações em 500 caracteres (RF10 / CA13)
  v_observacoes := LEFT(TRIM(COALESCE(p_payload->>'observacoes', '')), 500);
  v_pedido_token := gen_random_uuid();

  INSERT INTO public.pedidos (
    mesa_codigo,
    status,
    status_pagamento,
    forma_pagamento,
    observacoes,
    total,
    cliente_nome,
    para_viagem,
    origem,
    pedido_token,
    client_id,
    criado_por_nome
  ) VALUES (
    'BALCÃO',
    v_status_inicial,
    'pendente',
    v_forma_pagamento,
    v_observacoes,
    0,
    v_cliente_nome,
    v_para_viagem,
    'totem',
    v_pedido_token,
    v_client_id,
    v_totem.nome
  ) RETURNING id, numero_pedido INTO v_pedido_id, v_numero_pedido;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id'
      AND p.ativo = true
      AND p.disponivel = true
      AND COALESCE(p.apenas_encomenda, false) = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto indisponível no momento: %', v_item->>'produto_id';
    END IF;

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
          RAISE EXCEPTION 'Sabor esgotado: %', v_sabor->>'produto_id';
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
          RAISE EXCEPTION 'Adicional % não permitido para %', v_adicional::text, v_produto_record.nome;
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

  -- Calcula subtotal e processa cupom de desconto no servidor (RF01 / CA01, CA02)
  SELECT COALESCE(SUM(quantidade * preco_unitario - COALESCE(desconto, 0)), 0)
  INTO v_subtotal
  FROM public.pedido_itens
  WHERE pedido_id = v_pedido_id;

  v_total := v_subtotal;
  v_cupom_codigo := UPPER(TRIM(COALESCE(p_payload->>'cupom_codigo', '')));

  IF v_cupom_codigo <> '' THEN
    v_cupom_res := public.validar_cupom(v_cupom_codigo, v_subtotal, NULL);
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

    -- Registra uso atomicamente na transação
    INSERT INTO public.campanha_usos (campanha_id, pedido_id, cliente_id, valor_receita, created_at)
    VALUES (v_campanha_id, v_pedido_id, NULL, v_total, now());

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
    'mesa_codigo', 'BALCÃO',
    'status', v_status_inicial,
    'forma_pagamento', v_forma_pagamento,
    'total', v_total,
    'exigir_pagamento', v_exigir_pagamento
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.criar_pedido_totem(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido_totem(text, jsonb, text) TO anon, authenticated;
