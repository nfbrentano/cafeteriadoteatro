BEGIN;

-- Rollback CAF-000077
DELETE FROM public.app_migrations WHERE versao = '077';

DROP TRIGGER IF EXISTS trg_estorno_cupom_pedido_cancelado ON public.pedidos;
DROP FUNCTION IF EXISTS public.fn_estorno_cupom_pedido_cancelado();

DROP TABLE IF EXISTS public.campanha_usos CASCADE;

DROP FUNCTION IF EXISTS public.registrar_uso_cupom(BIGINT, BIGINT);

-- Restaura versão da CAF-000061 de registrar_uso_cupom (BIGINT, NUMERIC)
CREATE OR REPLACE FUNCTION public.registrar_uso_cupom(
  p_campanha_id BIGINT,
  p_valor_pedido NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_campanha_id IS NULL THEN
    RAISE EXCEPTION 'Campanha ID é obrigatório';
  END IF;

  UPDATE public.campanhas
  SET
    usos_registrados = COALESCE(usos_registrados, 0) + 1,
    receita_atribuida = COALESCE(receita_atribuida, 0) + GREATEST(COALESCE(p_valor_pedido, 0), 0)
  WHERE id = p_campanha_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_uso_cupom(BIGINT, NUMERIC) TO authenticated;

COMMIT;
