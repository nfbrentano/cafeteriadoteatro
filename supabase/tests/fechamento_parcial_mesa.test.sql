-- CAF-000112: Testes de Fechamento Parcial de Mesa e Pagamento por Item (pgTAP)
BEGIN;
SELECT plan(8);

-- 1. Verifica existência de registrar_pagamento_parcial_mesa
SELECT has_function(
  'public',
  'registrar_pagamento_parcial_mesa',
  ARRAY['text', 'jsonb', 'jsonb', 'numeric', 'numeric', 'text'],
  'registrar_pagamento_parcial_mesa deve existir com assinatura completa de CAF-000112'
);

-- 2. Verifica existência de obter_resumo_conta_mesa
SELECT has_function(
  'public',
  'obter_resumo_conta_mesa',
  ARRAY['text'],
  'obter_resumo_conta_mesa deve existir para consulta dinâmica do saldo da mesa'
);

-- 3. Verifica coluna quantidade_paga em pedido_itens
SELECT has_column(
  'public',
  'pedido_itens',
  'quantidade_paga',
  'pedido_itens deve conter a coluna quantidade_paga para controle por item'
);

-- 4. Verifica coluna parcial em fechamentos
SELECT has_column(
  'public',
  'fechamentos',
  'parcial',
  'fechamentos deve conter a coluna parcial'
);

-- 5. Verifica existência da tabela fechamento_itens
SELECT has_table(
  'public',
  'fechamento_itens',
  'tabela fechamento_itens deve existir para auditoria de itens quitados'
);

-- 6. Verifica colunas da tabela fechamento_itens
SELECT columns_are(
  'public',
  'fechamento_itens',
  ARRAY['id', 'fechamento_id', 'pedido_item_id', 'quantidade', 'valor_unitario', 'subtotal', 'created_at'],
  'fechamento_itens deve conter todas as colunas de auditoria de item'
);

-- 7. Teste de rejeição quando tenta pagar mesa inexistente ou sem pedidos abertos
SELECT throws_ok(
  $$ SELECT registrar_pagamento_parcial_mesa('MESA_INEXISTENTE_999', '[{"forma":"pix","valor":10.00}]'::jsonb, '[]'::jsonb, 10.00, 0, 'test-key-parcial-1') $$,
  'registrar_pagamento_parcial_mesa deve falhar para mesa sem pedidos abertos'
);

-- 8. Verifica se migration 112 está registrada em app_migrations
SELECT ok(
  EXISTS (SELECT 1 FROM public.app_migrations WHERE versao = '112'),
  'Migration 112 deve estar registrada em app_migrations'
);

SELECT * FROM finish();
ROLLBACK;

