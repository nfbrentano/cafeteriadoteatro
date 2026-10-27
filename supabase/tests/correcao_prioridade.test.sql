-- CAF-000104: Teste de Contrato e Estrutura de Prioridade de Pedidos (pgTAP)
BEGIN;
SELECT plan(6);

-- 1. Verifica coluna prioridade em pedidos
SELECT has_column(
  'public',
  'pedidos',
  'prioridade',
  'pedidos deve ter a coluna prioridade'
);

-- 2. Verifica coluna prioridade_motivo em pedidos
SELECT has_column(
  'public',
  'pedidos',
  'prioridade_motivo',
  'pedidos deve ter a coluna prioridade_motivo'
);

-- 3. Verifica índice de ordenação de fila do KDS
SELECT has_index(
  'public',
  'pedidos',
  'idx_pedidos_prioridade_created',
  ARRAY['prioridade', 'created_at'],
  'pedidos deve possuir o índice idx_pedidos_prioridade_created'
);

-- 4. Verifica função alterar_prioridade_pedido
SELECT has_function(
  'public',
  'alterar_prioridade_pedido',
  ARRAY['bigint', 'smallint', 'text'],
  'alterar_prioridade_pedido deve existir com assinatura (bigint, smallint, text)'
);

-- 5. Verifica tipo da coluna prioridade
SELECT col_type_is(
  'public',
  'pedidos',
  'prioridade',
  'smallint',
  'coluna prioridade deve ser do tipo smallint'
);

-- 6. Verifica registro de migration na tabela app_migrations
SELECT ok(
  EXISTS (SELECT 1 FROM public.app_migrations WHERE versao = '104'),
  'migration 104 deve constar em app_migrations'
);

SELECT * FROM finish();
ROLLBACK;

