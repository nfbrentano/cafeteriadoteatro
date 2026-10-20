-- =========================================================
-- MIGRATION: CAF-000040 - TOTEM / TABLET DE AUTOATENDIMENTO NO BALCÃO
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Garante que a mesa especial 'BALCÃO' exista para pedidos do totem
INSERT INTO public.mesas (codigo, descricao, ativo)
VALUES ('BALCÃO', 'Totem de Autoatendimento Balcão', true)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Atualiza constraints de origem e status em pedidos
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_origem_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_origem_check
  CHECK (origem IN ('pdv', 'cliente_qr', 'online', 'online_retirada', 'totem'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('aguardando_aprovacao', 'aguardando_pagamento', 'pendente', 'em_preparo', 'concluido', 'entregue', 'cancelado', 'pronto'));

-- 3. Tabela de dispositivos Totem pareados
CREATE TABLE IF NOT EXISTS public.totens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo_pareamento TEXT,
  token_hash TEXT UNIQUE,
  modo_operacao TEXT NOT NULL DEFAULT 'pagamento' CHECK (modo_operacao IN ('pagamento', 'aprovacao')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  pareado_em TIMESTAMPTZ,
  ultimo_acesso TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.totens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "totens_admin_all" ON public.totens;
CREATE POLICY "totens_admin_all"
  ON public.totens
  FOR ALL
  TO authenticated
  USING (public.tem_permissao('config.sistema') OR public.get_user_role() = 'admin')
  WITH CHECK (public.tem_permissao('config.sistema') OR public.get_user_role() = 'admin');

-- 4. Tabela de sugestões de complemento para o Totem
CREATE TABLE IF NOT EXISTS public.totem_sugestoes (
  id SERIAL PRIMARY KEY,
  gatilho_categoria_id TEXT REFERENCES public.categorias(id) ON DELETE CASCADE,
  gatilho_produto_id TEXT REFERENCES public.produtos(id) ON DELETE CASCADE,
  produto_sugerido_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  frase_destaque TEXT DEFAULT 'Combina perfeitamente com seu pedido!',
  ordem INT NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.totem_sugestoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "totem_sugestoes_read_all" ON public.totem_sugestoes;
CREATE POLICY "totem_sugestoes_read_all"
  ON public.totem_sugestoes
  FOR SELECT
  TO anon, authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "totem_sugestoes_admin_write" ON public.totem_sugestoes;
CREATE POLICY "totem_sugestoes_admin_write"
  ON public.totem_sugestoes
  FOR ALL
  TO authenticated
  USING (public.tem_permissao('config.sistema') OR public.get_user_role() = 'admin')
  WITH CHECK (public.tem_permissao('config.sistema') OR public.get_user_role() = 'admin');

-- 5. Configurações padrão do Totem em configuracoes_sistema
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('totem_expiracao_pagamento_min', '15'::jsonb),
  ('totem_aviso_teatro_titulo', '"🎭 Hoje no Teatro Univates"'::jsonb),
  ('totem_aviso_teatro_subtitulo', '"Garanta seu café e lanche sem fila antes do espetáculo começar!"'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 6. Função utilitária: expirar pedidos do totem não pagos após X minutos
CREATE OR REPLACE FUNCTION public.expirar_pedidos_totem_vencidos()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        cancelado_em = timezone('America/Sao_Paulo', now()),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE origem = 'totem'
      AND status = 'aguardando_pagamento'
      AND created_at < (now() - (v_min || ' minutes')::interval)
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_count FROM cancelados;

  RETURN v_count;
END;
$$;

-- 7. RPC: parear_totem(p_codigo)
-- Pareia o tablet usando o código de 6 dígitos gerado no admin e devolve o token longo
CREATE OR REPLACE FUNCTION public.parear_totem(p_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_totem RECORD;
  v_raw_token TEXT;
  v_token_hash TEXT;
BEGIN
  IF p_codigo IS NULL OR length(trim(p_codigo)) < 4 THEN
    RAISE EXCEPTION 'Código de pareamento inválido.';
  END IF;

  SELECT * INTO v_totem
  FROM public.totens
  WHERE codigo_pareamento = trim(p_codigo)
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de pareamento inválido, já utilizado ou revogado.';
  END IF;

  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  UPDATE public.totens
  SET token_hash = v_token_hash,
      codigo_pareamento = NULL,
      pareado_em = now(),
      ultimo_acesso = now(),
      updated_at = now()
  WHERE id = v_totem.id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'totem_id', v_totem.id,
    'nome', v_totem.nome,
    'modo_operacao', v_totem.modo_operacao,
    'token', v_raw_token
  );
END;
$$;

-- 8. RPC: validar_sessao_totem(p_token)
-- Verifica se o token do totem ainda está ativo e atualiza ultimo_acesso
CREATE OR REPLACE FUNCTION public.validar_sessao_totem(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash TEXT;
  v_totem RECORD;
  v_expiracao_min INT := 15;
  v_aviso_titulo TEXT := '🎭 Hoje no Teatro Univates';
  v_aviso_subtitulo TEXT := 'Peça aqui no totem e retire rápido no balcão!';
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'TOKEN_AUSENTE');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_totem
  FROM public.totens
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'TOKEN_INVALIDO');
  END IF;

  IF v_totem.ativo IS FALSE THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'TOTEM_REVOGADO');
  END IF;

  UPDATE public.totens
  SET ultimo_acesso = now()
  WHERE id = v_totem.id;

  -- Aproveita o heartbeat para expirar pedidos vencidos
  PERFORM public.expirar_pedidos_totem_vencidos();

  SELECT COALESCE((valor)::text::int, 15) INTO v_expiracao_min
  FROM public.configuracoes_sistema WHERE chave = 'totem_expiracao_pagamento_min';

  SELECT COALESCE( trim(both '"' from (valor)::text), v_aviso_titulo) INTO v_aviso_titulo
  FROM public.configuracoes_sistema WHERE chave = 'totem_aviso_teatro_titulo';

  SELECT COALESCE( trim(both '"' from (valor)::text), v_aviso_subtitulo) INTO v_aviso_subtitulo
  FROM public.configuracoes_sistema WHERE chave = 'totem_aviso_teatro_subtitulo';

  RETURN jsonb_build_object(
    'valido', true,
    'totem_id', v_totem.id,
    'nome', v_totem.nome,
    'modo_operacao', v_totem.modo_operacao,
    'expiracao_pagamento_min', v_expiracao_min,
    'aviso_titulo', v_aviso_titulo,
    'aviso_subtitulo', v_aviso_subtitulo
  );
END;
$$;

-- 9. RPC: criar_pedido_totem(p_token, p_payload, p_idempotency_key)
CREATE OR REPLACE FUNCTION public.criar_pedido_totem(
  p_token TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash TEXT;
  v_totem RECORD;
  v_pedido_id BIGINT;
  v_numero_pedido INT;
  v_pedido_token UUID;
  v_total NUMERIC(10,2) := 0;
  v_cliente_nome TEXT;
  v_para_viagem BOOLEAN := false;
  v_forma_pagamento TEXT := 'pix';
  v_observacoes TEXT;
  v_status_inicial TEXT := 'aguardando_pagamento';
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
BEGIN
  -- 1. Valida o token do totem
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

  UPDATE public.totens
  SET ultimo_acesso = now()
  WHERE id = v_totem.id;

  -- Expira pedidos antigos não pagos
  PERFORM public.expirar_pedidos_totem_vencidos();

  -- 2. Verifica idempotência
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

  -- 3. Valida dados básicos do pedido
  v_cliente_nome := TRIM(COALESCE(p_payload->>'cliente_nome', ''));
  IF length(v_cliente_nome) < 2 THEN
    RAISE EXCEPTION 'Por favor, informe seu primeiro nome para chamada no painel.';
  END IF;

  v_para_viagem := COALESCE((p_payload->>'para_viagem')::boolean, false);
  v_forma_pagamento := LOWER(TRIM(COALESCE(p_payload->>'forma_pagamento', 'pix')));
  IF v_forma_pagamento NOT IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outros') THEN
    v_forma_pagamento := 'pix';
  END IF;

  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos 1 item ao pedido.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 25 THEN
    RAISE EXCEPTION 'Máximo de 25 itens por pedido no totem.';
  END IF;

  v_observacoes := TRIM(COALESCE(p_payload->>'observacoes', ''));
  v_pedido_token := gen_random_uuid();

  -- 4. Cria o pedido com status aguardando_pagamento (não entra no KDS até ser recebido no caixa)
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

  -- 5. Insere os itens recalculando preços a partir do banco
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

  -- 6. Aplica promoções do dia e atualiza total
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
    'mesa_codigo', 'BALCÃO',
    'status', v_status_inicial,
    'forma_pagamento', v_forma_pagamento,
    'total', v_total
  );
END;
$$;

-- 10. RPC: receber_pedido_totem(p_pedido_id, p_forma_pagamento)
-- Confirma o pagamento no PDV, gera registro em pedido_pagamentos (calculando taxas via trigger CAF-000039) e envia para a cozinha
CREATE OR REPLACE FUNCTION public.receber_pedido_totem(
  p_pedido_id BIGINT,
  p_forma_pagamento TEXT DEFAULT 'pix'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.parear_totem(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_sessao_totem(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pedido_totem(TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_pedidos_totem_vencidos() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receber_pedido_totem(BIGINT, TEXT) TO authenticated;
