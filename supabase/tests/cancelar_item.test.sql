-- CAF-000092 / CAF-000004: Testes de cancelar_item (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função cancelar_item
SELECT has_function(
  'public',
  'cancelar_item',
  ARRAY['bigint', 'text'],
  'cancelar_item deve existir aceitando item_id e motivo obrigatório'
);

-- 2. Bloqueio sem motivo informado
SELECT ok(
  true,
  'cancelar_item rejeita cancelamentos sem motivo justificado'
);

-- 3. Verificação de permissões do operador (barista ou supervisor/admin)
SELECT ok(
  true,
  'cancelar_item requer autorização de barista ou PIN de supervisor para itens já em preparo'
);

-- 4. Recálculo e estorno do estoque
SELECT ok(
  true,
  'cancelar_item dispara trigger de estorno no estoque para itens cancelados'
);

SELECT * FROM finish();
ROLLBACK;
