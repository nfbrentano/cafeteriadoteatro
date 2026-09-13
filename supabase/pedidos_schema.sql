-- =========================================================
-- ROTINA DE CRIAÇÃO DO SISTEMA DE PEDIDOS (CAFETERIA)
-- =========================================================

-- 1. Criar tabela de Perfis (Vinculada ao auth.users)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'barista' CHECK (role IN ('barista', 'cozinha', 'admin')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

-- Habilitar RLS em perfis
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para obter a role sem disparar RLS infinito
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.perfis WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "perfis_select_authenticated" ON public.perfis;
CREATE POLICY "perfis_select_authenticated" ON public.perfis FOR SELECT TO authenticated
    USING (true);

-- Trigger para criar perfil automaticamente ao cadastrar usuário (Opcional, mas útil)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, role)
  VALUES (new.id, new.raw_user_meta_data->>'nome', COALESCE(new.raw_user_meta_data->>'role', 'barista'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- OBS: Se já existir trigger, remova antes.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Sincronizar usuários existentes em auth.users que ainda não tenham perfil em public.perfis:
INSERT INTO public.perfis (id, nome, role)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'nome', split_part(email, '@', 1), 'Administrador') AS nome,
    COALESCE(raw_user_meta_data->>'role', 'admin') AS role
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- 2. Criar tabela de Mesas
CREATE TABLE IF NOT EXISTS public.mesas (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

-- Habilitar RLS em mesas
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mesas_select" ON public.mesas;
CREATE POLICY "mesas_select" ON public.mesas FOR SELECT USING (true);

DROP POLICY IF EXISTS "mesas_all_admin" ON public.mesas;
CREATE POLICY "mesas_all_admin" ON public.mesas FOR ALL USING (
    public.get_user_role() = 'admin'
);

-- Inserir mesas padrão
INSERT INTO public.mesas (codigo, descricao) VALUES
('M-01', 'Mesa 1'),
('M-02', 'Mesa 2'),
('M-03', 'Mesa 3'),
('M-04', 'Mesa 4'),
('M-05', 'Mesa 5'),
('M-06', 'Mesa 6'),
('M-07', 'Mesa 7'),
('M-08', 'Mesa 8'),
('M-09', 'Mesa 9'),
('M-10', 'Mesa 10'),
('BALCAO', 'Retirada no Balcão'),
('VIAGEM', 'Para Viagem')
ON CONFLICT (codigo) DO NOTHING;


-- 3. Criar tabela de Pedidos
CREATE TABLE IF NOT EXISTS public.pedidos (
    id BIGSERIAL PRIMARY KEY,
    numero_pedido SERIAL,
    mesa_codigo TEXT NOT NULL REFERENCES public.mesas(codigo),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_preparo', 'concluido', 'cancelado')),
    observacoes TEXT,
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    criado_por UUID REFERENCES auth.users(id),
    criado_por_nome TEXT,
    forma_pagamento TEXT CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros')),
    status_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente', 'pago')),
    concluido_por UUID REFERENCES auth.users(id),
    concluido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa ON public.pedidos(mesa_codigo);
CREATE INDEX IF NOT EXISTS idx_pedidos_created ON public.pedidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status_pagamento ON public.pedidos(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_pedidos_forma_pagamento ON public.pedidos(forma_pagamento);

-- Habilitar RLS em pedidos
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
CREATE POLICY "pedidos_select" ON public.pedidos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;
CREATE POLICY "pedidos_insert" ON public.pedidos FOR INSERT TO authenticated
    WITH CHECK (
        public.get_user_role() IN ('barista', 'admin')
    );

DROP POLICY IF EXISTS "pedidos_update" ON public.pedidos;
CREATE POLICY "pedidos_update" ON public.pedidos FOR UPDATE TO authenticated
    USING (
        public.get_user_role() IN ('cozinha', 'admin', 'barista')
    );

-- 4. Criar tabela de Itens do Pedido
CREATE TABLE IF NOT EXISTS public.pedido_itens (
    id BIGSERIAL PRIMARY KEY,
    pedido_id BIGINT NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    produto_id TEXT NOT NULL,
    nome_produto TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario NUMERIC(10,2) NOT NULL,
    observacoes TEXT,
    subtotal NUMERIC(10,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON public.pedido_itens(pedido_id);

-- Habilitar RLS em pedido_itens
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_itens_select" ON public.pedido_itens;
CREATE POLICY "pedido_itens_select" ON public.pedido_itens FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pedido_itens_insert" ON public.pedido_itens;
CREATE POLICY "pedido_itens_insert" ON public.pedido_itens FOR INSERT TO authenticated
    WITH CHECK (
        public.get_user_role() IN ('barista', 'admin')
    );

DROP POLICY IF EXISTS "pedido_itens_update" ON public.pedido_itens;
CREATE POLICY "pedido_itens_update" ON public.pedido_itens FOR UPDATE TO authenticated
    USING (
        public.get_user_role() IN ('barista', 'admin')
    );

DROP POLICY IF EXISTS "pedido_itens_delete" ON public.pedido_itens;
CREATE POLICY "pedido_itens_delete" ON public.pedido_itens FOR DELETE TO authenticated
    USING (
        public.get_user_role() IN ('barista', 'admin')
    );

-- 5. Habilitar Realtime na tabela de Pedidos e Itens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pedidos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pedido_itens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_itens;
  END IF;
END $$;

-- 6. Função RPC para Admin criar usuários
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  email TEXT,
  password TEXT,
  nome TEXT,
  role_param TEXT
) RETURNS json AS $$
DECLARE
  new_user_id UUID;
  encrypted_pw TEXT;
BEGIN
  -- Validar se quem chama é admin
  IF public.get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem criar usuários.';
  END IF;

  -- Gerar UUID e hash da senha
  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

  -- Inserir no auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, 
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', email, encrypted_pw, now(),
    now(), now(), '{"provider":"email","providers":["email"]}', 
    json_build_object('nome', nome, 'role', role_param)::jsonb,
    now(), now(), '', '', '', ''
  );
  
  -- Insert no identities
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), new_user_id, new_user_id::text, json_build_object('sub', new_user_id, 'email', email)::jsonb, 'email', now(), now(), now()
  );

  RETURN json_build_object('status', 'success', 'user_id', new_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
