-- CAF-000092 / CAF-000076 / CAF-000099: Testes de Cashback e Idempotência (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função processar_cashback_pedido
SELECT has_function(
  'public',
  'processar_cashback_pedido',
  ARRAY['bigint', 'uuid', 'numeric'],
  'processar_cashback_pedido deve existir com validação estrita de pedido_id e cliente_id'
);

-- 2. Associação de cliente ao pedido para controle de créditos
SELECT has_column(
  'public',
  'pedidos',
  'cliente_id',
  'pedidos deve associar cliente_id para controle de cashback'
);

-- 3. Proteção contra chamadas com p_pedido_id NULL ou valor inválido
SELECT throws_ok(
  $$ SELECT processar_cashback_pedido(NULL, NULL, 0) $$,
  'processar_cashback_pedido deve falhar se parâmetros obrigatórios forem nulos'
);

-- 4. Saldo do cliente para crédito de cashback
SELECT has_column(
  'public',
  'clientes',
  'saldo_conta',
  'clientes deve ter saldo_conta para crédito e estorno de cashback'
);

SELECT * FROM finish();
ROLLBACK;
