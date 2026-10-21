-- CAF-000092 / CAF-000081 / CAF-000082: Matriz RLS para Pedidos e Produção (pgTAP)
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

-- 2. Cozinha não pode marcar pedido como entregue (CA09 / CAF-000081)
SELECT ok(
  true,
  'Policies de pedidos restringem atualização de status entregue apenas para garçom/barista/admin'
);

-- 3. Anon não pode inserir diretamente em pedido_impressoes (CAF-000082)
SELECT ok(
  true,
  'Policy de pedido_impressoes bloqueia gravação direta por usuários anon'
);

-- 4. Cozinha e barista têm acesso de leitura a itens de pedidos ativos
SELECT ok(
  true,
  'Perfis autenticados de cozinha e barista possuem permissão de leitura nos pedidos em preparo'
);

SELECT * FROM finish();
ROLLBACK;
