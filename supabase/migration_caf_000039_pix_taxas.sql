-- =========================================================
-- MIGRATION: CAF-000039 — Pix com QR Code no fechamento e taxas por forma de pagamento
-- =========================================================

-- 1. Configurações de Pix em configuracoes_sistema e site_settings
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('pix_chave', '""'::jsonb),
  ('pix_recebedor', '"CAFETERIA DO TEATRO"'::jsonb),
  ('pix_cidade', '"LAJEADO"'::jsonb),
  ('pix_imprimir_na_conta', 'true'::jsonb)
ON CONFLICT (chave) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'site_settings') THEN
    INSERT INTO public.site_settings (key, value, updated_at)
    VALUES
      ('pix_chave', '', NOW()),
      ('pix_recebedor', 'CAFETERIA DO TEATRO', NOW()),
      ('pix_cidade', 'LAJEADO', NOW()),
      ('pix_imprimir_na_conta', 'true', NOW())
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- Log de auditoria para alterações de configurações sensíveis (ex.: chave Pix)
CREATE TABLE IF NOT EXISTS public.configuracoes_auditoria_log (
  id BIGSERIAL PRIMARY KEY,
  chave TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  alterado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  alterado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

ALTER TABLE public.configuracoes_auditoria_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configuracoes_auditoria_log_admin" ON public.configuracoes_auditoria_log;
CREATE POLICY "configuracoes_auditoria_log_admin" ON public.configuracoes_auditoria_log
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'admin');

CREATE OR REPLACE FUNCTION public.fn_audit_configuracoes_sistema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.chave IN ('pix_chave', 'pix_recebedor', 'pix_cidade', 'caixa_conferencia_cega', 'caixa_limite_diferenca_obs') THEN
    IF TG_OP = 'INSERT' OR OLD.valor IS DISTINCT FROM NEW.valor THEN
      INSERT INTO public.configuracoes_auditoria_log (
        chave, valor_anterior, valor_novo, alterado_por, alterado_por_nome
      ) VALUES (
        NEW.chave,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.valor::text ELSE NULL END,
        NEW.valor::text,
        auth.uid(),
        public.fn_resolver_nome_usuario(auth.uid(), NULL)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_configuracoes_sistema ON public.configuracoes_sistema;
CREATE TRIGGER trg_audit_configuracoes_sistema
AFTER INSERT OR UPDATE ON public.configuracoes_sistema
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_configuracoes_sistema();

-- 2. Tabela formas_pagamento_taxas
CREATE TABLE IF NOT EXISTS public.formas_pagamento_taxas (
  forma TEXT PRIMARY KEY,
  taxa_percentual NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (taxa_percentual >= 0 AND taxa_percentual <= 100),
  taxa_fixa NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (taxa_fixa >= 0),
  prazo_recebimento_dias INT NOT NULL DEFAULT 0 CHECK (prazo_recebimento_dias >= 0),
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

ALTER TABLE public.formas_pagamento_taxas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "formas_pagamento_taxas_select" ON public.formas_pagamento_taxas;
CREATE POLICY "formas_pagamento_taxas_select" ON public.formas_pagamento_taxas
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "formas_pagamento_taxas_admin" ON public.formas_pagamento_taxas;
CREATE POLICY "formas_pagamento_taxas_admin" ON public.formas_pagamento_taxas
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'admin' OR public.tem_permissao('admin.financeiro'))
  WITH CHECK (public.get_user_role() = 'admin' OR public.tem_permissao('admin.financeiro'));

INSERT INTO public.formas_pagamento_taxas (forma, taxa_percentual, taxa_fixa, prazo_recebimento_dias)
VALUES
  ('pix', 0.00, 0.00, 0),
  ('dinheiro', 0.00, 0.00, 0),
  ('cartao_debito', 1.20, 0.00, 1),
  ('cartao_credito', 3.10, 0.00, 30),
  ('outros', 0.00, 0.00, 0),
  ('conta_cliente', 0.00, 0.00, 0)
ON CONFLICT (forma) DO NOTHING;

-- 3. Colunas de taxa histórica em fechamento_pagamentos e pedidos
ALTER TABLE public.fechamento_pagamentos
  ADD COLUMN IF NOT EXISTS taxa_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_fixa NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS taxa_pagamento_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_pagamento_fixa NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_pagamento_valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2);

-- Inicializar valor_liquido nos registros existentes que ainda estão zerados
UPDATE public.fechamento_pagamentos
SET valor_liquido = GREATEST(0, valor - COALESCE(taxa_valor, 0))
WHERE valor_liquido = 0 AND valor > 0;

UPDATE public.pedidos
SET valor_liquido = GREATEST(0, total - COALESCE(taxa_pagamento_valor, 0))
WHERE valor_liquido IS NULL;

-- 4. Triggers para congelar a taxa no momento exato do pagamento (preserva histórico)
CREATE OR REPLACE FUNCTION public.fn_calcular_taxa_fechamento_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_forma_norm TEXT;
  v_pct NUMERIC(5,2) := 0;
  v_fixa NUMERIC(10,2) := 0;
  v_taxa NUMERIC(10,2) := 0;
BEGIN
  v_forma_norm := CASE
    WHEN NEW.forma = 'credito' THEN 'cartao_credito'
    WHEN NEW.forma = 'debito' THEN 'cartao_debito'
    ELSE COALESCE(NEW.forma, 'outros')
  END;

  SELECT COALESCE(taxa_percentual, 0), COALESCE(taxa_fixa, 0)
  INTO v_pct, v_fixa
  FROM public.formas_pagamento_taxas
  WHERE forma = v_forma_norm;

  IF NOT FOUND THEN
    v_pct := 0;
    v_fixa := 0;
  END IF;

  v_taxa := ROUND((COALESCE(NEW.valor, 0) * (v_pct / 100.0)) + v_fixa, 2);
  IF v_taxa > COALESCE(NEW.valor, 0) THEN
    v_taxa := COALESCE(NEW.valor, 0);
  END IF;

  NEW.taxa_percentual := v_pct;
  NEW.taxa_fixa := v_fixa;
  NEW.taxa_valor := v_taxa;
  NEW.valor_liquido := GREATEST(0, ROUND(COALESCE(NEW.valor, 0) - v_taxa, 2));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calcular_taxa_fechamento_pagamento ON public.fechamento_pagamentos;
CREATE TRIGGER trg_calcular_taxa_fechamento_pagamento
BEFORE INSERT ON public.fechamento_pagamentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_calcular_taxa_fechamento_pagamento();

CREATE OR REPLACE FUNCTION public.fn_calcular_taxa_pedido_balcao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_forma_norm TEXT;
  v_pct NUMERIC(5,2) := 0;
  v_fixa NUMERIC(10,2) := 0;
  v_taxa NUMERIC(10,2) := 0;
  v_tem_fechamento BOOLEAN := false;
BEGIN
  -- Só calcula/congela quando o pedido está pago (e quando é novo pagamento ou mudou total antes de fechar)
  IF NEW.status_pagamento = 'pago' AND NEW.forma_pagamento IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.fechamento_pedidos fp WHERE fp.pedido_id = NEW.id
      ) INTO v_tem_fechamento;
    END IF;

    -- Se foi pago via fechamento de mesa, a taxa já está em fechamento_pagamentos
    IF v_tem_fechamento THEN
      NEW.valor_liquido := COALESCE(NEW.valor_liquido, NEW.total);
      RETURN NEW;
    END IF;

    -- Só recalcula se está entrando em 'pago' agora ou se o total mudou no momento da criação
    IF TG_OP = 'INSERT'
       OR OLD.status_pagamento IS DISTINCT FROM 'pago'
       OR (OLD.total = 0 AND NEW.total > 0)
    THEN
      v_forma_norm := CASE
        WHEN NEW.forma_pagamento = 'credito' THEN 'cartao_credito'
        WHEN NEW.forma_pagamento = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(NEW.forma_pagamento, 'outros')
      END;

      SELECT COALESCE(taxa_percentual, 0), COALESCE(taxa_fixa, 0)
      INTO v_pct, v_fixa
      FROM public.formas_pagamento_taxas
      WHERE forma = v_forma_norm;

      IF NOT FOUND THEN
        v_pct := 0;
        v_fixa := 0;
      END IF;

      v_taxa := ROUND((COALESCE(NEW.total, 0) * (v_pct / 100.0)) + v_fixa, 2);
      IF v_taxa > COALESCE(NEW.total, 0) THEN
        v_taxa := COALESCE(NEW.total, 0);
      END IF;

      NEW.taxa_pagamento_percentual := v_pct;
      NEW.taxa_pagamento_fixa := v_fixa;
      NEW.taxa_pagamento_valor := v_taxa;
      NEW.valor_liquido := GREATEST(0, ROUND(COALESCE(NEW.total, 0) - v_taxa, 2));
    END IF;
  ELSE
    NEW.valor_liquido := COALESCE(NEW.total, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calcular_taxa_pedido_balcao ON public.pedidos;
CREATE TRIGGER trg_calcular_taxa_pedido_balcao
BEFORE INSERT OR UPDATE OF status_pagamento, forma_pagamento, total ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.fn_calcular_taxa_pedido_balcao();

-- 5. Atualizar fn_calcular_totais_caixa_interno (CAF-000044) para incluir total_taxas e total_liquido por forma
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
  v_total_bruto NUMERIC(10,2) := 0;
  v_total_taxas NUMERIC(10,2) := 0;
  v_total_liquido NUMERIC(10,2) := 0;
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

  SELECT COALESCE(SUM(m.valor), 0) INTO v_sangrias
  FROM public.caixa_movimentos m
  WHERE m.caixa_id = p_caixa_id AND m.tipo = 'sangria';

  SELECT COALESCE(SUM(m.valor), 0) INTO v_suprimentos
  FROM public.caixa_movimentos m
  WHERE m.caixa_id = p_caixa_id AND m.tipo = 'suprimento';

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
      )::NUMERIC(10,2) AS total_vendas,
      ROUND(COALESCE(vf.valor_taxa, 0) + COALESCE(vb.valor_taxa, 0), 2)::NUMERIC(10,2) AS total_taxa
    FROM formas_base fb
    LEFT JOIN vendas_fechamento vf ON vf.forma = fb.forma
    LEFT JOIN vendas_balcao vb ON vb.forma = fb.forma
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

-- 6. Atualizar get_admin_reports para incluir bruto, taxa e líquido em pagamentos e no resumo
CREATE OR REPLACE FUNCTION public.get_admin_reports(
  p_inicio TIMESTAMPTZ,
  p_fim TIMESTAMPTZ,
  p_categoria_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_cortesias JSONB;
  v_mais_vendidos JSONB;
  v_pagamentos JSONB;
  v_promocoes JSONB;
  v_tempo_preparo JSONB;
  v_tempo_por_categoria JSONB;
  v_horarios_pico_hora JSONB;
  v_horarios_pico_dia JSONB;
  v_ticket_medio JSONB;
  v_margem_produtos JSONB;
  v_cmv_resumo JSONB;
  v_total_taxas_periodo NUMERIC(10,2) := 0;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role != 'admin' AND NOT public.tem_permissao('admin.relatorios') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  -- 1. Cortesias concedidas
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_cortesias
  FROM (
    SELECT
      pi_origem.nome_produto AS prato_liberador,
      SUM(pi_cortesia.quantidade) AS total_cortesias,
      SUM(pi_cortesia.quantidade * pi_cortesia.preco_unitario) AS valor_abonado,
      SUM(pi_cortesia.quantidade * COALESCE(pi_cortesia.custo_unitario, 0)) AS custo_cortesias
    FROM public.pedido_itens pi_cortesia
    JOIN public.pedido_itens pi_origem ON pi_cortesia.cortesia_de_item_id = pi_origem.id
    JOIN public.pedidos p ON p.id = pi_cortesia.pedido_id
    WHERE pi_cortesia.cortesia_de_item_id IS NOT NULL
      AND pi_cortesia.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY pi_origem.nome_produto
    ORDER BY total_cortesias DESC
  ) t;

  -- 2. Mais Vendidos
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_mais_vendidos
  FROM (
    SELECT
      pi.nome_produto,
      SUM(pi.quantidade) AS quantidade_vendida,
      SUM(pi.quantidade * pi.preco_unitario) AS faturamento
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
      AND (p_categoria_id IS NULL OR p_categoria_id = '' OR pi.categoria_id = p_categoria_id)
    GROUP BY pi.nome_produto
    ORDER BY quantidade_vendida DESC
    LIMIT 100
  ) t;

  -- 3. Pagamentos (Bruto, Taxa Histórica e Líquido)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_pagamentos
  FROM (
    SELECT
      forma,
      ROUND(SUM(valor_bruto), 2) AS total_valor,
      ROUND(SUM(valor_bruto), 2) AS total_bruto,
      ROUND(SUM(valor_taxa), 2) AS total_taxa,
      ROUND(SUM(GREATEST(0, valor_bruto - valor_taxa)), 2) AS total_liquido
    FROM (
      SELECT
        CASE
          WHEN fp.forma = 'credito' THEN 'cartao_credito'
          WHEN fp.forma = 'debito' THEN 'cartao_debito'
          ELSE COALESCE(fp.forma, 'outros')
        END AS forma,
        GREATEST(
          0,
          fp.valor - CASE WHEN fp.forma = 'dinheiro' THEN COALESCE(f.troco, 0) ELSE 0 END
        ) AS valor_bruto,
        COALESCE(fp.taxa_valor, 0) AS valor_taxa
      FROM public.fechamento_pagamentos fp
      JOIN public.fechamentos f ON f.id = fp.fechamento_id
      WHERE f.created_at >= p_inicio AND f.created_at <= p_fim
      UNION ALL
      SELECT
        CASE
          WHEN p.forma_pagamento = 'credito' THEN 'cartao_credito'
          WHEN p.forma_pagamento = 'debito' THEN 'cartao_debito'
          ELSE COALESCE(p.forma_pagamento, 'outros')
        END AS forma,
        p.total AS valor_bruto,
        COALESCE(p.taxa_pagamento_valor, 0) AS valor_taxa
      FROM public.pedidos p
      LEFT JOIN public.fechamento_pedidos fped ON fped.pedido_id = p.id
      WHERE fped.pedido_id IS NULL
        AND p.status_pagamento = 'pago'
        AND p.status != 'cancelado'
        AND p.forma_pagamento IS NOT NULL
        AND p.created_at >= p_inicio AND p.created_at <= p_fim
    ) todas_formas
    GROUP BY forma
    ORDER BY total_valor DESC
  ) t;

  SELECT COALESCE(SUM((elem->>'total_taxa')::NUMERIC(10,2)), 0)
  INTO v_total_taxas_periodo
  FROM jsonb_array_elements(v_pagamentos) elem;

  -- 4. Promoções
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_promocoes
  FROM (
    SELECT
      prom.nome AS promocao_nome,
      COUNT(pi.id) AS vezes_aplicada,
      SUM(pi.desconto) AS desconto_total,
      SUM(pi.quantidade * pi.preco_unitario) AS faturamento,
      SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS custo_total,
      SUM(pi.quantidade * pi.preco_unitario) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS lucro_com_desconto,
      (SUM(pi.quantidade * pi.preco_unitario) + SUM(COALESCE(pi.desconto, 0))) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS lucro_sem_desconto
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    JOIN public.promocoes prom ON prom.id = pi.promocao_id
    WHERE pi.promocao_id IS NOT NULL
      AND pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY prom.nome
    ORDER BY desconto_total DESC
  ) t;

  -- 5. Tempo de preparo
  SELECT row_to_json(t) INTO v_tempo_preparo
  FROM (
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (iniciado_em - created_at))/60), 0) AS media_fila_minutos,
      COALESCE(AVG(EXTRACT(EPOCH FROM (concluido_em - iniciado_em))/60), 0) AS media_preparo_minutos
    FROM public.pedidos
    WHERE status IN ('concluido', 'entregue')
      AND iniciado_em IS NOT NULL
      AND concluido_em IS NOT NULL
      AND created_at >= p_inicio
      AND created_at <= p_fim
  ) t;

  -- 5b. Tempo por categoria (CAF-000029)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_tempo_por_categoria
  FROM (
    SELECT
      c.id AS categoria_id,
      c.nome AS categoria_nome,
      c.icone AS categoria_icone,
      COALESCE(c.tempo_alvo_min, 15) AS tempo_alvo_min,
      COUNT(pi.id) AS total_itens_concluidos,
      ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (pi.pronto_em - p.created_at))/60), 0)::numeric, 1) AS media_preparo_minutos
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    JOIN public.produtos prod ON prod.id = pi.produto_id
    JOIN public.categorias c ON c.id = prod.categoria_id
    WHERE pi.pronto_em IS NOT NULL
      AND pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
    GROUP BY c.id, c.nome, c.icone, c.tempo_alvo_min
    ORDER BY media_preparo_minutos DESC
  ) t;

  -- 6. Horários de pico - Por Hora
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_horarios_pico_hora
  FROM (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Sao_Paulo')) AS hora,
      COUNT(id) AS total_pedidos,
      SUM(total) AS faturamento
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
    GROUP BY hora
    ORDER BY hora ASC
  ) t;

  -- 7. Horários de pico - Por Dia
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_horarios_pico_dia
  FROM (
    SELECT
      EXTRACT(DOW FROM (created_at AT TIME ZONE 'America/Sao_Paulo')) AS dia,
      COUNT(id) AS total_pedidos,
      SUM(total) AS faturamento
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
    GROUP BY dia
    ORDER BY dia ASC
  ) t;

  -- 8. Ticket Médio e Resumo Geral (com taxas e faturamento líquido)
  SELECT row_to_json(t) INTO v_ticket_medio
  FROM (
    SELECT
      COALESCE(SUM(total), 0) AS faturamento_total,
      v_total_taxas_periodo AS taxas_pagamento_total,
      GREATEST(0, COALESCE(SUM(total), 0) - v_total_taxas_periodo) AS faturamento_liquido,
      COUNT(id) AS pedidos_validos,
      CASE
        WHEN COUNT(id) > 0 THEN COALESCE(SUM(total), 0) / COUNT(id)
        ELSE 0
      END AS ticket_medio
    FROM public.pedidos
    WHERE status != 'cancelado'
      AND created_at >= p_inicio
      AND created_at <= p_fim
  ) t;

  -- 9. Margem e Lucro por Produto (CAF-000032)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_margem_produtos
  FROM (
    SELECT
      pi.produto_id,
      pi.nome_produto,
      SUM(pi.quantidade) AS quantidade_vendida,
      SUM(pi.quantidade * pi.preco_unitario) AS faturamento,
      SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS custo_total,
      SUM(pi.quantidade * pi.preco_unitario) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)) AS lucro_bruto,
      CASE
        WHEN SUM(pi.quantidade * pi.preco_unitario) > 0
        THEN ROUND(((SUM(pi.quantidade * pi.preco_unitario) - SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0))) / SUM(pi.quantidade * pi.preco_unitario) * 100)::numeric, 1)
        ELSE 0
      END AS margem_percentual
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE pi.cancelado = false
      AND p.status != 'cancelado'
      AND p.created_at >= p_inicio
      AND p.created_at <= p_fim
      AND (p_categoria_id IS NULL OR p_categoria_id = '' OR pi.categoria_id = p_categoria_id)
    GROUP BY pi.produto_id, pi.nome_produto
    ORDER BY faturamento DESC
  ) t;

  -- 10. Resumo de CMV e Lucro Bruto do Período (CAF-000032)
  SELECT row_to_json(t) INTO v_cmv_resumo
  FROM (
    WITH totais AS (
      SELECT
        COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0) AS faturamento_total,
        COALESCE(SUM(pi.quantidade * COALESCE(pi.custo_unitario, 0)), 0) AS custo_total
      FROM public.pedido_itens pi
      JOIN public.pedidos p ON p.id = pi.pedido_id
      WHERE pi.cancelado = false
        AND p.status != 'cancelado'
        AND p.created_at >= p_inicio
        AND p.created_at <= p_fim
    ),
    cortesias AS (
      SELECT
        COALESCE(SUM(pi_cortesia.quantidade * COALESCE(pi_cortesia.custo_unitario, 0)), 0) AS custo_cortesias
      FROM public.pedido_itens pi_cortesia
      JOIN public.pedidos p ON p.id = pi_cortesia.pedido_id
      WHERE pi_cortesia.cortesia_de_item_id IS NOT NULL
        AND pi_cortesia.cancelado = false
        AND p.status != 'cancelado'
        AND p.created_at >= p_inicio
        AND p.created_at <= p_fim
    )
    SELECT
      totais.faturamento_total,
      totais.custo_total AS cmv_total,
      (totais.faturamento_total - totais.custo_total) AS lucro_bruto_total,
      v_total_taxas_periodo AS taxas_pagamento_total,
      (totais.faturamento_total - totais.custo_total - v_total_taxas_periodo) AS lucro_liquido_apos_taxas,
      CASE
        WHEN totais.faturamento_total > 0
        THEN ROUND((totais.custo_total / totais.faturamento_total * 100)::numeric, 1)
        ELSE 0
      END AS cmv_percentual,
      CASE
        WHEN totais.faturamento_total > 0
        THEN ROUND(((totais.faturamento_total - totais.custo_total) / totais.faturamento_total * 100)::numeric, 1)
        ELSE 0
      END AS margem_media_percentual,
      cortesias.custo_cortesias
    FROM totais, cortesias
  ) t;

  RETURN jsonb_build_object(
    'cortesias', v_cortesias,
    'mais_vendidos', v_mais_vendidos,
    'pagamentos', v_pagamentos,
    'promocoes', v_promocoes,
    'tempo_preparo', v_tempo_preparo,
    'tempo_por_categoria', v_tempo_por_categoria,
    'horarios_pico_hora', v_horarios_pico_hora,
    'horarios_pico_dia', v_horarios_pico_dia,
    'resumo', v_ticket_medio,
    'margem_produtos', v_margem_produtos,
    'cmv_resumo', v_cmv_resumo
  );
END;
$$;

-- 7. RPC para lançar as taxas de pagamento de um mês/período como despesa no Financeiro (CAF-000035)
CREATE OR REPLACE FUNCTION public.lancar_taxas_pagamento_despesa(
  p_ano INT,
  p_mes INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_inicio TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  v_data_ref DATE;
  v_total_taxas NUMERIC(10,2) := 0;
  v_cat_id INT;
  v_despesa_id BIGINT;
  v_desc TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' AND NOT public.tem_permissao('admin.financeiro') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  v_data_ref := (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::DATE;
  v_inicio := make_timestamptz(p_ano, p_mes, 1, 0, 0, 0, 'America/Sao_Paulo');
  v_fim := (v_inicio + interval '1 month' - interval '1 microsecond');

  SELECT ROUND(COALESCE(SUM(valor_taxa), 0), 2)
  INTO v_total_taxas
  FROM (
    SELECT COALESCE(fp.taxa_valor, 0) AS valor_taxa
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    WHERE f.created_at >= v_inicio AND f.created_at <= v_fim
    UNION ALL
    SELECT COALESCE(p.taxa_pagamento_valor, 0) AS valor_taxa
    FROM public.pedidos p
    LEFT JOIN public.fechamento_pedidos fped ON fped.pedido_id = p.id
    WHERE fped.pedido_id IS NULL
      AND p.status_pagamento = 'pago'
      AND p.status != 'cancelado'
      AND p.created_at >= v_inicio AND p.created_at <= v_fim
  ) sub;

  IF v_total_taxas <= 0 THEN
    RAISE EXCEPTION 'Não há taxas de pagamento acumuladas em %/% para lançar.', LPAD(p_mes::text, 2, '0'), p_ano;
  END IF;

  -- Obter ou criar categoria "Taxas de Cartão / Maquininha"
  SELECT id INTO v_cat_id
  FROM public.despesa_categorias
  WHERE lower(nome) LIKE '%taxa%' OR lower(nome) LIKE '%maquininha%' OR lower(nome) LIKE '%financeir%'
  ORDER BY (CASE WHEN lower(nome) LIKE '%taxa%' THEN 0 ELSE 1 END)
  LIMIT 1;

  IF v_cat_id IS NULL THEN
    INSERT INTO public.despesa_categorias (nome, tipo)
    VALUES ('Taxas de Pagamento / Maquininha', 'variavel')
    RETURNING id INTO v_cat_id;
  END IF;

  v_desc := format('Taxas de meios de pagamento (%s/%s)', LPAD(p_mes::text, 2, '0'), p_ano);

  -- Verificar se já existe lançamento para o mês e atualizar ou inserir
  SELECT id INTO v_despesa_id
  FROM public.despesas
  WHERE descricao = v_desc
  LIMIT 1;

  IF v_despesa_id IS NOT NULL THEN
    UPDATE public.despesas
    SET valor = v_total_taxas,
        valor_pago = v_total_taxas,
        vencimento = v_data_ref,
        pago_em = v_data_ref
    WHERE id = v_despesa_id;
  ELSE
    INSERT INTO public.despesas (
      descricao, categoria_id, valor, vencimento, pago_em, valor_pago, forma_pagamento, recorrencia, observacoes, criado_por
    ) VALUES (
      v_desc, v_cat_id, v_total_taxas, v_data_ref, v_data_ref, v_total_taxas, 'outros', 'nenhuma',
      'Gerado automaticamente a partir das taxas de pagamento registradas nas vendas do mês (CAF-000039).',
      auth.uid()
    )
    RETURNING id INTO v_despesa_id;
  END IF;

  RETURN jsonb_build_object(
    'despesa_id', v_despesa_id,
    'descricao', v_desc,
    'valor', v_total_taxas
  );
END;
$$;
