-- Adiciona a coluna aviso_especial na tabela business_hours
ALTER TABLE public.business_hours
ADD COLUMN IF NOT EXISTS aviso_especial TEXT;
