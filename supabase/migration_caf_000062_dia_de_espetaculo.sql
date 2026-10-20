-- =========================================================
-- MIGRATION: CAF-000062 - MODO DIA DE ESPETÁCULO E RESERVA DE INTERVALO
-- =========================================================

-- 1. Chaves de configuração operacional em configuracoes_sistema
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('espetaculo_ativo', 'false'::jsonb),
  ('espetaculo_nome', '""'::jsonb),
  ('espetaculo_data', '""'::jsonb),
  ('espetaculo_horario_intervalo', '"21:00"'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 2. Colunas de marcação em public.pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS is_intervalo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS espetaculo_nome TEXT;

CREATE INDEX IF NOT EXISTS idx_pedidos_is_intervalo
  ON public.pedidos(is_intervalo)
  WHERE is_intervalo = true;
