-- =========================================================
-- MIGRATION: CAF-000029 - Prioridade de Pedido e Operação por Teclado
-- =========================================================

-- 1. Adicionar colunas na tabela pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS prioridade SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prioridade_motivo TEXT;

-- 2. Índice composto para aceleração de ordenação na fila
CREATE INDEX IF NOT EXISTS idx_pedidos_prioridade_created 
  ON public.pedidos(prioridade DESC, created_at ASC);

-- 3. Trigger Function de Auditoria atualizada com auditoria de prioridade
CREATE OR REPLACE FUNCTION public.fn_audit_pedidos()
RETURNS TRIGGER AS $$
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
                    NEW.id, NULL, 'cancelado', OLD.status, 'cancelado', NEW.motivo_cancelamento, v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
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
                    NEW.id, NULL, 'status_alterado', OLD.status, NEW.status, NULL, v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
                );
            END IF;
        END IF;

        -- 2) Mudança de Prioridade (CAF-000029)
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
                v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
            );
        END IF;

        -- 3) Transferência de Mesa
        IF OLD.mesa_codigo IS DISTINCT FROM NEW.mesa_codigo THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'mesa_transferida', OLD.mesa_codigo, NEW.mesa_codigo, 'Transferência de mesa', v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
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
                v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atualizar RPC criar_pedido com prioridade e prioridade_motivo
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

  -- Se foi enviado client_id, verificar se já existe o pedido (idempotência)
  IF v_client_id IS NOT NULL THEN
    SELECT id, total INTO v_pedido_id, v_total FROM public.pedidos WHERE client_id = v_client_id;
    IF FOUND THEN
      -- Pedido já existe, retornar sucesso sem recriar
      RETURN jsonb_build_object('id', v_pedido_id, 'total', v_total, 'idempotent', true);
    END IF;
  END IF;

  v_mesa_codigo := p_payload->>'mesa_codigo';
  
  -- Lógica para mesa de balcão ou viagem se não for informada
  IF v_mesa_codigo IS NULL OR v_mesa_codigo = '' THEN
    v_mesa_codigo := 'BALCAO';
  END IF;

  v_obs_geral := p_payload->>'observacoes';
  v_forma_pagamento := p_payload->>'forma_pagamento';
  v_status_pagamento := p_payload->>'status_pagamento';
  v_cliente_nome := p_payload->>'cliente_nome';
  v_para_viagem := COALESCE((p_payload->>'para_viagem')::BOOLEAN, false);
  v_prioridade := COALESCE((p_payload->>'prioridade')::SMALLINT, 0);
  v_prioridade_motivo := p_payload->>'prioridade_motivo';

  INSERT INTO public.pedidos (
    mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, 
    total, cliente_nome, para_viagem, client_id, prioridade, prioridade_motivo
  )
  VALUES (
    v_mesa_codigo, v_obs_geral, v_forma_pagamento, v_status_pagamento, auth.uid(),
    (SELECT nome FROM public.perfis WHERE id = auth.uid()), 0, v_cliente_nome, v_para_viagem, 
    v_client_id, v_prioridade, v_prioridade_motivo
  ) RETURNING id INTO v_pedido_id;

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

  RETURN jsonb_build_object('id', v_pedido_id, 'total', v_total);
END;
$$;

-- 5. RPC para alternar prioridade de um pedido (barista, cozinha ou admin)
CREATE OR REPLACE FUNCTION public.alterar_prioridade_pedido(
  p_pedido_id BIGINT, 
  p_prioridade SMALLINT, 
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  RETURN jsonb_build_object('id', p_pedido_id, 'prioridade', p_prioridade, 'prioridade_motivo', p_motivo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.alterar_prioridade_pedido(BIGINT, SMALLINT, TEXT) TO authenticated;
