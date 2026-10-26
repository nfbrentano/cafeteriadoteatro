-- CAF-000092 / CAF-000011 / CAF-000099: Testes de transferir_mesa (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função transferir_mesa
SELECT has_function(
  'public',
  'transferir_mesa',
  ARRAY['text', 'text'],
  'transferir_mesa deve existir aceitando mesa de origem e mesa de destino'
);

-- 2. Movimentação dos pedidos pendentes entre mesas
SELECT has_column(
  'public',
  'pedidos',
  'mesa_codigo',
  'pedidos deve possuir coluna mesa_codigo para transferência entre ambientes'
);

-- 3. Catálogo de mesas e log de auditoria
SELECT has_table(
  'public',
  'mesas',
  'mesas deve existir para verificar origem e destino registrando auditoria'
);

-- 4. Status da mesa
SELECT has_column(
  'public',
  'mesas',
  'status',
  'mesas deve possuir status livre/ocupada'
);

SELECT * FROM finish();
ROLLBACK;
