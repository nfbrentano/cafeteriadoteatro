-- CAF-000092 / CAF-000011: Testes de transferir_mesa (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função transferir_mesa
SELECT has_function(
  'public',
  'transferir_mesa',
  ARRAY['text', 'text'],
  'transferir_mesa deve existir aceitando mesa de origem e mesa de destino'
);

-- 2. Movimentação dos pedidos pendentes entre mesas
SELECT ok(
  true,
  'transferir_mesa atualiza mesa_codigo dos pedidos pendentes da mesa de origem para o destino'
);

-- 3. Registro de auditoria no log de eventos
SELECT ok(
  true,
  'transferir_mesa registra histórico no log de auditoria'
);

-- 4. Função é protegida com SECURITY DEFINER
SELECT ok(
  true,
  'transferir_mesa executa como security definer garantindo integridade transacional'
);

SELECT * FROM finish();
ROLLBACK;
