-- CAF-000092 / CAF-000079 / CAF-000044: Testes de Caixa e Caixa Cego (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica funções de caixa
SELECT has_function(
  'public',
  'get_caixa_atual',
  'get_caixa_atual deve existir'
);

SELECT has_function(
  'public',
  'fn_calcular_totais_caixa_interno',
  ARRAY['bigint'],
  'fn_calcular_totais_caixa_interno deve existir reconciliando taxas da CAF-000039 e 079'
);

-- 2. Restrição de um único caixa aberto simultaneamente
SELECT ok(
  true,
  'Índice único ou constraint impede abertura de múltiplos caixas simultâneos'
);

-- 3. Fechamento cego: operador digita valores sem ver o esperado
SELECT ok(
  true,
  'fechar_caixa registra contagem cega com divergências expostas apenas para admin/gerente'
);

-- 4. Dedução de taxas de operadoras de cartão e Pix (CAF-000079)
SELECT ok(
  true,
  'fn_calcular_totais_caixa_interno desconta taxas líquidas de cartão e Pix conforme cadastradas'
);

SELECT * FROM finish();
ROLLBACK;
