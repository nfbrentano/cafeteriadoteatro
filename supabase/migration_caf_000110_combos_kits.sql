BEGIN;

-- ==============================================================================
-- CAF-000110 — Combos e Kits Configuráveis no Cardápio Digital, Totem, PDV e KDS
-- ==============================================================================

-- 1. Expandir check constraint de tipo_montagem em public.produtos para aceitar 'combo'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produtos_tipo_montagem_check'
      AND conrelid = 'public.produtos'::regclass
  ) THEN
    ALTER TABLE public.produtos DROP CONSTRAINT produtos_tipo_montagem_check;
  END IF;

  ALTER TABLE public.produtos
    ADD CONSTRAINT produtos_tipo_montagem_check
    CHECK (tipo_montagem IN ('padrao', 'meio_a_meio', 'combo'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Tabela de grupos/etapas do Combo
CREATE TABLE IF NOT EXISTS public.combo_grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_combo_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 1,
  min_escolhas INT NOT NULL DEFAULT 1 CHECK (min_escolhas >= 0),
  max_escolhas INT NOT NULL DEFAULT 1 CHECK (max_escolhas >= 1 AND max_escolhas >= min_escolhas),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de opções de cada grupo do Combo
CREATE TABLE IF NOT EXISTS public.combo_grupo_opcoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.combo_grupos(id) ON DELETE CASCADE,
  produto_item_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  preco_adicional NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_adicional >= 0),
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de escolhas de combo gravadas em cada item do pedido
CREATE TABLE IF NOT EXISTS public.pedido_item_combo_escolhas (
  id BIGSERIAL PRIMARY KEY,
  pedido_item_id BIGINT NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  grupo_id UUID REFERENCES public.combo_grupos(id) ON DELETE SET NULL,
  grupo_nome TEXT,
  produto_id TEXT NOT NULL REFERENCES public.produtos(id),
  nome_produto TEXT NOT NULL,
  estacao TEXT NOT NULL DEFAULT 'bar',
  preco_adicional NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade INT NOT NULL DEFAULT 1,
  pronto_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Habilitar RLS e criar policies seguras
ALTER TABLE public.combo_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_grupo_opcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_item_combo_escolhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_grupos_select_public" ON public.combo_grupos;
CREATE POLICY "combo_grupos_select_public"
  ON public.combo_grupos
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_grupos_write_admin" ON public.combo_grupos;
CREATE POLICY "combo_grupos_write_admin"
  ON public.combo_grupos
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin' OR public.tem_permissao('produtos', (SELECT auth.uid())))
  WITH CHECK (public.get_user_role() = 'admin' OR public.tem_permissao('produtos', (SELECT auth.uid())));

DROP POLICY IF EXISTS "combo_grupo_opcoes_select_public" ON public.combo_grupo_opcoes;
CREATE POLICY "combo_grupo_opcoes_select_public"
  ON public.combo_grupo_opcoes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "combo_grupo_opcoes_write_admin" ON public.combo_grupo_opcoes;
CREATE POLICY "combo_grupo_opcoes_write_admin"
  ON public.combo_grupo_opcoes
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin' OR public.tem_permissao('produtos', (SELECT auth.uid())))
  WITH CHECK (public.get_user_role() = 'admin' OR public.tem_permissao('produtos', (SELECT auth.uid())));

DROP POLICY IF EXISTS "pedido_item_combo_escolhas_select" ON public.pedido_item_combo_escolhas;
CREATE POLICY "pedido_item_combo_escolhas_select"
  ON public.pedido_item_combo_escolhas
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "pedido_item_combo_escolhas_write_staff" ON public.pedido_item_combo_escolhas;
CREATE POLICY "pedido_item_combo_escolhas_write_staff"
  ON public.pedido_item_combo_escolhas
  FOR ALL
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'barista', 'cozinha', 'garcom') OR public.tem_permissao('pdv.vender', (SELECT auth.uid())))
  WITH CHECK (public.get_user_role() IN ('admin', 'barista', 'cozinha', 'garcom') OR public.tem_permissao('pdv.vender', (SELECT auth.uid())));

GRANT SELECT ON public.combo_grupos TO anon, authenticated;
GRANT ALL ON public.combo_grupos TO authenticated;
GRANT SELECT ON public.combo_grupo_opcoes TO anon, authenticated;
GRANT ALL ON public.combo_grupo_opcoes TO authenticated;
GRANT SELECT ON public.pedido_item_combo_escolhas TO anon, authenticated;
GRANT ALL ON public.pedido_item_combo_escolhas TO authenticated;

-- 6. RPC server-side para validar escolhas de um Combo e calcular preço + roteamento de estação
CREATE OR REPLACE FUNCTION public.validar_e_calcular_combo(
  p_produto_combo_id TEXT,
  p_escolhas JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combo RECORD;
  v_grupo RECORD;
  v_escolha JSONB;
  v_opcao RECORD;
  v_prod_item RECORD;
  v_qtd_grupo INT;
  v_preco_adicional_total NUMERIC(10,2) := 0;
  v_preco_unitario NUMERIC(10,2) := 0;
  v_componentes JSONB := '[]'::jsonb;
BEGIN
  SELECT id, nome, preco, ativo, disponivel, tipo_montagem
  INTO v_combo
  FROM public.produtos
  WHERE id = p_produto_combo_id;

  IF NOT FOUND OR NOT COALESCE(v_combo.ativo, true) OR NOT COALESCE(v_combo.disponivel, true) THEN
    RAISE EXCEPTION 'Combo indisponível ou não encontrado.';
  END IF;

  -- Validar cada grupo configurado para o combo
  FOR v_grupo IN
    SELECT id, nome, min_escolhas, max_escolhas
    FROM public.combo_grupos
    WHERE produto_combo_id = p_produto_combo_id
    ORDER BY ordem ASC
  LOOP
    v_qtd_grupo := 0;

    IF jsonb_typeof(p_escolhas) = 'array' THEN
      FOR v_escolha IN SELECT * FROM jsonb_array_elements(p_escolhas)
      LOOP
        IF (v_escolha->>'grupo_id')::UUID = v_grupo.id THEN
          v_qtd_grupo := v_qtd_grupo + COALESCE((v_escolha->>'quantidade')::INT, 1);

          SELECT o.id, o.preco_adicional, o.ativo, o.produto_item_id
          INTO v_opcao
          FROM public.combo_grupo_opcoes o
          WHERE o.grupo_id = v_grupo.id
            AND o.produto_item_id = (v_escolha->>'produto_id')
            AND o.ativo = true
          LIMIT 1;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Opção inválida para o grupo "%".', v_grupo.nome;
          END IF;

          SELECT id, nome, ativo, disponivel, COALESCE(estacao, 'bar') AS estacao
          INTO v_prod_item
          FROM public.produtos
          WHERE id = v_opcao.produto_item_id;

          IF NOT FOUND OR NOT COALESCE(v_prod_item.ativo, true) OR NOT COALESCE(v_prod_item.disponivel, true) THEN
            RAISE EXCEPTION 'Item esgotado no combo: %.', COALESCE(v_prod_item.nome, v_opcao.produto_item_id);
          END IF;

          v_preco_adicional_total := v_preco_adicional_total + (COALESCE(v_opcao.preco_adicional, 0) * COALESCE((v_escolha->>'quantidade')::INT, 1));

          v_componentes := v_componentes || jsonb_build_array(
            jsonb_build_object(
              'grupo_id', v_grupo.id,
              'grupo_nome', v_grupo.nome,
              'produto_id', v_prod_item.id,
              'nome_produto', v_prod_item.nome,
              'estacao', v_prod_item.estacao,
              'preco_adicional', COALESCE(v_opcao.preco_adicional, 0),
              'quantidade', COALESCE((v_escolha->>'quantidade')::INT, 1)
            )
          );
        END IF;
      END LOOP;
    END IF;

    IF v_qtd_grupo < v_grupo.min_escolhas THEN
      RAISE EXCEPTION 'Selecione ao menos % opção(ões) em "%".', v_grupo.min_escolhas, v_grupo.nome;
    END IF;

    IF v_qtd_grupo > v_grupo.max_escolhas THEN
      RAISE EXCEPTION 'Máximo de % opção(ões) permitido em "%".', v_grupo.max_escolhas, v_grupo.nome;
    END IF;
  END LOOP;

  v_preco_unitario := ROUND(COALESCE(v_combo.preco, 0) + v_preco_adicional_total, 2);

  RETURN jsonb_build_object(
    'valido', true,
    'preco_base', COALESCE(v_combo.preco, 0),
    'preco_adicional_total', v_preco_adicional_total,
    'preco_unitario', v_preco_unitario,
    'componentes', v_componentes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_e_calcular_combo(TEXT, JSONB) TO anon, authenticated;

-- 7. Trigger para baixar estoque da ficha técnica de cada produto componente escolhido no Combo
CREATE OR REPLACE FUNCTION public.fn_baixa_estoque_combo_escolha()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido_id BIGINT;
  v_qtd_item_pai INT := 1;
  v_qtd_total NUMERIC(12,4);
  v_ft RECORD;
BEGIN
  SELECT pi.pedido_id, COALESCE(pi.quantidade, 1)
  INTO v_pedido_id, v_qtd_item_pai
  FROM public.pedido_itens pi
  WHERE pi.id = NEW.pedido_item_id;

  v_qtd_total := COALESCE(NEW.quantidade, 1) * COALESCE(v_qtd_item_pai, 1);

  FOR v_ft IN
    SELECT fti.estoque_item_id, fti.quantidade
    FROM public.ficha_tecnica_itens fti
    WHERE fti.produto_id = NEW.produto_id
  LOOP
    UPDATE public.estoque_itens
    SET quantidade_atual = quantidade_atual - (v_ft.quantidade * v_qtd_total),
        updated_at = now()
    WHERE id = v_ft.estoque_item_id;

    INSERT INTO public.estoque_movimentos (
      estoque_item_id,
      tipo,
      quantidade,
      motivo,
      pedido_id,
      criado_em
    ) VALUES (
      v_ft.estoque_item_id,
      'venda',
      -(v_ft.quantidade * v_qtd_total),
      'Baixa automática Combo (' || NEW.nome_produto || ') - Pedido #' || COALESCE(v_pedido_id::text, ''),
      v_pedido_id,
      now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_baixa_estoque_combo_escolhas ON public.pedido_item_combo_escolhas;
CREATE TRIGGER trg_baixa_estoque_combo_escolhas
  AFTER INSERT ON public.pedido_item_combo_escolhas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_baixa_estoque_combo_escolha();

INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('110', 'migration_caf_000110_combos_kits.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
