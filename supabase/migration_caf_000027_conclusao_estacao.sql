-- =========================================================
-- MIGRATION: CAF-000022 - Conclusão Independente por Estação (Bar x Cozinha)
-- =========================================================

-- 1. Garantir coluna estacao na tabela categorias (CAF-000007)
ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS estacao TEXT NOT NULL DEFAULT 'cozinha' CHECK (estacao IN ('bar','cozinha'));

-- Atualizar categorias padrão de bebidas para 'bar' caso ainda estejam como 'cozinha'
UPDATE public.categorias
SET estacao = 'bar'
WHERE id IN (
  'cafes-quentes', 'cafes-gelados', 'cafes-especiais', 'bebidas-geladas', 
  'sucos-vitaminas', 'milk-shakes', 'bebidas-alcoolicas', 'chocolate-quente'
) AND estacao = 'cozinha';

-- 2. Colunas na tabela pedido_itens
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS estacao TEXT CHECK (estacao IN ('bar', 'cozinha')),
  ADD COLUMN IF NOT EXISTS iniciado_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pronto_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Backfill de estacao nos itens existentes
UPDATE public.pedido_itens pi
SET estacao = COALESCE(c.estacao, 'cozinha')
FROM public.produtos p
LEFT JOIN public.categorias c ON c.id = p.categoria_id
WHERE pi.produto_id = p.id AND pi.estacao IS NULL;

UPDATE public.pedido_itens
SET estacao = 'cozinha'
WHERE estacao IS NULL;

-- 4. Atualizar RPC criar_pedido para gravar estacao no item
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

  INSERT INTO public.pedidos (
    mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, total, cliente_nome, para_viagem, client_id
  )
  VALUES (
    v_mesa_codigo, v_obs_geral, v_forma_pagamento, v_status_pagamento, auth.uid(),
    (SELECT nome FROM public.perfis WHERE id = auth.uid()), 0, v_cliente_nome, v_para_viagem, v_client_id
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

-- 5. Atualizar RPC adicionar_itens_pedido para gravar estacao no item
CREATE OR REPLACE FUNCTION public.adicionar_itens_pedido(p_pedido_id BIGINT, p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record 
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado, inativo ou esgotado: %', v_item->>'produto_id'; END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
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
        SELECT EXISTS (
          SELECT 1 FROM public.produto_adicionais_permitidos
          WHERE produto_id = v_produto_record.id AND adicional_id = v_adicional::text
        ) INTO v_adicional_permitido;

        IF NOT v_adicional_permitido THEN
          RAISE EXCEPTION 'Adicional % não permitido para o produto %', v_adicional::text, v_produto_record.id;
        END IF;

        SELECT preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text AND ativo = true;
        IF FOUND THEN v_preco_unitario := v_preco_unitario + v_adicional_record.preco; END IF;
      END LOOP;
    END IF;

    v_cortesia_de_id := (v_item->>'cortesia_de_item_id')::BIGINT;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes, cortesia_de_item_id, estacao
    ) VALUES (
      p_pedido_id, v_produto_record.id, v_produto_record.nome, (v_item->>'quantidade')::int,
      v_preco_base, v_preco_unitario, v_item->>'observacoes', v_cortesia_de_id,
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

  PERFORM public.aplicar_promocoes_pedido(p_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - desconto), 0) INTO v_total
  FROM public.pedido_itens WHERE pedido_id = p_pedido_id AND cancelado = false;

  UPDATE public.pedidos SET total = v_total WHERE id = p_pedido_id;

  RETURN jsonb_build_object('id', p_pedido_id, 'total', v_total);
END;
$$;

-- 6. Trigger Function de checagem e atualização automática de status do pedido
CREATE OR REPLACE FUNCTION public.fn_checar_conclusao_pedido()
RETURNS TRIGGER AS $$
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
          concluido_em = COALESCE(concluido_em, timezone('America/Sao_Paulo', now())),
          concluido_por = COALESCE(auth.uid(), concluido_por),
          updated_at = timezone('America/Sao_Paulo', now())
      WHERE id = v_pedido_id;
    END IF;
  -- Caso 2: Nem todos os itens estão prontos
  ELSE
    -- Se estava 'concluido', reverter para 'em_preparo'
    IF v_status_atual = 'concluido' THEN
      UPDATE public.pedidos
      SET status = 'em_preparo',
          concluido_em = NULL,
          concluido_por = NULL,
          updated_at = timezone('America/Sao_Paulo', now())
      WHERE id = v_pedido_id;
    -- Se estava 'pendente' e já há algum item pronto, avançar para 'em_preparo'
    ELSIF v_status_atual = 'pendente' AND v_itens_prontos > 0 THEN
      UPDATE public.pedidos
      SET status = 'em_preparo',
          iniciado_em = COALESCE(iniciado_em, timezone('America/Sao_Paulo', now())),
          updated_at = timezone('America/Sao_Paulo', now())
      WHERE id = v_pedido_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_checar_conclusao_pedido ON public.pedido_itens;
CREATE TRIGGER trg_checar_conclusao_pedido
AFTER INSERT OR UPDATE OF pronto_em, cancelado ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.fn_checar_conclusao_pedido();

-- 7. RPC: iniciar_estacao
CREATE OR REPLACE FUNCTION public.iniciar_estacao(p_pedido_id BIGINT, p_estacao TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_now TIMESTAMPTZ := timezone('America/Sao_Paulo', now());
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
$$;

-- 8. RPC: concluir_estacao
CREATE OR REPLACE FUNCTION public.concluir_estacao(p_pedido_id BIGINT, p_estacao TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_now TIMESTAMPTZ := timezone('America/Sao_Paulo', now());
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
$$;

-- 9. RPC: desfazer_estacao
CREATE OR REPLACE FUNCTION public.desfazer_estacao(p_pedido_id BIGINT, p_estacao TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_novo_status TEXT;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('cozinha', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_estacao IS NOT NULL AND p_estacao NOT IN ('bar', 'cozinha') THEN
    RAISE EXCEPTION 'Estação inválida: %', p_estacao;
  END IF;

  -- Desmarcar pronto_em e pronto_por nos itens da estação
  UPDATE public.pedido_itens
  SET pronto_em = NULL,
      pronto_por = NULL
  WHERE pedido_id = p_pedido_id
    AND cancelado = false
    AND (p_estacao IS NULL OR estacao = p_estacao);

  SELECT status INTO v_novo_status FROM public.pedidos WHERE id = p_pedido_id;
  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', v_novo_status);
END;
$$;

-- 10. Permissões de Execução
GRANT EXECUTE ON FUNCTION public.iniciar_estacao(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_estacao(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desfazer_estacao(BIGINT, TEXT) TO authenticated;
