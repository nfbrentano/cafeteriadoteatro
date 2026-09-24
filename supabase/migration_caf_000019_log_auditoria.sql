-- =========================================================
-- MIGRATION: CAF-000019 — Log de auditoria dos pedidos
-- =========================================================

-- 1. Adicionar colunas de cancelamento na tabela de pedidos se não existirem
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelado_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

-- 2. Criar a tabela de pedido_eventos
CREATE TABLE IF NOT EXISTS public.pedido_eventos (
    id BIGSERIAL PRIMARY KEY,
    pedido_id BIGINT NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES public.pedido_itens(id) ON DELETE SET NULL,
    acao TEXT NOT NULL,
    de TEXT,
    para TEXT,
    motivo TEXT,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_nome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido_id ON public.pedido_eventos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_acao ON public.pedido_eventos(acao);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_usuario_id ON public.pedido_eventos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_created_at ON public.pedido_eventos(created_at DESC);

-- 3. Habilitar RLS em pedido_eventos
ALTER TABLE public.pedido_eventos ENABLE ROW LEVEL SECURITY;

-- Leitura exclusiva para administradores
DROP POLICY IF EXISTS "pedido_eventos_select_admin" ON public.pedido_eventos;
CREATE POLICY "pedido_eventos_select_admin" ON public.pedido_eventos
    FOR SELECT TO authenticated
    USING (public.get_user_role() = 'admin');

-- Bloquear INSERT, UPDATE e DELETE diretos pela API REST (apenas triggers SECURITY DEFINER inserem)
DROP POLICY IF EXISTS "pedido_eventos_insert_block" ON public.pedido_eventos;
DROP POLICY IF EXISTS "pedido_eventos_update_block" ON public.pedido_eventos;
DROP POLICY IF EXISTS "pedido_eventos_delete_block" ON public.pedido_eventos;
-- Sem policies para INSERT/UPDATE/DELETE, o RLS bloqueia automaticamente qualquer tentativa via API.

-- 4. Função auxiliar para resolver o nome do usuário
CREATE OR REPLACE FUNCTION public.fn_resolver_nome_usuario(p_user_id UUID, p_fallback_nome TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    v_nome TEXT;
BEGIN
    IF p_fallback_nome IS NOT NULL AND TRIM(p_fallback_nome) != '' THEN
        RETURN p_fallback_nome;
    END IF;

    IF p_user_id IS NOT NULL THEN
        SELECT nome INTO v_nome FROM public.perfis WHERE id = p_user_id;
        IF v_nome IS NOT NULL AND TRIM(v_nome) != '' THEN
            RETURN v_nome;
        END IF;
    END IF;

    RETURN 'Sistema';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger Function para eventos em public.pedidos
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
            NEW.id, NULL, 'criado', NULL, NEW.status, NEW.observacoes, v_user_id, v_user_nome, NEW.created_at
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

        -- 2) Transferência de Mesa
        IF OLD.mesa_codigo IS DISTINCT FROM NEW.mesa_codigo THEN
            v_user_id := auth.uid();
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.id, NULL, 'mesa_transferida', OLD.mesa_codigo, NEW.mesa_codigo, 'Transferência de mesa', v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
            );
        END IF;

        -- 3) Confirmação de Pagamento
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

DROP TRIGGER IF EXISTS trg_audit_pedidos ON public.pedidos;
CREATE TRIGGER trg_audit_pedidos
AFTER INSERT OR UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_pedidos();

-- 6. Trigger Function para eventos em public.pedido_itens
CREATE OR REPLACE FUNCTION public.fn_audit_pedido_itens()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_nome TEXT;
BEGIN
    -- Caso INSERT (item adicionado)
    IF TG_OP = 'INSERT' THEN
        v_user_id := auth.uid();
        v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

        INSERT INTO public.pedido_eventos (
            pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
        ) VALUES (
            NEW.pedido_id, NEW.id, 'item_adicionado', NULL,
            CONCAT(NEW.quantidade, 'x ', NEW.nome_produto),
            NEW.observacoes, v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
        );
        RETURN NEW;
    END IF;

    -- Caso UPDATE (item cancelado)
    IF TG_OP = 'UPDATE' THEN
        IF (OLD.cancelado IS DISTINCT FROM true AND NEW.cancelado = true) THEN
            v_user_id := COALESCE(NEW.cancelado_por, auth.uid());
            v_user_nome := public.fn_resolver_nome_usuario(v_user_id);

            INSERT INTO public.pedido_eventos (
                pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at
            ) VALUES (
                NEW.pedido_id, NEW.id, 'item_cancelado',
                CONCAT(NEW.quantidade, 'x ', NEW.nome_produto),
                'cancelado',
                NEW.motivo_cancelamento,
                v_user_id, v_user_nome, timezone('America/Sao_Paulo', now())
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_pedido_itens ON public.pedido_itens;
CREATE TRIGGER trg_audit_pedido_itens
AFTER INSERT OR UPDATE ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_pedido_itens();
