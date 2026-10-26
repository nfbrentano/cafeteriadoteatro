BEGIN;

-- =========================================================
-- MIGRATION: CAF-000076 - CORREÇÃO DE CASHBACK, SEGURANÇA E ESTORNO
-- =========================================================

-- 1. Unicidade de crédito e estorno por pedido
DROP INDEX IF EXISTS public.idx_cliente_conta_mov_cashback_unico;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cliente_conta_mov_cashback_deposito_unico
  ON public.cliente_conta_movimentos (pedido_id)
  WHERE pedido_id IS NOT NULL AND tipo = 'deposito' AND (forma_pagamento = 'cashback' OR motivo ILIKE '%cashback%');

CREATE UNIQUE INDEX IF NOT EXISTS idx_cliente_conta_mov_cashback_estorno_unico
  ON public.cliente_conta_movimentos (pedido_id)
  WHERE pedido_id IS NOT NULL AND tipo = 'estorno' AND (forma_pagamento = 'cashback' OR motivo ILIKE '%cashback%');

-- 2. RPC processar_cashback_pedido recalculada no servidor e blindada
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
  v_valor_base NUMERIC(10,2) := 0;
  v_status_pedido TEXT;
  v_cliente_real UUID;
BEGIN
  -- CA05: Chamada sem pedido_id é estritamente recusada
  IF p_pedido_id IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'p_pedido_id é obrigatório.');
  END IF;

  -- 1. Verifica se o recurso está ativo
  SELECT COALESCE((valor)::text::boolean, false)
  INTO v_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_ativo';

  IF NOT COALESCE(v_ativo, false) THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback desativado no sistema.');
  END IF;

  -- 2. Verifica pedido existente e seu status
  SELECT status, cliente_id
  INTO v_status_pedido, v_cliente_real
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF v_status_pedido = 'cancelado' THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Pedido cancelado não pode receber cashback.');
  END IF;

  IF p_cliente_id IS NULL THEN
    p_cliente_id := v_cliente_real;
  END IF;

  IF p_cliente_id IS NULL THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cliente não informado.');
  END IF;

  -- 3. Idempotência: verifica se este pedido já recebeu cashback
  SELECT EXISTS (
    SELECT 1 FROM public.cliente_conta_movimentos
    WHERE pedido_id = p_pedido_id 
      AND tipo = 'deposito'
      AND (forma_pagamento = 'cashback' OR motivo ILIKE '%cashback%')
  ) INTO v_ja_creditado;

  IF v_ja_creditado THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Cashback já creditado para este pedido.');
  END IF;

  -- 4. CA04 / RF04: Mover cálculo para o servidor baseado nos pagamentos gravados.
  -- 1º: Tenta somar pagamentos gravados em fechamento_pagamentos (se o pedido passou por fechamento de mesa)
  SELECT COALESCE(SUM(
    GREATEST(0, fp.valor - CASE WHEN fp.forma = 'dinheiro' THEN COALESCE(f.troco, 0) ELSE 0 END)
  ), 0.00)
  INTO v_valor_base
  FROM public.fechamento_pagamentos fp
  JOIN public.fechamentos f ON f.id = fp.fechamento_id
  JOIN public.fechamento_pedidos fped ON fped.fechamento_id = f.id
  WHERE fped.pedido_id = p_pedido_id
    AND LOWER(fp.forma) IN ('pix', 'dinheiro', 'cartao', 'cartao_credito', 'cartao_debito');

  -- 2º: Se não encontrou em fechamento_pagamentos, verifica se o pedido direto foi pago por forma elegível
  IF v_valor_base <= 0 THEN
    SELECT COALESCE(
      CASE 
        WHEN LOWER(COALESCE(p.forma_pagamento, '')) IN ('pix', 'dinheiro', 'cartao', 'cartao_credito', 'cartao_debito')
        THEN p.total
        ELSE 0
      END,
      0.00
    )
    INTO v_valor_base
    FROM public.pedidos p
    WHERE p.id = p_pedido_id;
  END IF;

  -- 3º: Fallback seguro apenas se o banco não tem registros mas o caller informou valor
  IF v_valor_base <= 0 AND p_valor_elegivel > 0 THEN
    v_valor_base := p_valor_elegivel;
  END IF;

  -- Obtém percentual e valor mínimo
  SELECT COALESCE((valor)::text::numeric, 5.0)
  INTO v_percentual
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_percentual';

  SELECT COALESCE((valor)::text::numeric, 10.0)
  INTO v_minimo
  FROM public.configuracoes_sistema
  WHERE chave = 'cashback_valor_minimo';

  IF v_valor_base < v_minimo THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor abaixo do mínimo para cashback.');
  END IF;

  -- Calcula o valor com arredondamento seguro
  v_cashback := ROUND((v_valor_base * v_percentual) / 100.0, 2);

  IF v_cashback <= 0 THEN
    RETURN jsonb_build_object('creditado', false, 'motivo', 'Valor de cashback nulo.');
  END IF;

  -- Lança movimentação
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
    format('Cashback automático (%s%%) — Pedido #%s', v_percentual, p_pedido_id),
    'cashback',
    now()
  );

  -- Atualiza saldo_conta em clientes
  UPDATE public.clientes
  SET saldo_conta = COALESCE(saldo_conta, 0) + v_cashback
  WHERE id = p_cliente_id;

  -- CA08: Saldo consistente calculado a partir das movimentações
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

-- 3. Segurança: Revogar de anon e permitir apenas authenticated (RF05 / CA05)
REVOKE EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) TO authenticated;

-- 4. Trigger de estorno de cashback no cancelamento de pedido (RF07 / CA07)
CREATE OR REPLACE FUNCTION public.fn_estorno_cashback_pedido_cancelado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cashback_mov RECORD;
  v_ja_estornado BOOLEAN;
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status != 'cancelado' THEN
    -- Busca crédito de cashback do pedido
    SELECT id, cliente_id, valor INTO v_cashback_mov
    FROM public.cliente_conta_movimentos
    WHERE pedido_id = NEW.id
      AND (forma_pagamento = 'cashback' OR motivo ILIKE '%cashback%')
      AND tipo = 'deposito'
    LIMIT 1;

    IF v_cashback_mov.id IS NOT NULL THEN
      -- Idempotência: verifica se já foi estornado
      SELECT EXISTS (
        SELECT 1 FROM public.cliente_conta_movimentos
        WHERE pedido_id = NEW.id
          AND tipo = 'estorno'
          AND (forma_pagamento = 'cashback' OR motivo ILIKE '%cashback%')
      ) INTO v_ja_estornado;

      IF NOT v_ja_estornado THEN
        -- Lança o movimento de estorno com valor negativo
        INSERT INTO public.cliente_conta_movimentos (
          cliente_id,
          pedido_id,
          tipo,
          valor,
          motivo,
          forma_pagamento,
          created_at
        ) VALUES (
          v_cashback_mov.cliente_id,
          NEW.id,
          'estorno',
          -v_cashback_mov.valor,
          format('Estorno de cashback pelo cancelamento do Pedido #%s', NEW.id),
          'cashback',
          now()
        );

        -- Atualiza saldo_conta em clientes (D01: permite saldo negativo se o cliente já usou)
        UPDATE public.clientes
        SET saldo_conta = COALESCE(saldo_conta, 0) - v_cashback_mov.valor
        WHERE id = v_cashback_mov.cliente_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estorno_cashback_pedido_cancelado ON public.pedidos;
CREATE TRIGGER trg_estorno_cashback_pedido_cancelado
AFTER UPDATE OF status ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.fn_estorno_cashback_pedido_cancelado();

-- Registro de aplicação (RF04)
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('076', 'migration_caf_000076_correcao_cashback.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
