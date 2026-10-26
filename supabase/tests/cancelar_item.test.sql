-- CAF-000092 / CAF-000004 / CAF-000099: Testes de cancelar_item (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função cancelar_item
SELECT has_function(
  'public',
  'cancelar_item',
  ARRAY['bigint', 'text'],
  'cancelar_item deve existir aceitando item_id e motivo obrigatório'
);

-- 2. Rastreamento de motivo de cancelamento
SELECT has_column(
  'public',
  'pedido_itens',
  'motivo_cancelamento',
  'pedido_itens deve conter coluna motivo_cancelamento para justificar ação'
);

-- 3. Verificação de operador que executou o cancelamento
SELECT has_column(
  'public',
  'pedido_itens',
  'cancelado_por',
  'pedido_itens deve registrar cancelado_por para auditoria de supervisor/barista'
);

-- 4. Flag de cancelamento do item
SELECT has_column(
  'public',
  'pedido_itens',
  'cancelado',
  'pedido_itens deve possuir coluna booleana cancelado para estorno e controle'
);

SELECT * FROM finish();
ROLLBACK;
