BEGIN;

-- Rollback CAF-000073
DELETE FROM public.app_migrations WHERE versao = '073';

DROP FUNCTION IF EXISTS public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT);

-- Restaura versão CAF-000023 de fechar_conta_mesa (5 parâmetros)
CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(
    p_mesa_codigo TEXT,
    p_pagamentos JSONB,
    p_taxa_servico NUMERIC DEFAULT 0,
    p_desconto_manual NUMERIC DEFAULT 0,
    p_desconto_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_conta NUMERIC(10,2) := 0;
    v_total_pago NUMERIC(10,2) := 0;
    v_troco NUMERIC(10,2) := 0;
    v_fechamento_id UUID;
    v_pagamento RECORD;
    v_pedido RECORD;
    v_subtotal NUMERIC(10,2) := 0;
BEGIN
    SELECT COALESCE(SUM(total), 0) INTO v_subtotal
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status != 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago');

    IF v_subtotal = 0 THEN
        RAISE EXCEPTION 'Nenhum pedido em aberto para a mesa %', p_mesa_codigo;
    END IF;

    v_total_conta := (v_subtotal - COALESCE(p_desconto_manual, 0)) + COALESCE(p_taxa_servico, 0);

    FOR v_pagamento IN SELECT * FROM jsonb_to_recordset(p_pagamentos) AS x(forma TEXT, valor NUMERIC)
    LOOP
        v_total_pago := v_total_pago + v_pagamento.valor;
    END LOOP;

    IF v_total_pago < v_total_conta THEN
        RAISE EXCEPTION 'Valor pago é inferior ao total da conta';
    END IF;

    v_troco := v_total_pago - v_total_conta;

    INSERT INTO public.fechamentos (mesa_codigo, total_conta, troco, criado_por, taxa_servico, desconto_manual, desconto_motivo)
    VALUES (p_mesa_codigo, v_total_conta, v_troco, auth.uid(), p_taxa_servico, p_desconto_manual, p_desconto_motivo)
    RETURNING id INTO v_fechamento_id;

    FOR v_pagamento IN SELECT * FROM jsonb_to_recordset(p_pagamentos) AS x(forma TEXT, valor NUMERIC)
    LOOP
        INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
        VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);
    END LOOP;

    FOR v_pedido IN SELECT id FROM public.pedidos WHERE mesa_codigo = p_mesa_codigo AND status != 'cancelado' AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    LOOP
        INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
        VALUES (v_fechamento_id, v_pedido.id);
        UPDATE public.pedidos SET status_pagamento = 'pago' WHERE id = v_pedido.id;
    END LOOP;

    RETURN jsonb_build_object('sucesso', true, 'fechamento_id', v_fechamento_id, 'troco', v_troco);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

DROP INDEX IF EXISTS public.idx_fechamentos_idempotency_key_uniq;
ALTER TABLE public.fechamentos
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS cupom_codigo,
  DROP COLUMN IF EXISTS campanha_id;

COMMIT;
