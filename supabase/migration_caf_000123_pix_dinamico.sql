BEGIN;

-- ==============================================================================
-- MIGRATION: CAF-000123 — Pix Dinâmico com Confirmação Automática de Pagamento
-- Implementa: CAF-000123
-- Descrição:
--   1. Configurações de Pix dinâmico e política de exigência no KDS em configuracoes_sistema.
--   2. Tabela public.pix_cobrancas com RLS, índices e inclusão em supabase_realtime.
--   3. Função fn_deve_exigir_pix_kds() e atualização de criar_pedido_totem / criar_pedido_online /
--      consultar_status_pedido_cliente para suportar modo sempre / espetáculo / nunca.
--   4. Ajuste nos triggers fn_calcular_taxa_pedido_balcao e fn_calcular_taxa_fechamento_pagamento
--      para preservar a taxa real retornada pelo PSP (CAF-000113).
--   5. RPCs criar_cobranca_pix, processar_webhook_pix, expirar_cobrancas_pix_vencidas,
--      listar_cobrancas_pix_conferencia e resolver_cobranca_pix_conferencia.
-- ==============================================================================

-- 1. Configurações em public.configuracoes_sistema
INSERT INTO public.configuracoes_sistema (chave, valor, updated_at)
VALUES
  ('pix_dinamico_ativo', 'true'::jsonb, timezone('America/Sao_Paulo', now())),
  ('pix_psp_provedor', '"mercadopago"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('pix_exigir_pagamento_kds', '"sempre"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('pix_expiracao_totem_min', '10'::jsonb, timezone('America/Sao_Paulo', now())),
  ('pix_expiracao_pdv_min', '10'::jsonb, timezone('America/Sao_Paulo', now())),
  ('pix_expiracao_online_min', '30'::jsonb, timezone('America/Sao_Paulo', now()))
ON CONFLICT (chave) DO NOTHING;

-- 2. Tabela public.pix_cobrancas
CREATE TABLE IF NOT EXISTS public.pix_cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL,
  mesa_codigo TEXT,
  parte_nome TEXT,
  canal TEXT NOT NULL DEFAULT 'totem' CHECK (canal IN ('totem', 'online', 'pdv', 'cliente_qr')),
  provedor TEXT NOT NULL DEFAULT 'sandbox' CHECK (provedor IN ('mercadopago', 'asaas', 'sandbox', 'estatico')),
  txid TEXT NOT NULL UNIQUE,
  psp_transacao_id TEXT UNIQUE,
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  valor_pago NUMERIC(10,2),
  taxa_psp_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxa_psp_fixa NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxa_psp_valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_liquido NUMERIC(10,2),
  brcode TEXT NOT NULL,
  qr_code_base64 TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'expirada', 'divergente', 'cancelada')),
  motivo_conferencia TEXT,
  expira_em TIMESTAMPTZ NOT NULL,
  pago_em TIMESTAMPTZ,
  fechamento_id UUID REFERENCES public.fechamentos(id) ON DELETE SET NULL,
  fechamento_payload JSONB,
  webhook_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_pedido_id ON public.pix_cobrancas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_mesa_status ON public.pix_cobrancas (mesa_codigo, status);
CREATE INDEX IF NOT EXISTS idx_pix_cobrancas_status_expira ON public.pix_cobrancas (status, expira_em);

ALTER TABLE public.pix_cobrancas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_cobrancas_select_public" ON public.pix_cobrancas;
CREATE POLICY "pix_cobrancas_select_public" ON public.pix_cobrancas
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "pix_cobrancas_staff_all" ON public.pix_cobrancas;
CREATE POLICY "pix_cobrancas_staff_all" ON public.pix_cobrancas
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'barista') OR public.tem_permissao('pdv.vender'))
  WITH CHECK (public.get_user_role() IN ('admin', 'barista') OR public.tem_permissao('pdv.vender'));

REVOKE INSERT, UPDATE, DELETE ON public.pix_cobrancas FROM anon, public;
GRANT SELECT ON public.pix_cobrancas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pix_cobrancas TO authenticated;

DO $$
BEGIN
  ALTER TABLE public.pix_cobrancas REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pix_cobrancas;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Função auxiliar: avalia se o pedido deve aguardar pagamento antes de ir ao KDS
CREATE OR REPLACE FUNCTION public.fn_deve_exigir_pix_kds()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modo TEXT := 'sempre';
  v_espetaculo TEXT := 'false';
BEGIN
  SELECT LOWER(TRIM(BOTH '"' FROM COALESCE(valor::text, 'sempre')))
  INTO v_modo
  FROM public.configuracoes_sistema
  WHERE chave = 'pix_exigir_pagamento_kds';

  IF v_modo IS NULL OR v_modo = '' THEN
    v_modo := 'sempre';
  END IF;

  IF v_modo IN ('nunca', 'false', 'desligado', 'nao', 'não') THEN
    RETURN false;
  END IF;

  IF v_modo = 'espetaculo' THEN
    SELECT LOWER(TRIM(BOTH '"' FROM COALESCE(valor::text, 'false')))
    INTO v_espetaculo
    FROM public.configuracoes_sistema
    WHERE chave = 'espetaculo_ativo';

    RETURN v_espetaculo = 'true';
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_deve_exigir_pix_kds() TO anon, authenticated, service_role;

-- 4. Preserva taxa real do PSP quando já gravada nos triggers de fechamento/pedido
CREATE OR REPLACE FUNCTION public.fn_calcular_taxa_fechamento_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forma_norm TEXT;
  v_pct NUMERIC(5,2) := 0;
  v_fixa NUMERIC(10,2) := 0;
  v_taxa NUMERIC(10,2) := 0;
BEGIN
  IF COALESCE(NEW.taxa_valor, 0) > 0 OR COALESCE(NEW.taxa_percentual, 0) > 0 OR COALESCE(NEW.taxa_fixa, 0) > 0 THEN
    NEW.valor_liquido := GREATEST(0, ROUND(COALESCE(NEW.valor, 0) - COALESCE(NEW.taxa_valor, 0), 2));
    RETURN NEW;
  END IF;

  v_forma_norm := CASE
    WHEN NEW.forma = 'credito' THEN 'cartao_credito'
    WHEN NEW.forma = 'debito' THEN 'cartao_debito'
    ELSE COALESCE(NEW.forma, 'outros')
  END;

  SELECT COALESCE(taxa_percentual, 0), COALESCE(taxa_fixa, 0)
  INTO v_pct, v_fixa
  FROM public.formas_pagamento_taxas
  WHERE forma = v_forma_norm;

  IF NOT FOUND THEN
    v_pct := 0;
    v_fixa := 0;
  END IF;

  v_taxa := ROUND((COALESCE(NEW.valor, 0) * (v_pct / 100.0)) + v_fixa, 2);
  IF v_taxa > COALESCE(NEW.valor, 0) THEN
    v_taxa := COALESCE(NEW.valor, 0);
  END IF;

  NEW.taxa_percentual := v_pct;
  NEW.taxa_fixa := v_fixa;
  NEW.taxa_valor := v_taxa;
  NEW.valor_liquido := GREATEST(0, ROUND(COALESCE(NEW.valor, 0) - v_taxa, 2));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_calcular_taxa_pedido_balcao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forma_norm TEXT;
  v_pct NUMERIC(5,2) := 0;
  v_fixa NUMERIC(10,2) := 0;
  v_taxa NUMERIC(10,2) := 0;
  v_tem_fechamento BOOLEAN := false;
BEGIN
  IF NEW.status_pagamento = 'pago' AND NEW.forma_pagamento IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.fechamento_pedidos fp WHERE fp.pedido_id = NEW.id
      ) INTO v_tem_fechamento;
    END IF;

    IF v_tem_fechamento THEN
      NEW.valor_liquido := COALESCE(NEW.valor_liquido, NEW.total);
      RETURN NEW;
    END IF;

    -- Preserva taxa exata do PSP quando informada explicitamente pelo webhook Pix
    IF COALESCE(NEW.taxa_pagamento_valor, 0) > 0
       OR COALESCE(NEW.taxa_pagamento_percentual, 0) > 0
       OR COALESCE(NEW.taxa_pagamento_fixa, 0) > 0 THEN
      NEW.valor_liquido := GREATEST(0, ROUND(COALESCE(NEW.total, 0) - COALESCE(NEW.taxa_pagamento_valor, 0), 2));
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT'
       OR OLD.status_pagamento IS DISTINCT FROM 'pago'
       OR (OLD.total = 0 AND NEW.total > 0)
    THEN
      v_forma_norm := CASE
        WHEN NEW.forma_pagamento = 'credito' THEN 'cartao_credito'
        WHEN NEW.forma_pagamento = 'debito' THEN 'cartao_debito'
        ELSE COALESCE(NEW.forma_pagamento, 'outros')
      END;

      SELECT COALESCE(taxa_percentual, 0), COALESCE(taxa_fixa, 0)
      INTO v_pct, v_fixa
      FROM public.formas_pagamento_taxas
      WHERE forma = v_forma_norm;

      IF NOT FOUND THEN
        v_pct := 0;
        v_fixa := 0;
      END IF;

      v_taxa := ROUND((COALESCE(NEW.total, 0) * (v_pct / 100.0)) + v_fixa, 2);
      IF v_taxa > COALESCE(NEW.total, 0) THEN
        v_taxa := COALESCE(NEW.total, 0);
      END IF;

      NEW.taxa_pagamento_percentual := v_pct;
      NEW.taxa_pagamento_fixa := v_fixa;
      NEW.taxa_pagamento_valor := v_taxa;
      NEW.valor_liquido := GREATEST(0, ROUND(COALESCE(NEW.total, 0) - v_taxa, 2));
    END IF;
  ELSE
    NEW.valor_liquido := COALESCE(NEW.total, 0);
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Atualizar criar_pedido_totem para respeitar fn_deve_exigir_pix_kds() (CA07)
CREATE OR REPLACE FUNCTION public.criar_pedido_totem(
  p_token TEXT,
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash TEXT;
  v_totem RECORD;
  v_pedido_id BIGINT;
  v_numero_pedido INT;
  v_pedido_token UUID;
  v_total NUMERIC(10,2) := 0;
  v_cliente_nome TEXT;
  v_para_viagem BOOLEAN := false;
  v_forma_pagamento TEXT := 'pix';
  v_observacoes TEXT;
  v_status_inicial TEXT := 'aguardando_pagamento';
  v_exigir_pagamento BOOLEAN := true;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_adicional_permitido BOOLEAN;
  v_itens_count INT := 0;
  v_client_id UUID;
  v_status_retorno TEXT;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'TOTEM_REVOGADO: Totem não autenticado.';
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_totem
  FROM public.totens
  WHERE token_hash = v_token_hash
  LIMIT 1;

  IF NOT FOUND OR v_totem.ativo IS FALSE THEN
    RAISE EXCEPTION 'TOTEM_REVOGADO: Este totem foi desativado pelo administrador.';
  END IF;

  UPDATE public.totens
  SET ultimo_acesso = now()
  WHERE id = v_totem.id;

  PERFORM public.expirar_pedidos_totem_vencidos();

  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    BEGIN
      v_client_id := p_idempotency_key::UUID;
      SELECT id, numero_pedido, pedido_token, status, total
      INTO v_pedido_id, v_numero_pedido, v_pedido_token, v_status_retorno, v_total
      FROM public.pedidos
      WHERE client_id = v_client_id;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'sucesso', true,
          'pedido_id', v_pedido_id,
          'numero_pedido', v_numero_pedido,
          'pedido_token', v_pedido_token,
          'status', v_status_retorno,
          'total', v_total,
          'idempotente', true
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_client_id := NULL;
    END;
  END IF;

  v_cliente_nome := TRIM(COALESCE(p_payload->>'cliente_nome', ''));
  IF length(v_cliente_nome) < 2 THEN
    RAISE EXCEPTION 'Por favor, informe seu primeiro nome para chamada no painel.';
  END IF;

  v_para_viagem := COALESCE((p_payload->>'para_viagem')::boolean, false);
  v_forma_pagamento := LOWER(TRIM(COALESCE(p_payload->>'forma_pagamento', 'pix')));
  IF v_forma_pagamento NOT IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outros') THEN
    v_forma_pagamento := 'pix';
  END IF;

  v_exigir_pagamento := public.fn_deve_exigir_pix_kds();
  IF v_exigir_pagamento THEN
    v_status_inicial := 'aguardando_pagamento';
  ELSE
    v_status_inicial := 'pendente';
  END IF;

  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos 1 item ao pedido.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 25 THEN
    RAISE EXCEPTION 'Máximo de 25 itens por pedido no totem.';
  END IF;

  v_observacoes := TRIM(COALESCE(p_payload->>'observacoes', ''));
  v_pedido_token := gen_random_uuid();

  INSERT INTO public.pedidos (
    mesa_codigo,
    status,
    status_pagamento,
    forma_pagamento,
    observacoes,
    total,
    cliente_nome,
    para_viagem,
    origem,
    pedido_token,
    client_id,
    criado_por_nome
  ) VALUES (
    'BALCÃO',
    v_status_inicial,
    'pendente',
    v_forma_pagamento,
    v_observacoes,
    0,
    v_cliente_nome,
    v_para_viagem,
    'totem',
    v_pedido_token,
    v_client_id,
    v_totem.nome
  ) RETURNING id, numero_pedido INTO v_pedido_id, v_numero_pedido;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id'
      AND p.ativo = true
      AND p.disponivel = true
      AND COALESCE(p.apenas_encomenda, false) = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto indisponível no momento: %', v_item->>'produto_id';
    END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      IF jsonb_typeof(v_item->'sabores') != 'array' THEN
        RAISE EXCEPTION 'Produto meio a meio requer seleção de sabores';
      END IF;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record
        FROM public.produtos
        WHERE id = v_sabor->>'produto_id' AND ativo = true AND disponivel = true;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Sabor esgotado: %', v_sabor->>'produto_id';
        END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT EXISTS (
          SELECT 1 FROM public.produto_adicionais_permitidos
          WHERE produto_id = v_produto_record.id AND adicional_id = v_adicional::text
        ) INTO v_adicional_permitido;

        IF (SELECT COUNT(*) FROM public.produto_adicionais_permitidos WHERE produto_id = v_produto_record.id) > 0 AND NOT v_adicional_permitido THEN
          RAISE EXCEPTION 'Adicional % não permitido para %', v_adicional::text, v_produto_record.nome;
        END IF;

        SELECT preco INTO v_adicional_record
        FROM public.adicionais
        WHERE id = v_adicional::text AND ativo = true;

        IF FOUND THEN
          v_preco_unitario := v_preco_unitario + v_adicional_record.preco;
        END IF;
      END LOOP;
    END IF;

    v_itens_count := GREATEST(1, LEAST(20, COALESCE((v_item->>'quantidade')::int, 1)));

    INSERT INTO public.pedido_itens (
      pedido_id,
      produto_id,
      nome_produto,
      quantidade,
      preco_base,
      preco_unitario,
      observacoes,
      estacao
    ) VALUES (
      v_pedido_id,
      v_produto_record.id,
      v_produto_record.nome,
      v_itens_count,
      v_preco_base,
      v_preco_unitario,
      v_item->>'observacoes',
      v_produto_record.estacao
    ) RETURNING id INTO v_pedido_item_id;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id';
        INSERT INTO public.pedido_item_sabores (pedido_item_id, lado, produto_id, nome, preco)
        VALUES (v_pedido_item_id, v_sabor->>'lado', v_sabor_record.id, v_sabor_record.nome, ROUND(v_sabor_record.preco * 0.5, 2));
      END LOOP;
    END IF;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text;
        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (pedido_item_id, adicional_id, nome, preco)
          VALUES (v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - COALESCE(desconto, 0)), 0)
  INTO v_total
  FROM public.pedido_itens
  WHERE pedido_id = v_pedido_id;

  UPDATE public.pedidos
  SET total = v_total
  WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', v_pedido_id,
    'numero_pedido', v_numero_pedido,
    'pedido_token', v_pedido_token,
    'mesa_codigo', 'BALCÃO',
    'status', v_status_inicial,
    'forma_pagamento', v_forma_pagamento,
    'total', v_total,
    'exigir_pagamento', v_exigir_pagamento
  );
END;
$$;

-- 6. Atualizar criar_pedido_online e consultar_status_pedido_cliente para Pix dinâmico online
CREATE OR REPLACE FUNCTION public.criar_pedido_online(
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_ativo BOOLEAN := true;
  v_tempo_estimado INT := 15;
  v_limite_janela INT := 5;
  v_pedido_id BIGINT;
  v_numero_pedido INT;
  v_pedido_token UUID;
  v_total NUMERIC(10,2) := 0;
  v_cliente_nome TEXT;
  v_cliente_telefone_raw TEXT;
  v_cliente_telefone_digits TEXT;
  v_cliente_id UUID;
  v_aceita_lgpd BOOLEAN;
  v_observacoes TEXT;
  v_modo_retirada TEXT;
  v_forma_pagamento TEXT;
  v_status_inicial TEXT := 'aguardando_aprovacao';
  v_exigir_pix BOOLEAN := false;
  v_retirada_em TIMESTAMPTZ;
  v_agora TIMESTAMPTZ := now();
  v_max_antecedencia_horas INT := 0;
  v_ocupacao_janela INT := 0;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_adicional_permitido BOOLEAN;
  v_itens_count INT := 0;
  v_ultimo_pedido_em TIMESTAMPTZ;
  v_client_id UUID;
  v_status_retorno TEXT;
BEGIN
  SELECT COALESCE((valor)::text::boolean, true)
  INTO v_config_ativo
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_ativo';

  IF v_config_ativo IS FALSE THEN
    RAISE EXCEPTION 'Os pedidos online para retirada estão temporariamente pausados.';
  END IF;

  SELECT COALESCE((valor)::text::int, 15)
  INTO v_tempo_estimado
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_tempo_estimado_min';

  SELECT COALESCE((valor)::text::int, 5)
  INTO v_limite_janela
  FROM public.configuracoes_sistema
  WHERE chave = 'pedido_online_limite_janela';

  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    BEGIN
      v_client_id := p_idempotency_key::UUID;
      SELECT id, numero_pedido, pedido_token, status, total, retirada_em
      INTO v_pedido_id, v_numero_pedido, v_pedido_token, v_status_retorno, v_total, v_retirada_em
      FROM public.pedidos
      WHERE client_id = v_client_id;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'sucesso', true,
          'pedido_id', v_pedido_id,
          'numero_pedido', v_numero_pedido,
          'pedido_token', v_pedido_token,
          'status', v_status_retorno,
          'total', v_total,
          'retirada_em', v_retirada_em,
          'idempotente', true
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_client_id := NULL;
    END;
  END IF;

  v_cliente_nome := TRIM(COALESCE(p_payload->>'cliente_nome', ''));
  IF length(v_cliente_nome) < 2 THEN
    RAISE EXCEPTION 'Por favor, informe seu nome completo para retirada.';
  END IF;

  v_cliente_telefone_raw := TRIM(COALESCE(p_payload->>'cliente_telefone', ''));
  v_cliente_telefone_digits := regexp_replace(v_cliente_telefone_raw, '\D', '', 'g');
  IF length(v_cliente_telefone_digits) IN (10, 11) THEN
    v_cliente_telefone_digits := '55' || v_cliente_telefone_digits;
  END IF;

  IF length(v_cliente_telefone_digits) NOT IN (12, 13) THEN
    RAISE EXCEPTION 'Informe um número de WhatsApp válido com DDD (ex: 51 99999-9999).';
  END IF;

  v_aceita_lgpd := COALESCE((p_payload->>'aceita_lgpd')::boolean, true);

  SELECT MAX(created_at) INTO v_ultimo_pedido_em
  FROM public.pedidos
  WHERE cliente_telefone = v_cliente_telefone_digits AND origem IN ('online', 'online_retirada');

  IF v_ultimo_pedido_em IS NOT NULL AND (v_agora - v_ultimo_pedido_em) < INTERVAL '30 seconds' THEN
    RAISE EXCEPTION 'Aguarde alguns segundos antes de enviar outro pedido.';
  END IF;

  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE telefone = v_cliente_telefone_digits
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (nome, telefone, aceita_contato, ativo)
    VALUES (v_cliente_nome, v_cliente_telefone_digits, v_aceita_lgpd, true)
    ON CONFLICT (telefone) DO UPDATE
      SET nome = EXCLUDED.nome,
          aceita_contato = COALESCE(EXCLUDED.aceita_contato, public.clientes.aceita_contato),
          updated_at = now()
    RETURNING id INTO v_cliente_id;
  ELSE
    UPDATE public.clientes
    SET nome = COALESCE(NULLIF(v_cliente_nome, ''), nome),
        aceita_contato = v_aceita_lgpd OR aceita_contato,
        updated_at = now()
    WHERE id = v_cliente_id;
  END IF;

  IF p_payload->'itens' IS NULL OR jsonb_array_length(p_payload->'itens') = 0 THEN
    RAISE EXCEPTION 'O pedido não contém nenhum item.';
  END IF;

  IF jsonb_array_length(p_payload->'itens') > 20 THEN
    RAISE EXCEPTION 'Máximo de 20 itens por pedido online.';
  END IF;

  v_modo_retirada := COALESCE(p_payload->>'modo_retirada', 'imediato');
  v_forma_pagamento := NULLIF(LOWER(TRIM(COALESCE(p_payload->>'forma_pagamento', ''))), '');

  v_exigir_pix := (v_forma_pagamento = 'pix' OR COALESCE((p_payload->>'exigir_pagamento_pix')::boolean, false))
                  AND public.fn_deve_exigir_pix_kds();
  IF v_exigir_pix THEN
    v_status_inicial := 'aguardando_pagamento';
  ELSE
    v_status_inicial := 'aguardando_aprovacao';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT id, nome, COALESCE(antecedencia_min_horas, 0) AS antecedencia_min_horas, COALESCE(apenas_encomenda, false) AS apenas_encomenda
    INTO v_produto_record
    FROM public.produtos
    WHERE id = v_item->>'produto_id' AND ativo = true AND disponivel = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou indisponível: %', v_item->>'produto_id';
    END IF;

    IF v_produto_record.apenas_encomenda AND v_modo_retirada = 'imediato' THEN
      RAISE EXCEPTION 'O item "%" está disponível apenas sob encomenda agendada.', v_produto_record.nome;
    END IF;

    IF v_produto_record.antecedencia_min_horas > v_max_antecedencia_horas THEN
      v_max_antecedencia_horas := v_produto_record.antecedencia_min_horas;
    END IF;
  END LOOP;

  IF v_modo_retirada = 'agendado' THEN
    BEGIN
      v_retirada_em := (p_payload->>'retirada_em')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Data/hora de agendamento inválida.';
    END;

    IF v_retirada_em IS NULL THEN
      RAISE EXCEPTION 'Informe a data e o horário para retirada do pedido agendado.';
    END IF;

    IF v_max_antecedencia_horas > 0 AND v_retirada_em < (v_agora + (v_max_antecedencia_horas || ' hours')::interval - INTERVAL '5 minutes') THEN
      RAISE EXCEPTION 'Este pedido contém itens que exigem antecedência mínima de % hora(s).', v_max_antecedencia_horas;
    END IF;

    IF v_retirada_em < (v_agora + INTERVAL '10 minutes') THEN
      RAISE EXCEPTION 'O horário agendado deve ser no futuro.';
    END IF;
  ELSE
    IF v_max_antecedencia_horas > 0 THEN
      RAISE EXCEPTION 'Seu pedido possui itens sob encomenda que exigem no mínimo % hora(s) de antecedência. Escolha um horário agendado.', v_max_antecedencia_horas;
    END IF;
    v_retirada_em := v_agora + (v_tempo_estimado || ' minutes')::interval;
  END IF;

  SELECT COUNT(*)::int INTO v_ocupacao_janela
  FROM public.pedidos
  WHERE retirada_em IS NOT NULL
    AND status <> 'cancelado'
    AND date_trunc('hour', retirada_em AT TIME ZONE 'America/Sao_Paulo') +
        INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM (retirada_em AT TIME ZONE 'America/Sao_Paulo')) / 15.0)
      = date_trunc('hour', v_retirada_em AT TIME ZONE 'America/Sao_Paulo') +
        INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM (v_retirada_em AT TIME ZONE 'America/Sao_Paulo')) / 15.0);

  IF v_ocupacao_janela >= v_limite_janela THEN
    RAISE EXCEPTION 'A janela de horário escolhida atingiu o limite máximo de pedidos (%). Por favor, selecione outro horário.', v_limite_janela;
  END IF;

  v_observacoes := TRIM(COALESCE(p_payload->>'observacoes', ''));
  v_pedido_token := gen_random_uuid();

  INSERT INTO public.pedidos (
    mesa_codigo,
    status,
    status_pagamento,
    forma_pagamento,
    observacoes,
    total,
    cliente_id,
    cliente_nome,
    cliente_telefone,
    para_viagem,
    retirada_em,
    origem,
    pedido_token,
    client_id
  ) VALUES (
    'RETIRADA',
    v_status_inicial,
    'pendente',
    v_forma_pagamento,
    v_observacoes,
    0,
    v_cliente_id,
    v_cliente_nome,
    v_cliente_telefone_digits,
    true,
    v_retirada_em,
    'online',
    v_pedido_token,
    v_client_id
  ) RETURNING id, numero_pedido INTO v_pedido_id, v_numero_pedido;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      IF jsonb_typeof(v_item->'sabores') != 'array' THEN
        RAISE EXCEPTION 'Produto meio a meio requer seleção de sabores';
      END IF;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record
        FROM public.produtos
        WHERE id = v_sabor->>'produto_id' AND ativo = true AND disponivel = true;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Sabor não encontrado ou esgotado: %', v_sabor->>'produto_id';
        END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT EXISTS (
          SELECT 1 FROM public.produto_adicionais_permitidos
          WHERE produto_id = v_produto_record.id AND adicional_id = v_adicional::text
        ) INTO v_adicional_permitido;

        IF (SELECT COUNT(*) FROM public.produto_adicionais_permitidos WHERE produto_id = v_produto_record.id) > 0 AND NOT v_adicional_permitido THEN
          RAISE EXCEPTION 'Adicional % não permitido para o produto %', v_adicional::text, v_produto_record.nome;
        END IF;

        SELECT preco INTO v_adicional_record
        FROM public.adicionais
        WHERE id = v_adicional::text AND ativo = true;

        IF FOUND THEN
          v_preco_unitario := v_preco_unitario + v_adicional_record.preco;
        END IF;
      END LOOP;
    END IF;

    v_itens_count := GREATEST(1, LEAST(20, COALESCE((v_item->>'quantidade')::int, 1)));

    INSERT INTO public.pedido_itens (
      pedido_id,
      produto_id,
      nome_produto,
      quantidade,
      preco_base,
      preco_unitario,
      observacoes,
      estacao
    ) VALUES (
      v_pedido_id,
      v_produto_record.id,
      v_produto_record.nome,
      v_itens_count,
      v_preco_base,
      v_preco_unitario,
      v_item->>'observacoes',
      v_produto_record.estacao
    ) RETURNING id INTO v_pedido_item_id;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id';
        INSERT INTO public.pedido_item_sabores (pedido_item_id, lado, produto_id, nome, preco)
        VALUES (v_pedido_item_id, v_sabor->>'lado', v_sabor_record.id, v_sabor_record.nome, ROUND(v_sabor_record.preco * 0.5, 2));
      END LOOP;
    END IF;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT id, nome, preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text;
        IF FOUND THEN
          INSERT INTO public.pedido_item_adicionais (pedido_item_id, adicional_id, nome, preco)
          VALUES (v_pedido_item_id, v_adicional_record.id, v_adicional_record.nome, v_adicional_record.preco);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - COALESCE(desconto, 0)), 0)
  INTO v_total
  FROM public.pedido_itens
  WHERE pedido_id = v_pedido_id;

  UPDATE public.pedidos
  SET total = v_total
  WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedido_id', v_pedido_id,
    'numero_pedido', v_numero_pedido,
    'pedido_token', v_pedido_token,
    'mesa_codigo', 'RETIRADA',
    'status', v_status_inicial,
    'status_pagamento', 'pendente',
    'forma_pagamento', v_forma_pagamento,
    'retirada_em', v_retirada_em,
    'total', v_total,
    'exigir_pagamento', v_exigir_pix
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_status_pedido_cliente(p_pedido_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_itens JSONB;
BEGIN
  IF p_pedido_token IS NULL THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  SELECT
    p.id,
    p.numero_pedido,
    p.mesa_codigo,
    p.status,
    p.status_pagamento,
    p.forma_pagamento,
    p.total,
    p.origem,
    p.para_viagem,
    p.retirada_em,
    p.created_at,
    p.updated_at,
    p.motivo_cancelamento,
    p.cliente_nome
  INTO v_pedido
  FROM public.pedidos p
  WHERE p.pedido_token = p_pedido_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
      'produto_id', pi.produto_id,
      'nome', pi.nome_produto,
      'quantidade', pi.quantidade,
      'preco_unitario', pi.preco_unitario,
      'cancelado', pi.cancelado
    )
  ) INTO v_itens
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = v_pedido.id;

  RETURN jsonb_build_object(
    'encontrado', true,
    'id', v_pedido.id,
    'numero_pedido', v_pedido.numero_pedido,
    'mesa_codigo', v_pedido.mesa_codigo,
    'status', v_pedido.status,
    'status_pagamento', v_pedido.status_pagamento,
    'forma_pagamento', v_pedido.forma_pagamento,
    'origem', v_pedido.origem,
    'para_viagem', v_pedido.para_viagem,
    'retirada_em', v_pedido.retirada_em,
    'total', v_pedido.total,
    'created_at', v_pedido.created_at,
    'motivo_cancelamento', v_pedido.motivo_cancelamento,
    'cliente_nome', v_pedido.cliente_nome,
    'itens', COALESCE(v_itens, '[]'::jsonb)
  );
END;
$$;

-- 7. RPC: criar_cobranca_pix
CREATE OR REPLACE FUNCTION public.criar_cobranca_pix(
  p_pedido_id BIGINT DEFAULT NULL,
  p_mesa_codigo TEXT DEFAULT NULL,
  p_valor NUMERIC DEFAULT NULL,
  p_canal TEXT DEFAULT 'totem',
  p_txid TEXT DEFAULT NULL,
  p_brcode TEXT DEFAULT NULL,
  p_provedor TEXT DEFAULT 'sandbox',
  p_expiracao_min INT DEFAULT NULL,
  p_parte_nome TEXT DEFAULT NULL,
  p_fechamento_payload JSONB DEFAULT NULL,
  p_psp_transacao_id TEXT DEFAULT NULL,
  p_qr_code_base64 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canal TEXT;
  v_provedor TEXT;
  v_valor NUMERIC(10,2);
  v_expiracao_min INT;
  v_expira_em TIMESTAMPTZ;
  v_txid TEXT;
  v_brcode TEXT;
  v_cobranca_id UUID;
BEGIN
  v_canal := LOWER(TRIM(COALESCE(p_canal, 'totem')));
  IF v_canal NOT IN ('totem', 'online', 'pdv', 'cliente_qr') THEN
    v_canal := 'totem';
  END IF;

  v_provedor := LOWER(TRIM(COALESCE(p_provedor, 'sandbox')));
  IF v_provedor NOT IN ('mercadopago', 'asaas', 'sandbox', 'estatico') THEN
    v_provedor := 'sandbox';
  END IF;

  -- Expirar pendentes vencidas antes de gerar nova cobrança
  UPDATE public.pix_cobrancas
  SET status = 'expirada',
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE status = 'pendente'
    AND expira_em <= now();

  -- Resolver valor
  v_valor := ROUND(COALESCE(p_valor, 0), 2);
  IF v_valor <= 0 AND p_pedido_id IS NOT NULL THEN
    SELECT COALESCE(total, 0) INTO v_valor
    FROM public.pedidos
    WHERE id = p_pedido_id;
  END IF;

  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'Valor da cobrança Pix deve ser maior que zero.';
  END IF;

  -- Cancelar cobranças anteriores ainda pendentes para o mesmo pedido ou mesa/parte (CA09)
  IF p_pedido_id IS NOT NULL THEN
    UPDATE public.pix_cobrancas
    SET status = 'cancelada',
        motivo_conferencia = COALESCE(motivo_conferencia, 'Substituída por nova cobrança Pix'),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE pedido_id = p_pedido_id
      AND status = 'pendente';
  ELSIF p_mesa_codigo IS NOT NULL AND v_canal = 'pdv' THEN
    UPDATE public.pix_cobrancas
    SET status = 'cancelada',
        motivo_conferencia = COALESCE(motivo_conferencia, 'Substituída por nova cobrança Pix na mesa'),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE mesa_codigo = p_mesa_codigo
      AND canal = 'pdv'
      AND COALESCE(parte_nome, '') = COALESCE(p_parte_nome, '')
      AND status = 'pendente';
  END IF;

  -- Resolver validade configurada por canal
  IF p_expiracao_min IS NOT NULL AND p_expiracao_min > 0 THEN
    v_expiracao_min := p_expiracao_min;
  ELSIF v_canal = 'online' THEN
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9]', '', 'g'), '')::int, 30)
    INTO v_expiracao_min
    FROM public.configuracoes_sistema
    WHERE chave = 'pix_expiracao_online_min';
    v_expiracao_min := COALESCE(v_expiracao_min, 30);
  ELSIF v_canal = 'pdv' THEN
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9]', '', 'g'), '')::int, 10)
    INTO v_expiracao_min
    FROM public.configuracoes_sistema
    WHERE chave = 'pix_expiracao_pdv_min';
    v_expiracao_min := COALESCE(v_expiracao_min, 10);
  ELSE
    SELECT COALESCE(NULLIF(regexp_replace(valor::text, '[^0-9]', '', 'g'), '')::int, 10)
    INTO v_expiracao_min
    FROM public.configuracoes_sistema
    WHERE chave = 'pix_expiracao_totem_min';
    v_expiracao_min := COALESCE(v_expiracao_min, 10);
  END IF;

  v_expiracao_min := GREATEST(1, LEAST(1440, v_expiracao_min));
  v_expira_em := now() + (v_expiracao_min || ' minutes')::interval;

  v_txid := regexp_replace(UPPER(TRIM(COALESCE(p_txid, ''))), '[^A-Z0-9]', '', 'g');
  IF v_txid = '' THEN
    v_txid := 'PIX' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 20));
  END IF;
  v_txid := LEFT(v_txid, 25);

  v_brcode := COALESCE(NULLIF(TRIM(p_brcode), ''), 'PIX:' || v_txid);

  INSERT INTO public.pix_cobrancas (
    pedido_id,
    mesa_codigo,
    parte_nome,
    canal,
    provedor,
    txid,
    psp_transacao_id,
    valor,
    brcode,
    qr_code_base64,
    status,
    expira_em,
    fechamento_payload
  ) VALUES (
    p_pedido_id,
    p_mesa_codigo,
    p_parte_nome,
    v_canal,
    v_provedor,
    v_txid,
    NULLIF(TRIM(COALESCE(p_psp_transacao_id, '')), ''),
    v_valor,
    v_brcode,
    p_qr_code_base64,
    'pendente',
    v_expira_em,
    p_fechamento_payload
  ) RETURNING id INTO v_cobranca_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'cobranca_id', v_cobranca_id,
    'pedido_id', p_pedido_id,
    'mesa_codigo', p_mesa_codigo,
    'canal', v_canal,
    'provedor', v_provedor,
    'txid', v_txid,
    'valor', v_valor,
    'status', 'pendente',
    'expira_em', v_expira_em,
    'expiracao_min', v_expiracao_min,
    'brcode', v_brcode,
    'qr_code_base64', p_qr_code_base64
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_cobranca_pix(BIGINT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, INT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;

-- 8. RPC: processar_webhook_pix (idempotente por txid/psp_transacao_id, valida valor/expiração, quita pedido/mesa e registra taxa PSP)
CREATE OR REPLACE FUNCTION public.processar_webhook_pix(
  p_txid TEXT,
  p_psp_transacao_id TEXT DEFAULT NULL,
  p_valor_pago NUMERIC DEFAULT NULL,
  p_taxa_psp NUMERIC DEFAULT NULL,
  p_provedor TEXT DEFAULT 'mercadopago',
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txid TEXT := UPPER(TRIM(COALESCE(p_txid, '')));
  v_psp_id TEXT := NULLIF(TRIM(COALESCE(p_psp_transacao_id, '')), '');
  v_cobranca RECORD;
  v_existing_tx RECORD;
  v_taxa_pct NUMERIC(5,2) := 0;
  v_taxa_fixa NUMERIC(10,2) := 0;
  v_taxa_valor NUMERIC(10,2) := 0;
  v_valor_liquido NUMERIC(10,2) := 0;
  v_pago_em TIMESTAMPTZ := timezone('America/Sao_Paulo', now());
  v_fechamento_res JSONB := NULL;
  v_fechamento_id UUID := NULL;
  v_pagamentos_fech JSONB := NULL;
  v_qtd_pedidos_abertos INT := 0;
  v_valor_pago_num NUMERIC(10,2);
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.get_user_role() NOT IN ('admin', 'barista')
     AND NOT public.tem_permissao('pdv.vender') THEN
    RAISE EXCEPTION 'Acesso negado ao processamento de webhook Pix.';
  END IF;

  -- Idempotência pelo psp_transacao_id se já tiver quitado alguma cobrança (CA04)
  IF v_psp_id IS NOT NULL THEN
    SELECT id, pedido_id, fechamento_id, status, txid
    INTO v_existing_tx
    FROM public.pix_cobrancas
    WHERE psp_transacao_id = v_psp_id
      AND status = 'pago'
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'sucesso', true,
        'idempotente', true,
        'status', 'pago',
        'cobranca_id', v_existing_tx.id,
        'pedido_id', v_existing_tx.pedido_id,
        'fechamento_id', v_existing_tx.fechamento_id,
        'txid', v_existing_tx.txid
      );
    END IF;
  END IF;

  SELECT * INTO v_cobranca
  FROM public.pix_cobrancas
  WHERE txid = v_txid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'status', 'nao_encontrada',
      'motivo', 'COBRANCA_NAO_ENCONTRADA',
      'txid', v_txid
    );
  END IF;

  -- Idempotência pela própria cobrança já paga (CA04)
  IF v_cobranca.status = 'pago' THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'idempotente', true,
      'status', 'pago',
      'cobranca_id', v_cobranca.id,
      'pedido_id', v_cobranca.pedido_id,
      'fechamento_id', v_cobranca.fechamento_id,
      'txid', v_cobranca.txid
    );
  END IF;

  v_valor_pago_num := ROUND(COALESCE(p_valor_pago, 0), 2);

  -- Cobrança expirada ou cancelada não pode quitar o pedido (CA09 / RF07)
  IF v_cobranca.status IN ('expirada', 'cancelada') OR v_cobranca.expira_em <= now() THEN
    UPDATE public.pix_cobrancas
    SET status = 'divergente',
        valor_pago = v_valor_pago_num,
        psp_transacao_id = COALESCE(NULLIF(v_psp_id, ''), psp_transacao_id),
        motivo_conferencia = 'Pagamento recebido após expiração ou substituição da cobrança.',
        webhook_payload = COALESCE(p_payload, '{}'::jsonb),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE id = v_cobranca.id;

    RETURN jsonb_build_object(
      'sucesso', false,
      'status', 'divergente',
      'motivo', 'COBRANCA_EXPIRADA',
      'cobranca_id', v_cobranca.id,
      'pedido_id', v_cobranca.pedido_id
    );
  END IF;

  -- Divergência de valor não quita o pedido e marca para conferência no Admin (CA05 / RF07)
  IF ABS(v_valor_pago_num - v_cobranca.valor) > 0.009 THEN
    UPDATE public.pix_cobrancas
    SET status = 'divergente',
        valor_pago = v_valor_pago_num,
        psp_transacao_id = COALESCE(NULLIF(v_psp_id, ''), psp_transacao_id),
        motivo_conferencia = format('Valor pago (R$ %s) diverge do cobrado (R$ %s).', v_valor_pago_num, v_cobranca.valor),
        webhook_payload = COALESCE(p_payload, '{}'::jsonb),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE id = v_cobranca.id;

    RETURN jsonb_build_object(
      'sucesso', false,
      'status', 'divergente',
      'motivo', 'VALOR_DIVERGENTE',
      'cobranca_id', v_cobranca.id,
      'pedido_id', v_cobranca.pedido_id,
      'valor_esperado', v_cobranca.valor,
      'valor_pago', v_valor_pago_num
    );
  END IF;

  -- Calcula taxa PSP real ou herda taxa configurada em formas_pagamento_taxas (CA10)
  IF p_taxa_psp IS NOT NULL AND p_taxa_psp >= 0 THEN
    v_taxa_valor := LEAST(v_valor_pago_num, ROUND(p_taxa_psp, 2));
    IF v_valor_pago_num > 0 THEN
      v_taxa_pct := ROUND((v_taxa_valor / v_valor_pago_num) * 100.0, 2);
    END IF;
    v_taxa_fixa := 0;
  ELSE
    SELECT COALESCE(taxa_percentual, 0), COALESCE(taxa_fixa, 0)
    INTO v_taxa_pct, v_taxa_fixa
    FROM public.formas_pagamento_taxas
    WHERE forma = 'pix';

    v_taxa_valor := LEAST(v_valor_pago_num, ROUND((v_valor_pago_num * (COALESCE(v_taxa_pct, 0) / 100.0)) + COALESCE(v_taxa_fixa, 0), 2));
  END IF;

  v_valor_liquido := GREATEST(0, ROUND(v_valor_pago_num - v_taxa_valor, 2));

  UPDATE public.pix_cobrancas
  SET status = 'pago',
      valor_pago = v_valor_pago_num,
      taxa_psp_percentual = COALESCE(v_taxa_pct, 0),
      taxa_psp_fixa = COALESCE(v_taxa_fixa, 0),
      taxa_psp_valor = v_taxa_valor,
      valor_liquido = v_valor_liquido,
      psp_transacao_id = COALESCE(NULLIF(v_psp_id, ''), psp_transacao_id),
      provedor = COALESCE(NULLIF(LOWER(TRIM(p_provedor)), ''), provedor),
      pago_em = v_pago_em,
      webhook_payload = COALESCE(p_payload, '{}'::jsonb),
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = v_cobranca.id;

  -- Caso 1: Pedido direto (Totem / Online / QR Cliente)
  IF v_cobranca.pedido_id IS NOT NULL THEN
    UPDATE public.pedidos
    SET status = CASE
          WHEN status IN ('aguardando_pagamento', 'aguardando_aprovacao') THEN 'pendente'
          ELSE status
        END,
        status_pagamento = 'pago',
        forma_pagamento = 'pix',
        pago_em = COALESCE(pago_em, v_pago_em),
        taxa_pagamento_percentual = COALESCE(v_taxa_pct, 0),
        taxa_pagamento_fixa = COALESCE(v_taxa_fixa, 0),
        taxa_pagamento_valor = v_taxa_valor,
        valor_liquido = v_valor_liquido,
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE id = v_cobranca.pedido_id
      AND status <> 'cancelado';
  END IF;

  -- Caso 2: Fechamento de conta de mesa no PDV (CA08)
  IF v_cobranca.canal = 'pdv'
     AND v_cobranca.mesa_codigo IS NOT NULL
     AND COALESCE((v_cobranca.fechamento_payload->>'auto_fechar')::boolean, true) THEN
    SELECT COUNT(*)::int INTO v_qtd_pedidos_abertos
    FROM public.pedidos
    WHERE mesa_codigo = v_cobranca.mesa_codigo
      AND status <> 'cancelado'
      AND (status_pagamento IS NULL OR status_pagamento <> 'pago');

    IF v_qtd_pedidos_abertos > 0 THEN
      IF jsonb_typeof(v_cobranca.fechamento_payload->'pagamentos') = 'array'
         AND jsonb_array_length(v_cobranca.fechamento_payload->'pagamentos') > 0 THEN
        v_pagamentos_fech := v_cobranca.fechamento_payload->'pagamentos';
      ELSE
        v_pagamentos_fech := jsonb_build_array(
          jsonb_build_object('forma', 'pix', 'valor', v_cobranca.valor)
        );
      END IF;

      v_fechamento_res := public.fechar_conta_mesa(
        p_mesa_codigo := v_cobranca.mesa_codigo,
        p_pagamentos := v_pagamentos_fech,
        p_taxa_servico := COALESCE((v_cobranca.fechamento_payload->>'taxa_servico')::numeric, 0),
        p_desconto_manual := COALESCE((v_cobranca.fechamento_payload->>'desconto_manual')::numeric, 0),
        p_desconto_motivo := NULLIF(v_cobranca.fechamento_payload->>'desconto_motivo', ''),
        p_idempotency_key := COALESCE(NULLIF(v_cobranca.fechamento_payload->>'idempotency_key', ''), 'PIX-' || v_cobranca.txid),
        p_cupom_codigo := NULLIF(v_cobranca.fechamento_payload->>'cupom_codigo', ''),
        p_campanha_id := NULLIF(v_cobranca.fechamento_payload->>'campanha_id', '')::bigint
      );

      v_fechamento_id := NULLIF(v_fechamento_res->>'fechamento_id', '')::uuid;

      IF v_fechamento_id IS NOT NULL THEN
        IF v_taxa_valor > 0 THEN
          UPDATE public.fechamento_pagamentos
          SET taxa_percentual = COALESCE(v_taxa_pct, 0),
              taxa_fixa = COALESCE(v_taxa_fixa, 0),
              taxa_valor = v_taxa_valor,
              valor_liquido = GREATEST(0, ROUND(valor - v_taxa_valor, 2))
          WHERE fechamento_id = v_fechamento_id
            AND forma = 'pix';
        END IF;

        UPDATE public.pix_cobrancas
        SET fechamento_id = v_fechamento_id,
            updated_at = timezone('America/Sao_Paulo', now())
        WHERE id = v_cobranca.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'idempotente', false,
    'status', 'pago',
    'cobranca_id', v_cobranca.id,
    'pedido_id', v_cobranca.pedido_id,
    'fechamento_id', v_fechamento_id,
    'txid', v_cobranca.txid,
    'valor', v_valor_pago_num,
    'taxa_psp', v_taxa_valor,
    'valor_liquido', v_valor_liquido
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.processar_webhook_pix(TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.processar_webhook_pix(TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated, service_role;

-- 9. RPCs de manutenção e conferência no Admin (RF07 / CA09)
CREATE OR REPLACE FUNCTION public.expirar_cobrancas_pix_vencidas()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH atualizadas AS (
    UPDATE public.pix_cobrancas
    SET status = 'expirada',
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE status = 'pendente'
      AND expira_em <= now()
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_count FROM atualizadas;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expirar_cobrancas_pix_vencidas() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.listar_cobrancas_pix_conferencia(
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.get_user_role() NOT IN ('admin', 'barista')
     AND NOT public.tem_permissao('admin.financeiro')
     AND NOT public.tem_permissao('pdv.vender') THEN
    RAISE EXCEPTION 'Acesso negado às cobranças Pix em conferência.';
  END IF;

  PERFORM public.expirar_cobrancas_pix_vencidas();

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      pc.id,
      pc.pedido_id,
      pc.mesa_codigo,
      pc.parte_nome,
      pc.canal,
      pc.provedor,
      pc.txid,
      pc.psp_transacao_id,
      pc.valor,
      pc.valor_pago,
      pc.taxa_psp_valor,
      pc.status,
      pc.motivo_conferencia,
      pc.expira_em,
      pc.pago_em,
      pc.created_at,
      p.numero_pedido,
      p.cliente_nome
    FROM public.pix_cobrancas pc
    LEFT JOIN public.pedidos p ON p.id = pc.pedido_id
    WHERE (p_status IS NULL AND pc.status IN ('divergente', 'expirada'))
       OR (p_status IS NOT NULL AND pc.status = p_status)
    ORDER BY pc.created_at DESC
    LIMIT 100
  ) AS row_data;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.listar_cobrancas_pix_conferencia(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.listar_cobrancas_pix_conferencia(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolver_cobranca_pix_conferencia(
  p_cobranca_id UUID,
  p_acao TEXT DEFAULT 'cancelar',
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acao TEXT := LOWER(TRIM(COALESCE(p_acao, 'cancelar')));
  v_cobranca RECORD;
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.get_user_role() NOT IN ('admin', 'barista')
     AND NOT public.tem_permissao('admin.financeiro') THEN
    RAISE EXCEPTION 'Acesso negado para resolver divergência Pix.';
  END IF;

  SELECT * INTO v_cobranca
  FROM public.pix_cobrancas
  WHERE id = p_cobranca_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança Pix não encontrada.';
  END IF;

  IF v_acao = 'aprovar' THEN
    UPDATE public.pix_cobrancas
    SET status = 'pago',
        pago_em = COALESCE(pago_em, timezone('America/Sao_Paulo', now())),
        motivo_conferencia = COALESCE(NULLIF(TRIM(p_observacao), ''), COALESCE(motivo_conferencia, '') || ' [Aprovado manualmente]'),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE id = p_cobranca_id;

    IF v_cobranca.pedido_id IS NOT NULL THEN
      UPDATE public.pedidos
      SET status = CASE WHEN status IN ('aguardando_pagamento', 'aguardando_aprovacao') THEN 'pendente' ELSE status END,
          status_pagamento = 'pago',
          forma_pagamento = 'pix',
          pago_em = COALESCE(pago_em, timezone('America/Sao_Paulo', now())),
          updated_at = timezone('America/Sao_Paulo', now())
      WHERE id = v_cobranca.pedido_id AND status <> 'cancelado';
    END IF;
  ELSE
    UPDATE public.pix_cobrancas
    SET status = 'cancelada',
        motivo_conferencia = COALESCE(NULLIF(TRIM(p_observacao), ''), COALESCE(motivo_conferencia, '') || ' [Resolvido/Cancelado]'),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE id = p_cobranca_id;
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'cobranca_id', p_cobranca_id, 'acao', v_acao);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolver_cobranca_pix_conferencia(UUID, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resolver_cobranca_pix_conferencia(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 10. Registro da migration 123
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('123', 'migration_caf_000123_pix_dinamico.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
