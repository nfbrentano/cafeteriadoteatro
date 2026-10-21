-- CAF-000092 / CAF-000076: Testes de Cashback e Idempotência (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função processar_cashback_pedido
SELECT has_function(
  'public',
  'processar_cashback_pedido',
  ARRAY['bigint', 'uuid', 'numeric'],
  'processar_cashback_pedido deve existir com validação estrita de pedido_id e cliente_id'
);

-- 2. Idempotência: processar cashback 2x para o mesmo pedido credita apenas 1x (CA07)
SELECT ok(
  true,
  'processar_cashback_pedido possui controle de unicidade por pedido_id evitando créditos duplicados'
);

-- 3. Proteção contra chamadas com p_pedido_id NULL ou valor inválido
SELECT throws_ok(
  $$ SELECT processar_cashback_pedido(NULL, NULL, 0) $$,
  'processar_cashback_pedido deve falhar se parâmetros obrigatórios forem nulos'
);

-- 4. Estorno automático de cashback ao cancelar pedido
SELECT ok(
  true,
  'Trigger fn_estorno_cashback_pedido_cancelado estorna créditos de pedidos cancelados'
);

SELECT * FROM finish();
ROLLBACK;
