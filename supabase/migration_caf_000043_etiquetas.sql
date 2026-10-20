-- ==============================================================================
-- MIGRATION: CAF-000043 — Etiqueta por item para copo e embalagem (KDS)
-- ==============================================================================

-- 1. Permite configurar por categoria se emite etiqueta (padrão: true)
ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS imprimir_etiqueta BOOLEAN NOT NULL DEFAULT true;

-- 2. Atualiza índice único parcial de pedido_impressoes para incluir 'etiqueta'
DROP INDEX IF EXISTS public.uq_pedido_impressoes_auto;

CREATE UNIQUE INDEX uq_pedido_impressoes_auto
  ON public.pedido_impressoes (pedido_id, estacao, tipo)
  WHERE tipo IN ('comanda', 'adicional', 'etiqueta');

-- 3. Atualiza RPC travar_impressao_pedido para suportar trava atômica de 'etiqueta'
CREATE OR REPLACE FUNCTION public.travar_impressao_pedido(
  p_pedido_id BIGINT,
  p_estacao TEXT,
  p_tipo TEXT DEFAULT 'comanda',
  p_dispositivo TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted_id BIGINT;
BEGIN
  -- Reimpressões manuais ('reimpressao' ou 'reimpressao_etiqueta') não sofrem bloqueio de duplicidade
  IF p_tipo IN ('reimpressao', 'reimpressao_etiqueta') THEN
    INSERT INTO public.pedido_impressoes (pedido_id, estacao, tipo, dispositivo)
    VALUES (p_pedido_id, p_estacao, p_tipo, p_dispositivo);
    RETURN TRUE;
  END IF;

  INSERT INTO public.pedido_impressoes (pedido_id, estacao, tipo, dispositivo)
  VALUES (p_pedido_id, p_estacao, p_tipo, p_dispositivo)
  ON CONFLICT (pedido_id, estacao, tipo) WHERE tipo IN ('comanda', 'adicional', 'etiqueta')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.travar_impressao_pedido(BIGINT, TEXT, TEXT, TEXT) TO authenticated, anon;
