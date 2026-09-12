-- =========================================================
-- MIGRAÇÃO V2: SISTEMA DE PEDIDOS (CAFETERIA DO TEATRO)
-- Execute este script no SQL Editor do Supabase
-- =========================================================

-- 1. Novas colunas na tabela de Pedidos
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS criado_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros')),
  ADD COLUMN IF NOT EXISTS status_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente', 'pago'));

-- 2. Nova coluna na tabela de Itens do Pedido (observações específicas do produto)
ALTER TABLE public.pedido_itens 
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- 3. Índices adicionais para performance de consultas e métricas
CREATE INDEX IF NOT EXISTS idx_pedidos_status_pagamento ON public.pedidos(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_pedidos_forma_pagamento ON public.pedidos(forma_pagamento);

-- 4. Ajuste de RLS em pedido_itens para permitir update/delete por admin e barista
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

-- 5. Permitir que authenticated possa ler nomes de perfis (para exibição de operador)
DROP POLICY IF EXISTS "perfis_select_all_authenticated" ON public.perfis;
CREATE POLICY "perfis_select_all_authenticated" ON public.perfis FOR SELECT TO authenticated
    USING (true);

-- 6. Garantir publicação Realtime sem apagar outras tabelas
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
