BEGIN;

-- ==============================================================================
-- CAF-000083 — Pendências funcionais de operação e caixa
-- ==============================================================================

-- 1. Colunas de apoio para reabertura de caixa
ALTER TABLE public.caixas
  ADD COLUMN IF NOT EXISTS motivo_reabertura TEXT,
  ADD COLUMN IF NOT EXISTS reaberto_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reaberto_por UUID REFERENCES auth.users(id);

-- 2. RPC reabrir_caixa (Apenas Admin com motivo obrigatório e sem outro caixa aberto)
CREATE OR REPLACE FUNCTION public.reabrir_caixa(
  p_caixa_id UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_caixa RECORD;
BEGIN
  -- 1. Valida autenticação e cargo
  IF auth.role() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;

  v_role := public.get_user_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem reabrir caixas fechados.';
  END IF;

  -- 2. Valida motivo
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'O motivo da reabertura deve conter ao menos 5 caracteres.';
  END IF;

  -- 3. Valida se já existe outro caixa aberto
  IF EXISTS (SELECT 1 FROM public.caixas WHERE status = 'aberto' AND id <> p_caixa_id) THEN
    RAISE EXCEPTION 'Já existe um caixa aberto no momento. Não é possível reabrir outro.';
  END IF;

  -- 4. Busca o caixa e valida estado
  SELECT id, status, fechado_em INTO v_caixa
  FROM public.caixas
  WHERE id = p_caixa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa % não encontrado.', p_caixa_id;
  END IF;

  IF v_caixa.status = 'aberto' THEN
    RAISE EXCEPTION 'O caixa já está aberto.';
  END IF;

  -- 5. Reabre o caixa
  UPDATE public.caixas
  SET
    status = 'aberto',
    fechado_em = NULL,
    fechado_por = NULL,
    total_apurado = NULL,
    diferenca = NULL,
    motivo_reabertura = trim(p_motivo),
    reaberto_em = now(),
    reaberto_por = auth.uid(),
    updated_at = now()
  WHERE id = p_caixa_id;

  -- 6. Registra no log de auditoria
  BEGIN
    INSERT INTO public.auditoria_operacional (
      usuario_id,
      acao,
      tabela,
      registro_id,
      detalhes,
      created_at
    ) VALUES (
      auth.uid(),
      'REABERTURA_CAIXA',
      'caixas',
      p_caixa_id::text,
      jsonb_build_object('motivo', p_motivo, 'reaberto_em', now()),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Se tabela de auditoria não existir, prossegue sem travar
    NULL;
  END;

  RETURN jsonb_build_object('sucesso', true, 'caixa_id', p_caixa_id, 'status', 'aberto');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reabrir_caixa(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reabrir_caixa(UUID, TEXT) TO authenticated;

-- 3. Atualizar fn_calcular_totais_caixa_interno para incluir créditos/depósitos de clientes (RF01)
CREATE OR REPLACE FUNCTION public.fn_calcular_totais_caixa_interno(p_caixa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_total_bruto NUMERIC(10,2) := 0;
  v_total_taxas NUMERIC(10,2) := 0;
  v_total_liquido NUMERIC(10,2) := 0;
  v_total_depositos_clientes NUMERIC(10,2) := 0;
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

  -- Somar depósitos de conta de cliente ocorridos no período
  SELECT COALESCE(SUM(m.valor), 0) INTO v_total_depositos_clientes
  FROM public.cliente_conta_movimentos m
  WHERE m.created_at >= v_aberto_em AND m.created_at <= v_limite_fim
    AND m.tipo IN ('deposito', 'pagamento_fatura')
    AND m.valor > 0;

  -- Somar vendas do período:
  -- (A) fechamento_pagamentos de fechamentos de mesa (descontando troco em dinheiro)
  -- (B) pedidos de balcão/viagem pagos diretamente que não pertencem a fechamentos de mesa
  -- (C) depósitos de clientes na forma de pagamento correspondente
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
      SUM(fp.valor) AS valor_bruto,
      SUM(COALESCE(fp.taxa_valor, 0)) AS valor_taxa
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
      SUM(p.total) AS valor_bruto,
      SUM(COALESCE(p.taxa_pagamento_valor, 0)) AS valor_taxa
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
  depositos_cliente AS (
    SELECT
      CASE
        WHEN m.forma_pagamento = 'credito' THEN 'cartao_credito'
        WHEN m.forma_pagamento = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(m.forma_pagamento, 'dinheiro')
      END AS forma,
      SUM(m.valor) AS total_deposito
    FROM public.cliente_conta_movimentos m
    WHERE m.created_at >= v_aberto_em AND m.created_at <= v_limite_fim
      AND m.tipo IN ('deposito', 'pagamento_fatura')
      AND m.valor > 0
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
          + COALESCE(dc.total_deposito, 0)
          - CASE WHEN fb.forma = 'dinheiro' THEN COALESCE((SELECT total_troco FROM trocos_fechamento), 0) ELSE 0 END,
          2
        )
      )::NUMERIC(10,2) AS total_vendas,
      ROUND(COALESCE(vf.valor_taxa, 0) + COALESCE(vb.valor_taxa, 0), 2)::NUMERIC(10,2) AS total_taxa,
      ROUND(COALESCE(dc.total_deposito, 0), 2)::NUMERIC(10,2) AS total_deposito
    FROM formas_base fb
    LEFT JOIN vendas_fechamento vf ON vf.forma = fb.forma
    LEFT JOIN vendas_balcao vb ON vb.forma = fb.forma
    LEFT JOIN depositos_cliente dc ON dc.forma = fb.forma
  )
  SELECT
    COALESCE((SELECT c.total_vendas FROM consolidado c WHERE c.forma = 'dinheiro'), 0),
    COALESCE(SUM(CASE WHEN c.forma != 'conta_cliente' THEN c.total_vendas ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.forma != 'conta_cliente' THEN c.total_taxa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.forma != 'conta_cliente' THEN GREATEST(0, c.total_vendas - c.total_taxa) ELSE 0 END), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'forma', c.forma,
          'metodo', c.forma,
          'total_vendas', c.total_vendas,
          'total', c.total_vendas,
          'total_taxa', c.total_taxa,
          'total_taxas', c.total_taxa,
          'total_depositos', c.total_deposito,
          'total_liquido', GREATEST(0, ROUND(c.total_vendas - c.total_taxa, 2)),
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
  INTO v_vendas_dinheiro, v_total_bruto, v_total_taxas, v_total_liquido, v_itens, v_pagamentos_map
  FROM consolidado c;

  v_dinheiro_esperado := ROUND(v_fundo_troco + v_suprimentos - v_sangrias + v_vendas_dinheiro, 2);

  RETURN jsonb_build_object(
    'caixa_id', p_caixa_id,
    'aberto_em', v_aberto_em,
    'fechado_em', v_fechado_em,
    'fundo_troco', v_fundo_troco,
    'sangrias', v_sangrias,
    'suprimentos', v_suprimentos,
    'total_depositos_clientes', v_total_depositos_clientes,
    'vendas_dinheiro', v_vendas_dinheiro,
    'dinheiro_esperado', v_dinheiro_esperado,
    'total_bruto', v_total_bruto,
    'total_taxas', v_total_taxas,
    'total_liquido', v_total_liquido,
    'itens', v_itens,
    'pagamentos', v_pagamentos_map
  );
END;
$$;

-- 4. Tempo-alvo: Trocar DEFAULT 15 por NULL em categorias.tempo_alvo_min (RF09 / CA12)
ALTER TABLE public.categorias ALTER COLUMN tempo_alvo_min SET DEFAULT NULL;

-- Registro de aplicação (RF04)
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('083', 'migration_caf_000083_pendencias_operacao.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
