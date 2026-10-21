-- ==============================================================================
-- CAF-000072: Baseline do schema de produção e reconciliação com as migrations
-- Idempotente (IF NOT EXISTS, CREATE OR REPLACE)
-- ==============================================================================

-- 1. Tabela produto_adicionais_permitidos (usada por totem, cardápio e validações)
CREATE TABLE IF NOT EXISTS public.produto_adicionais_permitidos (
    produto_id BIGINT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    adicional_id BIGINT NOT NULL REFERENCES public.adicionais(id) ON DELETE CASCADE,
    criado_em TIMESTAMPTZ DEFAULT timezone('America/Sao_Paulo'::text, now()),
    PRIMARY KEY (produto_id, adicional_id)
);

ALTER TABLE public.produto_adicionais_permitidos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'produto_adicionais_permitidos' AND policyname = 'produto_adicionais_permitidos_select'
    ) THEN
        CREATE POLICY produto_adicionais_permitidos_select ON public.produto_adicionais_permitidos
            FOR SELECT USING (true);
    END IF;
END $$;

GRANT SELECT ON public.produto_adicionais_permitidos TO anon, authenticated, service_role;
GRANT ALL ON public.produto_adicionais_permitidos TO authenticated, service_role;

-- 2. Coluna custo_unitario_medio em estoque_itens se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'estoque_itens' AND column_name = 'custo_unitario_medio'
    ) THEN
        ALTER TABLE public.estoque_itens ADD COLUMN custo_unitario_medio NUMERIC(10,4) DEFAULT 0;
    END IF;
END $$;

-- 3. Coluna pedido_origem_id em pedidos para suporte a pedidos adicionais (CAF-000084 / RF04)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'pedido_origem_id'
    ) THEN
        ALTER TABLE public.pedidos ADD COLUMN pedido_origem_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. View v_adicionais_produto garantindo security_invoker = true
CREATE OR REPLACE VIEW public.v_adicionais_produto
WITH (security_invoker = true)
AS
SELECT 
    pa.produto_id,
    a.id AS adicional_id,
    a.nome,
    a.preco,
    a.categoria_id,
    a.ativo
FROM public.produto_adicionais_permitidos pa
JOIN public.adicionais a ON a.id = pa.adicional_id
WHERE a.ativo = true;

GRANT SELECT ON public.v_adicionais_produto TO anon, authenticated, service_role;
