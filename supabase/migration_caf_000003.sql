-- =========================================================
-- MIGRATION: CAF-000003 - Otimização de Performance no PDV
-- =========================================================

-- Criar índice na coluna created_at da tabela pedidos para otimizar 
-- a busca de pedidos concluídos filtrados por data no painel do PDV e Cozinha
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos(created_at);
