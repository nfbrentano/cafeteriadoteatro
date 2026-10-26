-- CAF-000092 / CAF-000082 / CAF-000099: Testes de Pedidos via QR Code, Totem e Online (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica funções de pedido do cliente
SELECT has_function(
  'public',
  'criar_pedido_cliente',
  ARRAY['text', 'jsonb', 'text'],
  'criar_pedido_cliente deve existir validando qr_token e idempotência'
);

SELECT has_function(
  'public',
  'criar_pedido_online',
  ARRAY['jsonb', 'text'],
  'criar_pedido_online deve existir'
);

-- 2. Horários de funcionamento para pedidos remotos
SELECT has_table(
  'public',
  'business_hours',
  'tabela business_hours deve existir para checagem de horário de operação no servidor'
);

-- 3. Mesas ativas para atendimento cliente
SELECT has_column(
  'public',
  'mesas',
  'ativo',
  'mesas deve possuir coluna ativo para rejeitar pedidos em mesas desabilitadas'
);

SELECT * FROM finish();
ROLLBACK;
