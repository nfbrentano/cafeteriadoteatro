-- =========================================================
-- MIGRATION: CAF-000074 - CORREÇÃO DE ESTOQUE E FICHA TÉCNICA (CMV)
-- =========================================================

-- 1. Sincronizar custo_unitario_medio -> custo_medio e manter compatibilidade
DO $$
BEGIN
  -- Se custo_unitario_medio existir em estoque_itens, migra os valores
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estoque_itens' AND column_name = 'custo_unitario_medio'
  ) THEN
    UPDATE public.estoque_itens
    SET custo_medio = COALESCE(NULLIF(custo_medio, 0), custo_unitario_medio, 0)
    WHERE (custo_medio = 0 OR custo_medio IS NULL) AND custo_unitario_medio IS NOT NULL;

    -- Mantém a coluna espelho atualizada para evitar quebras se houver queries legadas
    UPDATE public.estoque_itens
    SET custo_unitario_medio = custo_medio;
  END IF;
END $$;

-- 2. Atualizar funções de ficha técnica para ler custo_medio (CAF-000032)
CREATE OR REPLACE FUNCTION public.fn_calcular_custo_produto(p_produto_id TEXT)
RETURNS NUMERIC(10,4) AS $$
DECLARE
  v_custo_ficha NUMERIC(10,4) := 0;
  v_has_ficha BOOLEAN := false;
  v_custo_manual NUMERIC(10,2);
  v_estoque_item_id BIGINT;
  v_custo_estoque NUMERIC(10,4);
BEGIN
  -- 1. Ficha técnica do produto usando custo_medio
  SELECT COALESCE(SUM(ft.quantidade * COALESCE(ei.custo_medio, 0)), 0), true
  INTO v_custo_ficha, v_has_ficha
  FROM public.fichas_tecnicas ft
  JOIN public.estoque_itens ei ON ei.id = ft.estoque_item_id
  WHERE ft.produto_id = p_produto_id;

  IF v_has_ficha AND v_custo_ficha > 0 THEN
    RETURN v_custo_ficha;
  END IF;

  -- 2. Se não houver ficha com custo, consulta custo manual ou item de revenda direta
  SELECT preco_custo_manual, estoque_item_id
  INTO v_custo_manual, v_estoque_item_id
  FROM public.produtos
  WHERE id = p_produto_id;

  IF v_custo_manual IS NOT NULL AND v_custo_manual > 0 THEN
    RETURN v_custo_manual::NUMERIC(10,4);
  END IF;

  IF v_estoque_item_id IS NOT NULL THEN
    SELECT COALESCE(custo_medio, 0) INTO v_custo_estoque
    FROM public.estoque_itens
    WHERE id = v_estoque_item_id;
    RETURN COALESCE(v_custo_estoque, 0);
  END IF;

  RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_calcular_custo_adicional(p_adicional_id TEXT)
RETURNS NUMERIC(10,4) AS $$
DECLARE
  v_custo_ficha NUMERIC(10,4) := 0;
  v_has_ficha BOOLEAN := false;
  v_estoque_item_id BIGINT;
  v_custo_estoque NUMERIC(10,4);
BEGIN
  -- 1. Ficha técnica do adicional usando custo_medio
  SELECT COALESCE(SUM(ft.quantidade * COALESCE(ei.custo_medio, 0)), 0), true
  INTO v_custo_ficha, v_has_ficha
  FROM public.fichas_tecnicas ft
  JOIN public.estoque_itens ei ON ei.id = ft.estoque_item_id
  WHERE ft.adicional_id = p_adicional_id;

  IF v_has_ficha AND v_custo_ficha > 0 THEN
    RETURN v_custo_ficha;
  END IF;

  -- 2. Insumo direto de estoque
  SELECT estoque_item_id INTO v_estoque_item_id
  FROM public.adicionais
  WHERE id = p_adicional_id;

  IF v_estoque_item_id IS NOT NULL THEN
    SELECT COALESCE(custo_medio, 0) INTO v_custo_estoque
    FROM public.estoque_itens
    WHERE id = v_estoque_item_id;
    RETURN COALESCE(v_custo_estoque, 0);
  END IF;

  RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Vincular fornecedor padrão também aos produtos para produtos revendidos (D02 / CA06)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS fornecedor_padrao_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor_padrao ON public.produtos(fornecedor_padrao_id) WHERE fornecedor_padrao_id IS NOT NULL;

-- 4. Chave de margem mínima configurável para fichas técnicas (RF06 / CA07)
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('ficha_margem_minima_percentual', '50.00'::jsonb, 'Margem mínima de lucro esperada para fichas técnicas (%)')
ON CONFLICT (chave) DO NOTHING;
