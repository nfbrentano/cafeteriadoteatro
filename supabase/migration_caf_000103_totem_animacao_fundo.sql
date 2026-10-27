-- =========================================================
-- MIGRATION: CAF-000103 - TOTEM ANIMAÇÃO DE FUNDO
-- =========================================================

-- Semeia a configuração padrão de animação de fundo do totem
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES ('totem_animacao_fundo', '{"tipo":"catalogo","id":"nenhuma"}'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- Atualiza validar_sessao_totem para retornar animacao_fundo
CREATE OR REPLACE FUNCTION public.validar_sessao_totem(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash TEXT;
  v_totem RECORD;
  v_expiracao_min INT := 15;
  v_aviso_titulo TEXT := '🎭 Hoje no Teatro Univates';
  v_aviso_subtitulo TEXT := 'Peça aqui no totem e retire rápido no balcão!';
  v_animacao_fundo JSONB := '{"tipo":"catalogo","id":"nenhuma"}'::jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'TOKEN_AUSENTE');
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_totem
  FROM public.totens
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'TOKEN_INVALIDO');
  END IF;

  IF v_totem.ativo IS FALSE THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'TOTEM_REVOGADO');
  END IF;

  UPDATE public.totens
  SET ultimo_acesso = now()
  WHERE id = v_totem.id;

  -- Aproveita o heartbeat para expirar pedidos vencidos
  PERFORM public.expirar_pedidos_totem_vencidos();

  SELECT COALESCE((valor)::text::int, 15) INTO v_expiracao_min
  FROM public.configuracoes_sistema WHERE chave = 'totem_expiracao_pagamento_min';

  SELECT COALESCE( trim(both '"' from (valor)::text), v_aviso_titulo) INTO v_aviso_titulo
  FROM public.configuracoes_sistema WHERE chave = 'totem_aviso_teatro_titulo';

  SELECT COALESCE( trim(both '"' from (valor)::text), v_aviso_subtitulo) INTO v_aviso_subtitulo
  FROM public.configuracoes_sistema WHERE chave = 'totem_aviso_teatro_subtitulo';

  SELECT COALESCE(valor, '{"tipo":"catalogo","id":"nenhuma"}'::jsonb) INTO v_animacao_fundo
  FROM public.configuracoes_sistema WHERE chave = 'totem_animacao_fundo';

  RETURN jsonb_build_object(
    'valido', true,
    'totem_id', v_totem.id,
    'nome', v_totem.nome,
    'modo_operacao', v_totem.modo_operacao,
    'expiracao_pagamento_min', v_expiracao_min,
    'aviso_titulo', v_aviso_titulo,
    'aviso_subtitulo', v_aviso_subtitulo,
    'animacao_fundo', v_animacao_fundo
  );
END;
$$;

