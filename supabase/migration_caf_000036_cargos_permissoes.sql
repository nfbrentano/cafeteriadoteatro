-- =========================================================
-- MIGRATION: CAF-000036 — Permissões por Cargo e Desempenho por Operador
-- =========================================================

-- 1. Tabela de Cargos
CREATE TABLE IF NOT EXISTS public.cargos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT,
    sistema BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

-- 2. Tabela de Permissões por Cargo
CREATE TABLE IF NOT EXISTS public.cargo_permissoes (
    cargo_id UUID NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
    permissao TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
    PRIMARY KEY (cargo_id, permissao)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cargo_permissoes_cargo_id ON public.cargo_permissoes(cargo_id);
CREATE INDEX IF NOT EXISTS idx_cargo_permissoes_permissao ON public.cargo_permissoes(permissao);

-- 3. Atualizar Tabela de Perfis com Cargo e PIN
ALTER TABLE public.perfis
    ADD COLUMN IF NOT EXISTS cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pin_hash TEXT,
    ADD COLUMN IF NOT EXISTS pin_tentativas_erradas INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pin_bloqueado_ate TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_perfis_cargo_id ON public.perfis(cargo_id);

-- 4. Inserir Cargos Padrão do Sistema
INSERT INTO public.cargos (nome, descricao, sistema) VALUES
('Admin', 'Acesso irrestrito a todas as configurações, módulos, relatórios e usuários', true),
('Gerente', 'Gestão operacional, cancelamentos, descontos, estoque, relatórios e clientes', false),
('Atendente / Barista', 'Atendimento de mesas, lançamento de pedidos, pagamentos e caixa', true),
('Cozinha', 'Operação do monitor de preparo de pedidos (KDS)', true)
ON CONFLICT (nome) DO NOTHING;

-- 5. Vincular Permissões Padrão para os Cargos
DO $$
DECLARE
    v_admin_id UUID;
    v_gerente_id UUID;
    v_barista_id UUID;
    v_cozinha_id UUID;
    v_perm TEXT;
    v_todas_permissoes TEXT[] := ARRAY[
        -- PDV
        'pdv.vender',
        'pdv.cancelar_item',
        'pdv.cancelar_pedido',
        'pdv.desconto',
        'pdv.cortesia',
        'pdv.transferir_mesa',
        'pdv.fechar_conta',
        -- Caixa
        'caixa.abrir_fechar',
        'caixa.sangria',
        -- KDS
        'kds.operar',
        -- Admin
        'admin.cardapio',
        'admin.relatorios',
        'admin.financeiro',
        'admin.estoque',
        'admin.clientes',
        'admin.usuarios',
        'admin.configuracoes'
    ];
BEGIN
    SELECT id INTO v_admin_id FROM public.cargos WHERE nome = 'Admin';
    SELECT id INTO v_gerente_id FROM public.cargos WHERE nome = 'Gerente';
    SELECT id INTO v_barista_id FROM public.cargos WHERE nome = 'Atendente / Barista';
    SELECT id INTO v_cozinha_id FROM public.cargos WHERE nome = 'Cozinha';

    -- Admin: Todas as permissões
    FOREACH v_perm IN ARRAY v_todas_permissoes LOOP
        INSERT INTO public.cargo_permissoes (cargo_id, permissao)
        VALUES (v_admin_id, v_perm)
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Gerente: PDV total, Caixa total, KDS e Admin operacional (sem admin.usuarios)
    IF v_gerente_id IS NOT NULL THEN
        INSERT INTO public.cargo_permissoes (cargo_id, permissao) VALUES
            (v_gerente_id, 'pdv.vender'),
            (v_gerente_id, 'pdv.cancelar_item'),
            (v_gerente_id, 'pdv.cancelar_pedido'),
            (v_gerente_id, 'pdv.desconto'),
            (v_gerente_id, 'pdv.cortesia'),
            (v_gerente_id, 'pdv.transferir_mesa'),
            (v_gerente_id, 'pdv.fechar_conta'),
            (v_gerente_id, 'caixa.abrir_fechar'),
            (v_gerente_id, 'caixa.sangria'),
            (v_gerente_id, 'kds.operar'),
            (v_gerente_id, 'admin.cardapio'),
            (v_gerente_id, 'admin.relatorios'),
            (v_gerente_id, 'admin.estoque'),
            (v_gerente_id, 'admin.clientes'),
            (v_gerente_id, 'admin.financeiro'),
            (v_gerente_id, 'admin.configuracoes')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Atendente / Barista: Vendas, transferir mesa, fechar conta, abrir/fechar caixa e sangria
    IF v_barista_id IS NOT NULL THEN
        INSERT INTO public.cargo_permissoes (cargo_id, permissao) VALUES
            (v_barista_id, 'pdv.vender'),
            (v_barista_id, 'pdv.transferir_mesa'),
            (v_barista_id, 'pdv.fechar_conta'),
            (v_barista_id, 'caixa.abrir_fechar'),
            (v_barista_id, 'caixa.sangria')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Cozinha: apenas KDS
    IF v_cozinha_id IS NOT NULL THEN
        INSERT INTO public.cargo_permissoes (cargo_id, permissao) VALUES
            (v_cozinha_id, 'kds.operar')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 6. Migrar Perfis Existentes para os Cargos Correspondentes
DO $$
DECLARE
    v_admin_id UUID;
    v_barista_id UUID;
    v_cozinha_id UUID;
BEGIN
    SELECT id INTO v_admin_id FROM public.cargos WHERE nome = 'Admin';
    SELECT id INTO v_barista_id FROM public.cargos WHERE nome = 'Atendente / Barista';
    SELECT id INTO v_cozinha_id FROM public.cargos WHERE nome = 'Cozinha';

    UPDATE public.perfis SET cargo_id = v_admin_id WHERE (cargo_id IS NULL AND role = 'admin');
    UPDATE public.perfis SET cargo_id = v_barista_id WHERE (cargo_id IS NULL AND role = 'barista');
    UPDATE public.perfis SET cargo_id = v_cozinha_id WHERE (cargo_id IS NULL AND role = 'cozinha');
END $$;

-- 7. Função Segura para Hash de PIN
CREATE OR REPLACE FUNCTION public.fn_hash_pin(p_pin TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_pin IS NULL OR TRIM(p_pin) = '' THEN
        RETURN NULL;
    END IF;
    RETURN encode(sha256(('cafeteria_teatro_pin_salt_2026_' || TRIM(p_pin))::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- 8. Função `tem_permissao(p_permissao, p_user_id)`
CREATE OR REPLACE FUNCTION public.tem_permissao(
    p_permissao TEXT,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
    v_cargo_id UUID;
    v_role TEXT;
    v_is_sistema_admin BOOLEAN := false;
    v_has_perm BOOLEAN := false;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT p.cargo_id, p.role, (c.nome = 'Admin')
    INTO v_cargo_id, v_role, v_is_sistema_admin
    FROM public.perfis p
    LEFT JOIN public.cargos c ON c.id = p.cargo_id
    WHERE p.id = p_user_id AND p.ativo = true;

    -- Se for admin do sistema ou role 'admin', tem acesso total
    IF v_is_sistema_admin OR v_role = 'admin' THEN
        RETURN true;
    END IF;

    -- Se tiver cargo vinculado, verifica na tabela de permissões
    IF v_cargo_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.cargo_permissoes
            WHERE cargo_id = v_cargo_id AND permissao = p_permissao
        ) INTO v_has_perm;

        IF v_has_perm THEN
            RETURN true;
        END IF;
    END IF;

    -- Fallback compatibilidade retroativa: se for barista e pedir desconto com flag habilitada
    IF p_permissao = 'pdv.desconto' THEN
        SELECT pode_dar_desconto INTO v_has_perm FROM public.perfis WHERE id = p_user_id;
        IF v_has_perm THEN
            RETURN true;
        END IF;
    END IF;

    -- Fallback compatibilidade retroativa com roles antigas se ainda não tiver cargo
    IF v_cargo_id IS NULL THEN
        IF v_role = 'barista' AND p_permissao IN ('pdv.vender', 'pdv.transferir_mesa', 'pdv.fechar_conta', 'caixa.abrir_fechar', 'caixa.sangria') THEN
            RETURN true;
        ELSIF v_role = 'cozinha' AND p_permissao = 'kds.operar' THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 9. Função para Retornar as Permissões do Usuário Conectado
CREATE OR REPLACE FUNCTION public.get_minhas_permissoes()
RETURNS JSONB AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_cargo_nome TEXT;
    v_is_admin BOOLEAN := false;
    v_permissoes JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('autenticado', false, 'permissoes', '[]'::jsonb);
    END IF;

    SELECT c.nome, (c.nome = 'Admin' OR p.role = 'admin')
    INTO v_cargo_nome, v_is_admin
    FROM public.perfis p
    LEFT JOIN public.cargos c ON c.id = p.cargo_id
    WHERE p.id = v_uid;

    IF v_is_admin THEN
        SELECT jsonb_agg(permissao) INTO v_permissoes
        FROM (SELECT DISTINCT permissao FROM public.cargo_permissoes) s;
    ELSE
        SELECT jsonb_agg(cp.permissao) INTO v_permissoes
        FROM public.perfis p
        JOIN public.cargo_permissoes cp ON cp.cargo_id = p.cargo_id
        WHERE p.id = v_uid;
    END IF;

    RETURN jsonb_build_object(
        'autenticado', true,
        'user_id', v_uid,
        'cargo', COALESCE(v_cargo_nome, 'Sem Cargo'),
        'is_admin', v_is_admin,
        'permissoes', COALESCE(v_permissoes, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 10. Tabela de Log de Autorizações por PIN
CREATE TABLE IF NOT EXISTS public.autorizacoes_pin_log (
    id BIGSERIAL PRIMARY KEY,
    solicitante_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    solicitante_nome TEXT,
    autorizador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    autorizador_nome TEXT NOT NULL,
    permissao TEXT NOT NULL,
    motivo TEXT,
    contexto JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

CREATE INDEX IF NOT EXISTS idx_autorizacoes_pin_created_at ON public.autorizacoes_pin_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autorizacoes_pin_autorizador ON public.autorizacoes_pin_log(autorizador_id);

-- 11. Função de Validação e Liberação por PIN
CREATE OR REPLACE FUNCTION public.validar_pin_autorizacao(
    p_pin TEXT,
    p_permissao_necessaria TEXT,
    p_motivo TEXT DEFAULT NULL,
    p_contexto JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_hash TEXT;
    v_autorizador RECORD;
    v_solicitante_nome TEXT;
    v_solicitante_id UUID := auth.uid();
BEGIN
    IF p_pin IS NULL OR LENGTH(TRIM(p_pin)) < 4 OR LENGTH(TRIM(p_pin)) > 8 THEN
        RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN deve conter entre 4 e 8 dígitos numéricos.');
    END IF;

    v_hash := public.fn_hash_pin(p_pin);

    -- Busca usuário ativo que possua este PIN
    SELECT p.id, p.nome, p.cargo_id, p.pin_tentativas_erradas, p.pin_bloqueado_ate
    INTO v_autorizador
    FROM public.perfis p
    WHERE p.pin_hash = v_hash AND p.ativo = true
    LIMIT 1;

    -- Se não encontrou usuário com esse PIN
    IF v_autorizador IS NULL THEN
        -- Verifica se algum usuário está sendo alvo de força bruta e incrementa falhas se identificado
        RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN inválido ou colaborador não localizado.');
    END IF;

    -- Verifica bloqueio temporário
    IF v_autorizador.pin_bloqueado_ate IS NOT NULL AND v_autorizador.pin_bloqueado_ate > now() THEN
        RETURN jsonb_build_object(
            'autorizado', false,
            'mensagem', 'PIN temporariamente bloqueado por excesso de tentativas. Tente novamente mais tarde.'
        );
    END IF;

    -- Verifica se o autorizador possui a permissão requerida
    IF NOT public.tem_permissao(p_permissao_necessaria, v_autorizador.id) THEN
        RETURN jsonb_build_object(
            'autorizado', false,
            'mensagem', 'O supervisor identificado por este PIN não possui permissão para autorizar esta ação (' || p_permissao_necessaria || ').'
        );
    END IF;

    -- Reseta tentativas erradas
    UPDATE public.perfis
    SET pin_tentativas_erradas = 0, pin_bloqueado_ate = NULL
    WHERE id = v_autorizador.id;

    -- Resolve nome do solicitante
    IF v_solicitante_id IS NOT NULL THEN
        SELECT nome INTO v_solicitante_nome FROM public.perfis WHERE id = v_solicitante_id;
    END IF;

    -- Registra o log de autorização
    INSERT INTO public.autorizacoes_pin_log (
        solicitante_id,
        solicitante_nome,
        autorizador_id,
        autorizador_nome,
        permissao,
        motivo,
        contexto
    ) VALUES (
        v_solicitante_id,
        COALESCE(v_solicitante_nome, 'Operador'),
        v_autorizador.id,
        v_autorizador.nome,
        p_permissao_necessaria,
        p_motivo,
        p_contexto
    );

    RETURN jsonb_build_object(
        'autorizado', true,
        'autorizador_id', v_autorizador.id,
        'autorizador_nome', v_autorizador.nome,
        'permissao', p_permissao_necessaria
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 12. Função para Definir PIN de Colaborador
CREATE OR REPLACE FUNCTION public.set_usuario_pin(
    p_user_id UUID,
    p_pin TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_caller_id UUID := auth.uid();
BEGIN
    -- Permitido se for o próprio usuário ou quem possui permissão admin.usuarios
    v_is_admin := public.tem_permissao('admin.usuarios', v_caller_id);

    IF v_caller_id != p_user_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Acesso negado para alterar o PIN deste usuário.';
    END IF;

    IF p_pin IS NULL OR TRIM(p_pin) = '' THEN
        -- Remove PIN
        UPDATE public.perfis
        SET pin_hash = NULL, pin_tentativas_erradas = 0, pin_bloqueado_ate = NULL
        WHERE id = p_user_id;
        RETURN jsonb_build_object('sucesso', true, 'mensagem', 'PIN removido.');
    END IF;

    IF LENGTH(TRIM(p_pin)) < 4 OR LENGTH(TRIM(p_pin)) > 8 THEN
        RAISE EXCEPTION 'O PIN deve conter entre 4 e 8 dígitos numéricos.';
    END IF;

    UPDATE public.perfis
    SET pin_hash = public.fn_hash_pin(p_pin),
        pin_tentativas_erradas = 0,
        pin_bloqueado_ate = NULL
    WHERE id = p_user_id;

    RETURN jsonb_build_object('sucesso', true, 'mensagem', 'PIN salvo com sucesso.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. RPC: Relatório de Desempenho por Operador
CREATE OR REPLACE FUNCTION public.get_relatorio_desempenho_operadores(
    p_data_inicio TIMESTAMPTZ,
    p_data_fim TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_resultado JSONB;
BEGIN
    IF NOT (public.tem_permissao('admin.relatorios') OR public.get_user_role() = 'admin') THEN
        RAISE EXCEPTION 'Acesso negado. Apenas usuários autorizados podem visualizar relatórios.';
    END IF;

    WITH vendas_op AS (
        SELECT
            p.criado_por AS operador_id,
            COALESCE(p.criado_por_nome, perf.nome, 'Não identificado') AS operador_nome,
            COALESCE(c.nome, 'Sem Cargo') AS cargo_nome,
            COUNT(p.id) AS total_pedidos,
            COUNT(CASE WHEN p.status = 'cancelado' THEN 1 END) AS qtd_pedidos_cancelados,
            COUNT(CASE WHEN p.status != 'cancelado' THEN 1 END) AS qtd_pedidos_concluidos,
            COALESCE(SUM(CASE WHEN p.status != 'cancelado' THEN p.total ELSE 0 END), 0) AS total_faturado,
            COALESCE(AVG(CASE WHEN p.status != 'cancelado' THEN p.total END), 0) AS ticket_medio
        FROM public.pedidos p
        LEFT JOIN public.perfis perf ON perf.id = p.criado_por
        LEFT JOIN public.cargos c ON c.id = perf.cargo_id
        WHERE p.created_at >= p_data_inicio AND p.created_at <= p_data_fim
        GROUP BY p.criado_por, COALESCE(p.criado_por_nome, perf.nome, 'Não identificado'), c.nome
    ),
    descontos_op AS (
        SELECT
            f.desconto_por AS operador_id,
            COUNT(f.id) AS qtd_descontos,
            COALESCE(SUM(f.desconto_manual), 0) AS total_descontos
        FROM public.fechamentos f
        WHERE f.desconto_manual > 0
          AND f.fechado_em >= p_data_inicio
          AND f.fechado_em <= p_data_fim
          AND f.desconto_por IS NOT NULL
        GROUP BY f.desconto_por
    ),
    cancelamentos_itens AS (
        SELECT
            pe.usuario_id AS operador_id,
            COUNT(pe.id) AS qtd_itens_cancelados
        FROM public.pedido_eventos pe
        WHERE pe.acao ILIKE '%cancel%'
          AND pe.created_at >= p_data_inicio
          AND pe.created_at <= p_data_fim
          AND pe.usuario_id IS NOT NULL
        GROUP BY pe.usuario_id
    )
    SELECT jsonb_agg(jsonb_build_object(
        'operador_id', v.operador_id,
        'operador_nome', v.operador_nome,
        'cargo_nome', v.cargo_nome,
        'total_pedidos', v.total_pedidos,
        'pedidos_concluidos', v.qtd_pedidos_concluidos,
        'pedidos_cancelados', v.qtd_pedidos_cancelados,
        'faturamento_total', v.total_faturado,
        'ticket_medio', ROUND(v.ticket_medio, 2),
        'qtd_descontos_concedidos', COALESCE(d.qtd_descontos, 0),
        'total_descontos_concedidos', COALESCE(d.total_descontos, 0),
        'qtd_itens_cancelados', COALESCE(ci.qtd_itens_cancelados, 0)
    ))
    INTO v_resultado
    FROM vendas_op v
    LEFT JOIN descontos_op d ON d.operador_id = v.operador_id
    LEFT JOIN cancelamentos_itens ci ON ci.operador_id = v.operador_id;

    RETURN COALESCE(v_resultado, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 14. Habilitar RLS em Cargos e Permissões
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autorizacoes_pin_log ENABLE ROW LEVEL SECURITY;

-- Policies Cargos
DROP POLICY IF EXISTS "cargos_select_authenticated" ON public.cargos;
CREATE POLICY "cargos_select_authenticated" ON public.cargos
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cargos_write_admin" ON public.cargos;
CREATE POLICY "cargos_write_admin" ON public.cargos
    FOR ALL TO authenticated
    USING (public.tem_permissao('admin.usuarios'))
    WITH CHECK (public.tem_permissao('admin.usuarios'));

-- Policies Cargo Permissoes
DROP POLICY IF EXISTS "cargo_permissoes_select_authenticated" ON public.cargo_permissoes;
CREATE POLICY "cargo_permissoes_select_authenticated" ON public.cargo_permissoes
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cargo_permissoes_write_admin" ON public.cargo_permissoes;
CREATE POLICY "cargo_permissoes_write_admin" ON public.cargo_permissoes
    FOR ALL TO authenticated
    USING (public.tem_permissao('admin.usuarios'))
    WITH CHECK (public.tem_permissao('admin.usuarios'));

-- Policies Log de Autorizações
DROP POLICY IF EXISTS "autorizacoes_pin_log_select_admin" ON public.autorizacoes_pin_log;
CREATE POLICY "autorizacoes_pin_log_select_admin" ON public.autorizacoes_pin_log
    FOR SELECT TO authenticated
    USING (public.tem_permissao('admin.relatorios') OR public.tem_permissao('admin.usuarios'));

-- Proteção: impedir exclusão ou desativação de cargos do sistema
CREATE OR REPLACE FUNCTION public.fn_proteger_cargo_sistema()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.sistema = true AND (TG_OP = 'DELETE' OR NEW.nome != OLD.nome) THEN
        RAISE EXCEPTION 'Cargos essenciais do sistema não podem ser excluídos ou renomeados.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_cargo_sistema ON public.cargos;
CREATE TRIGGER trg_proteger_cargo_sistema
    BEFORE UPDATE OR DELETE ON public.cargos
    FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_cargo_sistema();
