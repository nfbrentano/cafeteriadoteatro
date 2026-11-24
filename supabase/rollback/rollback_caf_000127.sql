-- ==============================================================================
-- ROLLBACK CAF-000127: Dados sensíveis legíveis: pin_hash com bcrypt e policies
-- ==============================================================================

BEGIN;

-- 1. Restaura privilégio SELECT em toda a tabela perfis para authenticated e anon
GRANT SELECT ON public.perfis TO authenticated, anon;

-- 2. Restaura policies de leitura abertas USING (true)
DROP POLICY IF EXISTS "fechamentos_select" ON public.fechamentos;
CREATE POLICY "fechamentos_select" ON public.fechamentos FOR SELECT USING (true);

DROP POLICY IF EXISTS "fechamento_pagamentos_select" ON public.fechamento_pagamentos;
CREATE POLICY "fechamento_pagamentos_select" ON public.fechamento_pagamentos FOR SELECT USING (true);

DROP POLICY IF EXISTS "fechamento_pedidos_select" ON public.fechamento_pedidos;
CREATE POLICY "fechamento_pedidos_select" ON public.fechamento_pedidos FOR SELECT USING (true);

DROP POLICY IF EXISTS "caixa_movimentos_select" ON public.caixa_movimentos;
CREATE POLICY "caixa_movimentos_select" ON public.caixa_movimentos FOR SELECT USING (true);

DROP POLICY IF EXISTS "estoque_itens_select" ON public.estoque_itens;
CREATE POLICY "estoque_itens_select" ON public.estoque_itens FOR SELECT USING (true);

DROP POLICY IF EXISTS "estoque_movimentos_select" ON public.estoque_movimentos;
CREATE POLICY "estoque_movimentos_select" ON public.estoque_movimentos FOR SELECT USING (true);

DROP POLICY IF EXISTS "estoque_lotes_select" ON public.estoque_lotes;
CREATE POLICY "estoque_lotes_select" ON public.estoque_lotes FOR SELECT USING (true);

GRANT SELECT ON public.estoque_lotes TO anon;
GRANT SELECT ON public.fechamentos, public.fechamento_pagamentos, public.fechamento_pedidos, public.caixa_movimentos, public.estoque_itens, public.estoque_movimentos TO anon;

-- 3. Restaura security_invoker na view de retirada
ALTER VIEW public.v_painel_retirada SET (security_invoker = true);

-- 4. Remove registro da migration
DELETE FROM public.app_migrations WHERE versao = '127';

COMMIT;
