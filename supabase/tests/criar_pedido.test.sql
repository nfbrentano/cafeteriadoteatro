-- CAF-000092 / CAF-000075 / CAF-000099: Testes de criar_pedido e adicionais permitidos (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica existência da função
SELECT has_function(
  'public',
  'criar_pedido',
  ARRAY['jsonb'],
  'criar_pedido deve existir aceitando payload JSONB estruturado'
);

-- 2. Verifica existência da relação de adicionais permitidos
SELECT has_table(
  'public',
  'produto_adicionais_permitidos',
  'produto_adicionais_permitidos deve existir como fonte de validação de adicionais'
);

-- 3. Validação de disponibilidade de produtos
SELECT has_column(
  'public',
  'produtos',
  'disponivel',
  'produtos deve ter coluna disponivel para controle de estoque/esgotamento'
);

-- 4. Observações sanitizadas
SELECT has_column(
  'public',
  'pedidos',
  'observacoes',
  'pedidos deve ter coluna observacoes'
);

-- 5. Total do pedido
SELECT has_column(
  'public',
  'pedidos',
  'total',
  'pedidos deve ter coluna total calculada'
);

SELECT * FROM finish();
ROLLBACK;
