-- =========================================================
-- MIGRATION: CAF-000007 - Adicionar estacao na tabela categorias
-- =========================================================

ALTER TABLE public.categorias
ADD COLUMN IF NOT EXISTS estacao TEXT NOT NULL DEFAULT 'cozinha' CHECK (estacao IN ('bar','cozinha'));
