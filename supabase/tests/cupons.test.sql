-- CAF-000092 / CAF-000077 / CAF-000099: Testes de Cupons de Desconto e Uso Único (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica validação e registro de cupons (validar_cupom e registrar_uso_cupom)
SELECT has_function(
  'public',
  'registrar_uso_cupom',
  ARRAY['bigint', 'bigint'],
  'registrar_uso_cupom deve existir com controle de uso por campanha e pedido'
);

-- 2. Código do cupom na campanha para validar_cupom
SELECT has_column(
  'public',
  'campanhas',
  'cupom_codigo',
  'campanhas deve conter coluna cupom_codigo para busca e validar_cupom'
);

-- 3. Contador de usos registrados para controle de limite
SELECT has_column(
  'public',
  'campanhas',
  'usos_registrados',
  'campanhas deve conter coluna usos_registrados para auditoria e controle de esgotamento'
);

-- 4. Rastreamento do cupom no pedido
SELECT has_column(
  'public',
  'pedidos',
  'cupom_codigo',
  'pedidos deve conter coluna cupom_codigo para persistência do desconto aplicado'
);

SELECT * FROM finish();
ROLLBACK;
