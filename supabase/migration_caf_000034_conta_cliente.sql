-- Migration CAF-000034: Conta do Cliente (Fiado e Créditos Pré-pagos)

-- 1. Novas colunas na tabela public.clientes
ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS conta_habilitada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS dia_vencimento SMALLINT CHECK (dia_vencimento IS NULL OR (dia_vencimento BETWEEN 1 AND 31));

-- 2. Atualizar CHECK de forma_pagamento em public.pedidos para incluir 'conta_cliente'
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_forma_pagamento_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_forma_pagamento_check 
  CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente'));

-- 3. Tabela de movimentações da conta do cliente
CREATE TABLE IF NOT EXISTS public.cliente_conta_movimentos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('consumo', 'pagamento', 'deposito', 'estorno', 'ajuste')),
  valor NUMERIC(10,2) NOT NULL,
  pedido_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL,
  fechamento_id BIGINT REFERENCES public.fechamentos_caixa(id) ON DELETE SET NULL,
  forma_pagamento TEXT,
  motivo TEXT,
  criado_por UUID REFERENCES auth.users(id),
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_conta_mov_cliente_id ON public.cliente_conta_movimentos (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_conta_mov_pedido_id ON public.cliente_conta_movimentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_cliente_conta_mov_tipo ON public.cliente_conta_movimentos (tipo);

-- 4. View de saldos e limites
CREATE OR REPLACE VIEW public.v_cliente_saldo AS
SELECT 
  c.id AS cliente_id,
  c.nome AS cliente_nome,
  c.telefone AS cliente_telefone,
  c.conta_habilitada,
  c.limite_credito,
  c.dia_vencimento,
  COALESCE(SUM(m.valor), 0.00)::NUMERIC(10,2) AS saldo,
  (c.limite_credito + COALESCE(SUM(m.valor), 0.00))::NUMERIC(10,2) AS limite_disponivel
FROM public.clientes c
LEFT JOIN public.cliente_conta_movimentos m ON m.cliente_id = c.id
GROUP BY c.id, c.nome, c.telefone, c.conta_habilitada, c.limite_credito, c.dia_vencimento;

-- 5. RPC para lançar movimento atômico com validação e lock
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
  v_role := public.get_user_role();
  IF v_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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
    IF NOT p_bypass_limite OR v_role != 'admin' THEN
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

-- 6. RPC para obter extrato e resumo da conta do cliente
CREATE OR REPLACE FUNCTION public.obter_extrato_cliente(
  p_cliente_id UUID,
  p_limite INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_cliente RECORD;
  v_saldo RECORD;
  v_movimentos JSONB := '[]'::JSONB;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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

-- 7. Atualizar buscar_clientes_pdv para incluir dados de conta corrente
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
AS $$
DECLARE
  v_role TEXT;
  v_digits TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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

-- 8. Atualizar criar_pedido para debitar automaticamente da conta quando forma_pagamento = 'conta_cliente'
CREATE OR REPLACE FUNCTION public.criar_pedido(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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

-- 9. Trigger de estorno automático ao cancelar pedido pago com conta_cliente
CREATE OR REPLACE FUNCTION public.fn_estorno_pedido_conta_cliente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status != 'cancelado' 
     AND OLD.forma_pagamento = 'conta_cliente' AND OLD.status_pagamento = 'pago' 
     AND OLD.cliente_id IS NOT NULL AND OLD.total > 0 THEN
    
    PERFORM public.lancar_movimento_conta(
      p_cliente_id := OLD.cliente_id,
      p_tipo := 'estorno',
      p_valor := OLD.total,
      p_pedido_id := OLD.id,
      p_fechamento_id := NULL,
      p_forma_pagamento := 'conta_cliente',
      p_motivo := 'Estorno automático pelo cancelamento do Pedido #' || OLD.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estorno_pedido_conta_cliente ON public.pedidos;
CREATE TRIGGER trg_estorno_pedido_conta_cliente
AFTER UPDATE OF status ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.fn_estorno_pedido_conta_cliente();

-- 10. RLS na tabela cliente_conta_movimentos
ALTER TABLE public.cliente_conta_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Baristas e admins podem ver movimentações de conta" ON public.cliente_conta_movimentos;
CREATE POLICY "Baristas e admins podem ver movimentações de conta"
ON public.cliente_conta_movimentos
FOR SELECT
TO authenticated
USING (public.get_user_role() IN ('barista', 'admin'));

DROP POLICY IF EXISTS "Baristas e admins podem inserir movimentações de conta" ON public.cliente_conta_movimentos;
CREATE POLICY "Baristas e admins podem inserir movimentações de conta"
ON public.cliente_conta_movimentos
FOR INSERT
TO authenticated
WITH CHECK (public.get_user_role() IN ('barista', 'admin'));
