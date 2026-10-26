-- CAF-000092 / CAF-000081 / CAF-000082 / CAF-000099: Matriz RLS para Pedidos e Produção (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica RLS ativado nas tabelas principais
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'pedidos'),
  'RLS deve estar habilitado na tabela pedidos'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'pedido_itens'),
  'RLS deve estar habilitado na tabela pedido_itens'
);

-- 2. Transições de status em pedidos (restringe marcação como entregue)
SELECT has_column(
  'public',
  'pedidos',
  'status',
  'pedidos deve possuir coluna status para validação de ciclo de vida operacional e transição entregue'
);

-- 3. Trava de impressão segura
SELECT has_table(
  'public',
  'pedido_impressoes',
  'Tabela pedido_impressoes deve existir para travar comandas impressas'
);

-- 4. Status de conclusão de item na cozinha
SELECT has_column(
  'public',
  'pedido_itens',
  'pronto_em',
  'pedido_itens deve registrar pronto_em para controle do KDS'
);

SELECT * FROM finish();
ROLLBACK;
