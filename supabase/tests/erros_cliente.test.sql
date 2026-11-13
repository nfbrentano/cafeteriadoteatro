-- Testes pgTAP para CAF-000115: tabela erros_cliente, RLS e RPCs de observabilidade
BEGIN;

SELECT plan(13);

-- 1. Existência da tabela
SELECT has_table('public', 'erros_cliente', 'Tabela public.erros_cliente deve existir');

-- 2. RLS habilitado
SELECT ok(
  (
    SELECT c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'erros_cliente'
  ),
  'RLS deve estar habilitado em public.erros_cliente'
);

-- 3. Policy SELECT exclusiva para admin
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'erros_cliente'
      AND policyname = 'erros_cliente_select_admin'
  ),
  'Policy erros_cliente_select_admin deve existir em pg_policies'
);

-- 4. Bloqueio de DML/SELECT direto para anon
SELECT is(
  has_table_privilege('anon', 'public.erros_cliente', 'SELECT'),
  false,
  'anon não deve ter privilégio SELECT direto em public.erros_cliente'
);

SELECT is(
  has_table_privilege('anon', 'public.erros_cliente', 'INSERT'),
  false,
  'anon não deve ter privilégio INSERT direto em public.erros_cliente'
);

-- 5. Existência das 3 RPCs
SELECT has_function(
  'public',
  'registrar_erro_cliente',
  ARRAY['text', 'text', 'text', 'text', 'text', 'text', 'text', 'jsonb'],
  'RPC registrar_erro_cliente deve existir'
);

SELECT has_function(
  'public',
  'obter_resumo_erros_cliente',
  ARRAY['integer', 'text'],
  'RPC obter_resumo_erros_cliente deve existir'
);

SELECT has_function(
  'public',
  'limpar_erros_antigos',
  ARRAY['integer'],
  'RPC limpar_erros_antigos deve existir'
);

-- 6. Revogação de EXECUTE de anon nas RPCs administrativas
SELECT is(
  has_function_privilege('anon', 'public.obter_resumo_erros_cliente(integer, text)', 'EXECUTE'),
  false,
  'anon não deve ter EXECUTE em public.obter_resumo_erros_cliente'
);

SELECT is(
  has_function_privilege('anon', 'public.limpar_erros_antigos(integer)', 'EXECUTE'),
  false,
  'anon não deve ter EXECUTE em public.limpar_erros_antigos'
);

-- 7. Guarda de role admin (P0001) quando executado sem perfil admin
SELECT throws_ok(
  $$ SELECT public.obter_resumo_erros_cliente(24, NULL) $$,
  'P0001',
  NULL,
  'obter_resumo_erros_cliente deve rejeitar chamadas sem role admin'
);

SELECT throws_ok(
  $$ SELECT public.limpar_erros_antigos(30) $$,
  'P0001',
  NULL,
  'limpar_erros_antigos deve rejeitar chamadas sem role admin'
);

-- 8. Registro da migration 115 no histórico
SELECT ok(
  EXISTS (SELECT 1 FROM public.app_migrations WHERE versao = '115'),
  'Migration 115 deve estar registrada em public.app_migrations'
);

SELECT * FROM finish();
ROLLBACK;
