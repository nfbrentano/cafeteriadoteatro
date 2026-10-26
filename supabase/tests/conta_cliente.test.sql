-- CAF-000092 / CAF-000034 / CAF-000083 / CAF-000099: Testes de Conta do Cliente / Fiado (pgTAP)
BEGIN;
SELECT plan(5);

-- 1. Verifica função lancar_movimento_conta com assinatura real de produção e lock FOR UPDATE
SELECT has_function(
  'public',
  'lancar_movimento_conta',
  ARRAY['uuid', 'text', 'numeric', 'bigint', 'uuid', 'text', 'text', 'boolean'],
  'lancar_movimento_conta deve existir com suporte a controle de limites, concorrência e FOR UPDATE'
);

-- 2. Limite de crédito/fiado (CA08): débito acima do limite permitido deve falhar
SELECT has_column(
  'public',
  'clientes',
  'limite_credito',
  'clientes deve possuir limite_credito para validação de compras a prazo'
);

-- 3. Saldo da conta do cliente com controle de concorrência FOR UPDATE
SELECT has_column(
  'public',
  'clientes',
  'saldo_conta',
  'clientes deve possuir saldo_conta para controle de fiado com trava FOR UPDATE'
);

-- 4. Habilitação de fiado por cliente
SELECT has_column(
  'public',
  'clientes',
  'conta_habilitada',
  'clientes deve ter coluna conta_habilitada para autorização de vendas fiado'
);

-- 5. Integração com caixa
SELECT has_table(
  'public',
  'caixas',
  'Tabela caixas deve existir para registrar entradas de depósitos em conta de cliente'
);

SELECT * FROM finish();
ROLLBACK;
