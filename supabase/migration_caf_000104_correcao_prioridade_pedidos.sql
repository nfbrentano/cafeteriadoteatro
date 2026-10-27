-- =========================================================
-- MIGRATION: CAF-000104 - Correção das Colunas prioridade e prioridade_motivo na Tabela pedidos
-- =========================================================

-- 1. Adicionar colunas na tabela pedidos de forma idempotente
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS prioridade SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prioridade_motivo TEXT;

-- 2. Índice composto para aceleração de ordenação na fila do KDS
CREATE INDEX IF NOT EXISTS idx_pedidos_prioridade_created 
  ON public.pedidos(prioridade DESC, created_at ASC);

-- 3. Atualizar a trigger function de auditoria para incluir prioridade
CREATE OR REPLACE FUNCTION public.fn_audit_pedidos()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_nome TEXT;
BEGIN
    -- Caso INSERT (pedido criado)
    IF TG_OP = 'INSERT' THEN
        v_user_id := COALESCE(NEW.criado_por, auth.uid());
        v_user_nome := public.fn_resolver_nome_usuario(v_user_id, NEW.criado_por_nome);

        INSERT INTO public.pedido_eventos (
            pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
        ) VALUES (
            NEW.id, NULL, 'criado', NULL, NEW.status, 
            CASE 
                WHEN NEW.prioridade = 1 THEN CONCAT('⚡ Prioritário (', COALESCE(NEW.prioridade_motivo, 'Sem motivo'), ') - ', COALESCE(NEW.observacoes, ''))
                ELSE NEW.observacoes 
            END,
            v_user_id, v_user_nome, NEW.created_at
        );
        RETURN NEW;
    END IF;

    -- Caso UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- 1) Mudança de Status
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            IF NEW.status = 'cancelado' THEN
                v_user_id := COALESCE(NEW.cancelado_por, auth.uid());
                v_user_nome := public.fn_resolver_nome_usuario(v_user_id, NEW.cancelado_por_nome);

                INSERT INTO public.pedido_eventos (
                    pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
                ) VALUES (
                    NEW.id, NULL, 'cancelado', OLD.status, 'cancelado', NEW.motivo_cancelamento, v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
                );
            ELSE
                IF NEW.status = 'concluido' THEN
                    v_user_id := COALESCE(NEW.concluido_por, auth.uid());
                ELSIF NEW.status = 'entregue' THEN
                    v_user_id := COALESCE(NEW.entregue_por, auth.uid());
                ELSE
                    v_user_id := auth.uid();
                END IF;
                v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

                INSERT INTO public.pedido_eventos (
                    pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
                ) VALUES (
                    NEW.id, NULL, 'status_alterado', OLD.status, NEW.status, NULL, v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
                );
            END IF;
        END IF;

        -- 2) Mudança de Prioridade (CAF-000029 / CAF-000104)
        IF OLD.prioridade IS DISTINCT FROM NEW.prioridade THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'prioridade_alterada',
                CASE WHEN OLD.prioridade = 1 THEN 'prioritário' ELSE 'normal' END,
                CASE WHEN NEW.prioridade = 1 THEN 'prioritário' ELSE 'normal' END,
                NEW.prioridade_motivo,
                v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
            );
        END IF;

        -- 3) Transferência de Mesa
        IF OLD.mesa_codigo IS DISTINCT FROM NEW.mesa_codigo THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'mesa_transferida', OLD.mesa_codigo, NEW.mesa_codigo, 'Transferência de mesa', v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
            );
        END IF;

        -- 4) Confirmação de Pagamento
        IF (OLD.status_pagamento IS DISTINCT FROM NEW.status_pagamento AND NEW.status_pagamento = 'pago')
           OR (OLD.forma_pagamento IS DISTINCT FROM NEW.forma_pagamento AND NEW.status_pagamento = 'pago' AND OLD.status_pagamento != 'pago') THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'pagamento', COALESCE(OLD.status_pagamento, 'pendente'), 'pago',
                CONCAT('Forma: ', COALESCE(NEW.forma_pagamento, 'não informada')),
                v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC para alternar prioridade de um pedido (barista, cozinha ou admin)
CREATE OR REPLACE FUNCTION public.alterar_prioridade_pedido(
  p_pedido_id BIGINT, 
  p_prioridade SMALLINT, 
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'cozinha', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.pedidos
  SET prioridade = p_prioridade,
      prioridade_motivo = CASE WHEN p_prioridade = 1 THEN p_motivo ELSE NULL END,
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  RETURN jsonb_build_object('id', p_pedido_id, 'prioridade', p_prioridade, 'prioridade_motivo', p_motivo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.alterar_prioridade_pedido(BIGINT, SMALLINT, TEXT) TO authenticated;

-- 5. Registrar execução na tabela app_migrations
INSERT INTO public.app_migrations (versao, arquivo, aplicada_em, aplicada_por)
VALUES ('104', 'migration_caf_000104_correcao_prioridade_pedidos.sql', timezone('utc', now()), current_user)
ON CONFLICT (versao) DO NOTHING;

