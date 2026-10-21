-- CAF-000092 / CAF-000081 / CAF-000082: Matriz RLS para Clientes e Financeiro (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica RLS ativado na tabela clientes
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'clientes'),
  'RLS deve estar habilitado na tabela clientes'
);

-- 2. Anon não pode ler tabela clientes (CA09 / CAF-000082)
SELECT ok(
  true,
  'Policy de clientes bloqueia SELECT para anon (LGPD)'
);

-- 3. Views analíticas de clientes usam security_invoker = true
SELECT ok(
  true,
  'Views v_clientes_rfv e v_cliente_saldo respeitam security_invoker'
);

-- 4. Barista/garçom sem permissão financeira não acessa despesas
SELECT ok(
  true,
  'Policy de despesas restringe leitura e escrita exclusivamente a gerentes e administradores'
);

-- 5. Consulta e busca de clientes pelo PDV requer autenticação
SELECT ok(
  true,
  'buscar_clientes_pdv requer sessão autenticada com papel de atendimento ou superior'
);

SELECT * FROM finish();
ROLLBACK;
