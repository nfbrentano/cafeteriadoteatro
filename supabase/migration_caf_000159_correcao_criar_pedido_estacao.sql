-- ==============================================================================
-- Migração CAF-000159: Correção da RPC criar_pedido (coluna p.estacao inexistente)
--
-- Problema:
--   A RPC criar_pedido(JSONB) selecionava 'p.estacao' da tabela produtos, que não
--   possui essa coluna. A coluna correta pertence à tabela categorias ('c.estacao').
--   Isso causava erro 42703 (undefined_column) e retornava HTTP 400 Bad Request
--   no PDV ao tentar criar qualquer pedido.
--
-- Solução:
--   Atualizar a query de produtos na RPC para:
--   COALESCE(c.estacao, 'cozinha') AS estacao
--   mantendo o LEFT JOIN com categorias c e atribuindo à pedido_itens.estacao.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.criar_pedido(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_qtd INT;
BEGIN
  -- Verificar Role
  PERFORM public.exigir_cargo('barista', 'admin');

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
    -- Limite de quantidade 1..99
    v_qtd := (v_item->>'quantidade')::INT;
    IF v_qtd IS NULL OR v_qtd < 1 OR v_qtd > 99 THEN
      RAISE EXCEPTION 'Quantidade do item deve estar entre 1 e 99.';
    END IF;

    SELECT p.id, p.nome, p.preco, COALESCE(c.estacao, 'cozinha') AS estacao, p.tipo_montagem, c.nome as categoria_nome
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
      v_pedido_id, v_produto_record.id, v_produto_record.nome, v_qtd,
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
  FROM public.pedido_itens WHERE pedido_id = v_pedido_id AND cancelado = false;

  UPDATE public.pedidos SET total = v_total WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'id', v_pedido_id,
    'total', v_total,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_pedido(JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido(JSONB) TO authenticated, service_role;

-- Registra a migração 159 em public.app_migrations
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('159', 'migration_caf_000159_correcao_criar_pedido_estacao.sql')
ON CONFLICT (versao) DO UPDATE SET arquivo = EXCLUDED.arquivo;
