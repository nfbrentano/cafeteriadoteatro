-- =========================================================
-- MIGRATION: CAF-000078 - FINANCEIRO: CONTRATO DE DESPESAS
-- =========================================================

-- 1. Coluna documento em despesas (RF05 / CA07 / D01)
ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS documento TEXT;

CREATE INDEX IF NOT EXISTS idx_despesas_documento
  ON public.despesas(documento)
  WHERE documento IS NOT NULL;

-- 2. Garantir bucket privado de comprovantes (RF06 / CA08)
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes-despesas', 'comprovantes-despesas', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Atualizar permissões da RPC baixar_despesa
GRANT EXECUTE ON FUNCTION public.baixar_despesa(BIGINT, DATE, NUMERIC, TEXT) TO authenticated;
