-- =========================================================
-- MIGRATION: CAF-000037 - QR CODE POR MESA E PEDIDO PELO CLIENTE
-- =========================================================

-- 1. Coluna qr_token na tabela de mesas
ALTER TABLE public.mesas
  ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;

-- Gera token para mesas existentes que ainda não possuem
UPDATE public.mesas
SET qr_token = encode(gen_random_bytes(8), 'hex')
WHERE qr_token IS NULL;

-- Trigger para gerar qr_token automaticamente em novas mesas
CREATE OR REPLACE FUNCTION public.fn_gerar_qr_token_mesa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.qr_token IS NULL OR TRIM(NEW.qr_token) = '' THEN
    NEW.qr_token := encode(gen_random_bytes(8), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gerar_qr_token_mesa ON public.mesas;
CREATE TRIGGER trg_gerar_qr_token_mesa
BEFORE INSERT ON public.mesas
FOR EACH ROW
EXECUTE FUNCTION public.fn_gerar_qr_token_mesa();

-- 2. Atualizar colunas e constraints na tabela de pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'pdv';

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pedido_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_pedidos_pedido_token ON public.pedidos(pedido_token);
CREATE INDEX IF NOT EXISTS idx_pedidos_origem ON public.pedidos(origem);
CREATE INDEX IF NOT EXISTS idx_mesas_qr_token ON public.mesas(qr_token);

-- Atualiza a restrição de status de pedidos para aceitar 'aguardando_aprovacao'
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check 
  CHECK (status IN ('aguardando_aprovacao', 'pendente', 'em_preparo', 'concluido', 'entregue', 'cancelado', 'pronto'));

-- Atualiza a restrição de origem
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_origem_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_origem_check 
  CHECK (origem IN ('pdv', 'cliente_qr', 'online_retirada'));

-- 3. Tabela de Chamados de Mesa (atendente / conta)
CREATE TABLE IF NOT EXISTS public.mesa_chamados (
  id BIGSERIAL PRIMARY KEY,
  mesa_codigo TEXT NOT NULL REFERENCES public.mesas(codigo) ON UPDATE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('atendente', 'conta')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'atendido', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
  atendido_em TIMESTAMPTZ,
  atendido_por UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_mesa_chamados_status ON public.mesa_chamados(status);
CREATE INDEX IF NOT EXISTS idx_mesa_chamados_mesa ON public.mesa_chamados(mesa_codigo);
CREATE INDEX IF NOT EXISTS idx_mesa_chamados_created ON public.mesa_chamados(created_at DESC);

ALTER TABLE public.mesa_chamados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mesa_chamados_select" ON public.mesa_chamados;
CREATE POLICY "mesa_chamados_select" ON public.mesa_chamados FOR SELECT USING (true);

DROP POLICY IF EXISTS "mesa_chamados_insert_anon" ON public.mesa_chamados;
CREATE POLICY "mesa_chamados_insert_anon" ON public.mesa_chamados FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "mesa_chamados_update_staff" ON public.mesa_chamados;
CREATE POLICY "mesa_chamados_update_staff" ON public.mesa_chamados FOR UPDATE USING (
  public.tem_permissao('pdv.vender') OR public.get_user_role() IN ('barista', 'admin')
);

-- 4. Tabela de Configurações do Sistema
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configuracoes_sistema_select" ON public.configuracoes_sistema;
CREATE POLICY "configuracoes_sistema_select" ON public.configuracoes_sistema FOR SELECT USING (true);

DROP POLICY IF EXISTS "configuracoes_sistema_admin" ON public.configuracoes_sistema;
CREATE POLICY "configuracoes_sistema_admin" ON public.configuracoes_sistema FOR ALL USING (
  public.tem_permissao('admin.configuracoes') OR public.get_user_role() = 'admin'
);

INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES ('pedido_cliente_ativo', 'true'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 5. RPC: criar_pedido_cliente (autoatendimento com recálculo estrito no banco)
CREATE OR REPLACE FUNCTION public.criar_pedido_cliente(
  p_qr_token TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  IF v_ultimo_pedido_em IS NOT NULL AND (timezone('America/Sao_Paulo', now()) - v_ultimo_pedido_em) < INTERVAL '30 seconds' THEN
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
$$;

-- 6. RPC: consultar_status_pedido_cliente (privacidade e tracking em tempo real)
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

  SELECT p.id, p.mesa_codigo, p.status, p.total, p.created_at, p.updated_at, p.motivo_cancelamento, p.cliente_nome
  INTO v_pedido
  FROM public.pedidos p
  WHERE p.pedido_token = p_pedido_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
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
    'mesa_codigo', v_pedido.mesa_codigo,
    'status', v_pedido.status,
    'total', v_pedido.total,
    'created_at', v_pedido.created_at,
    'motivo_cancelamento', v_pedido.motivo_cancelamento,
    'cliente_nome', v_pedido.cliente_nome,
    'itens', COALESCE(v_itens, '[]'::jsonb)
  );
END;
$$;

-- 7. RPC: chamar_atendente_mesa
CREATE OR REPLACE FUNCTION public.chamar_atendente_mesa(p_qr_token TEXT, p_tipo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  IF v_recente IS NOT NULL AND (timezone('America/Sao_Paulo', now()) - v_recente) < INTERVAL '60 seconds' THEN
    RETURN jsonb_build_object('sucesso', true, 'repetido', true, 'mensagem', 'Chamado já registrado. O atendente já foi avisado.');
  END IF;

  INSERT INTO public.mesa_chamados (mesa_codigo, tipo, status)
  VALUES (v_mesa.codigo, p_tipo, 'pendente')
  RETURNING id INTO v_chamado_id;

  RETURN jsonb_build_object('sucesso', true, 'chamado_id', v_chamado_id, 'mesa_codigo', v_mesa.codigo, 'tipo', p_tipo);
END;
$$;

-- 8. RPCs para o PDV / Atendente
CREATE OR REPLACE FUNCTION public.aprovar_pedido_cliente(p_pedido_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.recusar_pedido_cliente(p_pedido_id BIGINT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido RECORD;
BEGIN
  IF NOT public.tem_permissao('pdv.cancelar_pedido') AND NOT public.tem_permissao('pdv.vender') AND public.get_user_role() NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado para recusar pedidos.';
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

CREATE OR REPLACE FUNCTION public.atender_chamado_mesa(p_chamado_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.mesa_chamados
  SET status = 'atendido',
      atendido_em = timezone('America/Sao_Paulo', now()),
      atendido_por = auth.uid()
  WHERE id = p_chamado_id;

  RETURN jsonb_build_object('sucesso', true, 'chamado_id', p_chamado_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerar_qr_token_mesa(p_mesa_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Permissões de Execução nas RPCs
GRANT EXECUTE ON FUNCTION public.criar_pedido_cliente(TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_status_pedido_cliente(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chamar_atendente_mesa(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_pedido_cliente(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recusar_pedido_cliente(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atender_chamado_mesa(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerar_qr_token_mesa(BIGINT) TO authenticated;
