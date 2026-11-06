-- CAF-000113: Testes de DRE Gerencial, Conciliação de Recebíveis e Metas de Venda (pgTAP)
BEGIN;
SELECT plan(8);

-- 1. Verifica existência de obter_dre_gerencial
SELECT has_function(
  'public',
  'obter_dre_gerencial',
  ARRAY['date', 'date', 'text'],
  'obter_dre_gerencial deve existir com assinatura completa (p_inicio, p_fim, p_regime)'
);

-- 2. Verifica existência de obter_previsao_recebiveis
SELECT has_function(
  'public',
  'obter_previsao_recebiveis',
  ARRAY['date', 'integer'],
  'obter_previsao_recebiveis deve existir com assinatura (p_data_inicio, p_dias_futuros)'
);

-- 3. Verifica existência de obter_meta_progresso_dia
SELECT has_function(
  'public',
  'obter_meta_progresso_dia',
  ARRAY[]::text[],
  'obter_meta_progresso_dia deve existir sem parâmetros obrigatórios'
);

-- 4. Verifica existência da configuração meta_faturamento_dia_normal
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.configuracoes_sistema
    WHERE chave = 'meta_faturamento_dia_normal'
  ),
  'configuracao meta_faturamento_dia_normal deve existir em configuracoes_sistema'
);

-- 5. Verifica existência da configuração meta_faturamento_dia_espetaculo
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.configuracoes_sistema
    WHERE chave = 'meta_faturamento_dia_espetaculo'
  ),
  'configuracao meta_faturamento_dia_espetaculo deve existir em configuracoes_sistema'
);

-- 6. Verifica registro da migration 113 em app_migrations
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.app_migrations
    WHERE versao = '113'
  ),
  'Migration 113 deve estar registrada em public.app_migrations'
);

-- 7. Executa obter_meta_progresso_dia e valida retorno
SELECT isnt_empty(
  'SELECT public.obter_meta_progresso_dia()',
  'obter_meta_progresso_dia deve executar com sucesso e retornar json com dados do dia'
);

-- 8. Verifica bloqueio de obter_dre_gerencial sem permissão de admin
SELECT throws_ok(
  'SELECT public.obter_dre_gerencial(CURRENT_DATE, CURRENT_DATE, ''caixa'')',
  'P0001',
  '%Acesso negado: permissão admin.financeiro necessária%',
  'obter_dre_gerencial deve barrar chamadas sem role admin ou permissão admin.financeiro'
);

SELECT * FROM finish();
ROLLBACK;

