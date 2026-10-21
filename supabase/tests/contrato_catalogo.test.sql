-- CAF-000092 / CAF-000086: Teste de Contrato do Catálogo Front-End <-> Banco (pgTAP)
BEGIN;
SELECT plan(8);

-- 1. Verifica presença das tabelas essenciais para a operação
SELECT has_table('public', 'pedidos', 'Tabela pedidos deve existir');
SELECT has_table('public', 'pedido_itens', 'Tabela pedido_itens deve existir');
SELECT has_table('public', 'produtos', 'Tabela produtos deve existir');
SELECT has_table('public', 'categorias', 'Tabela categorias deve existir');
SELECT has_table('public', 'fechamentos', 'Tabela fechamentos deve existir');

-- 2. Verifica presença das RPCs essenciais invocadas pelo front-end
SELECT has_function('public', 'fechar_conta_mesa', 'fechar_conta_mesa deve existir');
SELECT has_function('public', 'criar_pedido', 'criar_pedido deve existir');
SELECT has_function('public', 'cancelar_item', 'cancelar_item deve existir');

SELECT * FROM finish();
ROLLBACK;
