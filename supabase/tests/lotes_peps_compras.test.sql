BEGIN;
SELECT plan(8);

-- 1. Tabela estoque_lotes deve existir
SELECT has_table('public', 'estoque_lotes', 'Tabela estoque_lotes deve existir');

-- 2. Colunas principais de estoque_lotes
SELECT columns_are(
  'public',
  'estoque_lotes',
  ARRAY[
    'id',
    'item_id',
    'lote_codigo',
    'data_validade',
    'quantidade_inicial',
    'quantidade_restante',
    'custo_unitario',
    'movimento_entrada_id',
    'ativo',
    'created_at',
    'updated_at'
  ],
  'Tabela estoque_lotes deve possuir todas as colunas necessárias'
);

-- 3. RLS habilitado em estoque_lotes
SELECT is(
  (
    SELECT c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'estoque_lotes'
  ),
  true,
  'RLS deve estar ativo na tabela estoque_lotes'
);

-- 4. Colunas lote_id e lote_codigo em estoque_movimentos
SELECT has_column('public', 'estoque_movimentos', 'lote_id', 'Coluna lote_id deve existir em estoque_movimentos');
SELECT has_column('public', 'estoque_movimentos', 'lote_codigo', 'Coluna lote_codigo deve existir em estoque_movimentos');

-- 5. Função dar_baixa_lote_vencido deve existir
SELECT has_function(
  'public',
  'dar_baixa_lote_vencido',
  ARRAY['bigint', 'text'],
  'Função dar_baixa_lote_vencido(bigint, text) deve existir'
);

-- 6. Função obter_consumo_estoque_30d deve existir
SELECT has_function(
  'public',
  'obter_consumo_estoque_30d',
  ARRAY[]::text[],
  'Função obter_consumo_estoque_30d() deve existir'
);

-- 7. Trigger de abatimento PEPS deve existir em estoque_movimentos
SELECT has_trigger(
  'public',
  'estoque_movimentos',
  'trg_estoque_abater_lotes_peps',
  'Trigger trg_estoque_abater_lotes_peps deve existir em estoque_movimentos'
);

SELECT * FROM finish();
ROLLBACK;
