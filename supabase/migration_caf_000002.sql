-- =========================================================
-- MIGRATION: CAF-000002 - FECHAMENTO DE CONTA
-- =========================================================

-- 1. Tabela fechamentos
CREATE TABLE IF NOT EXISTS public.fechamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa_codigo TEXT NOT NULL,
  total_conta NUMERIC(10,2) NOT NULL DEFAULT 0,
  troco NUMERIC(10,2) NOT NULL DEFAULT 0,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamentos_select" ON public.fechamentos FOR SELECT USING (true);
CREATE POLICY "fechamentos_insert" ON public.fechamentos FOR INSERT WITH CHECK (public.get_user_role() IN ('barista', 'admin'));

-- 2. Tabela fechamento_pagamentos
CREATE TABLE IF NOT EXISTS public.fechamento_pagamentos (
  id BIGSERIAL PRIMARY KEY,
  fechamento_id UUID NOT NULL REFERENCES public.fechamentos(id) ON DELETE CASCADE,
  forma TEXT NOT NULL, -- pix, dinheiro, cartao_credito, cartao_debito, outros
  valor NUMERIC(10,2) NOT NULL
);

ALTER TABLE public.fechamento_pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamento_pagamentos_select" ON public.fechamento_pagamentos FOR SELECT USING (true);
CREATE POLICY "fechamento_pagamentos_insert" ON public.fechamento_pagamentos FOR INSERT WITH CHECK (public.get_user_role() IN ('barista', 'admin'));

-- 3. Tabela fechamento_pedidos
CREATE TABLE IF NOT EXISTS public.fechamento_pedidos (
  fechamento_id UUID NOT NULL REFERENCES public.fechamentos(id) ON DELETE CASCADE,
  pedido_id BIGINT NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  PRIMARY KEY (fechamento_id, pedido_id)
);

ALTER TABLE public.fechamento_pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamento_pedidos_select" ON public.fechamento_pedidos FOR SELECT USING (true);
CREATE POLICY "fechamento_pedidos_insert" ON public.fechamento_pedidos FOR INSERT WITH CHECK (public.get_user_role() IN ('barista', 'admin'));

-- 4. RPC fechar_conta_mesa
-- Recebe o código da mesa e o array de pagamentos JSONB no formato:
-- [{"forma": "dinheiro", "valor": 50.0}, {"forma": "pix", "valor": 20.0}]
CREATE OR REPLACE FUNCTION public.fechar_conta_mesa(p_mesa_codigo TEXT, p_pagamentos JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_total_a_pagar NUMERIC(10,2) := 0;
  v_total_pago NUMERIC(10,2) := 0;
  v_troco NUMERIC(10,2) := 0;
  v_pagamento JSONB;
  v_fechamento_id UUID;
  v_pedido RECORD;
  v_count_pedidos INT := 0;
BEGIN
  -- Verificar Role
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- 1. Calcular o total de pedidos em aberto (status_pagamento != 'pago') da mesa
  -- Consideramos nulo como 'a_pagar'
  SELECT COALESCE(SUM(total), 0), COUNT(id)
  INTO v_total_a_pagar, v_count_pedidos
  FROM public.pedidos
  WHERE mesa_codigo = p_mesa_codigo
    AND (status_pagamento IS NULL OR status_pagamento != 'pago');

  IF v_count_pedidos = 0 THEN
    RAISE EXCEPTION 'Não há pedidos a pagar nesta mesa.';
  END IF;

  -- 2. Calcular a soma dos pagamentos enviados
  FOR v_pagamento IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    v_total_pago := v_total_pago + (v_pagamento->>'valor')::NUMERIC(10,2);
  END LOOP;

  IF v_total_pago < v_total_a_pagar THEN
    RAISE EXCEPTION 'O valor dos pagamentos (R$ %) é inferior ao total a pagar (R$ %).', v_total_pago, v_total_a_pagar;
  END IF;

  -- Troco geral da conta
  v_troco := v_total_pago - v_total_a_pagar;

  -- 3. Inserir o Fechamento
  INSERT INTO public.fechamentos (mesa_codigo, total_conta, troco, criado_por)
  VALUES (p_mesa_codigo, v_total_a_pagar, v_troco, auth.uid())
  RETURNING id INTO v_fechamento_id;

  -- 4. Inserir os Pagamentos
  FOR v_pagamento IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
    VALUES (v_fechamento_id, v_pagamento->>'forma', (v_pagamento->>'valor')::NUMERIC(10,2));
  END LOOP;

  -- 5. Vincular Pedidos e Marcar como Pago
  FOR v_pedido IN (
    SELECT id FROM public.pedidos 
    WHERE mesa_codigo = p_mesa_codigo AND (status_pagamento IS NULL OR status_pagamento != 'pago')
  ) LOOP
    INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
    VALUES (v_fechamento_id, v_pedido.id);
    
    UPDATE public.pedidos
    SET status_pagamento = 'pago'
    WHERE id = v_pedido.id;
  END LOOP;

  -- 6. Retornar dados do fechamento
  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento_id,
    'total_conta', v_total_a_pagar,
    'total_pago', v_total_pago,
    'troco', v_troco
  );
END;
$$;
