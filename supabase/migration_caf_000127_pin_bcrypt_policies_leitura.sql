-- ==============================================================================
-- Migration CAF-000127: Dados sensíveis legíveis: pin_hash com bcrypt e policies
-- USING (true) de financeiro, caixa e estoque
-- ==============================================================================

-- 1. Adiciona coluna gerada tem_pin para expor presença de PIN sem expor o hash
ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS tem_pin BOOLEAN
  GENERATED ALWAYS AS (pin_hash IS NOT NULL) STORED;

-- 2. Restringe privilégios de leitura (SELECT) em public.perfis por coluna
-- Revoga SELECT em nível de tabela para authenticated, anon e PUBLIC
REVOKE SELECT ON public.perfis FROM authenticated, anon, PUBLIC;

-- Concede SELECT apenas nas colunas permitidas (sem pin_hash, pin_tentativas_erradas, pin_bloqueado_ate)
GRANT SELECT (id, nome, role, ativo, created_at, cargo_id, pode_dar_desconto, tem_pin)
  ON public.perfis TO authenticated, anon;

-- 3. Anulamento de hashes legados sha256 (forçando supervisores a redefinirem com bcrypt)
UPDATE public.perfis
SET pin_hash = NULL
WHERE pin_hash IS NOT NULL AND pin_hash !~ '^\$2';

-- 4. Função de hash de PIN utilizando bcrypt (gen_salt('bf', 10))
CREATE OR REPLACE FUNCTION public.fn_hash_pin(p_pin TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF p_pin IS NULL OR TRIM(p_pin) = '' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN extensions.crypt(TRIM(p_pin), extensions.gen_salt('bf', 10));
    EXCEPTION WHEN undefined_function OR undefined_table OR invalid_schema_name THEN
        RETURN crypt(TRIM(p_pin), gen_salt('bf', 10));
    END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hash_pin(TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hash_pin(TEXT) TO authenticated, service_role;

-- 5. Atualiza set_usuario_pin para salvar com o novo algoritmo bcrypt
CREATE OR REPLACE FUNCTION public.set_usuario_pin(
    p_user_id UUID,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_caller_id UUID := auth.uid();
BEGIN
    v_is_admin := (public.get_user_role() = 'admin' OR public.tem_permissao('admin.usuarios', v_caller_id));

    IF v_caller_id != p_user_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Acesso negado para alterar o PIN deste usuário.';
    END IF;

    IF p_pin IS NULL OR TRIM(p_pin) = '' THEN
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
$$;

REVOKE EXECUTE ON FUNCTION public.set_usuario_pin(UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_usuario_pin(UUID, TEXT) TO authenticated, service_role;

-- 6. Validação de PIN com suporte a bcrypt e busca por autorizador / supervisor
DROP FUNCTION IF EXISTS public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.validar_pin_autorizacao(
    p_pin TEXT,
    p_permissao_necessaria TEXT,
    p_motivo TEXT DEFAULT NULL,
    p_contexto JSONB DEFAULT NULL,
    p_autorizador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_autorizador RECORD;
    v_solicitante_id UUID := auth.uid();
    v_solicitante_nome TEXT;
    v_match BOOLEAN := false;
    r_perfil RECORD;
    v_cur_match BOOLEAN;
BEGIN
    -- Validação de formato do PIN
    IF p_pin IS NULL OR LENGTH(TRIM(p_pin)) < 4 OR LENGTH(TRIM(p_pin)) > 8 THEN
        RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN deve conter entre 4 e 8 dígitos numéricos.');
    END IF;

    -- Identificação do autorizador e verificação bcrypt
    IF p_autorizador_id IS NOT NULL THEN
        SELECT p.id, p.nome, p.cargo_id, p.pin_tentativas_erradas, p.pin_bloqueado_ate, p.pin_hash
        INTO v_autorizador
        FROM public.perfis p
        WHERE p.id = p_autorizador_id AND p.ativo = true;

        IF v_autorizador IS NULL THEN
            RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN inválido ou colaborador não localizado.');
        END IF;

        IF v_autorizador.pin_bloqueado_ate IS NOT NULL AND v_autorizador.pin_bloqueado_ate > now() THEN
            RETURN jsonb_build_object(
                'autorizado', false,
                'mensagem', 'PIN temporariamente bloqueado por excesso de tentativas. Tente novamente mais tarde.'
            );
        END IF;

        IF v_autorizador.pin_hash IS NOT NULL THEN
            BEGIN
                v_match := (extensions.crypt(TRIM(p_pin), v_autorizador.pin_hash) = v_autorizador.pin_hash);
            EXCEPTION WHEN OTHERS THEN
                v_match := (crypt(TRIM(p_pin), v_autorizador.pin_hash) = v_autorizador.pin_hash);
            END;
        END IF;

        IF NOT v_match THEN
            UPDATE public.perfis
            SET pin_tentativas_erradas = COALESCE(pin_tentativas_erradas, 0) + 1,
                pin_bloqueado_ate = CASE
                    WHEN COALESCE(pin_tentativas_erradas, 0) + 1 >= 5 THEN now() + interval '15 minutes'
                    ELSE NULL
                END
            WHERE id = v_autorizador.id;

            RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN inválido ou bloqueado.');
        END IF;
    ELSE
        -- Percorre perfis ativos com PIN cadastrado e não bloqueados
        FOR r_perfil IN
            SELECT p.id, p.nome, p.cargo_id, p.pin_tentativas_erradas, p.pin_bloqueado_ate, p.pin_hash
            FROM public.perfis p
            WHERE p.ativo = true
              AND p.pin_hash IS NOT NULL
              AND (p.pin_bloqueado_ate IS NULL OR p.pin_bloqueado_ate <= now())
            ORDER BY p.created_at ASC
        LOOP
            BEGIN
                v_cur_match := (extensions.crypt(TRIM(p_pin), r_perfil.pin_hash) = r_perfil.pin_hash);
            EXCEPTION WHEN OTHERS THEN
                v_cur_match := (crypt(TRIM(p_pin), r_perfil.pin_hash) = r_perfil.pin_hash);
            END;

            IF v_cur_match THEN
                v_autorizador := r_perfil;
                v_match := true;
                EXIT;
            END IF;
        END LOOP;

        IF NOT v_match THEN
            RETURN jsonb_build_object('autorizado', false, 'mensagem', 'PIN inválido ou bloqueado.');
        END IF;
    END IF;

    -- Verificação da permissão requerida
    IF NOT public.tem_permissao(p_permissao_necessaria, v_autorizador.id) THEN
        RETURN jsonb_build_object(
            'autorizado', false,
            'mensagem', 'Colaborador não possui permissão para autorizar esta ação.'
        );
    END IF;

    -- Sucesso: zera tentativas erradas e remove bloqueio
    UPDATE public.perfis
    SET pin_tentativas_erradas = 0,
        pin_bloqueado_ate = NULL
    WHERE id = v_autorizador.id;

    IF v_solicitante_id IS NOT NULL THEN
        SELECT nome INTO v_solicitante_nome FROM public.perfis WHERE id = v_solicitante_id;
    END IF;

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
        'supervisor_nome', v_autorizador.nome,
        'cargo_id', v_autorizador.cargo_id,
        'cargo_nome', (SELECT nome FROM public.cargos WHERE id = v_autorizador.cargo_id)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB, UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;

-- 7. Recalibração de policies abertas em financeiro, caixa e estoque
-- Fechamentos
DROP POLICY IF EXISTS "fechamentos_select" ON public.fechamentos;
CREATE POLICY "fechamentos_select" ON public.fechamentos
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista')
    OR public.tem_permissao('pdv.vender')
    OR public.tem_permissao('caixa.abrir_fechar')
    OR public.tem_permissao('admin.financeiro')
  );

DROP POLICY IF EXISTS "fechamento_pagamentos_select" ON public.fechamento_pagamentos;
CREATE POLICY "fechamento_pagamentos_select" ON public.fechamento_pagamentos
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista')
    OR public.tem_permissao('pdv.vender')
    OR public.tem_permissao('caixa.abrir_fechar')
    OR public.tem_permissao('admin.financeiro')
  );

DROP POLICY IF EXISTS "fechamento_pedidos_select" ON public.fechamento_pedidos;
CREATE POLICY "fechamento_pedidos_select" ON public.fechamento_pedidos
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista')
    OR public.tem_permissao('pdv.vender')
    OR public.tem_permissao('caixa.abrir_fechar')
    OR public.tem_permissao('admin.financeiro')
  );

-- Caixa movimentos
DROP POLICY IF EXISTS "caixa_movimentos_select" ON public.caixa_movimentos;
CREATE POLICY "caixa_movimentos_select" ON public.caixa_movimentos
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista')
    OR public.tem_permissao('caixa.abrir_fechar')
    OR public.tem_permissao('admin.financeiro')
  );

-- Estoque itens
DROP POLICY IF EXISTS "estoque_itens_select" ON public.estoque_itens;
CREATE POLICY "estoque_itens_select" ON public.estoque_itens
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista', 'cozinha')
    OR public.tem_permissao('estoque.visualizar')
    OR public.tem_permissao('estoque.gerenciar')
  );

-- Estoque movimentos
DROP POLICY IF EXISTS "estoque_movimentos_select" ON public.estoque_movimentos;
CREATE POLICY "estoque_movimentos_select" ON public.estoque_movimentos
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista', 'cozinha')
    OR public.tem_permissao('estoque.visualizar')
    OR public.tem_permissao('estoque.gerenciar')
  );

-- Estoque lotes
DROP POLICY IF EXISTS "estoque_lotes_select" ON public.estoque_lotes;
CREATE POLICY "estoque_lotes_select" ON public.estoque_lotes
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista', 'cozinha')
    OR public.tem_permissao('estoque.visualizar')
    OR public.tem_permissao('estoque.gerenciar')
  );

-- Revogação explícita de anon nas 7 tabelas
REVOKE SELECT ON public.estoque_lotes FROM anon, PUBLIC;
REVOKE SELECT ON public.fechamentos, public.fechamento_pagamentos, public.fechamento_pedidos, public.caixa_movimentos, public.estoque_itens, public.estoque_movimentos FROM anon, PUBLIC;

-- 8. Garante que a view pública e sanitizada da TV de retirada (v_painel_retirada)
-- seja legível por anon sem expor dados sensíveis da tabela pedidos (LGPD / RNF02 / CA10)
ALTER VIEW public.v_painel_retirada SET (security_invoker = false);
GRANT SELECT ON public.v_painel_retirada TO anon, authenticated;
