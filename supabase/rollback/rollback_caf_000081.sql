BEGIN;

-- Rollback CAF-000081
DELETE FROM public.app_migrations WHERE versao = '081';

DROP TRIGGER IF EXISTS trg_validar_pedido_entregue ON public.pedidos;
DROP FUNCTION IF EXISTS public.fn_validar_pedido_entregue();

DROP FUNCTION IF EXISTS public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB, UUID);

-- Restaura validar_pin_autorizacao de 4 parâmetros da CAF-000036
CREATE OR REPLACE FUNCTION public.validar_pin_autorizacao(
    p_pin TEXT,
    p_permissao_necessaria TEXT,
    p_motivo TEXT DEFAULT NULL,
    p_contexto JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_hash TEXT;
    v_supervisor RECORD;
BEGIN
    v_hash := encode(sha256(p_pin::bytea), 'hex');

    SELECT p.id, p.nome, p.cargo_id INTO v_supervisor
    FROM public.perfis p
    WHERE p.pin_hash = v_hash AND p.ativo = true
    LIMIT 1;

    IF v_supervisor IS NULL THEN
        RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN inválido');
    END IF;

    RETURN jsonb_build_object('autorizado', true, 'supervisor_id', v_supervisor.id, 'supervisor_nome', v_supervisor.nome);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- Restaura transferir_mesa void da CAF-000022
DROP FUNCTION IF EXISTS public.transferir_mesa(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.transferir_mesa(p_origem TEXT, p_destino TEXT)
RETURNS void AS $$
BEGIN
    IF p_origem = p_destino THEN
        RAISE EXCEPTION 'A mesa de origem e destino não podem ser iguais';
    END IF;

    UPDATE public.pedidos
    SET mesa_codigo = p_destino, updated_at = NOW()
    WHERE mesa_codigo = p_origem
      AND status_pagamento IN ('pendente', 'parcial')
      AND status != 'cancelado';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.transferir_mesa(TEXT, TEXT) TO authenticated, service_role;

COMMIT;
