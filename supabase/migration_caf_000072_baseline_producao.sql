BEGIN;

-- ==============================================================================
-- CAF-000072: Baseline do schema de produção e reconciliação com as migrations
-- Idempotente (IF NOT EXISTS, CREATE OR REPLACE)
-- ==============================================================================

-- 0. Tabela de controle de migrations aplicadas (CAF-000098 / RF04)
CREATE TABLE IF NOT EXISTS public.app_migrations (
  versao TEXT PRIMARY KEY,
  arquivo TEXT NOT NULL,
  aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  aplicada_por TEXT DEFAULT current_user,
  checksum TEXT
);
ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_migrations' AND policyname = 'app_migrations_select'
  ) THEN
    CREATE POLICY app_migrations_select ON public.app_migrations FOR SELECT USING (true);
  END IF;
END $$;
GRANT SELECT ON public.app_migrations TO anon, authenticated;
GRANT ALL ON public.app_migrations TO authenticated, service_role;

-- 1. Tabela produto_adicionais_permitidos (usada por totem, cardápio e validações)
-- Se já existir como view (schema de produção com adicional_vinculos), não tenta recriar como tabela
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'produto_adicionais_permitidos'
    ) THEN
        CREATE TABLE IF NOT EXISTS public.produto_adicionais_permitidos (
            produto_id BIGINT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
            adicional_id BIGINT NOT NULL REFERENCES public.adicionais(id) ON DELETE CASCADE,
            criado_em TIMESTAMPTZ DEFAULT timezone('America/Sao_Paulo'::text, now()),
            PRIMARY KEY (produto_id, adicional_id)
        );
        ALTER TABLE public.produto_adicionais_permitidos ENABLE ROW LEVEL SECURITY;
        CREATE POLICY produto_adicionais_permitidos_select ON public.produto_adicionais_permitidos
            FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'produto_adicionais_permitidos' AND c.relkind = 'r'
    ) THEN
        GRANT SELECT ON public.produto_adicionais_permitidos TO anon, authenticated, service_role;
        GRANT ALL ON public.produto_adicionais_permitidos TO authenticated, service_role;
    END IF;
END $$;

-- 2. Coluna custo_unitario_medio em estoque_itens se não existir
ALTER TABLE public.estoque_itens ADD COLUMN IF NOT EXISTS custo_unitario_medio NUMERIC(10,4) DEFAULT 0;

-- 3. Coluna pedido_origem_id em pedidos para suporte a pedidos adicionais (CAF-000084 / RF04)
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pedido_origem_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL;

-- 4. View v_adicionais_produto garantindo security_invoker = true
CREATE OR REPLACE VIEW public.v_adicionais_produto
WITH (security_invoker = true)
AS
SELECT DISTINCT 
    p.id AS produto_id,
    a.id AS adicional_id,
    a.nome,
    a.preco,
    a.ordem
FROM public.produtos p
JOIN public.adicional_vinculos v ON (v.produto_id = p.id OR v.categoria_id = p.categoria_id)
JOIN public.adicionais a ON a.id = v.adicional_id
WHERE p.permite_adicionais = true AND a.ativo = true;

GRANT SELECT ON public.v_adicionais_produto TO anon, authenticated, service_role;

-- Registro de aplicação (RF04)
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('072', 'migration_caf_000072_baseline_producao.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
