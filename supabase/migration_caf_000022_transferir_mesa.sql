-- ==========================================
-- CAF-000011: Transferir e Juntar Mesas
-- ==========================================

-- Função RPC para transferir pedidos não pagos de uma mesa para outra
CREATE OR REPLACE FUNCTION public.transferir_mesa(p_origem TEXT, p_destino TEXT)
RETURNS void AS $$
BEGIN
    -- Verificar se p_origem e p_destino são iguais
    IF p_origem = p_destino THEN
        RAISE EXCEPTION 'A mesa de origem e destino não podem ser iguais';
    END IF;

    -- Verificar se p_destino está ativa e existe
    IF NOT EXISTS (SELECT 1 FROM public.mesas WHERE codigo = p_destino AND ativo = true) THEN
        RAISE EXCEPTION 'A mesa de destino não foi encontrada ou está inativa';
    END IF;

    -- Realizar a transferência dos pedidos pendentes ou parciais, ignorando cancelados
    UPDATE public.pedidos
    SET 
        mesa_codigo = p_destino,
        updated_at = NOW()
    WHERE 
        mesa_codigo = p_origem
        AND status_pagamento IN ('pendente', 'parcial')
        AND status != 'cancelado';
END;
$$ LANGUAGE plpgsql;
