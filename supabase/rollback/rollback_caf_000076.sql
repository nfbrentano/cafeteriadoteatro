BEGIN;

-- Rollback CAF-000076
DELETE FROM public.app_migrations WHERE versao = '076';

DROP TRIGGER IF EXISTS trg_estorno_cashback_pedido_cancelado ON public.pedidos;
DROP FUNCTION IF EXISTS public.fn_estorno_cashback_pedido_cancelado();

DROP INDEX IF EXISTS public.idx_cliente_conta_mov_cashback_deposito_unico;
DROP INDEX IF EXISTS public.idx_cliente_conta_mov_cashback_estorno_unico;

-- Restaura versão da CAF-000063 de processar_cashback_pedido
CREATE OR REPLACE FUNCTION public.processar_cashback_pedido(
  p_pedido_id BIGINT,
  p_cliente_id UUID,
  p_valor_elegivel NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ativo BOOLEAN;
  v_percentual NUMERIC;
  v_minimo NUMERIC;
  v_cashback NUMERIC(10,2);
  v_ja_creditado BOOLEAN;
  v_novo_saldo NUMERIC(10,2);
  v_valor_base NUMERIC(10,2) := 0;
BEGIN
  SELECT COALESCE((valor)::text::boolean, false) INTO v_ativo
  FROM public.configuracoes_sistema WHERE chave = 'cashback_ativo';
  IF NOT COALESCE(v_ativo, false) THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback desativado');
  END IF;

  SELECT COALESCE((valor)::text::numeric, 5) INTO v_percentual
  FROM public.configuracoes_sistema WHERE chave = 'cashback_percentual_padrao';

  SELECT COALESCE((valor)::text::numeric, 0) INTO v_minimo
  FROM public.configuracoes_sistema WHERE chave = 'cashback_valor_minimo_ativacao';

  SELECT COALESCE(total, 0) INTO v_valor_base
  FROM public.pedidos WHERE id = p_pedido_id;

  IF v_valor_base < v_minimo THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor abaixo do mínimo');
  END IF;

  v_cashback := ROUND((v_valor_base * (v_percentual / 100.0)), 2);

  UPDATE public.clientes
  SET saldo_conta = COALESCE(saldo_conta, 0) + v_cashback
  WHERE id = p_cliente_id
  RETURNING saldo_conta INTO v_novo_saldo;

  RETURN jsonb_build_object('creditado', true, 'valor', v_cashback, 'novo_saldo', v_novo_saldo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) TO authenticated;

COMMIT;
