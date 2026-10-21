-- Diagnóstico do schema de produção (SOMENTE LEITURA: apenas SELECT no catálogo).
-- Rodar no Supabase > SQL Editor e exportar o resultado (CSV) para comparar com as migrations.
WITH fn AS (
  SELECT p.oid, p.proname,
         pg_get_function_identity_arguments(p.oid) AS args,
         p.prosecdef, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.proname IN ('fechar_conta_mesa','criar_pedido','adicionar_itens_pedido','processar_cashback_pedido',
      'registrar_uso_cupom','fn_calcular_custo_produto','fn_calcular_custo_adicional','cancelar_item',
      'transferir_mesa','validar_pin_autorizacao','fn_calcular_totais_caixa_interno','lancar_movimento_conta',
      'registrar_impressao','criar_pedido_cliente','criar_pedido_online','criar_pedido_totem','get_user_role','tem_permissao')
)
-- 1. Assinaturas das RPCs, SECURITY DEFINER e se anon pode executar
SELECT '1_funcao' AS secao, proname AS item,
       format('(%s) | definer=%s | anon_exec=%s', args, prosecdef,
              has_function_privilege('anon', oid, 'EXECUTE')) AS detalhe
FROM fn
UNION ALL
-- 2. Dependências no corpo das funções (colunas/tabelas divergentes)
SELECT '2_corpo', proname, t.termo || ' = ' || (position(t.termo IN def) > 0)
FROM fn CROSS JOIN (VALUES ('custo_unitario_medio'),('custo_medio'),('v_adicionais_produto'),
  ('produto_adicionais_permitidos'),('p_desconto_manual'),('p_subtotal'),('FOR UPDATE'),('taxa'),
  ('business_hours'),('cancelado')) t(termo)
WHERE position(t.termo IN def) > 0
UNION ALL
-- 3. Colunas das tabelas envolvidas nas divergências
SELECT '3_coluna', table_name, string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('estoque_itens','estoque_movimentos','despesas','fechamentos',
  'produto_adicionais_permitidos','fichas_tecnicas','pedidos','pedido_itens','clientes','campanhas','perfis')
GROUP BY table_name
UNION ALL
-- 4. Como produto_adicionais_permitidos foi criada (tabela ou view)
SELECT '4_relacao', c.relname, c.relkind::text || CASE WHEN c.relkind = 'v'
  THEN ' | ' || left(pg_get_viewdef(c.oid), 300) ELSE '' END
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('produto_adicionais_permitidos','v_adicionais_produto')
UNION ALL
-- 5. Triggers nas tabelas críticas
SELECT '5_trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('pedidos','pedido_itens','estoque_movimentos','estoque_itens','despesas')
UNION ALL
-- 6. CHECK constraints (ex.: despesas.recorrencia)
SELECT '6_check', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'c' AND conrelid::regclass::text IN ('despesas','estoque_movimentos','pedidos','campanhas')
UNION ALL
-- 7. Views com dados pessoais: security_invoker ligado?
SELECT '7_view', c.relname, 'security_invoker=' || coalesce(
  (SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), 'false')
  || ' | anon_select=' || has_table_privilege('anon', c.oid, 'SELECT')
  || ' | auth_select=' || has_table_privilege('authenticated', c.oid, 'SELECT')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
UNION ALL
-- 8. Policies de escrita abertas (anon/public ou WITH CHECK true)
SELECT '8_policy', tablename || '.' || policyname,
       cmd || ' | roles=' || roles::text || ' | using=' || coalesce(qual, '-') || ' | check=' || coalesce(with_check, '-')
FROM pg_policies
WHERE schemaname = 'public' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  AND (roles && ARRAY['anon','public']::name[] OR with_check = 'true' OR qual = 'true')
UNION ALL
-- 9. Fuso do servidor (impacta timezone('America/Sao_Paulo', now()) em timestamptz)
SELECT '9_config', 'timezone', current_setting('TimeZone')
UNION ALL
SELECT '9_config', 'postgres_version', version()
ORDER BY 1, 2;
