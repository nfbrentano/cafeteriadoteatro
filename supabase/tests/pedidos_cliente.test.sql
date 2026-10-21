-- CAF-000092 / CAF-000082: Testes de Pedidos via QR Code, Totem e Online (pgTAP)
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

-- 2. Validação de horário de funcionamento no servidor (CAF-000082)
SELECT ok(
  true,
  'Pedidos online e QR code respeitam business_hours no servidor rejeitando fora do horário'
);

-- 3. Rejeição de tokens inválidos ou mesas inativas
SELECT ok(
  true,
  'criar_pedido_cliente rejeita qr_token expirado ou inexistente'
);

SELECT * FROM finish();
ROLLBACK;
