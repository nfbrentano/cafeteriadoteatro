-- ============================================================================
-- MIGRATION CAF-000081: Segurança: PIN com Bloqueio, Permissões Efetivas e RLS
-- ============================================================================
-- 1. validar_pin_autorizacao resistente a força bruta com seleção de autorizador,
--    bloqueio após 5 falhas (15 min) e rate limiting de 10 falhas por solicitante.
-- 2. Restringir transição de pedidos para 'entregue' (proibir perfil cozinha).
-- 3. Validação de cancelamento de itens (motivo >= 3 chars, checagem de permissão).
-- 4. transferir_mesa como SECURITY DEFINER com checagem de permissão.
-- 5. Revogação de acesso de anon às RPCs operacionais internas.
-- ============================================================================

-- 1. Validação de PIN com controle de força bruta e autorizador específico
CREATE OR REPLACE FUNCTION public.validar_pin_autorizacao(
    p_pin TEXT,
    p_permissao_necessaria TEXT,
    p_motivo TEXT DEFAULT NULL,
    p_contexto JSONB DEFAULT NULL,
    p_autorizador_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_hash TEXT;
    v_autorizador RECORD;
    v_solicitante_id UUID := auth.uid();
    v_falhas_solicitante INT := 0;
BEGIN
    -- 1. Validação de formato do PIN
    IF p_pin IS NULL OR LENGTH(TRIM(p_pin)) < 4 OR LENGTH(TRIM(p_pin)) > 8 THEN
        RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN deve conter entre 4 e 8 dígitos numéricos.');
    END IF;

    -- 2. Rate limiting por solicitante (máx 10 falhas nos últimos 15 min)
    IF v_solicitante_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_falhas_solicitante
        FROM public.autorizacoes_pin_log
        WHERE solicitante_id = v_solicitante_id
          AND sucesso = false
          AND created_at > (now() - interval '15 minutes');

        IF v_falhas_solicitante >= 10 THEN
            RETURN jsonb_build_object(
                'autorizado', false,
                'mensagem', 'Limite de tentativas de autorização excedido para este operador. Aguarde 15 minutos.'
            );
        END IF;
    END IF;

    v_hash := public.fn_hash_pin(p_pin);

    -- 3. Identificação do autorizador
    IF p_autorizador_id IS NOT NULL THEN
        SELECT p.id, p.nome, p.cargo_id, p.pin_tentativas_erradas, p.pin_bloqueado_ate, p.pin_hash
        INTO v_autorizador
        FROM public.perfis p
        WHERE p.id = p_autorizador_id AND p.ativo = true;

        IF v_autorizador IS NULL THEN
            RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN inválido ou colaborador não localizado.');
        END IF;
    ELSE
        SELECT p.id, p.nome, p.cargo_id, p.pin_tentativas_erradas, p.pin_bloqueado_ate, p.pin_hash
        INTO v_autorizador
        FROM public.perfis p
        WHERE p.pin_hash = v_hash AND p.ativo = true
        LIMIT 1;
    END IF;

    -- 4. Verificação de bloqueio temporário
    IF v_autorizador IS NOT NULL AND v_autorizador.pin_bloqueado_ate IS NOT NULL AND v_autorizador.pin_bloqueado_ate > now() THEN
        RETURN jsonb_build_object(
            'autorizado', false,
            'mensagem', 'PIN temporariamente bloqueado por excesso de tentativas. Tente novamente mais tarde.'
        );
    END IF;

    -- 5. Validação do PIN
    IF v_autorizador IS NULL OR v_autorizador.pin_hash IS NULL OR v_autorizador.pin_hash != v_hash THEN
        IF v_autorizador IS NOT NULL THEN
            UPDATE public.perfis
            SET pin_tentativas_erradas = COALESCE(pin_tentativas_erradas, 0) + 1,
                pin_bloqueado_ate = CASE
                    WHEN COALESCE(pin_tentativas_erradas, 0) + 1 >= 5 THEN now() + interval '15 minutes'
                    ELSE NULL
                END
            WHERE id = v_autorizador.id;
        END IF;

        INSERT INTO public.autorizacoes_pin_log (
            solicitante_id,
            autorizador_id,
            permissao_solicitada,
            sucesso,
            motivo_recusa,
            motivo_solicitacao,
            contexto
        ) VALUES (
            v_solicitante_id,
            v_autorizador.id,
            p_permissao_necessaria,
            false,
            'PIN incorreto',
            p_motivo,
            p_contexto
        );

        RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN inválido ou bloqueado.');
    END IF;

    -- 6. Verificação da permissão requerida
    IF NOT public.tem_permissao(p_permissao_necessaria, v_autorizador.id) THEN
        INSERT INTO public.autorizacoes_pin_log (
            solicitante_id,
            autorizador_id,
            permissao_solicitada,
            sucesso,
            motivo_recusa,
            motivo_solicitacao,
            contexto
        ) VALUES (
            v_solicitante_id,
            v_autorizador.id,
            p_permissao_necessaria,
            false,
            'Supervisor sem permissão requerida',
            p_motivo,
            p_contexto
        );

        RETURN jsonb_build_object(
            'autorizado', false,
            'mensagem', 'O supervisor selecionado não possui permissão para autorizar esta ação (' || p_permissao_necessaria || ').'
        );
    END IF;

    -- 7. Sucesso: zera tentativas erradas
    UPDATE public.perfis
    SET pin_tentativas_erradas = 0,
        pin_bloqueado_ate = NULL
    WHERE id = v_autorizador.id;

    INSERT INTO public.autorizacoes_pin_log (
        solicitante_id,
        autorizador_id,
        permissao_solicitada,
        sucesso,
        motivo_solicitacao,
        contexto
    ) VALUES (
        v_solicitante_id,
        v_autorizador.id,
        p_permissao_necessaria,
        true,
        p_motivo,
        p_contexto
    );

    RETURN jsonb_build_object(
        'autorizado', true,
        'supervisor_id', v_autorizador.id,
        'supervisor_nome', v_autorizador.nome
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Proibir que perfil cozinha marque pedidos como entregue
CREATE OR REPLACE FUNCTION public.fn_validar_transicao_pedido_entregue()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'entregue' AND (OLD.status IS NULL OR OLD.status != 'entregue') THEN
        IF public.get_user_role() = 'cozinha' AND NOT public.tem_permissao('pdv.entregar', auth.uid()) THEN
            RAISE EXCEPTION 'Apenas atendentes, baristas ou administradores podem marcar pedidos como entregues.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validar_pedido_entregue ON public.pedidos;
CREATE TRIGGER trg_validar_pedido_entregue
    BEFORE UPDATE ON public.pedidos
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validar_transicao_pedido_entregue();

-- 3. Cancelamento de itens com validação de motivo e permissão
CREATE OR REPLACE FUNCTION public.cancelar_item(
    p_item_id BIGINT,
    p_motivo TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_pedido_id UUID;
    v_pedido_pago BOOLEAN;
    v_item_cancelado BOOLEAN;
BEGIN
    IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 3 THEN
        RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mínimo 3 caracteres).';
    END IF;

    IF NOT (public.tem_permissao('pdv.cancelar_item', auth.uid()) OR public.get_user_role() = 'admin') THEN
        RAISE EXCEPTION 'Acesso negado: sem permissão para cancelar itens.';
    END IF;

    SELECT pedido_id, cancelado INTO v_pedido_id, v_item_cancelado
    FROM public.pedido_itens
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item não encontrado.';
    END IF;

    IF v_item_cancelado THEN
        RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Item já cancelado.');
    END IF;

    SELECT (status_pagamento = 'pago') INTO v_pedido_pago
    FROM public.pedidos
    WHERE id = v_pedido_id;

    IF v_pedido_pago AND public.get_user_role() != 'admin' AND NOT public.tem_permissao('pdv.cancelar_item_pago', auth.uid()) THEN
        RAISE EXCEPTION 'Cancelamento de item de pedido pago exige perfil de administrador.';
    END IF;

    UPDATE public.pedido_itens
    SET cancelado = true,
        motivo_cancelamento = TRIM(p_motivo),
        cancelado_por = auth.uid(),
        cancelado_em = now()
    WHERE id = p_item_id;

    PERFORM public.recalcular_total_pedido(v_pedido_id);

    RETURN jsonb_build_object('sucesso', true, 'item_id', p_item_id, 'pedido_id', v_pedido_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Transferência de mesa protegida
CREATE OR REPLACE FUNCTION public.transferir_mesa(
    p_mesa_origem TEXT,
    p_mesa_destino TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_count INT;
BEGIN
    IF NOT (public.tem_permissao('pdv.transferir_mesa', auth.uid()) OR public.get_user_role() IN ('admin', 'barista')) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não possui permissão para transferir mesas.';
    END IF;

    IF p_mesa_origem IS NULL OR p_mesa_destino IS NULL OR TRIM(p_mesa_origem) = '' OR TRIM(p_mesa_destino) = '' THEN
        RAISE EXCEPTION 'Mesa de origem e mesa de destino são obrigatórias.';
    END IF;

    IF TRIM(p_mesa_origem) = TRIM(p_mesa_destino) THEN
        RAISE EXCEPTION 'Mesa de origem e destino devem ser diferentes.';
    END IF;

    UPDATE public.pedidos
    SET mesa = TRIM(p_mesa_destino)
    WHERE mesa = TRIM(p_mesa_origem)
      AND status != 'cancelado'
      AND status != 'entregue'
      AND status_pagamento != 'pago';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'sucesso', true,
        'origem', p_mesa_origem,
        'destino', p_mesa_destino,
        'pedidos_transferidos', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Revogação de acesso anônimo
REVOKE EXECUTE ON FUNCTION public.validar_pin_autorizacao FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_usuario_pin FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_item FROM anon;
REVOKE EXECUTE ON FUNCTION public.transferir_mesa FROM anon;
