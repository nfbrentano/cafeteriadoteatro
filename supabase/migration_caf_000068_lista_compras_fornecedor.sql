-- Migration CAF-000068: Lista de Compras por Fornecedor e Entrada de Estoque Integrada ao Contas a Pagar

-- 1. Vincular fornecedor padrão aos itens de estoque
ALTER TABLE public.estoque_itens
  ADD COLUMN IF NOT EXISTS fornecedor_padrao_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_itens_fornecedor ON public.estoque_itens(fornecedor_padrao_id);

-- 2. Vincular fornecedor e conta a pagar às movimentações de estoque
ALTER TABLE public.estoque_movimentos
  ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS despesa_id BIGINT REFERENCES public.despesas(id) ON DELETE SET NULL;

-- 3. Assegurar categoria de insumos para compras no Contas a Pagar
INSERT INTO public.despesa_categorias (nome, tipo)
VALUES ('Insumos e Mercadorias', 'variavel')
ON CONFLICT (nome) DO NOTHING;
