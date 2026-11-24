-- ==============================================================================
-- Migration CAF-000128: Integridade Monetária no Servidor
-- ==============================================================================
-- RF01: Sinais e limites em fechar_conta_mesa e registrar_pagamento_parcial_mesa
-- RF02: Teto de taxa de serviço (20% do subtotal restante)
-- RF03: CHECK constraints NOT VALID em fechamentos, fechamento_pagamentos e pedido_itens
-- RF04: Quantidade entre 1 e 99 em criar_pedido e adicionar_itens_pedido
-- RF05: Permissão de desconto no servidor por public.tem_permissao('pdv.desconto', v_uid)
-- RF06: Token de autorização por PIN (autorizacoes_pin_tokens) de uso único e TTL 5 min
-- RF07: Recálculo de cupom no servidor (ignora valor do cliente e dispensa pdv.desconto)
-- RF08: fechamentos.desconto_por registra supervisor do PIN quando autorizado via PIN
-- ==============================================================================

-- 1. Relatório de Inconformidades Históricas (Diagnostic Notice)
DO $$
DECLARE
  v_fech_taxa_neg INT;
  v_fech_desc_neg INT;
  v_pag_valor_inval INT;
  v_pag_forma_inval INT;
  v_item_qtd_inval INT;
BEGIN
  SELECT count(*) INTO v_fech_taxa_neg FROM public.fechamentos WHERE taxa_servico < 0;
  SELECT count(*) INTO v_fech_desc_neg FROM public.fechamentos WHERE desconto_manual < 0;
  SELECT count(*) INTO v_pag_valor_inval FROM public.fechamento_pagamentos WHERE valor <= 0;
  SELECT count(*) INTO v_pag_forma_inval FROM public.fechamento_pagamentos WHERE forma NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente');
  SELECT count(*) INTO v_item_qtd_inval FROM public.pedido_itens WHERE quantidade <= 0;

  RAISE NOTICE '[CAF-000128 Relatorio de Inconformidades Antigas]';
  RAISE NOTICE 'fechamentos com taxa_servico < 0: %', v_fech_taxa_neg;
  RAISE NOTICE 'fechamentos com desconto_manual < 0: %', v_fech_desc_neg;
  RAISE NOTICE 'fechamento_pagamentos com valor <= 0: %', v_pag_valor_inval;
  RAISE NOTICE 'fechamento_pagamentos com forma invalida: %', v_pag_forma_inval;
  RAISE NOTICE 'pedido_itens com quantidade <= 0: %', v_item_qtd_inval;
END;
$$;

-- 2. CHECK Constraints NOT VALID (RF03 / CA05)
ALTER TABLE public.fechamentos
  DROP CONSTRAINT IF EXISTS chk_fechamentos_taxa_servico_positiva;
ALTER TABLE public.fechamentos
  ADD CONSTRAINT chk_fechamentos_taxa_servico_positiva
  CHECK (taxa_servico >= 0) NOT VALID;

ALTER TABLE public.fechamentos
  DROP CONSTRAINT IF EXISTS chk_fechamentos_desconto_manual_positivo;
ALTER TABLE public.fechamentos
  ADD CONSTRAINT chk_fechamentos_desconto_manual_positivo
  CHECK (desconto_manual >= 0) NOT VALID;

ALTER TABLE public.fechamento_pagamentos
  DROP CONSTRAINT IF EXISTS chk_fechamento_pagamentos_valor_positivo;
ALTER TABLE public.fechamento_pagamentos
  ADD CONSTRAINT chk_fechamento_pagamentos_valor_positivo
  CHECK (valor > 0) NOT VALID;

ALTER TABLE public.fechamento_pagamentos
  DROP CONSTRAINT IF EXISTS chk_fechamento_pagamentos_forma_valida;
ALTER TABLE public.fechamento_pagamentos
  ADD CONSTRAINT chk_fechamento_pagamentos_forma_valida
  CHECK (forma IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente')) NOT VALID;

ALTER TABLE public.pedido_itens
  DROP CONSTRAINT IF EXISTS chk_pedido_itens_quantidade_positiva;
ALTER TABLE public.pedido_itens
  ADD CONSTRAINT chk_pedido_itens_quantidade_positiva
  CHECK (quantidade > 0) NOT VALID;

-- 3. Tabela de Tokens de Autorização por PIN de uso único (RF06 / CA08, CA09)
CREATE TABLE IF NOT EXISTS public.autorizacoes_pin_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitante_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    autorizador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permissao TEXT NOT NULL,
    mesa_codigo TEXT,
    valor_limite NUMERIC(10,2),
    usado BOOLEAN NOT NULL DEFAULT false,
    usado_em TIMESTAMPTZ,
    expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.autorizacoes_pin_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autorizacoes_pin_tokens_auth" ON public.autorizacoes_pin_tokens;
CREATE POLICY "autorizacoes_pin_tokens_auth"
    ON public.autorizacoes_pin_tokens
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.autorizacoes_pin_tokens FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.autorizacoes_pin_tokens TO authenticated;
GRANT ALL ON public.autorizacoes_pin_tokens TO service_role;

CREATE INDEX IF NOT EXISTS idx_autorizacoes_pin_tokens_validade
    ON public.autorizacoes_pin_tokens (id, usado, expira_em);

-- 4. Atualização de validar_pin_autorizacao para emissão de autorizacao_id de uso único
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
    v_token_id UUID;
    v_limite NUMERIC(10,2) := NULL;
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

    -- Extração segura do limite de valor a partir do contexto
    IF p_contexto IS NOT NULL THEN
        IF (p_contexto->>'valor') IS NOT NULL AND (p_contexto->>'valor') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            v_limite := (p_contexto->>'valor')::NUMERIC(10,2);
        ELSIF (p_contexto->>'desconto') IS NOT NULL AND (p_contexto->>'desconto') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
            v_limite := (p_contexto->>'desconto')::NUMERIC(10,2);
        END IF;
    END IF;

    -- Geração do token de uso único
    v_token_id := gen_random_uuid();
    INSERT INTO public.autorizacoes_pin_tokens (
        id,
        solicitante_id,
        autorizador_id,
        permissao,
        mesa_codigo,
        valor_limite,
        expira_em
    ) VALUES (
        v_token_id,
        v_solicitante_id,
        v_autorizador.id,
        p_permissao_necessaria,
        p_contexto->>'mesa_codigo',
        v_limite,
        now() + interval '5 minutes'
    );

    RETURN jsonb_build_object(
        'autorizado', true,
        'autorizacao_id', v_token_id,
        'autorizador_id', v_autorizador.id,
        'supervisor_nome', v_autorizador.nome,
        'cargo_id', v_autorizador.cargo_id,
        'cargo_nome', (SELECT nome FROM public.cargos WHERE id = v_autorizador.cargo_id),
        'expira_em', (now() + interval '5 minutes')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB, UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_pin_autorizacao(TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;

-- 5. Atualização de fechar_conta_mesa com integridade monetária, recálculo de cupom e PIN
DROP FUNCTION IF EXISTS public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT, UUID);

CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_desconto_manual NUMERIC DEFAULT 0,
  p_desconto_motivo TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_cupom_codigo TEXT DEFAULT NULL,
  p_campanha_id BIGINT DEFAULT NULL,
  p_autorizacao_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_subtotal NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_subtotal_restante NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_pedido RECORD;
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_existing_fechamento RECORD;
  v_primeiro_pedido_id BIGINT := NULL;
  v_count_pedidos INT := 0;
  v_cliente_id UUID := NULL;
  v_ja_debitado BOOLEAN := false;
  v_campanha RECORD;
  v_desconto_final NUMERIC(10,2) := 0;
  v_desconto_por UUID := NULL;
  v_tem_permissao_desconto BOOLEAN := false;
  v_token RECORD;
BEGIN
  -- 1. Verificação de Idempotência
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, troco, total_conta INTO v_existing_fechamento
    FROM public.fechamentos
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'fechamento_id', v_existing_fechamento.id,
        'troco', v_existing_fechamento.troco,
        'total', v_existing_fechamento.total_conta,
        'idempotent', true
      );
    END IF;
  END IF;

  -- 2. Validação de Role e Permissões (NULL-safe)
  v_user_role := public.exigir_cargo_ou_permissao('pdv.fechar_conta', 'barista', 'admin');

  -- RF01 / CA01: Sinais monetários válidos
  IF p_taxa_servico IS NOT NULL AND p_taxa_servico < 0 THEN
    RAISE EXCEPTION 'Taxa de serviço não pode ser negativa.';
  END IF;

  IF p_desconto_manual IS NOT NULL AND p_desconto_manual < 0 THEN
    RAISE EXCEPTION 'Desconto manual não pode ser negativo.';
  END IF;

  -- 3. Calcula subtotal apenas dos pedidos ativos (não cancelados e não pagos) da mesa
  FOR v_pedido IN
    SELECT id, total, cliente_id
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    FOR UPDATE
  LOOP
    v_count_pedidos := v_count_pedidos + 1;
    v_pedido_ids := array_append(v_pedido_ids, v_pedido.id);
    v_subtotal := v_subtotal + COALESCE(v_pedido.total, 0);
    IF v_primeiro_pedido_id IS NULL THEN
      v_primeiro_pedido_id := v_pedido.id;
    END IF;
    IF v_cliente_id IS NULL AND v_pedido.cliente_id IS NOT NULL THEN
      v_cliente_id := v_pedido.cliente_id;
    END IF;
  END LOOP;

  IF v_count_pedidos = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  -- 3b. Deduz pagamentos parciais já realizados na sessão aberta da mesa
  SELECT COALESCE(SUM(fp.valor), 0) INTO v_ja_pago_parcial
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_subtotal_restante := GREATEST(0, v_subtotal - v_ja_pago_parcial);

  -- RF02 / CA04: Teto da taxa de serviço (20% do subtotal restante)
  IF COALESCE(p_taxa_servico, 0) > (ROUND(v_subtotal_restante * 0.20, 2) + 0.001) THEN
    RAISE EXCEPTION 'Taxa de serviço não pode ultrapassar 20%% do subtotal restante.';
  END IF;

  -- RF07 / CA10 / CA11: Tratamento de Cupom / Campanha
  IF p_campanha_id IS NOT NULL OR (p_cupom_codigo IS NOT NULL AND length(trim(p_cupom_codigo)) > 0) THEN
    SELECT id, nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa
    INTO v_campanha
    FROM public.campanhas
    WHERE (p_campanha_id IS NOT NULL AND id = p_campanha_id)
       OR (p_campanha_id IS NULL AND UPPER(TRIM(cupom_codigo)) = UPPER(TRIM(p_cupom_codigo)))
    ORDER BY id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cupom inválido ou não encontrado.';
    END IF;

    IF NOT COALESCE(v_campanha.ativa, true) THEN
      RAISE EXCEPTION 'Cupom inativo ou fora da validade.';
    END IF;

    IF v_subtotal_restante < COALESCE(v_campanha.valor_minimo_pedido, 0) THEN
      RAISE EXCEPTION 'Subtotal da mesa (R$ %) é inferior ao pedido mínimo do cupom (R$ %).',
        v_subtotal_restante, v_campanha.valor_minimo_pedido;
    END IF;

    IF LOWER(COALESCE(v_campanha.tipo_desconto, 'percentual')) IN ('percentual', 'percent') THEN
      v_desconto_final := ROUND((v_subtotal_restante * COALESCE(v_campanha.valor_desconto, 0)) / 100.0, 2);
    ELSE
      v_desconto_final := COALESCE(v_campanha.valor_desconto, 0);
    END IF;

    IF v_desconto_final > v_subtotal_restante THEN
      v_desconto_final := v_subtotal_restante;
    END IF;

    p_campanha_id := v_campanha.id;
    p_cupom_codigo := v_campanha.cupom_codigo;
    v_desconto_por := NULL;

  ELSIF COALESCE(p_desconto_manual, 0) > 0 THEN
    -- RF05, RF06, RF08 / CA07, CA08, CA09: Desconto Manual com verificação por cargo ou PIN
    IF p_desconto_motivo IS NULL OR length(trim(p_desconto_motivo)) = 0 THEN
      RAISE EXCEPTION 'Motivo do desconto é obrigatório.';
    END IF;

    IF p_desconto_manual > v_subtotal_restante THEN
      RAISE EXCEPTION 'O desconto (R$ %) não pode ser maior que o subtotal da mesa (R$ %).', p_desconto_manual, v_subtotal_restante;
    END IF;

    v_tem_permissao_desconto := public.tem_permissao('pdv.desconto', v_uid);

    IF NOT v_tem_permissao_desconto THEN
      IF p_autorizacao_id IS NULL THEN
        RAISE EXCEPTION 'Usuário sem permissão para aplicar desconto manual.';
      END IF;

      SELECT * INTO v_token
      FROM public.autorizacoes_pin_tokens
      WHERE id = p_autorizacao_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Autorização por PIN não encontrada ou inválida.';
      END IF;

      IF v_token.usado THEN
        RAISE EXCEPTION 'Autorização por PIN já utilizada.';
      END IF;

      IF v_token.expira_em < now() THEN
        RAISE EXCEPTION 'Autorização por PIN expirada.';
      END IF;

      IF v_token.permissao <> 'pdv.desconto' THEN
        RAISE EXCEPTION 'Autorização por PIN não confere permissão de desconto.';
      END IF;

      IF v_token.mesa_codigo IS NOT NULL AND v_token.mesa_codigo <> p_mesa_codigo THEN
        RAISE EXCEPTION 'Autorização por PIN é para outra mesa (% <> %).', v_token.mesa_codigo, p_mesa_codigo;
      END IF;

      IF v_token.valor_limite IS NOT NULL AND p_desconto_manual > (v_token.valor_limite + 0.001) THEN
        RAISE EXCEPTION 'Desconto solicitado (R$ %) excede o valor autorizado pelo supervisor (R$ %).', p_desconto_manual, v_token.valor_limite;
      END IF;

      UPDATE public.autorizacoes_pin_tokens
      SET usado = true, usado_em = now()
      WHERE id = p_autorizacao_id;

      v_desconto_por := v_token.autorizador_id;
    ELSE
      v_desconto_por := v_uid;
    END IF;

    v_desconto_final := p_desconto_manual;
  END IF;

  -- 4. Calcula total com taxa de serviço e desconto sobre o saldo restante
  v_total_a_pagar := ROUND(v_subtotal_restante + COALESCE(p_taxa_servico, 0) - v_desconto_final, 2);
  IF v_total_a_pagar < 0 THEN
    v_total_a_pagar := 0;
  END IF;

  -- 5. RF01 / CA02 / CA03: Validação dos pagamentos recebidos
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    IF v_total_a_pagar > 0 THEN
      RAISE EXCEPTION 'Nenhuma forma de pagamento informada.';
    END IF;
  ELSE
    FOR v_pagamento IN
      SELECT (elem->>'valor')::NUMERIC AS valor, (elem->>'forma') AS forma
      FROM jsonb_array_elements(p_pagamentos) AS elem
    LOOP
      IF v_pagamento.valor IS NULL OR v_pagamento.valor <= 0 THEN
        RAISE EXCEPTION 'Valor de pagamento deve ser maior que zero.';
      END IF;

      IF v_pagamento.forma NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente') THEN
        RAISE EXCEPTION 'Forma de pagamento inválida: %. Formas aceitas: pix, dinheiro, cartao_credito, cartao_debito, outros, conta_cliente.', v_pagamento.forma;
      END IF;

      v_total_pago := v_total_pago + v_pagamento.valor;
    END LOOP;
  END IF;

  IF v_total_a_pagar > 0 AND ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 6. Cria registro de fechamento em public.fechamentos
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, desconto_manual, desconto_motivo, desconto_por,
    idempotency_key, cupom_codigo, campanha_id, parcial
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), v_desconto_final, p_desconto_motivo, v_desconto_por,
    p_idempotency_key, p_cupom_codigo, p_campanha_id, false
  ) RETURNING id INTO v_fechamento_id;

  -- 7. Inserir formas de pagamento e debitar conta do cliente
  IF p_pagamentos IS NOT NULL AND jsonb_typeof(p_pagamentos) = 'array' THEN
    FOR v_pagamento IN
      SELECT (elem->>'valor')::NUMERIC(10,2) AS valor, (elem->>'forma') AS forma, (elem->>'cliente_id')::UUID AS pag_cliente_id
      FROM jsonb_array_elements(p_pagamentos) AS elem
    LOOP
      INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
      VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);

      IF v_pagamento.forma = 'conta_cliente' AND COALESCE(v_pagamento.valor, 0) > 0 THEN
        v_cliente_id := COALESCE(v_pagamento.pag_cliente_id, v_cliente_id);
        IF v_cliente_id IS NULL THEN
          RAISE EXCEPTION 'Mesa sem cliente vinculado para pagamento via Conta do Cliente.';
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.cliente_conta_movimentos m
          WHERE m.cliente_id = v_cliente_id
            AND m.tipo = 'consumo'
            AND ABS(m.valor) = ABS(v_pagamento.valor)
            AND (
              (v_primeiro_pedido_id IS NOT NULL AND m.pedido_id = v_primeiro_pedido_id)
              OR m.created_at >= (now() - interval '10 minutes')
            )
        ) INTO v_ja_debitado;

        IF NOT v_ja_debitado THEN
          PERFORM public.lancar_movimento_conta(
            p_cliente_id := v_cliente_id,
            p_tipo := 'consumo',
            p_valor := ABS(v_pagamento.valor),
            p_pedido_id := v_primeiro_pedido_id,
            p_fechamento_id := NULL,
            p_forma_pagamento := 'conta_cliente',
            p_motivo := 'Fechamento Mesa ' || p_mesa_codigo
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 8. Atualiza pedidos da mesa para 'pago' e vincula cupom
  FOR v_pedido IN
    SELECT id FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
  LOOP
    UPDATE public.pedidos
    SET
      status_pagamento = 'pago',
      pago_em = COALESCE(pago_em, now()),
      cupom_codigo = COALESCE(p_cupom_codigo, cupom_codigo),
      campanha_id = COALESCE(p_campanha_id, campanha_id),
      updated_at = now()
    WHERE id = v_pedido.id;

    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_pedido.id);
  END LOOP;

  -- 8b. Marcar todos os itens como integralmente quitados
  UPDATE public.pedido_itens
  SET quantidade_paga = quantidade
  WHERE pedido_id = ANY(v_pedido_ids)
    AND quantidade_paga < quantidade;

  -- 9. Registrar uso de cupom dentro da mesma transação
  IF p_campanha_id IS NOT NULL AND v_primeiro_pedido_id IS NOT NULL THEN
    PERFORM public.registrar_uso_cupom(p_campanha_id, v_primeiro_pedido_id);
  END IF;

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'troco', v_troco,
    'total', v_total_a_pagar,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT, UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_conta_mesa(TEXT, JSONB, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, BIGINT, UUID) TO authenticated, service_role;

-- 6. Atualização de registrar_pagamento_parcial_mesa com validações de integridade
CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcial_mesa(
  p_mesa_codigo TEXT,
  p_pagamentos JSONB,
  p_itens JSONB DEFAULT '[]'::jsonb,
  p_valor_abatimento NUMERIC DEFAULT 0,
  p_taxa_servico NUMERIC DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_existing_fechamento RECORD;
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_pedido RECORD;
  v_pedido_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_subtotal_geral NUMERIC(10,2) := 0;
  v_ja_pago_parcial NUMERIC(10,2) := 0;
  v_saldo_restante NUMERIC(10,2) := 0;
  v_valor_esperado NUMERIC(10,2) := 0;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento RECORD;
  v_item_elem JSONB;
  v_item_id BIGINT;
  v_qtd_pagar NUMERIC(10,3);
  v_item RECORD;
  v_subtotal_item NUMERIC(10,2);
  v_primeiro_pedido_id BIGINT := NULL;
  v_cliente_id UUID := NULL;
  v_ja_debitado BOOLEAN := false;
  v_novo_saldo NUMERIC(10,2) := 0;
BEGIN
  -- 1. Idempotência
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT id, troco, total_conta INTO v_existing_fechamento
    FROM public.fechamentos
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'fechamento_id', v_existing_fechamento.id,
        'troco', v_existing_fechamento.troco,
        'total', v_existing_fechamento.total_conta,
        'idempotent', true
      );
    END IF;
  END IF;

  -- 2. Permissões (NULL-safe)
  v_user_role := public.exigir_cargo_ou_permissao('pdv.fechar_conta', 'barista', 'admin');

  -- RF01: Sinais e limites
  IF p_taxa_servico IS NOT NULL AND p_taxa_servico < 0 THEN
    RAISE EXCEPTION 'Taxa de serviço não pode ser negativa.';
  END IF;

  -- 3. Obter e bloquear pedidos ativos da mesa
  FOR v_pedido IN
    SELECT id, total, cliente_id
    FROM public.pedidos
    WHERE mesa_codigo = p_mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento != 'pago')
    FOR UPDATE
  LOOP
    v_pedido_ids := array_append(v_pedido_ids, v_pedido.id);
    v_subtotal_geral := v_subtotal_geral + COALESCE(v_pedido.total, 0);
    IF v_primeiro_pedido_id IS NULL THEN
      v_primeiro_pedido_id := v_pedido.id;
    END IF;
    IF v_cliente_id IS NULL AND v_pedido.cliente_id IS NOT NULL THEN
      v_cliente_id := v_pedido.cliente_id;
    END IF;
  END LOOP;

  IF array_length(v_pedido_ids, 1) IS NULL OR array_length(v_pedido_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Mesa sem pedidos em aberto.';
  END IF;

  -- 4. Somar pagamentos parciais anteriores desta mesa aberta
  SELECT COALESCE(SUM(fp.valor), 0) INTO v_ja_pago_parcial
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  WHERE f.parcial = true
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pedidos fped
      WHERE fped.fechamento_id = f.id
        AND fped.pedido_id = ANY(v_pedido_ids)
    );

  v_saldo_restante := GREATEST(0, v_subtotal_geral - v_ja_pago_parcial);

  -- 5. Calcular valor a pagar (itens ou abatimento de valor livre)
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' AND jsonb_array_length(p_itens) > 0 THEN
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_item_id := (v_item_elem->>'pedido_item_id')::BIGINT;
      v_qtd_pagar := COALESCE((v_item_elem->>'quantidade')::NUMERIC, 1);

      IF v_qtd_pagar <= 0 THEN
        RAISE EXCEPTION 'Quantidade de item a pagar deve ser maior que zero.';
      END IF;

      SELECT pi.id, pi.pedido_id, pi.quantidade, pi.quantidade_paga, pi.preco_unitario, pi.cancelado
      INTO v_item
      FROM public.pedido_itens pi
      WHERE pi.id = v_item_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item de pedido #% não encontrado.', v_item_id;
      END IF;

      IF v_item.cancelado = true THEN
        RAISE EXCEPTION 'Item #% está cancelado e não pode ser pago.', v_item_id;
      END IF;

      IF NOT (v_item.pedido_id = ANY(v_pedido_ids)) THEN
        RAISE EXCEPTION 'Item #% não pertence aos pedidos ativos da mesa %.', v_item_id, p_mesa_codigo;
      END IF;

      IF (v_item.quantidade - v_item.quantidade_paga) < (v_qtd_pagar - 0.001) THEN
        RAISE EXCEPTION 'Quantidade solicitada (%) excede a quantidade restante (%) do item #%.',
          v_qtd_pagar, (v_item.quantidade - v_item.quantidade_paga), v_item_id;
      END IF;

      v_subtotal_item := ROUND(v_qtd_pagar * v_item.preco_unitario, 2);
      v_valor_esperado := v_valor_esperado + v_subtotal_item;
    END LOOP;
  ELSE
    IF p_valor_abatimento IS NULL OR p_valor_abatimento <= 0 THEN
      RAISE EXCEPTION 'Valor a pagar deve ser maior que zero.';
    END IF;
    v_valor_esperado := ROUND(p_valor_abatimento, 2);
  END IF;

  v_total_a_pagar := ROUND(v_valor_esperado + COALESCE(p_taxa_servico, 0), 2);

  IF v_total_a_pagar <= 0 THEN
    RAISE EXCEPTION 'Valor a pagar deve ser maior que zero.';
  END IF;

  IF v_valor_esperado > (v_saldo_restante + 0.01) THEN
    RAISE EXCEPTION 'Valor informado (R$ %) excede o saldo restante da mesa (R$ %).', v_valor_esperado, v_saldo_restante;
  END IF;

  -- 6. RF01 / CA02 / CA03: Validação dos pagamentos recebidos
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Nenhuma forma de pagamento informada.';
  END IF;

  FOR v_pagamento IN
    SELECT (elem->>'valor')::NUMERIC AS valor, (elem->>'forma') AS forma
    FROM jsonb_array_elements(p_pagamentos) AS elem
  LOOP
    IF v_pagamento.valor IS NULL OR v_pagamento.valor <= 0 THEN
      RAISE EXCEPTION 'Valor de pagamento deve ser maior que zero.';
    END IF;

    IF v_pagamento.forma NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida: %. Formas aceitas: pix, dinheiro, cartao_credito, cartao_debito, outros, conta_cliente.', v_pagamento.forma;
    END IF;

    v_total_pago := v_total_pago + v_pagamento.valor;
  END LOOP;

  IF ROUND(v_total_pago, 2) < (ROUND(v_total_a_pagar, 2) - 0.01) THEN
    RAISE EXCEPTION 'Total pago (R$ %) é inferior ao total a pagar (R$ %)', v_total_pago, v_total_a_pagar;
  END IF;

  v_troco := ROUND(GREATEST(v_total_pago - v_total_a_pagar, 0), 2);

  -- 7. Criar registro de fechamento parcial
  INSERT INTO public.fechamentos (
    mesa_codigo, total_conta, troco, criado_por,
    taxa_servico, parcial, idempotency_key
  ) VALUES (
    p_mesa_codigo, v_total_a_pagar, v_troco, v_uid,
    COALESCE(p_taxa_servico, 0), true, p_idempotency_key
  ) RETURNING id INTO v_fechamento_id;

  -- 8. Inserir pagamentos e debitar conta do cliente se aplicável
  FOR v_pagamento IN
    SELECT (elem->>'valor')::NUMERIC(10,2) AS valor, (elem->>'forma') AS forma, (elem->>'cliente_id')::UUID AS pag_cliente_id
    FROM jsonb_array_elements(p_pagamentos) AS elem
  LOOP
    INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
    VALUES (v_fechamento_id, v_pagamento.forma, v_pagamento.valor);

    IF v_pagamento.forma = 'conta_cliente' AND COALESCE(v_pagamento.valor, 0) > 0 THEN
      v_cliente_id := COALESCE(v_pagamento.pag_cliente_id, v_cliente_id);
      IF v_cliente_id IS NULL THEN
        RAISE EXCEPTION 'Mesa sem cliente vinculado para pagamento via Conta do Cliente.';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.cliente_conta_movimentos m
        WHERE m.cliente_id = v_cliente_id
          AND m.tipo = 'consumo'
          AND ABS(m.valor) = ABS(v_pagamento.valor)
          AND (
            (v_primeiro_pedido_id IS NOT NULL AND m.pedido_id = v_primeiro_pedido_id)
            OR m.created_at >= (now() - interval '10 minutes')
          )
      ) INTO v_ja_debitado;

      IF NOT v_ja_debitado THEN
        PERFORM public.lancar_movimento_conta(
          p_cliente_id := v_cliente_id,
          p_tipo := 'consumo',
          p_valor := ABS(v_pagamento.valor),
          p_pedido_id := v_primeiro_pedido_id,
          p_fechamento_id := NULL,
          p_forma_pagamento := 'conta_cliente',
          p_motivo := 'Pagamento Parcial Mesa ' || p_mesa_codigo
        );
      END IF;
    END IF;
  END LOOP;

  -- 9. Vincular fechamento parcial aos pedidos ativos da mesa
  FOREACH v_item_id IN ARRAY v_pedido_ids
  LOOP
    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_item_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 10. Atualizar quantidade_paga dos itens e registrar fechamento_itens
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' AND jsonb_array_length(p_itens) > 0 THEN
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_item_id := (v_item_elem->>'pedido_item_id')::BIGINT;
      v_qtd_pagar := COALESCE((v_item_elem->>'quantidade')::NUMERIC, 1);

      SELECT preco_unitario INTO v_subtotal_item
      FROM public.pedido_itens WHERE id = v_item_id;

      UPDATE public.pedido_itens
      SET quantidade_paga = quantidade_paga + v_qtd_pagar
      WHERE id = v_item_id;

      INSERT INTO public.fechamento_itens (
        fechamento_id, pedido_item_id, quantidade, valor_unitario, subtotal
      ) VALUES (
        v_fechamento_id, v_item_id, v_qtd_pagar, v_subtotal_item, ROUND(v_qtd_pagar * v_subtotal_item, 2)
      );
    END LOOP;
  END IF;

  v_novo_saldo := GREATEST(0, v_saldo_restante - v_valor_esperado);

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'total_pago', v_total_a_pagar,
    'saldo_restante', v_novo_saldo,
    'troco', v_troco,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pagamento_parcial_mesa(TEXT, JSONB, JSONB, NUMERIC, NUMERIC, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_parcial_mesa(TEXT, JSONB, JSONB, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

-- 7. Atualização de criar_pedido com validação de quantidade (RF04 / CA06: 1..99)
CREATE OR REPLACE FUNCTION public.criar_pedido(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_pedido_id BIGINT;
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_mesa_codigo TEXT;
  v_obs_geral TEXT;
  v_forma_pagamento TEXT;
  v_status_pagamento TEXT;
  v_cliente_nome TEXT;
  v_cliente_id UUID := NULL;
  v_para_viagem BOOLEAN;
  v_client_id UUID;
  v_prioridade SMALLINT;
  v_prioridade_motivo TEXT;
  v_inseridos BIGINT[];
  v_item_index INT := 0;
  v_cortesia_de_index INT;
  v_qtd INT;
BEGIN
  -- Verificar Role
  PERFORM public.exigir_cargo('barista', 'admin');

  v_client_id := (p_payload->>'client_id')::UUID;

  -- Idempotência
  IF v_client_id IS NOT NULL THEN
    SELECT id, total INTO v_pedido_id, v_total FROM public.pedidos WHERE client_id = v_client_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_pedido_id, 'total', v_total, 'idempotent', true);
    END IF;
  END IF;

  v_mesa_codigo := p_payload->>'mesa_codigo';
  IF v_mesa_codigo IS NULL OR v_mesa_codigo = '' THEN
    v_mesa_codigo := 'BALCAO';
  END IF;

  v_obs_geral := p_payload->>'observacoes';
  v_forma_pagamento := p_payload->>'forma_pagamento';
  v_status_pagamento := COALESCE(p_payload->>'status_pagamento', 'pendente');
  v_cliente_nome := p_payload->>'cliente_nome';
  IF p_payload->>'cliente_id' IS NOT NULL AND p_payload->>'cliente_id' <> '' THEN
    v_cliente_id := (p_payload->>'cliente_id')::UUID;
  END IF;
  v_para_viagem := COALESCE((p_payload->>'para_viagem')::BOOLEAN, false);
  v_prioridade := COALESCE((p_payload->>'prioridade')::SMALLINT, 0);
  v_prioridade_motivo := p_payload->>'prioridade_motivo';

  -- Validação de forma de pagamento na conta
  IF v_forma_pagamento = 'conta_cliente' AND v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Pagamento na conta do cliente requer a seleção de um cliente cadastrado';
  END IF;

  INSERT INTO public.pedidos (
    mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, 
    total, cliente_nome, cliente_id, para_viagem, client_id, prioridade, prioridade_motivo
  ) VALUES (
    v_mesa_codigo, v_obs_geral, v_forma_pagamento, v_status_pagamento, auth.uid(),
    COALESCE(auth.jwt()->>'name', auth.jwt()->>'email', 'Barista'),
    0, v_cliente_nome, v_cliente_id, v_para_viagem, v_client_id, v_prioridade, v_prioridade_motivo
  ) RETURNING id INTO v_pedido_id;

  -- Inserir itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    -- RF04 / CA06: Limite de quantidade 1..99
    v_qtd := (v_item->>'quantidade')::INT;
    IF v_qtd IS NULL OR v_qtd < 1 OR v_qtd > 99 THEN
      RAISE EXCEPTION 'Quantidade do item deve estar entre 1 e 99.';
    END IF;

    SELECT p.id, p.nome, p.preco, p.estacao, p.tipo_montagem, c.nome as categoria_nome
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado, inativo ou esgotado: %', v_item->>'produto_id';
    END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      IF jsonb_typeof(v_item->'sabores') != 'array' THEN
        RAISE EXCEPTION 'Produto meio a meio requer array de sabores';
      END IF;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id' AND ativo = true AND disponivel = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'Sabor não encontrado ou esgotado: %', v_sabor->>'produto_id'; END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text AND ativo = true;
        IF FOUND THEN v_preco_unitario := v_preco_unitario + v_adicional_record.preco; END IF;
      END LOOP;
    END IF;

    v_cortesia_de_index := (v_item->>'cortesia_de_item_index')::INT;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes, cortesia_de_item_id, estacao
    ) VALUES (
      v_pedido_id, v_produto_record.id, v_produto_record.nome, v_qtd,
      v_preco_base, v_preco_unitario, v_item->>'observacoes',
      CASE WHEN v_cortesia_de_index IS NOT NULL THEN v_inseridos[v_cortesia_de_index + 1] ELSE NULL END,
      v_produto_record.estacao
    ) RETURNING id INTO v_pedido_item_id;

    v_inseridos := array_append(v_inseridos, v_pedido_item_id);

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id';
        INSERT INTO public.pedido_item_sabores (pedido_item_id, lado, produto_id, nome, preco) 
        VALUES (v_pedido_item_id, v_sabor->>'lado', v_sabor_record.id, v_sabor_record.nome, ROUND(v_sabor_record.preco * 0.5, 2));
      END LOOP;
    END IF;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text;
        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (pedido_item_id, adicional_id, nome, preco) 
          VALUES (v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco);
        END IF;
      END LOOP;
    END IF;

    v_item_index := v_item_index + 1;
  END LOOP;

  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - desconto), 0) INTO v_total
  FROM public.pedido_itens WHERE pedido_id = v_pedido_id AND cancelado = false;

  UPDATE public.pedidos SET total = v_total WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'id', v_pedido_id,
    'total', v_total,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_pedido(JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido(JSONB) TO authenticated, service_role;

-- 8. Atualização de adicionar_itens_pedido com validação de quantidade (RF04 / CA06: 1..99)
CREATE OR REPLACE FUNCTION public.adicionar_itens_pedido(p_pedido_id BIGINT, p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_total NUMERIC(10,2);
  v_cortesia_de_id BIGINT;
  v_adicional_permitido BOOLEAN;
  v_status_pedido TEXT;
  v_novo_item_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_reaberto BOOLEAN := false;
  v_now TIMESTAMPTZ := timezone('America/Sao_Paulo', now());
  v_qtd INT;
BEGIN
  PERFORM public.exigir_cargo('barista', 'admin');

  -- 1. Verificar se pedido existe e se está cancelado
  SELECT status INTO v_status_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id;
  END IF;

  IF v_status_pedido = 'cancelado' THEN
    RAISE EXCEPTION 'Não é permitido adicionar itens a um pedido cancelado';
  END IF;

  -- 2. Inserir itens com flag lancado_depois = true
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    -- RF04 / CA06: Limite de quantidade 1..99
    v_qtd := (v_item->>'quantidade')::INT;
    IF v_qtd IS NULL OR v_qtd < 1 OR v_qtd > 99 THEN
      RAISE EXCEPTION 'Quantidade do item deve estar entre 1 e 99.';
    END IF;

    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record 
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF NOT FOUND THEN 
      RAISE EXCEPTION 'Produto não encontrado, inativo ou esgotado: %', v_item->>'produto_id'; 
    END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record 
        FROM public.produtos 
        WHERE id = v_sabor->>'produto_id' AND ativo = true AND disponivel = true;
        
        IF NOT FOUND THEN 
          RAISE EXCEPTION 'Sabor não encontrado ou esgotado: %', v_sabor->>'produto_id'; 
        END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT EXISTS (
          SELECT 1 FROM public.produto_adicionais_permitidos
          WHERE produto_id = v_produto_record.id AND adicional_id = v_adicional::text
        ) INTO v_adicional_permitido;

        IF NOT v_adicional_permitido THEN
          RAISE EXCEPTION 'Adicional % não permitido para o produto %', v_adicional::text, v_produto_record.id;
        END IF;

        SELECT preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text AND ativo = true;
        IF FOUND THEN 
          v_preco_unitario := v_preco_unitario + v_adicional_record.preco; 
        END IF;
      END LOOP;
    END IF;

    v_cortesia_de_id := (v_item->>'cortesia_de_item_id')::BIGINT;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, 
      observacoes, cortesia_de_item_id, estacao, lancado_depois, impresso_em
    ) VALUES (
      p_pedido_id, v_produto_record.id, v_produto_record.nome, v_qtd,
      v_preco_base, v_preco_unitario, v_item->>'observacoes', v_cortesia_de_id,
      v_produto_record.estacao, true, NULL
    ) RETURNING id INTO v_pedido_item_id;

    v_novo_item_ids := array_append(v_novo_item_ids, v_pedido_item_id);

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id';
        INSERT INTO public.pedido_item_sabores (pedido_item_id, lado, produto_id, nome, preco) 
        VALUES (v_pedido_item_id, v_sabor->>'lado', v_sabor_record.id, v_sabor_record.nome, ROUND(v_sabor_record.preco * 0.5, 2));
      END LOOP;
    END IF;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text;
        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (pedido_item_id, adicional_id, nome, preco) 
          VALUES (v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 3. Reabertura do pedido se estava concluido ou entregue
  IF v_status_pedido IN ('concluido', 'entregue') THEN
    UPDATE public.pedidos
    SET status = 'em_preparo',
        concluido_em = NULL,
        concluido_por = NULL,
        updated_at = v_now
    WHERE id = p_pedido_id;

    v_reaberto := true;

    BEGIN
      INSERT INTO public.pedido_eventos (
        pedido_id, acao, de, para, motivo, usuario_id, usuario_nome
      ) VALUES (
        p_pedido_id,
        'reaberto',
        v_status_pedido,
        'em_preparo',
        'Reaberto por item adicionado após conclusão',
        auth.uid(),
        public.fn_resolver_nome_usuario(auth.uid(), 'Sistema')
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  PERFORM public.aplicar_promocoes_pedido(p_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - desconto), 0) INTO v_total
  FROM public.pedido_itens WHERE pedido_id = p_pedido_id AND cancelado = false;

  UPDATE public.pedidos SET total = v_total WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'id', p_pedido_id, 
    'total', v_total,
    'reaberto', v_reaberto,
    'itens_adicionados', v_novo_item_ids
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adicionar_itens_pedido(BIGINT, JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.adicionar_itens_pedido(BIGINT, JSONB) TO authenticated, service_role;

-- 9. Registrar na tabela de controle de migrations
INSERT INTO public.app_migrations (versao, arquivo, aplicada_em)
VALUES ('128', 'migration_caf_000128_integridade_monetaria_servidor.sql', now())
ON CONFLICT (versao) DO NOTHING;
