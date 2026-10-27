-- CAF-000103: Teste pgTAP para configuração de animação de fundo do Totem e RPC validar_sessao_totem
BEGIN;
SELECT plan(3);

-- 1. Verifica existência da função validar_sessao_totem
SELECT has_function(
  'public',
  'validar_sessao_totem',
  ARRAY['text'],
  'validar_sessao_totem deve existir com parâmetro token texto'
);

-- 2. Verifica existência da chave de configuração totem_animacao_fundo
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.configuracoes_sistema
    WHERE chave = 'totem_animacao_fundo'
  ),
  'configuracao totem_animacao_fundo deve existir em configuracoes_sistema'
);

-- 3. Testa resposta de token nulo ou inválido
SELECT is(
  (public.validar_sessao_totem('token_invalido_teste_1234567890'))::jsonb->>'valido',
  'false',
  'validar_sessao_totem deve rejeitar token inexistente'
);

SELECT * FROM finish();
ROLLBACK;

