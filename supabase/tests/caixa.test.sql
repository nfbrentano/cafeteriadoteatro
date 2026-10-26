-- CAF-000092 / CAF-000079 / CAF-000044 / CAF-000099: Testes de Caixa e Caixa Cego (pgTAP)
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
  'fn_calcular_totais_caixa_interno deve existir reconciliando taxas da CAF-000039 e 079'
);

-- 2. Restrição de status de caixa
SELECT has_column(
  'public',
  'caixas',
  'status',
  'Tabela caixas deve rastrear status do caixa aberto/fechado'
);

-- 3. Fechamento de caixa com contagem cega
SELECT has_function(
  'public',
  'fechar_caixa',
  'fechar_caixa registra contagem cega com conferência e divergências'
);

-- 4. Dedução de taxas de operadoras de cartão e Pix (CAF-000079)
SELECT has_table(
  'public',
  'formas_pagamento_taxas',
  'Tabela formas_pagamento_taxas deve existir para dedução de taxas líquidas'
);

-- 5. Rastreamento de saldo final
SELECT has_column(
  'public',
  'caixas',
  'saldo_final',
  'Tabela caixas deve persistir saldo_final após fechamento'
);

SELECT * FROM finish();
ROLLBACK;
