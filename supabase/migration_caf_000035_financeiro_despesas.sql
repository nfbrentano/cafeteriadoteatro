-- Migration CAF-000035: Contas a Pagar, Despesas e Fluxo de Caixa

-- 1. Tabela de Fornecedores
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  documento TEXT,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_nome ON public.fornecedores (lower(nome));
CREATE INDEX IF NOT EXISTS idx_fornecedores_ativo ON public.fornecedores (ativo);

-- 2. Tabela de Categorias de Despesas
CREATE TABLE IF NOT EXISTS public.despesa_categorias (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('fixa', 'variavel')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Carga inicial de categorias
INSERT INTO public.despesa_categorias (nome, tipo) VALUES
  ('Aluguel', 'fixa'),
  ('Energia Elétrica', 'fixa'),
  ('Água / Saneamento', 'fixa'),
  ('Internet / Telefonia', 'fixa'),
  ('Salários / Pró-labore', 'fixa'),
  ('Contabilidade', 'fixa'),
  ('Impostos / Alvarás', 'fixa'),
  ('Insumos / Café e Alimentos', 'variavel'),
  ('Manutenção / Equipamentos', 'variavel'),
  ('Taxas de Cartão / Meios de Pagamento', 'variavel'),
  ('Marketing / Divulgação', 'variavel'),
  ('Descartáveis / Embalagens', 'variavel'),
  ('Outros', 'variavel')
ON CONFLICT (nome) DO NOTHING;

-- 3. Tabela de Despesas / Contas a Pagar
CREATE TABLE IF NOT EXISTS public.despesas (
  id BIGSERIAL PRIMARY KEY,
  descricao TEXT NOT NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  categoria_id INT NOT NULL REFERENCES public.despesa_categorias(id),
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  vencimento DATE NOT NULL,
  pago_em DATE DEFAULT NULL,
  valor_pago NUMERIC(10,2) DEFAULT NULL,
  forma_pagamento TEXT CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('pix', 'dinheiro', 'transferencia', 'boleto', 'debito_automatico', 'cartao_credito', 'outros')),
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'sangria', 'estoque')),
  recorrencia TEXT NOT NULL DEFAULT 'nenhuma' CHECK (recorrencia IN ('nenhuma', 'mensal')),
  proxima_recorrencia_criada BOOLEAN NOT NULL DEFAULT false,
  caixa_movimento_id BIGINT,
  estoque_movimento_id BIGINT,
  observacoes TEXT,
  anexo_url TEXT,
  criado_por UUID REFERENCES auth.users(id),
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despesas_vencimento ON public.despesas (vencimento);
CREATE INDEX IF NOT EXISTS idx_despesas_pago_em ON public.despesas (pago_em);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria_id ON public.despesas (categoria_id);
CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor_id ON public.despesas (fornecedor_id);

-- 4. RPC para Dar Baixa em Despesa (com geração automática da próxima recorrência mensal)
CREATE OR REPLACE FUNCTION public.baixar_despesa(
  p_despesa_id BIGINT,
  p_pago_em DATE,
  p_valor_pago NUMERIC,
  p_forma_pagamento TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_despesa RECORD;
  v_prox_vencimento DATE;
  v_prox_id BIGINT := NULL;
  v_user_nome TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem baixar despesas';
  END IF;

  SELECT * INTO v_despesa FROM public.despesas WHERE id = p_despesa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada';
  END IF;

  IF p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'O valor pago deve ser maior que zero';
  END IF;

  -- Atualizar a despesa atual como paga
  UPDATE public.despesas
  SET 
    pago_em = COALESCE(p_pago_em, CURRENT_DATE),
    valor_pago = p_valor_pago,
    forma_pagamento = p_forma_pagamento,
    updated_at = now()
  WHERE id = p_despesa_id;

  -- Se for mensal e ainda não gerou a próxima parcela
  IF v_despesa.recorrencia = 'mensal' AND NOT v_despesa.proxima_recorrencia_criada THEN
    v_prox_vencimento := (v_despesa.vencimento + interval '1 month')::DATE;

    SELECT COALESCE(raw_user_meta_data->>'nome', email) INTO v_user_nome
    FROM auth.users
    WHERE id = auth.uid();

    INSERT INTO public.despesas (
      descricao, fornecedor_id, categoria_id, valor, vencimento, 
      pago_em, valor_pago, forma_pagamento, origem, recorrencia, 
      proxima_recorrencia_criada, observacoes, criado_por, criado_por_nome
    ) VALUES (
      v_despesa.descricao, v_despesa.fornecedor_id, v_despesa.categoria_id, v_despesa.valor, v_prox_vencimento,
      NULL, NULL, NULL, v_despesa.origem, 'mensal',
      false, v_despesa.observacoes, auth.uid(), v_user_nome
    ) RETURNING id INTO v_prox_id;

    UPDATE public.despesas SET proxima_recorrencia_criada = true WHERE id = p_despesa_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'despesa_id', p_despesa_id,
    'proxima_despesa_id', v_prox_id,
    'proximo_vencimento', v_prox_vencimento
  );
END;
$$;

-- 5. RPC para Resumo Financeiro Gerencial do Mês
CREATE OR REPLACE FUNCTION public.get_resumo_financeiro(
  p_mes INT,
  p_ano INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_vencidas_total NUMERIC(10,2) := 0;
  v_vencidas_qtd INT := 0;
  v_vence_7d_total NUMERIC(10,2) := 0;
  v_vence_7d_qtd INT := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_total_faturamento NUMERIC(10,2) := 0;
  v_resultado NUMERIC(10,2) := 0;
  v_despesas_por_cat JSONB := '[]'::JSONB;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_data_inicio := make_date(p_ano, p_mes, 1);
  v_data_fim := (v_data_inicio + interval '1 month' - interval '1 day')::DATE;

  -- 1. Contas vencidas não pagas (em qualquer data até ontem)
  SELECT 
    COALESCE(SUM(valor), 0),
    COUNT(*)
  INTO v_vencidas_total, v_vencidas_qtd
  FROM public.despesas
  WHERE pago_em IS NULL AND vencimento < CURRENT_DATE;

  -- 2. Contas a vencer nos próximos 7 dias (a partir de hoje)
  SELECT 
    COALESCE(SUM(valor), 0),
    COUNT(*)
  INTO v_vence_7d_total, v_vence_7d_qtd
  FROM public.despesas
  WHERE pago_em IS NULL 
    AND vencimento >= CURRENT_DATE 
    AND vencimento <= (CURRENT_DATE + interval '7 days')::DATE;

  -- 3. Total pago no mês selecionado
  SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0)
  INTO v_total_pago
  FROM public.despesas
  WHERE pago_em >= v_data_inicio AND pago_em <= v_data_fim;

  -- 4. Faturamento bruto do mês (pedidos concluídos/pagos no período)
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_faturamento
  FROM public.pedidos
  WHERE status != 'cancelado' 
    AND status_pagamento = 'pago'
    AND created_at::DATE >= v_data_inicio 
    AND created_at::DATE <= v_data_fim;

  -- 5. Resultado operacional (Faturamento - Despesas Pagas)
  v_resultado := v_total_faturamento - v_total_pago;

  -- 6. Despesas do mês agrupadas por categoria
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_despesas_por_cat
  FROM (
    SELECT 
      c.nome AS categoria,
      c.tipo,
      COUNT(d.id)::INT AS quantidade,
      ROUND(SUM(COALESCE(d.valor_pago, d.valor)), 2) AS total
    FROM public.despesas d
    JOIN public.despesa_categorias c ON c.id = d.categoria_id
    WHERE d.pago_em >= v_data_inicio AND d.pago_em <= v_data_fim
    GROUP BY c.nome, c.tipo
    ORDER BY total DESC
  ) sub;

  RETURN jsonb_build_object(
    'mes', p_mes,
    'ano', p_ano,
    'vencidas_total', v_vencidas_total,
    'vencidas_qtd', v_vencidas_qtd,
    'vence_7d_total', v_vence_7d_total,
    'vence_7d_qtd', v_vence_7d_qtd,
    'total_pago', v_total_pago,
    'total_faturamento', v_total_faturamento,
    'resultado_operacional', v_resultado,
    'despesas_por_categoria', v_despesas_por_cat
  );
END;
$$;

-- 6. RPC para Fluxo de Caixa (dia a dia no período)
CREATE OR REPLACE FUNCTION public.get_fluxo_caixa(
  p_inicio DATE,
  p_fim DATE
)
RETURNS TABLE (
  data DATE,
  entradas NUMERIC(10,2),
  saidas NUMERIC(10,2),
  saldo_dia NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(p_inicio, p_fim, '1 day'::interval)::DATE AS dia
  ),
  vendas AS (
    SELECT 
      created_at::DATE AS dia,
      COALESCE(SUM(total), 0) AS total_vendas
    FROM public.pedidos
    WHERE status != 'cancelado' 
      AND status_pagamento = 'pago'
      AND created_at::DATE >= p_inicio AND created_at::DATE <= p_fim
    GROUP BY created_at::DATE
  ),
  despesas_pagas AS (
    SELECT 
      pago_em AS dia,
      COALESCE(SUM(COALESCE(valor_pago, valor)), 0) AS total_despesas
    FROM public.despesas
    WHERE pago_em IS NOT NULL
      AND pago_em >= p_inicio AND pago_em <= p_fim
    GROUP BY pago_em
  )
  SELECT 
    d.dia AS data,
    COALESCE(v.total_vendas, 0.00)::NUMERIC(10,2) AS entradas,
    COALESCE(dp.total_despesas, 0.00)::NUMERIC(10,2) AS saidas,
    (COALESCE(v.total_vendas, 0.00) - COALESCE(dp.total_despesas, 0.00))::NUMERIC(10,2) AS saldo_dia
  FROM dias d
  LEFT JOIN vendas v ON v.dia = d.dia
  LEFT JOIN despesas_pagas dp ON dp.dia = d.dia
  ORDER BY d.dia ASC;
END;
$$;

-- 7. Segurança: RLS em Fornecedores, Categorias e Despesas
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesa_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

-- Fornecedores (apenas admin)
DROP POLICY IF EXISTS "Apenas admins acessam fornecedores" ON public.fornecedores;
CREATE POLICY "Apenas admins acessam fornecedores"
ON public.fornecedores
FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin')
WITH CHECK (public.get_user_role() = 'admin');

-- Categorias (apenas admin)
DROP POLICY IF EXISTS "Apenas admins acessam despesa_categorias" ON public.despesa_categorias;
CREATE POLICY "Apenas admins acessam despesa_categorias"
ON public.despesa_categorias
FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin')
WITH CHECK (public.get_user_role() = 'admin');

-- Despesas (apenas admin)
DROP POLICY IF EXISTS "Apenas admins acessam despesas" ON public.despesas;
CREATE POLICY "Apenas admins acessam despesas"
ON public.despesas
FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin')
WITH CHECK (public.get_user_role() = 'admin');
