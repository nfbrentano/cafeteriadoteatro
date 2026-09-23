-- =========================================================
-- MIGRATION FASE 3 E RESTANTE
-- =========================================================

-- 1. Criação de tabelas de Cortesias
CREATE TABLE IF NOT EXISTS public.cortesia_regras (
  id BIGSERIAL PRIMARY KEY,
  produto_cortesia_id TEXT NOT NULL REFERENCES public.produtos(id),
  categoria_liberadora_id TEXT REFERENCES public.categorias(id),
  produto_liberador_id    TEXT REFERENCES public.produtos(id),
  qtd_por_unidade INT NOT NULL DEFAULT 1 CHECK (qtd_por_unidade > 0),
  ativo BOOLEAN NOT NULL DEFAULT true,
  CHECK (num_nonnulls(categoria_liberadora_id, produto_liberador_id) = 1)
);

-- 2. Atualização em pedido_itens
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS cortesia_de_item_id BIGINT REFERENCES public.pedido_itens(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cancelado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promocao_id BIGINT,
  ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pedido_itens_cortesia_de ON public.pedido_itens(cortesia_de_item_id);

-- Alterando a coluna 'subtotal' gerada (já que agora temos descontos)
ALTER TABLE public.pedido_itens DROP COLUMN IF EXISTS subtotal;
ALTER TABLE public.pedido_itens 
  ADD COLUMN subtotal NUMERIC(10,2) GENERATED ALWAYS AS (quantidade * preco_unitario - desconto) STORED;

-- 3. Tabela de Sabores (Meio a Meio)
CREATE TABLE IF NOT EXISTS public.pedido_item_sabores (
  id BIGSERIAL PRIMARY KEY,
  pedido_item_id BIGINT NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  lado TEXT NOT NULL CHECK (lado IN ('doce','salgado')),
  produto_id TEXT NOT NULL REFERENCES public.produtos(id),
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  UNIQUE (pedido_item_id, lado)
);

-- Inclusão da coluna tipo_montagem em produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_montagem TEXT NOT NULL DEFAULT 'simples' CHECK (tipo_montagem IN ('simples', 'meio_a_meio'));

-- 4. Tabelas de Promoções
CREATE TABLE IF NOT EXISTS public.promocoes (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('percentual','compre_leve','segunda_unidade')),
  percentual NUMERIC(5,2) CHECK (percentual > 0 AND percentual <= 100),
  qtd_compra INT CHECK (qtd_compra > 0),
  qtd_leva   INT CHECK (qtd_leva > qtd_compra),
  dias_semana SMALLINT[] NOT NULL,
  vigencia_inicio DATE,
  vigencia_fim DATE,
  imagem_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'percentual'      AND percentual IS NOT NULL) OR
    (tipo = 'segunda_unidade' AND percentual IS NOT NULL) OR
    (tipo = 'compre_leve'     AND qtd_compra IS NOT NULL AND qtd_leva IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.promocao_itens (
  id BIGSERIAL PRIMARY KEY,
  promocao_id BIGINT NOT NULL REFERENCES public.promocoes(id) ON DELETE CASCADE,
  produto_id   TEXT REFERENCES public.produtos(id)   ON DELETE CASCADE,
  categoria_id TEXT REFERENCES public.categorias(id) ON DELETE CASCADE,
  CHECK (num_nonnulls(produto_id, categoria_id) = 1)
);

-- =========================================================
-- 5. TRIGGERS: Cortesias e Cancelamento
-- =========================================================

-- Função para validar inserção ou atualização de item cortesia
CREATE OR REPLACE FUNCTION public.validar_cortesia()
RETURNS TRIGGER AS $$
DECLARE
  v_is_cortesia BOOLEAN;
  v_regra_valida BOOLEAN;
  v_mesa_origem TEXT;
  v_mesa_nova TEXT;
  v_qtd_cortesias_concedidas INT;
  v_qtd_maxima_permitida INT;
BEGIN
  -- 1. Verifica se o produto é uma cortesia configurada
  SELECT EXISTS (
    SELECT 1 FROM public.cortesia_regras WHERE produto_cortesia_id = NEW.produto_id AND ativo = true
  ) INTO v_is_cortesia;

  IF v_is_cortesia THEN
    -- Cortesia não pode ser inserida solta
    IF NEW.cortesia_de_item_id IS NULL THEN
      RAISE EXCEPTION 'Um item cortesia deve estar referenciado a um item principal (cortesia_de_item_id)';
    END IF;

    -- Validar a origem
    SELECT 
      p.mesa_codigo,
      (SELECT TRUE FROM public.cortesia_regras cr 
       WHERE cr.produto_cortesia_id = NEW.produto_id 
       AND cr.ativo = true
       AND (cr.produto_liberador_id = pi_origem.produto_id 
            OR cr.categoria_liberadora_id = (SELECT categoria_id FROM public.produtos WHERE id = pi_origem.produto_id))
       LIMIT 1
      ),
      (pi_origem.quantidade * (
         SELECT COALESCE(MAX(cr.qtd_por_unidade), 1) 
         FROM public.cortesia_regras cr 
         WHERE cr.produto_cortesia_id = NEW.produto_id AND cr.ativo = true
           AND (cr.produto_liberador_id = pi_origem.produto_id 
                OR cr.categoria_liberadora_id = (SELECT categoria_id FROM public.produtos WHERE id = pi_origem.produto_id))
      ))
    INTO v_mesa_origem, v_regra_valida, v_qtd_maxima_permitida
    FROM public.pedido_itens pi_origem
    JOIN public.pedidos p ON p.id = pi_origem.pedido_id
    WHERE pi_origem.id = NEW.cortesia_de_item_id AND pi_origem.cancelado = false;

    IF v_mesa_origem IS NULL THEN
      RAISE EXCEPTION 'Item de origem não encontrado ou cancelado';
    END IF;

    IF NOT v_regra_valida THEN
      RAISE EXCEPTION 'Item de origem não libera esta cortesia';
    END IF;

    -- Mesa da cortesia deve ser igual à mesa da origem
    SELECT mesa_codigo INTO v_mesa_nova FROM public.pedidos WHERE id = NEW.pedido_id;
    IF v_mesa_nova != v_mesa_origem THEN
      RAISE EXCEPTION 'Cortesia deve pertencer à mesma mesa do item de origem';
    END IF;

    -- Contagem de cortesias já usadas por este prato
    SELECT COALESCE(SUM(quantidade), 0) INTO v_qtd_cortesias_concedidas
    FROM public.pedido_itens
    WHERE cortesia_de_item_id = NEW.cortesia_de_item_id AND cancelado = false
    AND id != COALESCE(NEW.id, -1);

    IF (v_qtd_cortesias_concedidas + NEW.quantidade) > v_qtd_maxima_permitida THEN
      RAISE EXCEPTION 'Limite de cortesias excedido para este prato. Permitido: %, Usado/Sendo inserido: %', v_qtd_maxima_permitida, (v_qtd_cortesias_concedidas + NEW.quantidade);
    END IF;

  ELSE
    -- Se NÃO é cortesia, não pode ter referência
    IF NEW.cortesia_de_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas produtos configurados como cortesia podem ter cortesia_de_item_id definido';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_cortesia ON public.pedido_itens;
CREATE TRIGGER trg_validar_cortesia
BEFORE INSERT OR UPDATE ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.validar_cortesia();

-- Cancelamento em cascata (Se o pedido cancelar)
CREATE OR REPLACE FUNCTION public.cancelar_itens_por_pedido()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status != 'cancelado' THEN
    UPDATE public.pedido_itens 
    SET cancelado = true, cancelado_em = now() 
    WHERE pedido_id = NEW.id AND cancelado = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cancelar_itens_por_pedido ON public.pedidos;
CREATE TRIGGER trg_cancelar_itens_por_pedido
AFTER UPDATE OF status ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.cancelar_itens_por_pedido();

-- Cancelamento em cascata (Se o item de prato for cancelado, cancela a cortesia)
CREATE OR REPLACE FUNCTION public.cancelar_cortesia_em_cascata()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cancelado = true AND OLD.cancelado = false THEN
    UPDATE public.pedido_itens
    SET cancelado = true, cancelado_em = now()
    WHERE cortesia_de_item_id = NEW.id AND cancelado = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cancelar_cortesia_em_cascata ON public.pedido_itens;
CREATE TRIGGER trg_cancelar_cortesia_em_cascata
AFTER UPDATE OF cancelado ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.cancelar_cortesia_em_cascata();


-- =========================================================
-- 6. VIEWS & RPC PROMOCOES
-- =========================================================

-- View para facilitar encontrar o saldo de cortesias de uma mesa hoje
CREATE OR REPLACE VIEW public.v_cortesias_disponiveis AS
SELECT 
  p.mesa_codigo,
  pi.id AS pedido_item_origem_id,
  pi.nome_produto AS nome_prato_origem,
  cr.produto_cortesia_id,
  (pi.quantidade * cr.qtd_por_unidade) - COALESCE(
    (SELECT SUM(quantidade) FROM public.pedido_itens 
     WHERE cortesia_de_item_id = pi.id AND cancelado = false), 0
  ) AS saldo_disponivel
FROM public.pedido_itens pi
JOIN public.pedidos p ON p.id = pi.pedido_id
JOIN public.cortesia_regras cr ON (cr.produto_liberador_id = pi.produto_id OR cr.categoria_liberadora_id = (SELECT categoria_id FROM public.produtos WHERE id = pi.produto_id))
WHERE cr.ativo = true
  AND pi.cancelado = false
  AND p.status != 'cancelado'
  AND p.created_at >= CURRENT_DATE;

-- Função para listar promoções do dia
CREATE OR REPLACE FUNCTION public.promocoes_do_dia(p_data DATE DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)
RETURNS TABLE (
  id BIGINT, nome TEXT, descricao TEXT, tipo TEXT, percentual NUMERIC, qtd_compra INT, qtd_leva INT,
  produto_id TEXT, categoria_id TEXT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT p.id, p.nome, p.descricao, p.tipo, p.percentual, p.qtd_compra, p.qtd_leva, pi.produto_id, pi.categoria_id
  FROM public.promocoes p
  LEFT JOIN public.promocao_itens pi ON pi.promocao_id = p.id
  WHERE p.ativo = true
    AND EXTRACT(DOW FROM p_data) = ANY(p.dias_semana)
    AND (p.vigencia_inicio IS NULL OR p_data >= p.vigencia_inicio)
    AND (p.vigencia_fim IS NULL OR p_data <= p.vigencia_fim)
  ORDER BY p.ordem ASC;
$$;


-- =========================================================
-- 8. HELPER: Aplicar promoções no pedido
-- =========================================================
CREATE OR REPLACE FUNCTION public.aplicar_promocoes_pedido(p_pedido_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_promo RECORD;
  v_qtd_total INT;
  v_desconto_item NUMERIC(10,2);
  v_melhor_desconto NUMERIC(10,2);
  v_melhor_promo_id BIGINT;
  v_gratis INT;
BEGIN
  -- Agrupar itens por produto para calcular volume
  FOR v_item IN 
    SELECT produto_id, SUM(quantidade) as total_qtd
    FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id AND cancelado = false
    GROUP BY produto_id
  LOOP
    v_melhor_desconto := 0;
    v_melhor_promo_id := NULL;

    -- Buscar promoções aplicáveis a este produto
    FOR v_promo IN 
      SELECT * FROM public.promocoes_do_dia() p
      WHERE p.produto_id = v_item.produto_id 
         OR p.categoria_id = (SELECT categoria_id FROM public.produtos WHERE id = v_item.produto_id)
    LOOP
      v_desconto_item := 0;
      
      IF v_promo.tipo = 'percentual' THEN
        v_desconto_item := (v_item.total_qtd * (SELECT preco_base FROM public.pedido_itens WHERE pedido_id = p_pedido_id AND produto_id = v_item.produto_id LIMIT 1)) * (v_promo.percentual / 100.0);
      ELSIF v_promo.tipo = 'compre_leve' THEN
        v_gratis := FLOOR(v_item.total_qtd / v_promo.qtd_leva) * (v_promo.qtd_leva - v_promo.qtd_compra);
        v_desconto_item := v_gratis * (SELECT preco_base FROM public.pedido_itens WHERE pedido_id = p_pedido_id AND produto_id = v_item.produto_id LIMIT 1);
      ELSIF v_promo.tipo = 'segunda_unidade' THEN
        v_desconto_item := FLOOR(v_item.total_qtd / 2) * (SELECT preco_base FROM public.pedido_itens WHERE pedido_id = p_pedido_id AND produto_id = v_item.produto_id LIMIT 1) * (v_promo.percentual / 100.0);
      END IF;

      IF v_desconto_item > v_melhor_desconto THEN
        v_melhor_desconto := v_desconto_item;
        v_melhor_promo_id := v_promo.id;
      END IF;
    END LOOP;

    IF v_melhor_promo_id IS NOT NULL AND v_melhor_desconto > 0 THEN
      UPDATE public.pedido_itens 
      SET promocao_id = v_melhor_promo_id, 
          desconto = v_melhor_desconto
      WHERE id = (
        SELECT id FROM public.pedido_itens 
        WHERE pedido_id = p_pedido_id AND produto_id = v_item.produto_id AND cancelado = false 
        LIMIT 1
      );
    END IF;

  END LOOP;
END;
$$;


-- =========================================================
-- 7. UPDATE RPC: criar_pedido
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
-- 9. RPC: adicionar_itens_pedido
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


-- =========================================================
-- 10. SEED: Adicionais (Cheddar, Leite Vegetal) e Cortesias
-- =========================================================

-- Inserir os adicionais (se não existirem)
INSERT INTO public.adicionais (id, nome, preco, ativo) VALUES 
('add-cheddar', 'Cheddar', 3.00, true),
('add-leite-vegetal', 'Leite Vegetal', 2.00, true)
ON CONFLICT (id) DO NOTHING;

-- Vincular Cheddar (ex: a Sanduíches/Salgados, ou em geral se não usarmos o filtro no momento)
-- O usuário poderá adicionar pelo admin depois

-- Inserir Mini Cappuccino Cortesia como produto
INSERT INTO public.produtos (id, nome, categoria_id, descricao, preco, ativo, ordem)
VALUES (
  'prod-mini-cappuccino-cortesia', 
  'Mini Cappuccino Cortesia', 
  (SELECT id FROM public.categorias WHERE nome = 'Cafés' LIMIT 1), 
  'Cortesia servida após o prato', 
  0.00, 
  true, 
  999
) ON CONFLICT (id) DO NOTHING;

-- Criar a regra de cortesia: "Qualquer Prato libera um Mini Cappuccino Cortesia"
-- Supondo que exista uma categoria "Pratos". Se não existir, deixo preparado para o usuário vincular no admin.
INSERT INTO public.cortesia_regras (produto_cortesia_id, categoria_liberadora_id, qtd_por_unidade)
SELECT 'prod-mini-cappuccino-cortesia', id, 1 
FROM public.categorias 
WHERE nome ILIKE '%Pratos%' OR nome ILIKE '%Refeições%' LIMIT 1
ON CONFLICT DO NOTHING;

