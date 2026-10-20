-- =========================================================
-- MIGRATION: CAF-000061 - CUPONS DE DESCONTO E CONVERSÃO
-- =========================================================

-- 1. Colunas de desconto e rastreamento em public.campanhas
ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS tipo_desconto TEXT DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS valor_desconto NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_minimo_pedido NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ativa BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS usos_registrados INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receita_atribuida NUMERIC(10,2) DEFAULT 0;

-- Índice para busca rápida de cupons case-insensitive
CREATE INDEX IF NOT EXISTS idx_campanhas_cupom_upper
  ON public.campanhas (UPPER(TRIM(cupom_codigo)))
  WHERE cupom_codigo IS NOT NULL;

-- 2. Colunas de cupom em public.pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cupom_codigo TEXT,
  ADD COLUMN IF NOT EXISTS campanha_id BIGINT REFERENCES public.campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS desconto_cupom NUMERIC(10,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pedidos_campanha_id
  ON public.pedidos(campanha_id)
  WHERE campanha_id IS NOT NULL;

-- 3. Função RPC segura para validação pública de cupom
CREATE OR REPLACE FUNCTION public.validar_cupom(
  p_cupom_codigo TEXT,
  p_subtotal NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campanha RECORD;
  v_cupom_limpo TEXT;
  v_desconto_calc NUMERIC(10,2) := 0;
BEGIN
  v_cupom_limpo := UPPER(TRIM(COALESCE(p_cupom_codigo, '')));
  
  IF v_cupom_limpo = '' THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Código de cupom não informado.');
  END IF;

  SELECT id, nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa
  INTO v_campanha
  FROM public.campanhas
  WHERE UPPER(TRIM(cupom_codigo)) = v_cupom_limpo
  ORDER BY id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Cupom inválido ou não encontrado.');
  END IF;

  IF NOT COALESCE(v_campanha.ativa, true) THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Este cupom não está mais ativo.');
  END IF;

  IF p_subtotal < COALESCE(v_campanha.valor_minimo_pedido, 0) THEN
    RETURN jsonb_build_object(
      'valido', false,
      'mensagem', format('Pedido mínimo de R$ %s para este cupom (subtotal atual: R$ %s).',
        to_char(v_campanha.valor_minimo_pedido, 'FM999G990D00'),
        to_char(p_subtotal, 'FM999G990D00')
      )
    );
  END IF;

  IF LOWER(COALESCE(v_campanha.tipo_desconto, 'percentual')) IN ('percentual', 'percent') THEN
    v_desconto_calc := ROUND((p_subtotal * COALESCE(v_campanha.valor_desconto, 0)) / 100.0, 2);
  ELSE
    v_desconto_calc := COALESCE(v_campanha.valor_desconto, 0);
  END IF;

  IF v_desconto_calc > p_subtotal THEN
    v_desconto_calc := p_subtotal;
  END IF;

  RETURN jsonb_build_object(
    'valido', true,
    'mensagem', 'Cupom aplicado com sucesso!',
    'campanha_id', v_campanha.id,
    'campanha_nome', v_campanha.nome,
    'cupom_codigo', v_campanha.cupom_codigo,
    'tipo_desconto', v_campanha.tipo_desconto,
    'valor_desconto', v_campanha.valor_desconto,
    'desconto_calculado', v_desconto_calc
  );
END;
$$;

-- Permissão para chamar a RPC de cupom (anônimo e autenticado)
GRANT EXECUTE ON FUNCTION public.validar_cupom(TEXT, NUMERIC) TO anon, authenticated;

-- 4. Função RPC para registrar uso de cupom e receita atribuída
CREATE OR REPLACE FUNCTION public.registrar_uso_cupom(
  p_campanha_id BIGINT,
  p_valor_pedido NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_campanha_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.campanhas
  SET
    usos_registrados = COALESCE(usos_registrados, 0) + 1,
    receita_atribuida = COALESCE(receita_atribuida, 0) + GREATEST(COALESCE(p_valor_pedido, 0), 0)
  WHERE id = p_campanha_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_uso_cupom(BIGINT, NUMERIC) TO anon, authenticated;
