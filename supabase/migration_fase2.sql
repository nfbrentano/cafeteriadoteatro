-- =========================================================
-- MIGRATION: FASE 2 - ADICIONAIS & RPC DE PEDIDOS
-- =========================================================

-- 1. Tabela Adicionais
CREATE TABLE IF NOT EXISTS public.adicionais (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INT NOT NULL DEFAULT 0
);

-- Habilitar RLS
ALTER TABLE public.adicionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adicionais_select" ON public.adicionais FOR SELECT USING (true);
CREATE POLICY "adicionais_all_admin" ON public.adicionais FOR ALL USING (public.get_user_role() = 'admin');

-- 2. Tabela de Vínculos de Adicionais (a produtos ou categorias)
CREATE TABLE IF NOT EXISTS public.adicional_vinculos (
  id BIGSERIAL PRIMARY KEY,
  adicional_id TEXT NOT NULL REFERENCES public.adicionais(id) ON DELETE CASCADE,
  categoria_id TEXT REFERENCES public.categorias(id) ON DELETE CASCADE,
  produto_id   TEXT REFERENCES public.produtos(id)   ON DELETE CASCADE,
  CHECK (num_nonnulls(categoria_id, produto_id) = 1)
);

-- Habilitar RLS
ALTER TABLE public.adicional_vinculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adicional_vinculos_select" ON public.adicional_vinculos FOR SELECT USING (true);
CREATE POLICY "adicional_vinculos_all_admin" ON public.adicional_vinculos FOR ALL USING (public.get_user_role() = 'admin');

-- 3. Adicionar preco_base aos pedido_itens
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS preco_base NUMERIC(10,2);

-- 4. Tabela de Adicionais do Pedido Item (Snapshot no momento da compra)
CREATE TABLE IF NOT EXISTS public.pedido_item_adicionais (
  id BIGSERIAL PRIMARY KEY,
  pedido_item_id BIGINT NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  adicional_id TEXT NOT NULL REFERENCES public.adicionais(id),
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.pedido_item_adicionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pedido_item_adicionais_select" ON public.pedido_item_adicionais FOR SELECT USING (true);
CREATE POLICY "pedido_item_adicionais_insert_barista" ON public.pedido_item_adicionais FOR INSERT WITH CHECK (public.get_user_role() IN ('barista', 'admin'));


-- =========================================================
-- RPC: criar_pedido
-- Recebe JSONB com os dados do pedido e itens.
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
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_mesa_codigo TEXT;
  v_obs_geral TEXT;
  v_forma_pagamento TEXT;
  v_status_pagamento TEXT;
BEGIN
  -- Verificar Role
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Extrair dados básicos
  v_mesa_codigo := p_payload->>'mesa_codigo';
  v_obs_geral := p_payload->>'observacoes';
  v_forma_pagamento := p_payload->>'forma_pagamento';
  v_status_pagamento := p_payload->>'status_pagamento';

  -- 1. Inserir Pedido base (com total 0 inicialmente)
  INSERT INTO public.pedidos (mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, total)
  VALUES (
    v_mesa_codigo,
    v_obs_geral,
    v_forma_pagamento,
    v_status_pagamento,
    auth.uid(),
    (SELECT nome FROM public.perfis WHERE id = auth.uid()),
    0
  ) RETURNING id INTO v_pedido_id;

  -- 2. Inserir Itens e Adicionais
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    -- Buscar Produto Original
    SELECT id, nome, preco INTO v_produto_record 
    FROM public.produtos 
    WHERE id = v_item->>'produto_id' AND ativo = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou inativo: %', v_item->>'produto_id';
    END IF;

    v_preco_base := v_produto_record.preco;
    v_preco_unitario := v_preco_base;

    -- Validar e Somar Adicionais
    -- Espera que v_item->'adicionais' seja um array de IDs (strings)
    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record 
        FROM public.adicionais 
        WHERE id = v_adicional::text AND ativo = true;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Adicional não encontrado ou inativo: %', v_adicional::text;
        END IF;

        -- Nota: Nesta versão simples, não validamos os vínculos na RPC para não quebrar 
        -- o processo caso um vínculo seja removido enquanto a tela estava aberta. 
        -- O UI filtrará as opções corretas.
        
        v_preco_unitario := v_preco_unitario + v_adicional_record.preco;
      END LOOP;
    END IF;

    -- Inserir Pedido Item
    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes
    ) VALUES (
      v_pedido_id,
      v_produto_record.id,
      v_produto_record.nome,
      (v_item->>'quantidade')::int,
      v_preco_base,
      v_preco_unitario,
      v_item->>'observacoes'
    ) RETURNING id INTO v_pedido_item_id;

    -- Somar ao total do pedido
    v_total := v_total + (v_preco_unitario * (v_item->>'quantidade')::int);

    -- Inserir Snapshots dos Adicionais do Item
    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record 
        FROM public.adicionais 
        WHERE id = v_adicional::text AND ativo = true;

        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (
            pedido_item_id, adicional_id, nome, preco
          ) VALUES (
            v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco
          );
        END IF;
      END LOOP;
    END IF;

  END LOOP;

  -- 3. Atualizar Total do Pedido
  UPDATE public.pedidos SET total = v_total WHERE id = v_pedido_id;

  -- 4. Retornar dados inseridos
  RETURN jsonb_build_object(
    'pedido_id', v_pedido_id,
    'total', v_total
  );

END;
$$;


-- =========================================================
-- RPC: adicionar_itens_pedido
-- Recebe JSONB para adicionar itens a pedido existente
-- =========================================================
CREATE OR REPLACE FUNCTION public.adicionar_itens_pedido(p_pedido_id BIGINT, p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_pedido_record RECORD;
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_adicional JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_total_add NUMERIC(10,2) := 0;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Verificar pedido existente
  SELECT id, total INTO v_pedido_record FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id;
  END IF;

  -- Inserir Itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    SELECT id, nome, preco INTO v_produto_record 
    FROM public.produtos 
    WHERE id = v_item->>'produto_id' AND ativo = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou inativo: %', v_item->>'produto_id';
    END IF;

    v_preco_base := v_produto_record.preco;
    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record 
        FROM public.adicionais 
        WHERE id = v_adicional::text AND ativo = true;

        IF FOUND THEN
          v_preco_unitario := v_preco_unitario + v_adicional_record.preco;
        END IF;
      END LOOP;
    END IF;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes
    ) VALUES (
      p_pedido_id,
      v_produto_record.id,
      v_produto_record.nome,
      (v_item->>'quantidade')::int,
      v_preco_base,
      v_preco_unitario,
      v_item->>'observacoes'
    ) RETURNING id INTO v_pedido_item_id;

    v_total_add := v_total_add + (v_preco_unitario * (v_item->>'quantidade')::int);

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record 
        FROM public.adicionais 
        WHERE id = v_adicional::text AND ativo = true;

        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (
            pedido_item_id, adicional_id, nome, preco
          ) VALUES (
            v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Atualizar Total do Pedido
  UPDATE public.pedidos SET total = total + v_total_add WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id,
    'total_adicionado', v_total_add,
    'novo_total', v_pedido_record.total + v_total_add
  );

END;
$$;
