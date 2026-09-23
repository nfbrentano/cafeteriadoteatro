-- =========================================================
-- MIGRATION: CAF-000025 - FECHAMENTO DE CAIXA
-- =========================================================

-- 1. Tabela caixas
CREATE TABLE IF NOT EXISTS public.caixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aberto_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  aberto_por UUID REFERENCES auth.users(id),
  fundo_troco NUMERIC(10,2) NOT NULL DEFAULT 0,
  fechado_em TIMESTAMP WITH TIME ZONE,
  fechado_por UUID REFERENCES auth.users(id),
  observacoes TEXT
);

-- Garantir que exista apenas um caixa aberto ao mesmo tempo
CREATE UNIQUE INDEX uk_caixa_aberto ON public.caixas (fechado_em) WHERE fechado_em IS NULL;

ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caixas_select" ON public.caixas FOR SELECT USING (true);
CREATE POLICY "caixas_insert" ON public.caixas FOR INSERT WITH CHECK (public.get_user_role() IN ('barista', 'admin'));
CREATE POLICY "caixas_update" ON public.caixas FOR UPDATE USING (public.get_user_role() IN ('barista', 'admin'));

-- 2. Tabela caixa_movimentos (Sangria e Suprimento)
CREATE TABLE IF NOT EXISTS public.caixa_movimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id UUID NOT NULL REFERENCES public.caixas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('sangria', 'suprimento')),
  valor NUMERIC(10,2) NOT NULL,
  motivo TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  criado_por UUID REFERENCES auth.users(id)
);

ALTER TABLE public.caixa_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caixa_movimentos_select" ON public.caixa_movimentos FOR SELECT USING (true);
CREATE POLICY "caixa_movimentos_insert" ON public.caixa_movimentos FOR INSERT WITH CHECK (public.get_user_role() IN ('barista', 'admin'));

-- 3. Tabela caixa_conferencia (Para o fechamento de caixa, o que foi contado pelo operador)
CREATE TABLE IF NOT EXISTS public.caixa_conferencia (
  id BIGSERIAL PRIMARY KEY,
  caixa_id UUID NOT NULL REFERENCES public.caixas(id) ON DELETE CASCADE,
  forma_pagamento TEXT NOT NULL,
  valor_informado NUMERIC(10,2) NOT NULL,
  valor_sistema NUMERIC(10,2) NOT NULL,
  diferenca NUMERIC(10,2) NOT NULL
);

ALTER TABLE public.caixa_conferencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caixa_conferencia_select" ON public.caixa_conferencia FOR SELECT USING (true);
CREATE POLICY "caixa_conferencia_insert" ON public.caixa_conferencia FOR INSERT WITH CHECK (public.get_user_role() IN ('barista', 'admin'));

-- 4. RPC para pegar o caixa atual
CREATE OR REPLACE FUNCTION public.get_caixa_atual()
RETURNS TABLE (
  id UUID,
  aberto_em TIMESTAMP WITH TIME ZONE,
  aberto_por UUID,
  fundo_troco NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.aberto_em, c.aberto_por, c.fundo_troco
  FROM public.caixas c
  WHERE c.fechado_em IS NULL
  LIMIT 1;
END;
$$;

-- 5. RPC para calcular os totais do caixa
-- Pega a soma dos pagamentos que ocorreram no período do caixa
CREATE OR REPLACE FUNCTION public.get_totais_caixa(p_caixa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_aberto_em TIMESTAMP WITH TIME ZONE;
  v_fechado_em TIMESTAMP WITH TIME ZONE;
  v_fundo_troco NUMERIC(10,2);
  v_sangrias NUMERIC(10,2) := 0;
  v_suprimentos NUMERIC(10,2) := 0;
  v_pagamentos JSONB;
BEGIN
  -- Obter dados do caixa
  SELECT aberto_em, fechado_em, fundo_troco INTO v_aberto_em, v_fechado_em, v_fundo_troco
  FROM public.caixas WHERE c.id = p_caixa_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado';
  END IF;

  -- Se o caixa não foi fechado ainda, usar a hora atual
  IF v_fechado_em IS NULL THEN
    v_fechado_em := NOW();
  END IF;

  -- Somar sangrias
  SELECT COALESCE(SUM(valor), 0) INTO v_sangrias 
  FROM public.caixa_movimentos 
  WHERE caixa_id = p_caixa_id AND tipo = 'sangria';
  
  -- Somar suprimentos
  SELECT COALESCE(SUM(valor), 0) INTO v_suprimentos 
  FROM public.caixa_movimentos 
  WHERE caixa_id = p_caixa_id AND tipo = 'suprimento';

  -- Agrupar pagamentos no período do caixa (tabela fechamento_pagamentos join fechamentos)
  SELECT COALESCE(jsonb_object_agg(sub.forma, sub.total), '{}'::jsonb) INTO v_pagamentos
  FROM (
    SELECT fp.forma, SUM(fp.valor) AS total
    FROM public.fechamento_pagamentos fp
    JOIN public.fechamentos f ON f.id = fp.fechamento_id
    WHERE f.created_at >= v_aberto_em AND f.created_at <= v_fechado_em
    GROUP BY fp.forma
  ) sub;
  
  RETURN jsonb_build_object(
    'fundo_troco', v_fundo_troco,
    'sangrias', v_sangrias,
    'suprimentos', v_suprimentos,
    'pagamentos', v_pagamentos
  );
END;
$$;

-- 6. RPC para fechar o caixa
-- Recebe JSONB com valores conferidos: [{"forma": "dinheiro", "valor_informado": 150, "valor_sistema": 150, "diferenca": 0}, ...]
CREATE OR REPLACE FUNCTION public.fechar_caixa(p_caixa_id UUID, p_valores_informados JSONB, p_observacoes TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_conferencia JSONB;
BEGIN
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Fechar o caixa
  UPDATE public.caixas
  SET fechado_em = NOW(),
      fechado_por = auth.uid(),
      observacoes = p_observacoes
  WHERE id = p_caixa_id AND fechado_em IS NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado ou já fechado';
  END IF;

  -- Inserir conferências
  FOR v_conferencia IN SELECT * FROM jsonb_array_elements(p_valores_informados)
  LOOP
    INSERT INTO public.caixa_conferencia (caixa_id, forma_pagamento, valor_informado, valor_sistema, diferenca)
    VALUES (
      p_caixa_id, 
      v_conferencia->>'forma', 
      (v_conferencia->>'valor_informado')::NUMERIC(10,2),
      (v_conferencia->>'valor_sistema')::NUMERIC(10,2),
      (v_conferencia->>'diferenca')::NUMERIC(10,2)
    );
  END LOOP;
  
  RETURN TRUE;
END;
$$;
