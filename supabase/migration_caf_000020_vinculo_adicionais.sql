-- =========================================================
-- MIGRATION: CAF-000020 - Vínculo de Adicionais por Produto
-- =========================================================

-- 1. Nova coluna em produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS permite_adicionais BOOLEAN NOT NULL DEFAULT false;

-- 2. Atualizar produtos existentes com base nas categorias
UPDATE public.produtos
SET permite_adicionais = true
WHERE categoria_id IN ('cafes-quentes', 'cafes-especiais', 'cafes-gelados', 'baguetes')
   OR id = 'prod-baguete-frango'; -- Apenas para garantir, caso o slug da categoria não englobe

-- 3. Inserir vínculos na adicional_vinculos
-- add-leite-vegetal para cafés
INSERT INTO public.adicional_vinculos (adicional_id, categoria_id)
SELECT 'add-leite-vegetal', 'cafes-quentes'
WHERE EXISTS (SELECT 1 FROM public.categorias WHERE id = 'cafes-quentes')
ON CONFLICT DO NOTHING;

INSERT INTO public.adicional_vinculos (adicional_id, categoria_id)
SELECT 'add-leite-vegetal', 'cafes-especiais'
WHERE EXISTS (SELECT 1 FROM public.categorias WHERE id = 'cafes-especiais')
ON CONFLICT DO NOTHING;

INSERT INTO public.adicional_vinculos (adicional_id, categoria_id)
SELECT 'add-leite-vegetal', 'cafes-gelados'
WHERE EXISTS (SELECT 1 FROM public.categorias WHERE id = 'cafes-gelados')
ON CONFLICT DO NOTHING;

-- add-cheddar para baguetes
INSERT INTO public.adicional_vinculos (adicional_id, categoria_id)
SELECT 'add-cheddar', 'baguetes'
WHERE EXISTS (SELECT 1 FROM public.categorias WHERE id = 'baguetes')
ON CONFLICT DO NOTHING;

-- 4. View de Adicionais por Produto
CREATE OR REPLACE VIEW public.v_adicionais_produto AS
SELECT DISTINCT 
  p.id AS produto_id, 
  a.id AS adicional_id, 
  a.nome, 
  a.preco, 
  a.ordem
FROM public.produtos p
JOIN public.adicional_vinculos v ON (v.produto_id = p.id OR v.categoria_id = p.categoria_id)
JOIN public.adicionais a ON a.id = v.adicional_id
WHERE p.permite_adicionais = true 
  AND a.ativo = true;

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_adicional_vinculos_produto ON public.adicional_vinculos(produto_id);
CREATE INDEX IF NOT EXISTS idx_adicional_vinculos_categoria ON public.adicional_vinculos(categoria_id);

-- =========================================================
-- UPDATE RPC: criar_pedido
-- =========================================================
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
  v_inseridos BIGINT[];
  v_item_index INT := 0;
  v_cortesia_de_index INT;
  v_adicional_permitido BOOLEAN;
BEGIN
  -- Verificar Role
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_mesa_codigo := p_payload->>'mesa_codigo';
  v_obs_geral := p_payload->>'observacoes';
  v_forma_pagamento := p_payload->>'forma_pagamento';
  v_status_pagamento := p_payload->>'status_pagamento';

  INSERT INTO public.pedidos (mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, total)
  VALUES (
    v_mesa_codigo, v_obs_geral, v_forma_pagamento, v_status_pagamento, auth.uid(),
    (SELECT nome FROM public.perfis WHERE id = auth.uid()), 0
  ) RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT id, nome, preco, tipo_montagem INTO v_produto_record 
    FROM public.produtos WHERE id = v_item->>'produto_id' AND ativo = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou inativo: %', v_item->>'produto_id';
    END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      IF jsonb_typeof(v_item->'sabores') != 'array' THEN
        RAISE EXCEPTION 'Produto meio a meio requer array de sabores';
      END IF;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id' AND ativo = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'Sabor não encontrado: %', v_sabor->>'produto_id'; END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        -- Validar o vínculo do adicional
        SELECT EXISTS (
          SELECT 1 FROM public.v_adicionais_produto 
          WHERE produto_id = v_produto_record.id AND adicional_id = v_adicional::text
        ) INTO v_adicional_permitido;

        IF NOT v_adicional_permitido THEN
          RAISE EXCEPTION 'Adicional % não permitido para o produto %', v_adicional::text, v_produto_record.id;
        END IF;

        SELECT preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text AND ativo = true;
        IF FOUND THEN v_preco_unitario := v_preco_unitario + v_adicional_record.preco; END IF;
      END LOOP;
    END IF;

    v_cortesia_de_index := (v_item->>'cortesia_de_item_index')::INT;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes, cortesia_de_item_id
    ) VALUES (
      v_pedido_id, v_produto_record.id, v_produto_record.nome, (v_item->>'quantidade')::int,
      v_preco_base, v_preco_unitario, v_item->>'observacoes',
      CASE WHEN v_cortesia_de_index IS NOT NULL THEN v_inseridos[v_cortesia_de_index + 1] ELSE NULL END
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


-- =========================================================
-- UPDATE RPC: adicionar_itens_pedido
-- =========================================================
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
  v_inseridos BIGINT[];
  v_item_index INT := 0;
  v_cortesia_de_id BIGINT;
  v_adicional_permitido BOOLEAN;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    SELECT id, nome, preco, tipo_montagem INTO v_produto_record 
    FROM public.produtos WHERE id = v_item->>'produto_id' AND ativo = true;

    IF NOT FOUND THEN RAISE EXCEPTION 'Produto inativo: %', v_item->>'produto_id'; END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id' AND ativo = true;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        -- Validar o vínculo do adicional
        SELECT EXISTS (
          SELECT 1 FROM public.v_adicionais_produto 
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
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes, cortesia_de_item_id
    ) VALUES (
      p_pedido_id, v_produto_record.id, v_produto_record.nome, (v_item->>'quantidade')::int,
      v_preco_base, v_preco_unitario, v_item->>'observacoes', v_cortesia_de_id
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
