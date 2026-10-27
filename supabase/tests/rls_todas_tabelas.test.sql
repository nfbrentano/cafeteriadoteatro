-- rls_todas_tabelas.test.sql — CAF-000106: Teste de Segurança RLS em 100% das Tabelas Públicas (pgTAP)
BEGIN;
SELECT plan(10);

-- 1. Verifica RLS ativado na tabela cardapio_eventos_diarios
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'cardapio_eventos_diarios'),
  'RLS deve estar habilitado na tabela cardapio_eventos_diarios'
);

-- 2. Verifica RLS ativado na tabela cortesia_regras
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'cortesia_regras'),
  'RLS deve estar habilitado na tabela cortesia_regras'
);

-- 3. Verifica RLS ativado na tabela promocoes
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'promocoes'),
  'RLS deve estar habilitado na tabela promocoes'
);

-- 4. Verifica RLS ativado na tabela promocao_itens
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'promocao_itens'),
  'RLS deve estar habilitado na tabela promocao_itens'
);

-- 5. Verifica RLS ativado na tabela pedido_impressoes
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'pedido_impressoes'),
  'RLS deve estar habilitado na tabela pedido_impressoes'
);

-- 6. Verifica RLS ativado na tabela pedido_item_sabores
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'pedido_item_sabores'),
  'RLS deve estar habilitado na tabela pedido_item_sabores'
);

-- 7. CA06: Nenhuma tabela no schema public pode ter rowsecurity = false
SELECT is(
  (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false),
  0,
  'Zero tabelas no schema public com RLS desabilitado'
);

-- 8. Verifica existência de policies de leitura ativa para promocoes
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'promocoes' 
      AND policyname = 'promocoes_select_ativo'
  ),
  'Deve existir a policy promocoes_select_ativo na tabela promocoes'
);

-- 9. Verifica existência de policy restritiva para pedido_impressoes
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'pedido_impressoes' 
      AND policyname = 'pedido_impressoes_select_staff'
  ),
  'Deve existir a policy pedido_impressoes_select_staff na tabela pedido_impressoes'
);

-- 10. Verifica registro da migration 106 em app_migrations
SELECT ok(
  EXISTS (SELECT 1 FROM public.app_migrations WHERE versao = '106'),
  'Migration 106 deve estar registrada em app_migrations'
);

SELECT * FROM finish();
ROLLBACK;
