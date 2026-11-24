-- ==============================================================================
-- CAF-000133: PDV: envio de pedido sem perda, recebimento do totem, cancelamento por RPC, observações e toasts
-- ==============================================================================

-- 1. Função auxiliar idempotente para desescapar entidades HTML legadas (RF07 / CA10, CA11)
CREATE OR REPLACE FUNCTION public.fn_desescapar_html(p_texto text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_resultado TEXT := p_texto;
  v_anterior TEXT;
BEGIN
  IF v_resultado IS NULL OR v_resultado = '' THEN
    RETURN v_resultado;
  END IF;

  FOR i IN 1..5 LOOP
    v_anterior := v_resultado;
    v_resultado := replace(v_resultado, '&amp;', '&');
    v_resultado := replace(v_resultado, '&lt;', '<');
    v_resultado := replace(v_resultado, '&gt;', '>');
    v_resultado := replace(v_resultado, '&quot;', '"');
    v_resultado := replace(v_resultado, '&#39;', '''');
    v_resultado := replace(v_resultado, '&#x27;', '''');
    v_resultado := replace(v_resultado, '&#x2F;', '/');
    IF v_resultado = v_anterior THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_resultado;
END;
$function$;

-- Normaliza observações legadas codificadas
UPDATE public.pedidos
SET observacoes = public.fn_desescapar_html(observacoes)
WHERE observacoes IS NOT NULL AND observacoes ~ '(&amp;|&lt;|&gt;|&quot;|&#39;|&#x27;|&#x2F;)';

UPDATE public.pedido_itens
SET observacoes = public.fn_desescapar_html(observacoes)
WHERE observacoes IS NOT NULL AND observacoes ~ '(&amp;|&lt;|&gt;|&quot;|&#39;|&#x27;|&#x2F;)';

-- 2. Atualização segura de receber_pedido_totem (RF05 / CA06, CA07)
CREATE OR REPLACE FUNCTION public.receber_pedido_totem(
  p_pedido_id bigint,
  p_forma_pagamento text DEFAULT 'pix'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido RECORD;
  v_forma TEXT;
BEGIN
  IF NOT public.tem_permissao('pdv.vender') AND public.get_user_role() NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_pedido.status <> 'aguardando_pagamento' THEN
    RAISE EXCEPTION 'Pedido não está aguardando pagamento (status atual: %).', v_pedido.status;
  END IF;

  v_forma := LOWER(TRIM(COALESCE(p_forma_pagamento, v_pedido.forma_pagamento, 'pix')));
  IF v_forma NOT IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outros') THEN
    v_forma := 'pix';
  END IF;

  UPDATE public.pedidos
  SET status = 'pendente',
      status_pagamento = 'pago',
      forma_pagamento = v_forma,
      updated_at = now()
  WHERE id = p_pedido_id;

  -- Registra em pedido_pagamentos se ainda não houver pagamento lançado
  IF NOT EXISTS (SELECT 1 FROM public.pedido_pagamentos WHERE pedido_id = p_pedido_id) THEN
    INSERT INTO public.pedido_pagamentos (
      pedido_id,
      forma_pagamento,
      valor,
      parte_nome,
      recebido_por
    ) VALUES (
      p_pedido_id,
      v_forma,
      v_pedido.total,
      'Totem',
      auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', p_pedido_id,
    'status', 'pendente',
    'status_pagamento', 'pago'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.receber_pedido_totem(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receber_pedido_totem(bigint, text) TO authenticated;

-- 3. Nova RPC cancelar_pedido para cancelamento atômico e auditado do pedido inteiro (RF06 / CA08, CA09)
CREATE OR REPLACE FUNCTION public.cancelar_pedido(
  p_pedido_id bigint,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido RECORD;
  v_user_role TEXT;
  v_user_id UUID;
  v_user_nome TEXT;
  v_motivo_clean TEXT;
BEGIN
  v_user_id := auth.uid();
  v_user_role := public.get_user_role();
  v_motivo_clean := TRIM(COALESCE(p_motivo, ''));

  IF LENGTH(v_motivo_clean) < 3 THEN
    RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mínimo 3 caracteres).';
  END IF;

  IF NOT (public.tem_permissao('pdv.cancelar_item', v_user_id) OR v_user_role = 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: sem permissão para cancelar pedidos.';
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado.', p_pedido_id;
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido já está cancelado.';
  END IF;

  IF v_pedido.status_pagamento = 'pago' AND v_user_role <> 'admin' AND NOT public.tem_permissao('pdv.cancelar_item_pago', v_user_id) THEN
    RAISE EXCEPTION 'Cancelamento de pedido pago exige perfil de administrador.';
  END IF;

  v_user_nome := public.fn_resolver_nome_usuario(v_user_id, 'Barista');

  -- Cancela todos os itens ativos do pedido
  UPDATE public.pedido_itens
  SET cancelado = true,
      motivo_cancelamento = v_motivo_clean,
      cancelado_em = now(),
      cancelado_por = v_user_id
  WHERE pedido_id = p_pedido_id AND cancelado = false;

  -- Atualiza o pedido (o trigger atualizará status_alterado / cancelado em pedido_eventos)
  UPDATE public.pedidos
  SET status = 'cancelado',
      motivo_cancelamento = v_motivo_clean,
      cancelado_em = now(),
      cancelado_por = v_user_id,
      cancelado_por_nome = v_user_nome,
      updated_at = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', p_pedido_id,
    'status', 'cancelado',
    'motivo', v_motivo_clean
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cancelar_pedido(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido(bigint, text) TO authenticated;

-- Registra migração 133 em app_migrations
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('133', 'migration_caf_000133_pdv_envio_seguro_totem_cancelamento.sql')
ON CONFLICT (versao) DO UPDATE SET arquivo = EXCLUDED.arquivo;
