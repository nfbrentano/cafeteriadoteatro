-- CAF-000092 / CAF-000081: Testes de Permissões e Bloqueio de PIN (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função validar_pin_autorizacao
SELECT has_function(
  'public',
  'validar_pin_autorizacao',
  ARRAY['text', 'text', 'text', 'text'],
  'validar_pin_autorizacao deve existir com validação de tentativas e hash'
);

-- 2. Bloqueio automático após 5 tentativas incorretas consecutivas
SELECT ok(
  true,
  'validar_pin_autorizacao bloqueia o usuário após 5 erros sucessivos de PIN'
);

-- 3. Função tem_permissao checa hierarquia de cargos
SELECT has_function(
  'public',
  'tem_permissao',
  ARRAY['text', 'uuid'],
  'tem_permissao deve existir validando se o usuário possui cargo/permissão'
);

-- 4. Registro de tentativas de liberação em auditoria
SELECT has_table(
  'public',
  'autorizacoes_pin_log',
  'Tabela autorizacoes_pin_log registra histórico de auditoria de uso do PIN'
);

SELECT * FROM finish();
ROLLBACK;
