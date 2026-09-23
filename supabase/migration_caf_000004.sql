-- =========================================================
-- MIGRATION CAF-000004: Cancelar item individual
-- =========================================================

-- 1. Adicionar colunas em pedido_itens
ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

-- 2. Função auxiliar para recalcular total do pedido
CREATE OR REPLACE FUNCTION public.recalcular_total_pedido(p_pedido_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total NUMERIC(10,2);
BEGIN
  SELECT COALESCE(SUM(quantidade * preco_unitario - desconto), 0) INTO v_total
  FROM public.pedido_itens WHERE pedido_id = p_pedido_id AND cancelado = false;
  
  UPDATE public.pedidos SET total = v_total WHERE id = p_pedido_id;
END;
$$;

-- 3. Função para cancelar um item
CREATE OR REPLACE FUNCTION public.cancelar_item(p_item_id BIGINT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido_id BIGINT;
  v_status_pagamento TEXT;
  v_pedido_status TEXT;
  v_user_role TEXT;
  v_linhas_afetadas INT;
BEGIN
  -- Verificar Role
  v_user_role := public.get_user_role();
  
  -- Verificar se o item existe e pegar o pedido_id
  SELECT pi.pedido_id, p.status_pagamento, p.status
  INTO v_pedido_id, v_status_pagamento, v_pedido_status
  FROM public.pedido_itens pi
  JOIN public.pedidos p ON p.id = pi.pedido_id
  WHERE pi.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;
  
  IF v_pedido_status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido já está cancelado';
  END IF;

  -- Regra: Se o pedido estiver pago, apenas admin pode cancelar item
  IF v_status_pagamento = 'pago' AND v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem cancelar itens de pedidos já pagos.';
  END IF;

  -- Atualizar item
  UPDATE public.pedido_itens
  SET cancelado = true,
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      motivo_cancelamento = p_motivo
  WHERE id = p_item_id AND cancelado = false;
  
  GET DIAGNOSTICS v_linhas_afetadas = ROW_COUNT;
  IF v_linhas_afetadas = 0 THEN
    RAISE EXCEPTION 'Item já estava cancelado ou não pode ser alterado.';
  END IF;

  -- Recalcular descontos
  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  -- Recalcular total do pedido
  PERFORM public.recalcular_total_pedido(v_pedido_id);

  RETURN jsonb_build_object('status', 'success', 'item_id', p_item_id, 'pedido_id', v_pedido_id);
END;
$$;
