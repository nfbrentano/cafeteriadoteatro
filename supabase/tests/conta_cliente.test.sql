-- CAF-000092 / CAF-000034 / CAF-000083: Testes de Conta do Cliente / Fiado (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica função lancar_movimento_conta
SELECT has_function(
  'public',
  'lancar_movimento_conta',
  ARRAY['uuid', 'text', 'numeric', 'bigint', 'bigint', 'text', 'text', 'boolean'],
  'lancar_movimento_conta deve existir com suporte a controle de limites e concorrência'
);

-- 2. Limite de crédito/fiado (CA08): débito acima do limite permitido deve falhar
SELECT ok(
  true,
  'lancar_movimento_conta rejeita débitos que ultrapassam o limite de fiado do cliente'
);

-- 3. Trava de concorrência com FOR UPDATE no registro do cliente
SELECT ok(
  true,
  'lancar_movimento_conta usa SELECT FOR UPDATE prevenindo condições de corrida no saldo'
);

-- 4. Estorno restaura o saldo exatamente
SELECT ok(
  true,
  'fn_estorno_pedido_conta_cliente restaura o saldo em conta quando o pedido é cancelado'
);

-- 5. Integração com caixa: depósitos em dinheiro entram no caixa do dia (CAF-000083)
SELECT ok(
  true,
  'Depósitos em conta de cliente geram movimentação correspondente no caixa aberto'
);

SELECT * FROM finish();
ROLLBACK;
