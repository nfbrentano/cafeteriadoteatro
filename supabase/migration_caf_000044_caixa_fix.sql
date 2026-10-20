-- =========================================================
-- MIGRATION: CAF-000044 — Fechamento de caixa cego e correção do contrato entre tela e banco
-- =========================================================

-- 1. Ajustes estruturais em caixas e caixa_movimentos para compatibilidade
ALTER TABLE public.caixa_movimentos
  ADD COLUMN IF NOT EXISTS registrado_por UUID REFERENCES auth.users(id);

-- Atualizar constraint de tipo em caixa_movimentos para aceitar sangria/suprimento
DO $$
BEGIN
  ALTER TABLE public.caixa_movimentos DROP CONSTRAINT IF EXISTS caixa_movimentos_tipo_check;
  UPDATE public.caixa_movimentos SET tipo = 'suprimento' WHERE tipo = 'entrada';
  UPDATE public.caixa_movimentos SET tipo = 'sangria' WHERE tipo = 'saida';
  ALTER TABLE public.caixa_movimentos
    ADD CONSTRAINT caixa_movimentos_tipo_check CHECK (tipo IN ('sangria', 'suprimento'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Trigger para normalizar tipo ('entrada' -> 'suprimento', 'saida' -> 'sangria') e criado_por/registrado_por
CREATE OR REPLACE FUNCTION public.fn_normalize_caixa_movimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    NEW.tipo := 'suprimento';
  ELSIF NEW.tipo = 'saida' THEN
    NEW.tipo := 'sangria';
  END IF;

  IF NEW.criado_por IS NULL THEN
    NEW.criado_por := COALESCE(NEW.registrado_por, auth.uid());
  END IF;
  IF NEW.registrado_por IS NULL THEN
    NEW.registrado_por := NEW.criado_por;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_caixa_movimento ON public.caixa_movimentos;
CREATE TRIGGER trg_normalize_caixa_movimento
BEFORE INSERT OR UPDATE ON public.caixa_movimentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_normalize_caixa_movimento();

-- 2. Remover policy de INSERT direto em caixa_conferencia (apenas RPC fechar_caixa pode gravar)
DROP POLICY IF EXISTS "caixa_conferencia_insert" ON public.caixa_conferencia;

-- Atualizar policies de caixas e caixa_movimentos para considerar tem_permissao (CAF-000036)
DROP POLICY IF EXISTS "caixas_insert" ON public.caixas;
CREATE POLICY "caixas_insert" ON public.caixas
  FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao('caixa.abrir_fechar') OR public.get_user_role() IN ('barista', 'admin'));

DROP POLICY IF EXISTS "caixas_update" ON public.caixas;
CREATE POLICY "caixas_update" ON public.caixas
  FOR UPDATE TO authenticated
  USING (public.tem_permissao('caixa.abrir_fechar') OR public.get_user_role() IN ('barista', 'admin'));

DROP POLICY IF EXISTS "caixa_movimentos_insert" ON public.caixa_movimentos;
CREATE POLICY "caixa_movimentos_insert" ON public.caixa_movimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao('caixa.sangria') OR public.get_user_role() IN ('barista', 'admin'));

-- 3. Configurações padrão: caixa_conferencia_cega (sim) e caixa_limite_diferenca_obs (5.00)
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('caixa_conferencia_cega', 'true'::jsonb),
  ('caixa_limite_diferenca_obs', '5.00'::jsonb)
ON CONFLICT (chave) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'site_settings') THEN
    INSERT INTO public.site_settings (key, value, updated_at)
    VALUES
      ('caixa_conferencia_cega', 'true', NOW()),
      ('caixa_limite_diferenca_obs', '5.00', NOW())
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- Função auxiliar para ler se a conferência cega está ativa e o limite de diferença
CREATE OR REPLACE FUNCTION public.fn_get_config_caixa()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_cega BOOLEAN := true;
  v_limite NUMERIC(10,2) := 5.00;
  v_val_cega JSONB;
  v_val_limite JSONB;
  v_site_cega TEXT;
  v_site_limite TEXT;
  v_has_site_settings BOOLEAN := false;
BEGIN
  SELECT valor INTO v_val_cega FROM public.configuracoes_sistema WHERE chave = 'caixa_conferencia_cega';
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'site_settings'
  ) INTO v_has_site_settings;

  IF v_val_cega IS NOT NULL THEN
    IF jsonb_typeof(v_val_cega) = 'boolean' THEN
      v_cega := (v_val_cega)::boolean;
    ELSIF jsonb_typeof(v_val_cega) = 'string' THEN
      v_cega := lower(v_val_cega#>>'{}') NOT IN ('false', '0', 'nao', 'não');
    ELSIF jsonb_typeof(v_val_cega) = 'object' AND v_val_cega ? 'ativo' THEN
      v_cega := (v_val_cega->>'ativo')::boolean;
    END IF;
  ELSIF v_has_site_settings THEN
    SELECT value INTO v_site_cega FROM public.site_settings WHERE key = 'caixa_conferencia_cega';
    IF v_site_cega IS NOT NULL THEN
      v_cega := lower(v_site_cega) NOT IN ('false', '0', 'nao', 'não');
    END IF;
  END IF;

  SELECT valor INTO v_val_limite FROM public.configuracoes_sistema WHERE chave = 'caixa_limite_diferenca_obs';
  IF v_val_limite IS NOT NULL THEN
    v_limite := COALESCE(NULLIF(regexp_replace(v_val_limite#>>'{}', '[^0-9.]', '', 'g'), '')::NUMERIC(10,2), 5.00);
  ELSIF v_has_site_settings THEN
    SELECT value INTO v_site_limite FROM public.site_settings WHERE key = 'caixa_limite_diferenca_obs';
    IF v_site_limite IS NOT NULL THEN
      v_limite := COALESCE(NULLIF(regexp_replace(v_site_limite, '[^0-9.]', '', 'g'), '')::NUMERIC(10,2), 5.00);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'conferencia_cega', COALESCE(v_cega, true),
    'limite_diferenca_obs', COALESCE(v_limite, 5.00)
  );
END;
$$;

-- 4. Função interna que calcula todos os totais reais do caixa no banco
CREATE OR REPLACE FUNCTION public.fn_calcular_totais_caixa_interno(p_caixa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aberto_em TIMESTAMPTZ;
  v_fechado_em TIMESTAMPTZ;
  v_limite_fim TIMESTAMPTZ;
  v_fundo_troco NUMERIC(10,2) := 0;
  v_sangrias NUMERIC(10,2) := 0;
  v_suprimentos NUMERIC(10,2) := 0;
  v_vendas_dinheiro NUMERIC(10,2) := 0;
  v_dinheiro_esperado NUMERIC(10,2) := 0;
  v_itens JSONB := '[]'::jsonb;
  v_pagamentos_map JSONB := '{}'::jsonb;
BEGIN
  SELECT c.aberto_em, c.fechado_em, c.fundo_troco
  INTO v_aberto_em, v_fechado_em, v_fundo_troco
  FROM public.caixas c
  WHERE c.id = p_caixa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado';
  END IF;

  v_limite_fim := COALESCE(v_fechado_em, NOW());

  -- Somar sangrias e suprimentos
  SELECT COALESCE(SUM(m.valor), 0) INTO v_sangrias
  FROM public.caixa_movimentos m
  WHERE m.caixa_id = p_caixa_id AND m.tipo = 'sangria';

  SELECT COALESCE(SUM(m.valor), 0) INTO v_suprimentos
  FROM public.caixa_movimentos m
  WHERE m.caixa_id = p_caixa_id AND m.tipo = 'suprimento';

  -- Somar vendas do período:
  -- (A) fechamento_pagamentos de fechamentos realizados no período (descontando troco em dinheiro)
  -- (B) pedidos pagos diretamente na criação (balcão/viagem/etc.) que não pertencem a um fechamento de mesa
  WITH formas_base AS (
    SELECT unnest(ARRAY['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente']) AS forma
  ),
  vendas_fechamento AS (
    SELECT
      CASE
        WHEN fp.forma = 'credito' THEN 'cartao_credito'
        WHEN fp.forma = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(fp.forma, 'outros')
      END AS forma,
      SUM(fp.valor) AS valor_bruto
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    WHERE f.created_at >= v_aberto_em AND f.created_at <= v_limite_fim
    GROUP BY 1
  ),
  trocos_fechamento AS (
    SELECT COALESCE(SUM(f.troco), 0) AS total_troco
    FROM public.fechamentos f
    WHERE f.created_at >= v_aberto_em AND f.created_at <= v_limite_fim
      AND f.troco > 0
      AND EXISTS (
        SELECT 1 FROM public.fechamento_pagamentos fp2
        WHERE fp2.fechamento_id = f.id AND fp2.forma = 'dinheiro'
      )
  ),
  vendas_balcao AS (
    SELECT
      CASE
        WHEN p.forma_pagamento = 'credito' THEN 'cartao_credito'
        WHEN p.forma_pagamento = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(p.forma_pagamento, 'outros')
      END AS forma,
      SUM(p.total) AS valor_bruto
    FROM public.pedidos p
    WHERE p.status != 'cancelado'
      AND p.status_pagamento = 'pago'
      AND p.created_at >= v_aberto_em
      AND p.created_at <= v_limite_fim
      AND NOT EXISTS (
        SELECT 1 FROM public.fechamento_pedidos fped
        WHERE fped.pedido_id = p.id
      )
    GROUP BY 1
  ),
  consolidado AS (
    SELECT
      fb.forma,
      GREATEST(
        0,
        ROUND(
          COALESCE(vf.valor_bruto, 0)
          + COALESCE(vb.valor_bruto, 0)
          - CASE WHEN fb.forma = 'dinheiro' THEN COALESCE((SELECT total_troco FROM trocos_fechamento), 0) ELSE 0 END,
          2
        )
      )::NUMERIC(10,2) AS total_vendas
    FROM formas_base fb
    LEFT JOIN vendas_fechamento vf ON vf.forma = fb.forma
    LEFT JOIN vendas_balcao vb ON vb.forma = fb.forma
  )
  SELECT
    COALESCE((SELECT c.total_vendas FROM consolidado c WHERE c.forma = 'dinheiro'), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'forma', c.forma,
          'metodo', c.forma,
          'total_vendas', c.total_vendas,
          'total', c.total_vendas,
          'valor_esperado', CASE
            WHEN c.forma = 'dinheiro' THEN ROUND(v_fundo_troco + v_suprimentos - v_sangrias + c.total_vendas, 2)
            ELSE c.total_vendas
          END
        )
        ORDER BY array_position(ARRAY['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente'], c.forma)
      ),
      '[]'::jsonb
    ),
    COALESCE(jsonb_object_agg(c.forma, c.total_vendas), '{}'::jsonb)
  INTO v_vendas_dinheiro, v_itens, v_pagamentos_map
  FROM consolidado c;

  v_dinheiro_esperado := ROUND(v_fundo_troco + v_suprimentos - v_sangrias + v_vendas_dinheiro, 2);

  RETURN jsonb_build_object(
    'caixa_id', p_caixa_id,
    'aberto_em', v_aberto_em,
    'fechado_em', v_fechado_em,
    'fundo_troco', v_fundo_troco,
    'sangrias', v_sangrias,
    'suprimentos', v_suprimentos,
    'vendas_dinheiro', v_vendas_dinheiro,
    'dinheiro_esperado', v_dinheiro_esperado,
    'itens', v_itens,
    'pagamentos', v_pagamentos_map
  );
END;
$$;

-- 5. RPC get_caixa_atual (devolve suprimentos e sangrias + configurações de conferência)
DROP FUNCTION IF EXISTS public.get_caixa_atual();
CREATE OR REPLACE FUNCTION public.get_caixa_atual()
RETURNS TABLE (
  id UUID,
  aberto_em TIMESTAMPTZ,
  aberto_por UUID,
  aberto_por_nome TEXT,
  fundo_troco NUMERIC(10,2),
  total_suprimentos NUMERIC(10,2),
  total_sangrias NUMERIC(10,2),
  total_entradas NUMERIC(10,2),
  total_saidas NUMERIC(10,2),
  conferencia_cega BOOLEAN,
  limite_diferenca_obs NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cfg JSONB;
BEGIN
  v_cfg := public.fn_get_config_caixa();

  RETURN QUERY
  SELECT
    c.id,
    c.aberto_em,
    c.aberto_por,
    public.fn_resolver_nome_usuario(c.aberto_por, NULL) AS aberto_por_nome,
    c.fundo_troco,
    COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'suprimento'), 0)::NUMERIC(10,2) AS total_suprimentos,
    COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'sangria'), 0)::NUMERIC(10,2) AS total_sangrias,
    COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'suprimento'), 0)::NUMERIC(10,2) AS total_entradas,
    COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'sangria'), 0)::NUMERIC(10,2) AS total_saidas,
    (v_cfg->>'conferencia_cega')::BOOLEAN AS conferencia_cega,
    (v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2) AS limite_diferenca_obs
  FROM public.caixas c
  WHERE c.fechado_em IS NULL
  LIMIT 1;
END;
$$;

-- 6. RPC get_totais_caixa (respeita conferência cega para operadores não-admin)
DROP FUNCTION IF EXISTS public.get_totais_caixa(UUID);
CREATE OR REPLACE FUNCTION public.get_totais_caixa(p_caixa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_cfg JSONB;
  v_cega BOOLEAN;
  v_totais JSONB;
  v_fechado_em TIMESTAMPTZ;
BEGIN
  v_role := public.get_user_role();
  IF NOT (public.tem_permissao('caixa.abrir_fechar') OR v_role IN ('barista', 'admin')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_cfg := public.fn_get_config_caixa();
  v_cega := COALESCE((v_cfg->>'conferencia_cega')::BOOLEAN, true);

  v_totais := public.fn_calcular_totais_caixa_interno(p_caixa_id);
  v_fechado_em := (v_totais->>'fechado_em')::TIMESTAMPTZ;

  -- Se conferência cega está ligada, o caixa ainda está aberto e quem consulta não é admin:
  -- O valor esperado NUNCA sai do banco antes da confirmação!
  IF v_cega AND v_fechado_em IS NULL AND v_role != 'admin' THEN
    RETURN jsonb_build_object(
      'caixa_id', p_caixa_id,
      'modo_cego', true,
      'conferencia_cega', true,
      'limite_diferenca_obs', (v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2),
      'fundo_troco', (v_totais->>'fundo_troco')::NUMERIC(10,2),
      'sangrias', (v_totais->>'sangrias')::NUMERIC(10,2),
      'suprimentos', (v_totais->>'suprimentos')::NUMERIC(10,2),
      'dinheiro_esperado', NULL,
      'itens', '[]'::jsonb,
      'pagamentos', '{}'::jsonb
    );
  END IF;

  RETURN v_totais || jsonb_build_object(
    'modo_cego', false,
    'conferencia_cega', v_cega,
    'limite_diferenca_obs', (v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2)
  );
END;
$$;

-- 7. RPC fechar_caixa (calcula valor_sistema e diferenca estritamente no banco)
DROP FUNCTION IF EXISTS public.fechar_caixa(UUID, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.fechar_caixa(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fechar_caixa(
  p_caixa_id UUID,
  p_contagem JSONB,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_uid UUID := auth.uid();
  v_cfg JSONB;
  v_limite_obs NUMERIC(10,2);
  v_totais JSONB;
  v_item_esperado JSONB;
  v_forma TEXT;
  v_esperado NUMERIC(10,2);
  v_informado NUMERIC(10,2);
  v_diferenca NUMERIC(10,2);
  v_max_abs_dif NUMERIC(10,2) := 0;
  v_total_diferenca NUMERIC(10,2) := 0;
  v_limite_excedido BOOLEAN := false;
  v_conferencia_res JSONB := '[]'::jsonb;
  v_fechado_em TIMESTAMPTZ := NOW();
  v_aberto_por UUID;
  v_aberto_em TIMESTAMPTZ;
BEGIN
  v_role := public.get_user_role();
  IF NOT (public.tem_permissao('caixa.abrir_fechar') OR v_role IN ('barista', 'admin')) THEN
    RAISE EXCEPTION 'Acesso negado para fechar o caixa.';
  END IF;

  SELECT c.aberto_por, c.aberto_em
  INTO v_aberto_por, v_aberto_em
  FROM public.caixas c
  WHERE c.id = p_caixa_id AND c.fechado_em IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado ou já fechado.';
  END IF;

  v_cfg := public.fn_get_config_caixa();
  v_limite_obs := COALESCE((v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2), 5.00);

  -- Calcular os totais reais diretamente no banco (ignora valor_sistema/diferenca enviados pela API)
  v_totais := public.fn_calcular_totais_caixa_interno(p_caixa_id);

  -- Limpar eventual conferência anterior deste caixa
  DELETE FROM public.caixa_conferencia WHERE caixa_id = p_caixa_id;

  -- Processar cada forma de pagamento oficial
  FOR v_item_esperado IN SELECT * FROM jsonb_array_elements(v_totais->'itens')
  LOOP
    v_forma := v_item_esperado->>'forma';
    v_esperado := COALESCE((v_item_esperado->>'valor_esperado')::NUMERIC(10,2), 0);

    -- Pular conta_cliente se for zero e não tiver sido informada
    IF v_forma = 'conta_cliente' AND v_esperado = 0 THEN
      CONTINUE;
    END IF;

    -- Extrair apenas valor_informado de p_contagem (normalizando nomes legados credito/debito)
    SELECT COALESCE((elem->>'valor_informado')::NUMERIC(10,2), 0)
    INTO v_informado
    FROM jsonb_array_elements(COALESCE(p_contagem, '[]'::jsonb)) elem
    WHERE (
      CASE
        WHEN elem->>'forma' = 'credito' OR elem->>'metodo' = 'credito' THEN 'cartao_credito'
        WHEN elem->>'forma' = 'debito' OR elem->>'metodo' = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(elem->>'forma', elem->>'metodo')
      END
    ) = v_forma
    LIMIT 1;

    IF NOT FOUND OR v_informado IS NULL THEN
      IF v_forma = 'conta_cliente' THEN
        v_informado := v_esperado;
      ELSE
        v_informado := 0;
      END IF;
    END IF;

    v_diferenca := ROUND(v_informado - v_esperado, 2);

    IF v_forma != 'conta_cliente' THEN
      v_total_diferenca := ROUND(v_total_diferenca + v_diferenca, 2);
      IF ABS(v_diferenca) > v_max_abs_dif THEN
        v_max_abs_dif := ABS(v_diferenca);
      END IF;
    END IF;

    INSERT INTO public.caixa_conferencia (
      caixa_id, forma_pagamento, valor_informado, valor_sistema, diferenca
    ) VALUES (
      p_caixa_id, v_forma, v_informado, v_esperado, v_diferenca
    );

    v_conferencia_res := v_conferencia_res || jsonb_build_array(
      jsonb_build_object(
        'forma', v_forma,
        'valor_sistema', v_esperado,
        'valor_informado', v_informado,
        'diferenca', v_diferenca
      )
    );
  END LOOP;

  IF v_max_abs_dif > v_limite_obs THEN
    v_limite_excedido := true;
    IF p_observacoes IS NULL OR length(trim(p_observacoes)) = 0 THEN
      RAISE EXCEPTION 'Diferença de R$ % excede o limite de R$ %. Informe uma justificativa nas observações.',
        trim(to_char(v_max_abs_dif, '999990D00')),
        trim(to_char(v_limite_obs, '999990D00'));
    END IF;
  END IF;

  -- Fechar o caixa
  UPDATE public.caixas
  SET fechado_em = v_fechado_em,
      fechado_por = v_uid,
      observacoes = p_observacoes
  WHERE id = p_caixa_id;

  RETURN jsonb_build_object(
    'caixa_id', p_caixa_id,
    'aberto_em', v_aberto_em,
    'fechado_em', v_fechado_em,
    'aberto_por_nome', public.fn_resolver_nome_usuario(v_aberto_por, NULL),
    'fechado_por_nome', public.fn_resolver_nome_usuario(v_uid, NULL),
    'fundo_troco', (v_totais->>'fundo_troco')::NUMERIC(10,2),
    'sangrias', (v_totais->>'sangrias')::NUMERIC(10,2),
    'suprimentos', (v_totais->>'suprimentos')::NUMERIC(10,2),
    'dinheiro_esperado', (v_totais->>'dinheiro_esperado')::NUMERIC(10,2),
    'observacoes', p_observacoes,
    'total_diferenca', v_total_diferenca,
    'max_diferenca_abs', v_max_abs_dif,
    'limite_diferenca_obs', v_limite_obs,
    'limite_excedido', v_limite_excedido,
    'conferencia', v_conferencia_res
  );
END;
$$;

-- 8. RPC get_historico_caixas para consulta de histórico e auditoria no Admin
CREATE OR REPLACE FUNCTION public.get_historico_caixas(p_limite INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_cfg JSONB;
  v_limite_obs NUMERIC(10,2);
  v_result JSONB := '[]'::jsonb;
BEGIN
  v_role := public.get_user_role();
  IF NOT (public.tem_permissao('caixa.abrir_fechar') OR public.tem_permissao('admin.financeiro') OR v_role IN ('barista', 'admin')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_cfg := public.fn_get_config_caixa();
  v_limite_obs := COALESCE((v_cfg->>'limite_diferenca_obs')::NUMERIC(10,2), 5.00);

  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      c.id,
      c.aberto_em,
      c.fechado_em,
      c.aberto_por,
      public.fn_resolver_nome_usuario(c.aberto_por, NULL) AS aberto_por_nome,
      c.fechado_por,
      CASE WHEN c.fechado_por IS NOT NULL THEN public.fn_resolver_nome_usuario(c.fechado_por, NULL) ELSE NULL END AS fechado_por_nome,
      c.fundo_troco,
      c.observacoes,
      COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'suprimento'), 0)::NUMERIC(10,2) AS suprimentos,
      COALESCE((SELECT SUM(m.valor) FROM public.caixa_movimentos m WHERE m.caixa_id = c.id AND m.tipo = 'sangria'), 0)::NUMERIC(10,2) AS sangrias,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'forma', cc.forma_pagamento,
            'valor_sistema', cc.valor_sistema,
            'valor_informado', cc.valor_informado,
            'diferenca', cc.diferenca
          )
          ORDER BY array_position(ARRAY['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente'], cc.forma_pagamento)
        )
        FROM public.caixa_conferencia cc
        WHERE cc.caixa_id = c.id
      ), '[]'::jsonb) AS conferencia,
      COALESCE((
        SELECT SUM(cc.valor_sistema) FROM public.caixa_conferencia cc WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente'
      ), 0)::NUMERIC(10,2) AS total_esperado,
      COALESCE((
        SELECT SUM(cc.valor_informado) FROM public.caixa_conferencia cc WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente'
      ), 0)::NUMERIC(10,2) AS total_informado,
      COALESCE((
        SELECT SUM(cc.diferenca) FROM public.caixa_conferencia cc WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente'
      ), 0)::NUMERIC(10,2) AS total_diferenca,
      EXISTS (
        SELECT 1 FROM public.caixa_conferencia cc
        WHERE cc.caixa_id = c.id AND cc.forma_pagamento != 'conta_cliente' AND ABS(cc.diferenca) > v_limite_obs
      ) AS limite_excedido
    FROM public.caixas c
    ORDER BY c.aberto_em DESC
    LIMIT p_limite
  ) sub;

  RETURN v_result;
END;
$$;
