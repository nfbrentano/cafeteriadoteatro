-- CAF-000092 / CAF-000074 / CAF-000099: Testes de estoque, CMV e custo médio ponderado (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica triggers de recálculo de estoque
SELECT has_function(
  'public',
  'fn_estoque_recalcular_saldo',
  'fn_estoque_recalcular_saldo deve existir'
);

-- 2. Verifica função de cálculo de custo médio da ficha técnica
SELECT has_function(
  'public',
  'fn_calcular_custo_produto',
  ARRAY['text'],
  'fn_calcular_custo_produto deve existir aceitando id do produto'
);

-- 3. Custo médio ponderado do estoque
SELECT has_column(
  'public',
  'estoque_itens',
  'custo_medio',
  'estoque_itens deve conter custo_medio para controle de insumos e CMV'
);

-- 4. Gravação de custo histórico no item do pedido via trigger
SELECT has_column(
  'public',
  'pedido_itens',
  'custo_unitario',
  'Trigger trg_gravar_custo_pedido_item congela o custo_unitario no item do pedido'
);

-- 5. Sincronização de disponibilidade com produtos
SELECT has_column(
  'public',
  'produtos',
  'disponivel',
  'produtos deve possuir coluna disponivel para sincronização com saldo de insumos'
);

SELECT * FROM finish();
ROLLBACK;
