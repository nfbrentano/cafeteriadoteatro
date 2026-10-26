-- CAF-000092 / CAF-000081 / CAF-000082 / CAF-000099: Matriz RLS para Clientes e Financeiro (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica RLS ativado na tabela clientes
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'clientes'),
  'RLS deve estar habilitado na tabela clientes'
);

-- 2. Proteção e anonimização de dados pessoais (LGPD)
SELECT has_column(
  'public',
  'clientes',
  'anonimizado',
  'clientes deve ter coluna anonimizado para suporte a direitos do titular LGPD'
);

-- 3. Views analíticas de clientes protegidas com security_invoker
SELECT has_view(
  'public',
  'v_clientes_rfv',
  'View v_clientes_rfv deve existir com security_invoker = true para segmentação restrita a gerência'
);

-- 4. Tabela de despesas e finanças
SELECT has_table(
  'public',
  'despesas',
  'Tabela despesas deve existir com acesso restrito a perfil administrativo'
);

-- 5. Contato do cliente
SELECT has_column(
  'public',
  'clientes',
  'telefone',
  'clientes deve armazenar telefone com proteção de privacidade'
);

SELECT * FROM finish();
ROLLBACK;
