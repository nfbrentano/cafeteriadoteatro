-- ==============================================================================
-- E2E Bootstrap (CAF-000120)
-- Pre-manifest PostgreSQL / PGlite extensions, roles, auth/storage schemas and
-- legacy dashboard tables expected before running canonical migrations.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- Schema auth (equivalente ao Supabase Auth para testes locais isolados)
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supabase_auth_admin;

CREATE TABLE IF NOT EXISTS auth.users (
  instance_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aud VARCHAR(255) DEFAULT 'authenticated',
  role VARCHAR(255) DEFAULT 'authenticated',
  email VARCHAR(255) UNIQUE,
  encrypted_password VARCHAR(255) DEFAULT '',
  email_confirmed_at TIMESTAMPTZ DEFAULT now(),
  invited_at TIMESTAMPTZ,
  confirmation_token VARCHAR(255) DEFAULT '',
  confirmation_sent_at TIMESTAMPTZ,
  recovery_token VARCHAR(255) DEFAULT '',
  recovery_sent_at TIMESTAMPTZ,
  email_change_token_new VARCHAR(255) DEFAULT '',
  email_change VARCHAR(255) DEFAULT '',
  email_change_sent_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ DEFAULT now(),
  raw_app_meta_data JSONB DEFAULT '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  phone TEXT,
  phone_confirmed_at TIMESTAMPTZ,
  banned_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  identity_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT NOT NULL DEFAULT 'email',
  last_sign_in_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), ''),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

GRANT SELECT ON auth.users TO anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON auth.users TO service_role, supabase_auth_admin;
GRANT ALL ON auth.identities TO service_role, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- Schema storage (equivalente ao Supabase Storage)
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner UUID,
  public BOOLEAN DEFAULT false,
  avif_autodetection BOOLEAN DEFAULT false,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT,
  owner UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.buckets TO service_role, authenticated;
GRANT ALL ON storage.objects TO service_role, authenticated;

-- ------------------------------------------------------------------------------
-- Tabelas base legadas pré-manifesto (categorias, produtos, site CMS, acessos)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categorias (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  subtitulo TEXT,
  icone TEXT,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  visivel BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produtos (
  id TEXT PRIMARY KEY,
  categoria_id TEXT REFERENCES public.categorias(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_antigo NUMERIC(10,2),
  preco_base NUMERIC(10,2),
  imagem TEXT,
  imagem_url TEXT,
  badge TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  destaque BOOLEAN NOT NULL DEFAULT false,
  disponivel BOOLEAN NOT NULL DEFAULT true,
  esgotado BOOLEAN NOT NULL DEFAULT false,
  ordem INT NOT NULL DEFAULT 0,
  estacao TEXT NOT NULL DEFAULT 'bar',
  permite_meio_a_meio BOOLEAN NOT NULL DEFAULT false,
  tempo_preparo_min INT DEFAULT 5,
  controla_estoque BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_hours (
  id SERIAL PRIMARY KEY,
  seg_qui_abre TEXT,
  seg_qui_fecha TEXT,
  sex_abre TEXT,
  sex_fecha TEXT,
  sab_dom_ativo BOOLEAN DEFAULT false,
  sab_dom_abre TEXT,
  sab_dom_fecha TEXT,
  aviso_especial TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.hero_home (
  id INT PRIMARY KEY DEFAULT 1,
  image_url TEXT,
  image_alt TEXT,
  blur_data_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT,
  subtitulo TEXT,
  imagem_url TEXT,
  blur_data_url TEXT,
  ordem INT DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT,
  descricao TEXT,
  imagem_url TEXT,
  ativa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_pdf (
  id INT PRIMARY KEY DEFAULT 1,
  url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acessos (
  id BIGSERIAL PRIMARY KEY,
  pagina TEXT DEFAULT '/',
  data_visita DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo'::text, now())
);

CREATE TABLE IF NOT EXISTS public.contador (
  id BIGSERIAL PRIMARY KEY,
  numero BIGINT NOT NULL,
  data_referencia DATE NOT NULL UNIQUE,
  quantidade_acessos BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo'::text, now())
);

GRANT SELECT ON public.categorias, public.produtos, public.site_settings, public.business_hours,
  public.hero_home, public.hero_slides, public.promotions, public.assets, public.menu_pdf,
  public.acessos, public.contador TO anon, authenticated;
GRANT ALL ON public.categorias, public.produtos, public.site_settings, public.business_hours,
  public.hero_home, public.hero_slides, public.promotions, public.assets, public.menu_pdf,
  public.acessos, public.contador TO service_role;
