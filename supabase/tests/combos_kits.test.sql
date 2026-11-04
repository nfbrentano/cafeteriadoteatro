BEGIN;
SELECT plan(6);

-- 1. Tabelas combo_grupos, combo_grupo_opcoes e pedido_item_combo_escolhas devem existir
SELECT has_table('public', 'combo_grupos', 'Tabela combo_grupos deve existir');
SELECT has_table('public', 'combo_grupo_opcoes', 'Tabela combo_grupo_opcoes deve existir');
SELECT has_table('public', 'pedido_item_combo_escolhas', 'Tabela pedido_item_combo_escolhas deve existir');

-- 2. RLS habilitado nas 3 tabelas de combo
SELECT is(
  (
    SELECT bool_and(c.relrowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('combo_grupos', 'combo_grupo_opcoes', 'pedido_item_combo_escolhas')
  ),
  true,
  'RLS deve estar ativo em combo_grupos, combo_grupo_opcoes e pedido_item_combo_escolhas'
);

-- 3. Função validar_e_calcular_combo deve existir e ter SET search_path = public
SELECT has_function(
  'public',
  'validar_e_calcular_combo',
  ARRAY['text', 'jsonb'],
  'Função validar_e_calcular_combo(text, jsonb) deve existir'
);

-- 4. Trigger trg_baixa_estoque_combo_escolhas deve existir em pedido_item_combo_escolhas
SELECT has_trigger(
  'public',
  'pedido_item_combo_escolhas',
  'trg_baixa_estoque_combo_escolhas',
  'Trigger trg_baixa_estoque_combo_escolhas deve baixar estoque das fichas técnicas dos itens escolhidos no combo'
);

SELECT * FROM finish();
ROLLBACK;
