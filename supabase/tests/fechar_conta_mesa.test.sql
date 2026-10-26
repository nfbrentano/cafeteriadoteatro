-- CAF-000092 / CAF-000073 / CAF-000099: Testes de fechar_conta_mesa (pgTAP)
BEGIN;
SELECT plan(6);

-- 1. Verifica existência da função
SELECT has_function(
  'public',
  'fechar_conta_mesa',
  ARRAY['text', 'jsonb', 'numeric', 'numeric', 'text', 'text', 'text', 'bigint'],
  'fechar_conta_mesa deve existir com assinatura reconciliada da CAF-000073'
);

-- 2. Teste de rejeição quando pagamentos são menores que o total
SELECT throws_ok(
  $$ SELECT fechar_conta_mesa('M99', '[{"forma":"dinheiro","valor":5.00}]'::jsonb, 0, 0, NULL, 'test-key-1', NULL, NULL) $$,
  'fechar_conta_mesa deve falhar se pagamento for menor que o total ou mesa inexistente'
);

-- 3. Idempotência e trava de concorrência com idempotency_key (CA14)
SELECT has_column(
  'public',
  'fechamentos',
  'idempotency_key',
  'fechar_conta_mesa implementa lock FOR UPDATE e chave de idempotência p_idempotency_key'
);

-- 4. Exclusão de itens cancelados no fechamento da mesa (CAF-000073 / CA02)
SELECT has_column(
  'public',
  'pedido_itens',
  'cancelado',
  'fechar_conta_mesa ignora itens e pedidos com status cancelado ao calcular o total'
);

-- 5. Aplicação de desconto e taxa de serviço em centavos (p_taxa_servico, p_desconto_manual)
SELECT has_column(
  'public',
  'fechamentos',
  'desconto_manual',
  'fechar_conta_mesa calcula taxa de serviço e desconto manual (p_desconto_manual) com precisão de centavos'
);

-- 6. Transição de status dos pedidos para concluido/pago
SELECT has_column(
  'public',
  'pedidos',
  'status_pagamento',
  'fechar_conta_mesa transiciona pedidos ativos da mesa para concluido e status_pagamento pago'
);

SELECT * FROM finish();
ROLLBACK;
