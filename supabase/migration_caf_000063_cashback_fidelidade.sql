-- =========================================================
-- MIGRATION: CAF-000063 - CASHBACK E FIDELIDADE AUTOMÁTICA
-- =========================================================

-- 1. Chaves de configuração em configuracoes_sistema (DESATIVADO POR PADRÃO)
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES
  ('cashback_ativo', 'false'::jsonb),
  ('cashback_percentual', '5.00'::jsonb),
  ('cashback_valor_minimo', '10.00'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 2. Garantir coluna de saldo em clientes e tabela de movimentos de conta
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS saldo_conta NUMERIC(10,2) DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS public.cliente_conta_movimentos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'deposito',
  valor NUMERIC(10,2) NOT NULL,
  pedido_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL,
  fechamento_id BIGINT,
  forma_pagamento TEXT,
  motivo TEXT,
  criado_por UUID,
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_conta_movimentos
  ADD COLUMN IF NOT EXISTS pedido_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL;

-- 3. Índice único para evitar crédito duplicado de cashback no mesmo pedido
CREATE UNIQUE INDEX IF NOT EXISTS idx_cliente_conta_mov_cashback_unico
  ON public.cliente_conta_movimentos (pedido_id)
  WHERE pedido_id IS NOT NULL AND motivo ILIKE '%cashback%';

-- 4. Função RPC segura para processar crédito de cashback na carteira
CREATE OR REPLACE FUNCTION public.processar_cashback_pedido(
  p_pedido_id BIGINT,
  p_cliente_id UUID,
  p_valor_elegivel NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ativo BOOLEAN;
  v_percentual NUMERIC;
  v_minimo NUMERIC;
  v_cashback NUMERIC(10,2);
  v_ja_creditado BOOLEAN;
  v_novo_saldo NUMERIC(10,2);
BEGIN
  -- 1. Verifica se o recurso está ativo (obrigatório: desativado por padrão)
  SELECT COALESCE((valor)::text::boolean, false)
  INTO v_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_ativo';

  IF NOT COALESCE(v_ativo, false) THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback desativado no sistema.');
  END IF;

  IF p_cliente_id IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cliente não informado.');
  END IF;

  -- 2. Obtém percentual e valor mínimo
  SELECT COALESCE((valor)::text::numeric, 5.0)
  INTO v_percentual
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_percentual';

  SELECT COALESCE((valor)::text::numeric, 10.0)
  INTO v_minimo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_valor_minimo';

  IF p_valor_elegivel < v_minimo THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor abaixo do mínimo para cashback.');
  END IF;

  -- 3. Idempotência: verifica se este pedido já recebeu cashback
  IF p_pedido_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.cliente_conta_movimentos
      WHERE pedido_id = p_pedido_id AND motivo ILIKE '%cashback%'
    ) INTO v_ja_creditado;

    IF v_ja_creditado THEN
      RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback já creditado para este pedido.');
    END IF;
  END IF;

  -- 4. Calcula o valor
  v_cashback := ROUND((p_valor_elegivel * v_percentual) / 100.0, 2);

  IF v_cashback <= 0 THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor de cashback nulo.');
  END IF;

  -- 5. Lança na movimentação da conta do cliente
  INSERT INTO public.cliente_conta_movimentos (
    cliente_id,
    pedido_id,
    tipo,
    valor,
    motivo,
    forma_pagamento,
    created_at
  ) VALUES (
    p_cliente_id,
    p_pedido_id,
    'deposito',
    v_cashback,
    format('Cashback automático (%s%%) — Pedido #%s', v_percentual, COALESCE(p_pedido_id::text, 'PDV')),
    'cashback',
    now()
  );

  -- 6. Atualiza saldo_conta em clientes e calcula o saldo atualizado
  UPDATE public.clientes
  SET saldo_conta = COALESCE(saldo_conta, 0) + v_cashback
  WHERE id = p_cliente_id;

  SELECT COALESCE(SUM(valor), 0.00)
  INTO v_novo_saldo
  FROM public.cliente_conta_movimentos
  WHERE cliente_id = p_cliente_id;

  RETURN jsonb_build_object(
    'creditado', true,
    'valor_cashback', v_cashback,
    'percentual', v_percentual,
    'novo_saldo', v_novo_saldo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) TO anon, authenticated;
