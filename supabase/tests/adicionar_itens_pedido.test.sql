-- CAF-000092 / CAF-000005 / CAF-000099: Testes de adicionar_itens_pedido (pgTAP)
BEGIN;
SELECT plan(3);

-- 1. Verifica função adicionar_itens_pedido
SELECT has_function(
  'public',
  'adicionar_itens_pedido',
  ARRAY['bigint', 'jsonb'],
  'adicionar_itens_pedido deve existir aceitando pedido_id e lista de itens'
);

-- 2. Coluna status na tabela pedidos para controle de estado
SELECT has_column(
  'public',
  'pedidos',
  'status',
  'tabela pedidos deve ter status para bloqueio em pedidos já concluídos ou cancelados'
);

-- 3. Recálculo automático do total do pedido
SELECT has_column(
  'public',
  'pedidos',
  'total',
  'tabela pedidos deve ter coluna total para recálculo do valor somando novos itens'
);

SELECT * FROM finish();
ROLLBACK;
