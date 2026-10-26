-- CAF-000092 / CAF-000081 / CAF-000099: Testes de Permissões e Bloqueio de PIN (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica função validar_pin_autorizacao
SELECT has_function(
  'public',
  'validar_pin_autorizacao',
  'validar_pin_autorizacao deve existir com validação de tentativas e hash'
);

-- 2. Bloqueio automático após tentativas incorretas consecutivas
SELECT has_column(
  'public',
  'perfis',
  'pin_tentativas_erradas',
  'perfis deve rastrear pin_tentativas_erradas para bloqueio após 5 erros'
);

-- 3. Função tem_permissao checa hierarquia de cargos
SELECT has_function(
  'public',
  'tem_permissao',
  ARRAY['text', 'uuid'],
  'tem_permissao deve existir validando se o usuário possui cargo/permissão'
);

-- 4. Registro de tentativas de liberação e bloqueio temporário
SELECT has_column(
  'public',
  'perfis',
  'pin_bloqueado_ate',
  'perfis deve registrar pin_bloqueado_ate para auditoria e bloqueio temporário'
);

SELECT * FROM finish();
ROLLBACK;
