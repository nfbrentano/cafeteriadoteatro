-- =========================================================
-- MIGRATION: CAF-000024 / CAF-000028 — Itens lançados depois voltam para a fila com destaque e comanda complementar
-- =========================================================

-- 1. Adicionar colunas em pedido_itens
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS lancado_depois BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impresso_em TIMESTAMPTZ;

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_pedido_itens_lancado_depois 
  ON public.pedido_itens(pedido_id) WHERE lancado_depois = true;

CREATE INDEX IF NOT EXISTS idx_pedido_itens_impresso 
  ON public.pedido_itens(pedido_id) WHERE impresso_em IS NULL;

-- 2. Atualizar trigger function fn_checar_conclusao_pedido para reabrir pedidos mesmo se estiverem 'entregue'
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
    -- Se estava 'concluido' ou 'entregue', reverter para 'em_preparo'
    IF v_status_atual IN ('concluido', 'entregue') THEN
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

-- 3. Atualizar RPC adicionar_itens_pedido
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
  v_status_pedido TEXT;
  v_novo_item_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_reaberto BOOLEAN := false;
  v_now TIMESTAMPTZ := timezone('America/Sao_Paulo', now());
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN 
    RAISE EXCEPTION 'Acesso negado'; 
  END IF;

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

-- 4. RPC para marcar itens adicionais como impressos atomicamente (evita duplicidade em múltiplas telas)
CREATE OR REPLACE FUNCTION public.marcar_itens_impressos(p_item_ids BIGINT[])
RETURNS BIGINT[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('America/Sao_Paulo', now());
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
$$;

GRANT EXECUTE ON FUNCTION public.marcar_itens_impressos(BIGINT[]) TO authenticated;
