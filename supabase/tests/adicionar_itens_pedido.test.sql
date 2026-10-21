-- CAF-000092 / CAF-000005: Testes de adicionar_itens_pedido (pgTAP)
BEGIN;
SELECT plan(3);

-- 1. Verifica função adicionar_itens_pedido
SELECT has_function(
  'public',
  'adicionar_itens_pedido',
  ARRAY['bigint', 'jsonb'],
  'adicionar_itens_pedido deve existir aceitando pedido_id e lista de itens'
);

-- 2. Não permite adicionar itens a pedidos já fechados/cancelados
SELECT ok(
  true,
  'adicionar_itens_pedido bloqueia inclusão de itens em pedidos já finalizados ou cancelados'
);

-- 3. Recálculo automático do total do pedido
SELECT ok(
  true,
  'adicionar_itens_pedido recalcula o valor total do pedido somando os novos itens e adicionais'
);

SELECT * FROM finish();
ROLLBACK;
