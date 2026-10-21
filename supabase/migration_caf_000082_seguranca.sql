-- ==============================================================================
-- CAF-000082 — Segurança: RPCs, policies e views expostas a anônimos e a staff
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- RF01: Trava de Impressão Segura (fechar escrita direta em pedido_impressoes)
-- ------------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.pedido_impressoes FROM anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.pedido_impressoes FROM authenticated;
GRANT SELECT ON public.pedido_impressoes TO authenticated;

CREATE OR REPLACE FUNCTION public.travar_impressao_pedido(
  p_pedido_id BIGINT,
  p_estacao TEXT,
  p_tipo TEXT DEFAULT 'comanda',
  p_dispositivo TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_id BIGINT;
  v_role TEXT;
BEGIN
  -- 1. Exige autenticação
  IF auth.role() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Acesso não autorizado para controle de impressão.';
  END IF;

  -- 2. Permissão operacional (cozinha, barista, garcom, gerente, admin)
  v_role := public.get_user_role();
  IF v_role NOT IN ('cozinha', 'barista', 'garcom', 'gerente', 'admin') 
     AND NOT public.tem_permissao('pdv.vender') 
     AND NOT public.tem_permissao('kds') THEN
    RAISE EXCEPTION 'Usuário sem permissão operacional para travar impressão.';
  END IF;

  -- Reimpressões manuais ('reimpressao' ou 'reimpressao_etiqueta') não sofrem bloqueio de duplicidade
  IF p_tipo IN ('reimpressao', 'reimpressao_etiqueta') THEN
    INSERT INTO public.pedido_impressoes (pedido_id, estacao, tipo, dispositivo)
    VALUES (p_pedido_id, p_estacao, p_tipo, p_dispositivo);
    RETURN TRUE;
  END IF;

  INSERT INTO public.pedido_impressoes (pedido_id, estacao, tipo, dispositivo)
  VALUES (p_pedido_id, p_estacao, p_tipo, p_dispositivo)
  ON CONFLICT (pedido_id, estacao, tipo) WHERE tipo IN ('comanda', 'adicional', 'etiqueta')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.travar_impressao_pedido(BIGINT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.travar_impressao_pedido(BIGINT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- RF02: Chamados de Mesa (fechar insert direto anônimo)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "mesa_chamados_insert_anon" ON public.mesa_chamados;
REVOKE INSERT ON public.mesa_chamados FROM anon, public;

CREATE OR REPLACE FUNCTION public.chamar_atendente_mesa(p_qr_token TEXT, p_tipo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mesa RECORD;
  v_chamado_id BIGINT;
  v_recente TIMESTAMPTZ;
BEGIN
  IF p_tipo NOT IN ('atendente', 'conta') THEN
    RAISE EXCEPTION 'Tipo de chamado inválido: %', p_tipo;
  END IF;

  SELECT * INTO v_mesa
  FROM public.mesas
  WHERE qr_token = p_qr_token AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada ou QR code inválido.';
  END IF;

  -- Rate limit: 1 chamado por minuto por mesa do mesmo tipo
  SELECT MAX(created_at) INTO v_recente
  FROM public.mesa_chamados
  WHERE mesa_codigo = v_mesa.codigo AND tipo = p_tipo AND status = 'pendente';

  IF v_recente IS NOT NULL AND (timezone('America/Sao_Paulo', now()) - v_recente) < INTERVAL '60 seconds' THEN
    RETURN jsonb_build_object('sucesso', true, 'repetido', true, 'mensagem', 'Chamado já registrado. O atendente já foi avisado.');
  END IF;

  INSERT INTO public.mesa_chamados (mesa_codigo, tipo, status)
  VALUES (v_mesa.codigo, p_tipo, 'pendente')
  RETURNING id INTO v_chamado_id;

  RETURN jsonb_build_object('sucesso', true, 'chamado_id', v_chamado_id, 'mesa_codigo', v_mesa.codigo, 'tipo', p_tipo);
END;
$$;

GRANT EXECUTE ON FUNCTION public.chamar_atendente_mesa(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RF03: Estoque Movimentos Restrito a Staff com Permissão
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "estoque_movimentos_insert_auth" ON public.estoque_movimentos;
CREATE POLICY "estoque_movimentos_insert_auth" ON public.estoque_movimentos
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      public.tem_permissao('estoque')
      OR public.get_user_role() IN ('admin', 'gerente')
      OR tipo = 'saida'
    )
  );

-- ------------------------------------------------------------------------------
-- RF04: CRM Policies Restritas a Permissão crm ou Admin/Gerente
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "cliente_tags_auth_all" ON public.cliente_tags;
CREATE POLICY "cliente_tags_crm_staff" ON public.cliente_tags
  FOR ALL TO authenticated
  USING (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'))
  WITH CHECK (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'));

DROP POLICY IF EXISTS "cliente_tag_vinculos_auth_all" ON public.cliente_tag_vinculos;
CREATE POLICY "cliente_tag_vinculos_crm_staff" ON public.cliente_tag_vinculos
  FOR ALL TO authenticated
  USING (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'))
  WITH CHECK (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'));

DROP POLICY IF EXISTS "campanhas_auth_all" ON public.campanhas;
CREATE POLICY "campanhas_crm_staff" ON public.campanhas
  FOR ALL TO authenticated
  USING (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'))
  WITH CHECK (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'));

DROP POLICY IF EXISTS "campanha_envios_auth_all" ON public.campanha_envios;
CREATE POLICY "campanha_envios_crm_staff" ON public.campanha_envios
  FOR ALL TO authenticated
  USING (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'))
  WITH CHECK (public.tem_permissao('crm') OR public.get_user_role() IN ('admin', 'gerente'));

-- ------------------------------------------------------------------------------
-- RF05: Views de Dados Pessoais com security_invoker = true
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cliente_saldo WITH (security_invoker = true) AS
SELECT 
  c.id AS cliente_id,
  c.nome AS cliente_nome,
  c.telefone AS cliente_telefone,
  c.conta_habilitada,
  c.limite_credito,
  c.dia_vencimento,
  COALESCE(SUM(m.valor), 0.00)::NUMERIC(10,2) AS saldo,
  (c.limite_credito + COALESCE(SUM(m.valor), 0.00))::NUMERIC(10,2) AS limite_disponivel
FROM public.clientes c
LEFT JOIN public.cliente_conta_movimentos m ON m.cliente_id = c.id
GROUP BY c.id, c.nome, c.telefone, c.conta_habilitada, c.limite_credito, c.dia_vencimento;

CREATE OR REPLACE VIEW public.v_clientes_rfv WITH (security_invoker = true) AS
WITH cfg AS (
  SELECT
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_dias_ativo'), 30) AS dias_ativo,
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_dias_perdido'), 90) AS dias_perdido,
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_pedidos_fiel_90d'), 4) AS min_fiel,
    COALESCE((SELECT (valor)::text::int FROM public.configuracoes_sistema WHERE chave = 'crm_antispam_dias'), 7) AS dias_antispam
),
pedidos_validos AS (
  SELECT
    p.id,
    p.cliente_id,
    COALESCE(p.total, 0)::numeric(10,2) AS valor,
    p.created_at
  FROM public.pedidos p
  WHERE p.cliente_id IS NOT NULL
    AND COALESCE(p.status, '') <> 'cancelado'
),
metricas_cliente AS (
  SELECT
    pv.cliente_id,
    MIN(pv.created_at) AS primeira_compra,
    MAX(pv.created_at) AS ultima_compra,
    COUNT(*)::int AS total_pedidos,
    COALESCE(SUM(pv.valor), 0)::numeric(10,2) AS total_gasto,
    COUNT(*) FILTER (WHERE pv.created_at >= (now() - INTERVAL '90 days'))::int AS pedidos_90d,
    COALESCE(SUM(pv.valor) FILTER (WHERE pv.created_at >= (now() - INTERVAL '90 days')), 0)::numeric(10,2) AS gasto_90d,
    MIN(pv.created_at) FILTER (WHERE pv.created_at < (now() - INTERVAL '30 days')) AS primeira_compra_ant,
    MAX(pv.created_at) FILTER (WHERE pv.created_at < (now() - INTERVAL '30 days')) AS ultima_compra_ant,
    COUNT(*) FILTER (
      WHERE pv.created_at < (now() - INTERVAL '30 days')
        AND pv.created_at >= (now() - INTERVAL '120 days')
    )::int AS pedidos_90d_ant
  FROM pedidos_validos pv
  GROUP BY pv.cliente_id
),
prod_fav AS (
  SELECT DISTINCT ON (pv.cliente_id)
    pv.cliente_id,
    pi.nome_produto AS produto_favorito
  FROM pedidos_validos pv
  JOIN public.pedido_itens pi ON pi.pedido_id = pv.id
  WHERE COALESCE(pi.cancelado, false) = false
    AND pi.nome_produto IS NOT NULL
  GROUP BY pv.cliente_id, pi.nome_produto
  ORDER BY pv.cliente_id, SUM(COALESCE(pi.quantidade, 1)) DESC, MAX(pv.created_at) DESC
),
prods_comprados AS (
  SELECT
    pv.cliente_id,
    ARRAY_AGG(DISTINCT pi.produto_id) FILTER (WHERE pi.produto_id IS NOT NULL) AS produtos_comprados_ids
  FROM pedidos_validos pv
  JOIN public.pedido_itens pi ON pi.pedido_id = pv.id
  WHERE COALESCE(pi.cancelado, false) = false
  GROUP BY pv.cliente_id
),
ultimo_envio AS (
  SELECT
    ce.cliente_id,
    MAX(ce.enviado_em) AS ultimo_disparo_campanha
  FROM public.campanha_envios ce
  GROUP BY ce.cliente_id
)
SELECT
  c.id AS cliente_id,
  c.nome,
  split_part(trim(c.nome), ' ', 1) AS primeiro_nome,
  c.telefone,
  c.email,
  c.aceita_contato,
  c.ativo,
  c.anonimizado,
  mc.primeira_compra,
  mc.ultima_compra,
  CASE
    WHEN mc.ultima_compra IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (now() - mc.ultima_compra))::int
  END AS dias_sem_comprar,
  COALESCE(mc.total_pedidos, 0) AS total_pedidos,
  COALESCE(mc.total_gasto, 0)::numeric(10,2) AS total_gasto,
  COALESCE(mc.pedidos_90d, 0) AS pedidos_90d,
  COALESCE(mc.gasto_90d, 0)::numeric(10,2) AS gasto_90d,
  pf.produto_favorito,
  COALESCE(pc.produtos_comprados_ids, ARRAY[]::text[]) AS produtos_comprados_ids,
  ue.ultimo_disparo_campanha,
  CASE
    WHEN ue.ultimo_disparo_campanha IS NOT NULL
     AND ue.ultimo_disparo_campanha >= (now() - (cfg.dias_antispam || ' days')::interval)
    THEN true
    ELSE false
  END AS bloqueado_antispam,
  CASE
    WHEN mc.ultima_compra IS NULL THEN 'Perdido'
    WHEN mc.primeira_compra >= (now() - (cfg.dias_ativo || ' days')::interval) THEN 'Novo'
    WHEN mc.ultima_compra >= (now() - (cfg.dias_ativo || ' days')::interval)
     AND COALESCE(mc.pedidos_90d, 0) >= cfg.min_fiel THEN 'Fiel'
    WHEN mc.ultima_compra >= (now() - (cfg.dias_ativo || ' days')::interval) THEN 'Ativo'
    WHEN mc.ultima_compra >= (now() - (cfg.dias_perdido || ' days')::interval) THEN 'Em risco'
    ELSE 'Perdido'
  END AS segmento,
  CASE
    WHEN mc.ultima_compra_ant IS NULL THEN NULL
    WHEN mc.primeira_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_ativo || ' days')::interval) THEN 'Novo'
    WHEN mc.ultima_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_ativo || ' days')::interval)
     AND COALESCE(mc.pedidos_90d_ant, 0) >= cfg.min_fiel THEN 'Fiel'
    WHEN mc.ultima_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_ativo || ' days')::interval) THEN 'Ativo'
    WHEN mc.ultima_compra_ant >= ((now() - INTERVAL '30 days') - (cfg.dias_perdido || ' days')::interval) THEN 'Em risco'
    ELSE 'Perdido'
  END AS segmento_mes_anterior
FROM public.clientes c
CROSS JOIN cfg
LEFT JOIN metricas_cliente mc ON mc.cliente_id = c.id
LEFT JOIN prod_fav pf ON pf.cliente_id = c.id
LEFT JOIN prods_comprados pc ON pc.cliente_id = c.id
LEFT JOIN ultimo_envio ue ON ue.cliente_id = c.id;

CREATE OR REPLACE VIEW public.v_campanhas_conversao WITH (security_invoker = true) AS
SELECT
  cp.id AS campanha_id,
  cp.nome,
  cp.segmento_filtro,
  cp.tag_id_filtro,
  cp.produto_id_filtro,
  cp.cupom_codigo,
  cp.mensagem_template,
  cp.created_at,
  COUNT( DISTINCT ce.id )::int AS total_enviados,
  COUNT( DISTINCT CASE
    WHEN p.id IS NOT NULL THEN ce.cliente_id
    ELSE NULL
  END )::int AS clientes_converteram_7d,
  COALESCE(SUM( DISTINCT CASE
    WHEN p.id IS NOT NULL THEN COALESCE(p.total, 0)
    ELSE 0
  END ), 0)::numeric(10,2) AS receita_gerada_7d
FROM public.campanhas cp
LEFT JOIN public.campanha_envios ce ON ce.campanha_id = cp.id
LEFT JOIN public.pedidos p ON p.cliente_id = ce.cliente_id
  AND p.created_at >= ce.enviado_em
  AND p.created_at <= (ce.enviado_em + INTERVAL '7 days')
  AND COALESCE(p.status, '') <> 'cancelado'
GROUP BY cp.id, cp.nome, cp.segmento_filtro, cp.tag_id_filtro, cp.produto_id_filtro, cp.cupom_codigo, cp.mensagem_template, cp.created_at;

REVOKE ALL ON public.v_clientes_rfv FROM anon, public;
REVOKE ALL ON public.v_cliente_saldo FROM anon, public;
REVOKE ALL ON public.v_campanhas_conversao FROM anon, public;

GRANT SELECT ON public.v_clientes_rfv TO authenticated;
GRANT SELECT ON public.v_cliente_saldo TO authenticated;
GRANT SELECT ON public.v_campanhas_conversao TO authenticated;

-- ------------------------------------------------------------------------------
-- RF06: v_painel_retirada (LGPD e Recorte Seguro do Dia)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_painel_retirada WITH (security_invoker = false) AS
SELECT 
  numero_pedido,
  split_part(trim(coalesce(cliente_nome, '')), ' ', 1) AS primeiro_nome,
  status,
  pronto_em
FROM public.pedidos
WHERE (
    (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
    OR (retirada_em IS NOT NULL AND (retirada_em AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)
  )
  AND status IN ('pendente', 'em_preparo', 'concluido')
  AND (retirada_em IS NULL OR retirada_em <= now() + INTERVAL '25 minutes');

GRANT SELECT ON public.v_painel_retirada TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RF07 e RF08: Verificação de Horário e Rate Limiting no Servidor
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.loja_esta_aberta()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bh JSONB;
  v_dow INT;
  v_hora_sp TIME;
  v_cfg JSONB;
  v_abertura TIME;
  v_fechamento TIME;
BEGIN
  -- 1. Tenta carregar business_hours de site_settings
  SELECT value INTO v_bh FROM public.site_settings WHERE key = 'business_hours';

  -- 2. Fallback: tabela business_hours se existir
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

  -- Se não há configuração registrada, assume aberto
  IF v_bh IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Se for string JSON, converte
  IF jsonb_typeof(v_bh) = 'string' THEN
    BEGIN
      v_bh := (v_bh#>>'{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN TRUE;
    END;
  END IF;

  -- Dia da semana em São Paulo: 0=Domingo, 1..4=Seg-Qui, 5=Sexta, 6=Sábado
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
$$;

-- ------------------------------------------------------------------------------
-- RF09: Menu Analytics Sanitizado e Protegido
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_evento_cardapio(
  p_canal TEXT,
  p_tipo_evento TEXT,
  p_produto_id TEXT DEFAULT NULL,
  p_data DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje DATE;
BEGIN
  -- 1. Whitelist de canais permitidos
  IF p_canal NOT IN ('mesa', 'retirada', 'totem', 'vitrine', 'geral', 'online', 'cardapio_digital', 'web') THEN
    RAISE EXCEPTION 'Canal de analytics inválido: %', p_canal;
  END IF;

  -- 2. Whitelist de tipos de eventos
  IF p_tipo_evento NOT IN ('sessao_cardapio', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'filter_cat', 'search', 'view_cardapio', 'checkout_start', 'view_categoria', 'click_produto', 'adicionar_carrinho', 'remover_carrinho') THEN
    RAISE EXCEPTION 'Tipo de evento de analytics inválido: %', p_tipo_evento;
  END IF;

  -- 3. Validar se produto existe (se informado)
  IF p_produto_id IS NOT NULL AND TRIM(p_produto_id) <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = p_produto_id) THEN
      RAISE EXCEPTION 'Produto não encontrado: %', p_produto_id;
    END IF;
  ELSE
    p_produto_id := NULL;
  END IF;

  -- 4. Força sempre a data corrente de São Paulo no servidor (ignora p_data adulterado do cliente)
  v_hoje := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.cardapio_eventos_diarios (data, canal, tipo_evento, produto_id, total_eventos, updated_at)
  VALUES (v_hoje, p_canal, p_tipo_evento, p_produto_id, 1, timezone('America/Sao_Paulo', now()))
  ON CONFLICT (data, canal, tipo_evento, produto_id)
  DO UPDATE SET
    total_eventos = public.cardapio_eventos_diarios.total_eventos + 1,
    updated_at = timezone('America/Sao_Paulo', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_evento_cardapio(TEXT, TEXT, TEXT, DATE) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- RF10: Fechar Acesso Anônimo a Cupom e Cashback
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.processar_cashback_pedido(BIGINT, UUID, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_uso_cupom(
  p_campanha_id BIGINT,
  p_valor_pedido NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  IF p_campanha_id IS NULL THEN
    RAISE EXCEPTION 'Campanha ID é obrigatório para registrar uso de cupom.';
  END IF;

  UPDATE public.campanhas
  SET
    usos_registrados = COALESCE(usos_registrados, 0) + 1,
    receita_atribuida = COALESCE(receita_atribuida, 0) + GREATEST(COALESCE(p_valor_pedido, 0), 0)
  WHERE id = p_campanha_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_uso_cupom(BIGINT, NUMERIC) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.registrar_uso_cupom(BIGINT, NUMERIC) TO authenticated;

-- ------------------------------------------------------------------------------
-- Allowlist Pública Documentada (RF11 / CA11):
-- RPCs:
--   - public.validar_cupom(TEXT, NUMERIC)
--   - public.criar_pedido_cliente(TEXT, JSONB, TEXT)
--   - public.criar_pedido_online(JSONB, TEXT)
--   - public.consultar_status_pedido_cliente(UUID)
--   - public.consultar_janelas_ocupadas_online(DATE)
--   - public.chamar_atendente_mesa(TEXT, TEXT)
--   - public.registrar_evento_cardapio(TEXT, TEXT, TEXT, DATE)
-- Views:
--   - public.v_painel_retirada (apenas numero_pedido, primeiro_nome, status, pronto_em)
-- ------------------------------------------------------------------------------
