-- ==============================================================================
-- E2E Minimal Seed (CAF-000120 / RNF03)
-- Contém apenas categorias, produtos, mesas e credenciais sintéticas de teste.
-- Zero dados pessoais de clientes reais ou registros de produção.
-- ==============================================================================

-- 1. Categorias
INSERT INTO public.categorias (id, nome, subtitulo, ordem, estacao, visivel)
VALUES
  ('cafes', 'Cafés Especiais', 'Bebidas quentes e geladas', 1, 'bar', true),
  ('salgados', 'Salgados', 'Forneria artesanal', 2, 'cozinha', true),
  ('doces', 'Doces', 'Confeitaria da casa', 3, 'cozinha', true)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  subtitulo = EXCLUDED.subtitulo,
  ordem = EXCLUDED.ordem,
  estacao = EXCLUDED.estacao,
  visivel = EXCLUDED.visivel;

-- 2. Produtos
INSERT INTO public.produtos (id, categoria_id, nome, descricao, preco, preco_base, disponivel, destaque, ordem, estacao)
VALUES
  ('prod-espresso', 'cafes', 'Café Espresso', 'Espresso clássico 50ml', 10.00, 10.00, true, true, 1, 'bar'),
  ('prod-cappuccino', 'cafes', 'Cappuccino Italiano', 'Espresso, leite vaporizado e cacau', 15.00, 15.00, true, true, 2, 'bar'),
  ('prod-pao-queijo', 'salgados', 'Pão de Queijo Artesanal', 'Porção com pão de queijo mineiro', 12.00, 12.00, true, false, 3, 'cozinha'),
  ('prod-croissant', 'salgados', 'Croissant Manteiga', 'Folhado assado na hora', 18.00, 18.00, true, true, 4, 'cozinha'),
  ('prod-brownie', 'doces', 'Brownie do Teatro', 'Brownie de chocolate meio amargo', 14.00, 14.00, true, false, 5, 'cozinha')
ON CONFLICT (id) DO UPDATE SET
  categoria_id = EXCLUDED.categoria_id,
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  preco = EXCLUDED.preco,
  preco_base = EXCLUDED.preco_base,
  disponivel = EXCLUDED.disponivel,
  destaque = EXCLUDED.destaque,
  ordem = EXCLUDED.ordem,
  estacao = EXCLUDED.estacao;

-- 3. Mesas e tokens determinísticos para QR Code
INSERT INTO public.mesas (codigo, descricao, ativo, qr_token)
VALUES
  ('M-01', 'Mesa 01', true, 'tok-e2e-m01'),
  ('M-02', 'Mesa 02', true, 'tok-e2e-m02'),
  ('M-03', 'Mesa 03', true, 'tok-e2e-m03'),
  ('M-04', 'Mesa 04', true, 'tok-e2e-m04'),
  ('BALCAO', 'Balcão', true, 'tok-e2e-balcao')
ON CONFLICT (codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  ativo = EXCLUDED.ativo,
  qr_token = EXCLUDED.qr_token;

-- 4. Usuários de teste (auth.users + auth.identities + perfis + cargos + PIN 1234)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin@e2e.local',
    crypt('E2E@2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Admin E2E","role":"admin","pode_dar_desconto":true}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'barista@e2e.local',
    crypt('E2E@2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Barista E2E","role":"barista","pode_dar_desconto":true}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'cozinha@e2e.local',
    crypt('E2E@2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Cozinha E2E","role":"cozinha","pode_dar_desconto":false}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = now();

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@e2e.local"}'::jsonb,
    'email'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '{"sub":"00000000-0000-0000-0000-000000000002","email":"barista@e2e.local"}'::jsonb,
    'email'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    '{"sub":"00000000-0000-0000-0000-000000000003","email":"cozinha@e2e.local"}'::jsonb,
    'email'
  )
ON CONFLICT (id) DO NOTHING;

-- Garantir perfis completos, cargo_id e PIN de operador ('1234')
INSERT INTO public.perfis (id, nome, role, ativo, pode_dar_desconto, cargo_id, pin_hash)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Admin E2E',
    'admin',
    true,
    true,
    (SELECT id FROM public.cargos WHERE nome = 'Admin' LIMIT 1),
    public.fn_hash_pin('1234')
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Barista E2E',
    'barista',
    true,
    true,
    (SELECT id FROM public.cargos WHERE nome = 'Atendente / Barista' LIMIT 1),
    public.fn_hash_pin('1234')
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Cozinha E2E',
    'cozinha',
    true,
    false,
    (SELECT id FROM public.cargos WHERE nome = 'Cozinha' LIMIT 1),
    public.fn_hash_pin('1234')
  )
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  role = EXCLUDED.role,
  ativo = EXCLUDED.ativo,
  pode_dar_desconto = EXCLUDED.pode_dar_desconto,
  cargo_id = EXCLUDED.cargo_id,
  pin_hash = EXCLUDED.pin_hash;

-- 5. Configurações mínimas de site/sistema
INSERT INTO public.business_hours (id, seg_qui_abre, seg_qui_fecha, sex_abre, sex_fecha, sab_dom_ativo, sab_dom_abre, sab_dom_fecha)
VALUES (1, '09:00', '20:00', '09:00', '22:00', true, '10:00', '20:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_settings (key, value)
VALUES
  ('whatsapp_ativo', 'false'),
  ('whatsapp_numero', '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('pedido_cliente_ativo', 'true'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
