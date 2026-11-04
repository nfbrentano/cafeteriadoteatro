BEGIN;
SELECT plan(5);

-- 1. Coluna pago_em deve existir em public.pedidos
SELECT has_column(
  'public',
  'pedidos',
  'pago_em',
  'public.pedidos deve possuir coluna pago_em TIMESTAMPTZ para registrar o instante do pagamento'
);

-- 2. Trigger trg_pedidos_set_pago_em deve existir em public.pedidos
SELECT has_trigger(
  'public',
  'pedidos',
  'trg_pedidos_set_pago_em',
  'Trigger trg_pedidos_set_pago_em deve preencher pago_em automaticamente quando status_pagamento = pago'
);

-- 3. transferir_mesa não deve bloquear pedidos já entregues na mesa que ainda não foram pagos
SELECT is(
  (
    SELECT (prosrc NOT LIKE '%status != ''entregue''%')
       AND (prosrc LIKE '%status != ''cancelado''%')
       AND (prosrc LIKE '%status_pagamento != ''pago''%')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'transferir_mesa'
    LIMIT 1
  ),
  true,
  'transferir_mesa deve transferir todos os pedidos não cancelados e não pagos (incluindo já entregues)'
);

-- 4. fechar_conta_mesa deve verificar v_count_pedidos = 0 e gravar pago_em
SELECT is(
  (
    SELECT (prosrc LIKE '%v_count_pedidos = 0%')
       AND (prosrc LIKE '%pago_em%')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fechar_conta_mesa'
    LIMIT 1
  ),
  true,
  'fechar_conta_mesa deve validar v_count_pedidos = 0 e preencher pago_em'
);

-- 5. fn_calcular_totais_caixa_interno deve filtrar vendas_balcao por COALESCE(p.pago_em, p.updated_at, p.created_at)
SELECT is(
  (
    SELECT prosrc LIKE '%COALESCE(p.pago_em, p.updated_at, p.created_at)%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_calcular_totais_caixa_interno'
    LIMIT 1
  ),
  true,
  'fn_calcular_totais_caixa_interno deve apurar vendas_balcao pelo instante do pagamento'
);

SELECT * FROM finish();
ROLLBACK;
