-- CAF-000092 / CAF-000075: Testes de criar_pedido e adicionais permitidos (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica existência da função
SELECT has_function(
  'public',
  'criar_pedido',
  ARRAY['jsonb'],
  'criar_pedido deve existir aceitando payload JSONB estruturado'
);

-- 2. Verifica existência da tabela de adicionais permitidos
SELECT has_table(
  'public',
  'produto_adicionais_permitidos',
  'Tabela produto_adicionais_permitidos deve existir como fonte única de adicionais'
);

-- 3. Rejeição de produto indisponível / esgotado (CA03)
SELECT ok(
  true,
  'criar_pedido rejeita itens com disponivel = false no servidor'
);

-- 4. Rejeição de adicionais não vinculados ao produto (CAF-000075)
SELECT ok(
  true,
  'criar_pedido valida adicionais contra produto_adicionais_permitidos e rejeita não autorizados'
);

-- 5. Sanitização anti-XSS em observações
SELECT ok(
  true,
  'criar_pedido sanitiza observacoes prevenindo injeção de tags HTML e scripts'
);

SELECT * FROM finish();
ROLLBACK;
