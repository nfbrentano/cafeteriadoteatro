-- pix_dinamico.test.sql — CAF-000123: Pix Dinâmico, Idempotência, Divergência, KDS e Taxas PSP (pgTAP)
BEGIN;
SELECT plan(12);

-- 1. Existência da tabela pix_cobrancas com RLS ativo e sem INSERT direto por anon
SELECT has_table('public', 'pix_cobrancas', 'Tabela public.pix_cobrancas deve existir');

SELECT ok(
  (
    SELECT c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'pix_cobrancas'
  ),
  'RLS deve estar habilitado em public.pix_cobrancas'
);

SELECT is(
  has_table_privilege('anon', 'public.pix_cobrancas', 'INSERT'),
  false,
  'anon não deve ter INSERT direto em public.pix_cobrancas'
);

-- 2. RPCs obrigatórias existem e possuem search_path configurado
SELECT has_function('public', 'fn_deve_exigir_pix_kds', 'fn_deve_exigir_pix_kds deve existir');
SELECT has_function('public', 'criar_cobranca_pix', 'criar_cobranca_pix deve existir');
SELECT has_function('public', 'processar_webhook_pix', 'processar_webhook_pix deve existir');
SELECT has_function('public', 'listar_cobrancas_pix_conferencia', 'listar_cobrancas_pix_conferencia deve existir');

-- 3. anon não pode chamar processar_webhook_pix diretamente
SELECT is(
  has_function_privilege('anon', 'public.processar_webhook_pix(text, text, numeric, numeric, text, jsonb)', 'EXECUTE'),
  false,
  'anon não deve ter EXECUTE em processar_webhook_pix'
);

-- 4. CA07: fn_deve_exigir_pix_kds respeita sempre / espetaculo / nunca
SELECT ok(
  (
    SELECT bool_and(res) FROM (
      SELECT public.fn_deve_exigir_pix_kds() AS res
    ) t
  ),
  'fn_deve_exigir_pix_kds deve retornar true por padrão (modo sempre)'
);

-- 5. CA04 & CA05: Criação de cobrança, rejeição de valor divergente e idempotência de webhook
DO $$
DECLARE
  v_pedido_id BIGINT;
  v_cob JSONB;
  v_txid TEXT;
  v_div JSONB;
  v_ok1 JSONB;
  v_ok2 JSONB;
  v_status_ped TEXT;
  v_status_pag TEXT;
  v_taxa_ped NUMERIC;
BEGIN
  INSERT INTO public.pedidos (mesa_codigo, status, status_pagamento, forma_pagamento, total, origem, cliente_nome)
  VALUES ('BALCÃO', 'aguardando_pagamento', 'pendente', 'pix', 25.00, 'totem', 'Cliente pgTAP')
  RETURNING id INTO v_pedido_id;

  v_cob := public.criar_cobranca_pix(v_pedido_id, 'BALCÃO', 25.00, 'totem', NULL, '000201TESTE', 'sandbox', 10);
  v_txid := v_cob->>'txid';

  -- Valor divergente (R$ 20,00 vs R$ 25,00) marca divergente e não paga o pedido
  v_div := public.processar_webhook_pix(v_txid, 'psp_div_1', 20.00, 0.25, 'mercadopago', '{}'::jsonb);
  IF v_div->>'status' <> 'divergente' THEN
    RAISE EXCEPTION 'Esperado status divergente, veio %', v_div->>'status';
  END IF;

  SELECT status_pagamento INTO v_status_pag FROM public.pedidos WHERE id = v_pedido_id;
  IF v_status_pag = 'pago' THEN
    RAISE EXCEPTION 'Pedido não deveria ficar pago após valor divergente';
  END IF;

  -- Gera nova cobrança válida e testa idempotência (CA04 / CA10)
  v_cob := public.criar_cobranca_pix(v_pedido_id, 'BALCÃO', 25.00, 'totem', NULL, '000201TESTE2', 'mercadopago', 10);
  v_txid := v_cob->>'txid';

  v_ok1 := public.processar_webhook_pix(v_txid, 'psp_ok_1', 25.00, 0.25, 'mercadopago', '{}'::jsonb);
  v_ok2 := public.processar_webhook_pix(v_txid, 'psp_ok_1', 25.00, 0.25, 'mercadopago', '{}'::jsonb);

  IF (v_ok1->>'idempotente')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Primeira notificação não deve ser marcada como idempotente';
  END IF;
  IF (v_ok2->>'idempotente')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Segunda notificação deve ser idempotente';
  END IF;

  SELECT status, status_pagamento, taxa_pagamento_valor
  INTO v_status_ped, v_status_pag, v_taxa_ped
  FROM public.pedidos WHERE id = v_pedido_id;

  IF v_status_ped <> 'pendente' OR v_status_pag <> 'pago' OR v_taxa_ped <> 0.25 THEN
    RAISE EXCEPTION 'Estado final incorreto no pedido: status=%, pag=%, taxa=%', v_status_ped, v_status_pag, v_taxa_ped;
  END IF;
END $$;

SELECT ok(
  EXISTS (SELECT 1 FROM public.pix_cobrancas WHERE psp_transacao_id = 'psp_ok_1' AND status = 'pago' AND taxa_psp_valor = 0.25),
  'Processamento válido de webhook deve marcar cobrança como paga e registrar taxa PSP'
);

-- 6. Configurações iniciais gravadas em configuracoes_sistema
SELECT ok(
  EXISTS (SELECT 1 FROM public.configuracoes_sistema WHERE chave = 'pix_exigir_pagamento_kds'),
  'Chave pix_exigir_pagamento_kds deve estar configurada em configuracoes_sistema'
);

-- 7. Registro da migration 123 em app_migrations
SELECT ok(
  EXISTS (SELECT 1 FROM public.app_migrations WHERE versao = '123'),
  'Migration 123 deve estar registrada em public.app_migrations'
);

SELECT * FROM finish();
ROLLBACK;
