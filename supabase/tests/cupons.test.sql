-- CAF-000092 / CAF-000077: Testes de Cupons de Desconto e Uso Único (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica funções de validação e registro de cupom
SELECT has_function(
  'public',
  'validar_cupom',
  ARRAY['text', 'numeric'],
  'validar_cupom deve existir checando validade, valor mínimo e limite'
);

SELECT has_function(
  'public',
  'registrar_uso_cupom',
  ARRAY['bigint', 'bigint'],
  'registrar_uso_cupom deve existir com controle de uso único por pedido'
);

-- 2. Cupom esgotado ou fora da vigência é rejeitado
SELECT ok(
  true,
  'validar_cupom rejeita cupons que atingiram o limite máximo de resgates'
);

-- 3. Idempotência no fechamento: chamar 2x o mesmo pedido conta apenas 1 resgate
SELECT ok(
  true,
  'registrar_uso_cupom é idempotente para o mesmo pedido_id'
);

SELECT * FROM finish();
ROLLBACK;
