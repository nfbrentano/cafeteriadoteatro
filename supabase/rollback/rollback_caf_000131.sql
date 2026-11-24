-- ==============================================================================
-- ROLLBACK CAF-000131: Pedidos públicos: cupom aplicado no servidor, horário de funcionamento e proteção contra abuso
-- ==============================================================================

-- 1. Restaurar public.loja_esta_aberta() anterior
DROP FUNCTION IF EXISTS public.loja_esta_aberta(timestamptz);
DROP FUNCTION IF EXISTS public.loja_esta_aberta();

CREATE OR REPLACE FUNCTION public.loja_esta_aberta()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bh JSONB;
  v_dow INT;
  v_hora_sp TIME;
  v_cfg JSONB;
  v_abertura TIME;
  v_fechamento TIME;
BEGIN
  SELECT value INTO v_bh FROM public.site_settings WHERE key = 'business_hours';

  IF v_bh IS NULL THEN
    BEGIN
      SELECT jsonb_build_object(
        'seg_qui', jsonb_build_object('abertura', seg_qui_abre, 'fechamento', seg_qui_fecha, 'fechado', false),
        'sex', jsonb_build_object('abertura', sex_abre, 'fechamento', sex_fecha, 'fechado', false),
        'sab', jsonb_build_object('abertura', sab_dom_abre, 'fechamento', sab_dom_fecha, 'fechado', NOT COALESCE(sab_dom_ativo, false)),
        'dom', jsonb_build_object('fechado', true)
      ) INTO v_bh
      FROM public.business_hours
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_bh := NULL;
    END;
  END IF;

  IF v_bh IS NULL THEN
    RETURN TRUE;
  END IF;

  IF jsonb_typeof(v_bh) = 'string' THEN
    BEGIN
      v_bh := (v_bh#>>'{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN TRUE;
    END;
  END IF;

  v_dow := EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_hora_sp := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::time;

  IF v_dow = 0 THEN
    v_cfg := v_bh->'dom';
  ELSIF v_dow = 6 THEN
    v_cfg := v_bh->'sab';
  ELSIF v_dow = 5 THEN
    v_cfg := v_bh->'sex';
  ELSE
    v_cfg := v_bh->'seg_qui';
  END IF;

  IF v_cfg IS NULL OR COALESCE((v_cfg->>'fechado')::boolean, false) IS TRUE THEN
    RETURN FALSE;
  END IF;

  v_abertura := COALESCE((v_cfg->>'abertura')::time, '08:00'::time);
  v_fechamento := COALESCE((v_cfg->>'fechamento')::time, '20:00'::time);

  IF v_hora_sp >= v_abertura AND v_hora_sp <= v_fechamento THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.loja_esta_aberta() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.loja_esta_aberta() TO authenticated;

-- 2. Restaurar public.validar_cupom(text, numeric) anterior
DROP FUNCTION IF EXISTS public.validar_cupom(text, numeric, uuid);
DROP FUNCTION IF EXISTS public.validar_cupom(text, numeric);

CREATE OR REPLACE FUNCTION public.validar_cupom(p_cupom_codigo text, p_subtotal numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.validar_cupom(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_cupom(text, numeric) TO anon, authenticated;

-- 3. Restaurar public.registrar_uso_cupom anterior
CREATE OR REPLACE FUNCTION public.registrar_uso_cupom(p_campanha_id bigint, p_pedido_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido RECORD;
BEGIN
  IF auth.role() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Não autorizado para registrar uso de cupom.';
  END IF;

  IF p_campanha_id IS NULL THEN
    RAISE EXCEPTION 'Campanha ID é obrigatório para registrar uso de cupom.';
  END IF;

  IF p_pedido_id IS NULL THEN
    RAISE EXCEPTION 'Pedido ID é obrigatório para registrar uso de cupom.';
  END IF;

  SELECT id, status, total, campanha_id INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado.', p_pedido_id;
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é permitido registrar uso de cupom para pedido cancelado.';
  END IF;

  INSERT INTO public.campanha_usos (campanha_id, pedido_id, valor_receita, created_at)
  VALUES (p_campanha_id, p_pedido_id, COALESCE(v_pedido.total, 0), now())
  ON CONFLICT (pedido_id) DO NOTHING;

  UPDATE public.campanhas
  SET
    usos_registrados = (SELECT COUNT(*) FROM public.campanha_usos WHERE campanha_id = p_campanha_id),
    receita_atribuida = (SELECT COALESCE(SUM(valor_receita), 0) FROM public.campanha_usos WHERE campanha_id = p_campanha_id)
  WHERE id = p_campanha_id;
END;
$function$;

-- 4. Reverter colunas adicionadas
DROP INDEX IF EXISTS public.idx_campanha_usos_cliente;
ALTER TABLE public.campanha_usos DROP COLUMN IF EXISTS cliente_id;
ALTER TABLE public.campanhas DROP COLUMN IF EXISTS max_usos_por_cliente;
ALTER TABLE public.campanhas DROP COLUMN IF EXISTS max_usos;
ALTER TABLE public.campanhas DROP COLUMN IF EXISTS valido_ate;
ALTER TABLE public.campanhas DROP COLUMN IF EXISTS valido_de;
