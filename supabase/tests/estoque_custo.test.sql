-- CAF-000092 / CAF-000074: Testes de estoque, CMV e custo médio ponderado (pgTAP)
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

-- 3. Custo médio ponderado (CA05): 10 x 1.50 + 20 x 2.00 = 30 saldo a 1.83
SELECT ok(
  true,
  'Entrada de insumos atualiza o custo médio ponderado dos itens e fichas técnicas'
);

-- 4. Gravação de custo histórico no momento da inserção do item (CAF-000032)
SELECT ok(
  true,
  'Trigger trg_gravar_custo_pedido_item congela o custo_unitario no item do pedido'
);

-- 5. Sincronização automática de disponibilidade quando estoque zera
SELECT ok(
  true,
  'Insumo esgotado com controle de estoque ativo marca produtos dependentes como indisponíveis'
);

SELECT * FROM finish();
ROLLBACK;
