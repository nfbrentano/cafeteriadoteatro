-- Migration CAF-000033: Cadastro de Clientes com Histórico de Consumo

-- 1. Criar tabela de clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT UNIQUE,
  email TEXT,
  data_nascimento DATE,
  observacoes TEXT,
  aceita_contato BOOLEAN NOT NULL DEFAULT false,
  anonimizado BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para sanitizar telefone (apenas dígitos com DDI 55 se DDD padrão)
CREATE OR REPLACE FUNCTION public.fn_sanitize_cliente_telefone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  IF NEW.telefone IS NOT NULL AND NEW.telefone <> '' THEN
    v_digits := regexp_replace(NEW.telefone, '\D', '', 'g');
    IF length(v_digits) IN (10, 11) THEN
      v_digits := '55' || v_digits;
    END IF;
    NEW.telefone := v_digits;
  ELSE
    NEW.telefone := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_cliente_telefone ON public.clientes;
CREATE TRIGGER trg_sanitize_cliente_telefone
BEFORE INSERT OR UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.fn_sanitize_cliente_telefone();

-- Índices de busca e ordenação
CREATE INDEX IF NOT EXISTS idx_clientes_nome_lower ON public.clientes (lower(nome));
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON public.clientes (telefone);
CREATE INDEX IF NOT EXISTS idx_clientes_ativo ON public.clientes (ativo);
CREATE INDEX IF NOT EXISTS idx_clientes_created_at ON public.clientes (created_at DESC);

-- 2. Vincular cliente_id à tabela pedidos
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON public.pedidos (cliente_id);

-- 3. Atualizar RPC criar_pedido para aceitar e persistir cliente_id
CREATE OR REPLACE FUNCTION public.criar_pedido(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_pedido_id BIGINT;
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_adicional JSONB;
  v_sabor JSONB;
  v_produto_record RECORD;
  v_adicional_record RECORD;
  v_sabor_record RECORD;
  v_preco_base NUMERIC(10,2);
  v_preco_unitario NUMERIC(10,2);
  v_pedido_item_id BIGINT;
  v_mesa_codigo TEXT;
  v_obs_geral TEXT;
  v_forma_pagamento TEXT;
  v_status_pagamento TEXT;
  v_cliente_nome TEXT;
  v_cliente_id UUID := NULL;
  v_para_viagem BOOLEAN;
  v_client_id UUID;
  v_prioridade SMALLINT;
  v_prioridade_motivo TEXT;
  v_inseridos BIGINT[];
  v_item_index INT := 0;
  v_cortesia_de_index INT;
BEGIN
  -- Verificar Role
  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_client_id := (p_payload->>'client_id')::UUID;

  -- Se foi enviado client_id, verificar se já existe o pedido (idempotência)
  IF v_client_id IS NOT NULL THEN
    SELECT id, total INTO v_pedido_id, v_total FROM public.pedidos WHERE client_id = v_client_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_pedido_id, 'total', v_total, 'idempotent', true);
    END IF;
  END IF;

  v_mesa_codigo := p_payload->>'mesa_codigo';
  IF v_mesa_codigo IS NULL OR v_mesa_codigo = '' THEN
    v_mesa_codigo := 'BALCAO';
  END IF;

  v_obs_geral := p_payload->>'observacoes';
  v_forma_pagamento := p_payload->>'forma_pagamento';
  v_status_pagamento := p_payload->>'status_pagamento';
  v_cliente_nome := p_payload->>'cliente_nome';

  IF p_payload ? 'cliente_id' AND p_payload->>'cliente_id' IS NOT NULL AND p_payload->>'cliente_id' <> '' THEN
    v_cliente_id := (p_payload->>'cliente_id')::UUID;
  END IF;

  v_para_viagem := COALESCE((p_payload->>'para_viagem')::BOOLEAN, false);
  v_prioridade := COALESCE((p_payload->>'prioridade')::SMALLINT, 0);
  v_prioridade_motivo := p_payload->>'prioridade_motivo';

  INSERT INTO public.pedidos (
    mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, 
    total, cliente_nome, para_viagem, client_id, prioridade, prioridade_motivo, cliente_id
  )
  VALUES (
    v_mesa_codigo, v_obs_geral, v_forma_pagamento, v_status_pagamento, auth.uid(),
    (SELECT nome FROM public.perfis WHERE id = auth.uid()), 0, v_cliente_nome, v_para_viagem, 
    v_client_id, v_prioridade, v_prioridade_motivo, v_cliente_id
  ) RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
  LOOP
    SELECT p.id, p.nome, p.preco, p.tipo_montagem, COALESCE(c.estacao, 'cozinha') AS estacao
    INTO v_produto_record 
    FROM public.produtos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado, inativo ou esgotado: %', v_item->>'produto_id';
    END IF;

    IF v_produto_record.tipo_montagem = 'meio_a_meio' THEN
      v_preco_base := 0;
      IF jsonb_typeof(v_item->'sabores') != 'array' THEN
        RAISE EXCEPTION 'Produto meio a meio requer array de sabores';
      END IF;
      FOR v_sabor IN SELECT * FROM jsonb_array_elements(v_item->'sabores')
      LOOP
        SELECT id, nome, preco INTO v_sabor_record FROM public.produtos WHERE id = v_sabor->>'produto_id' AND ativo = true AND disponivel = true;
        IF NOT FOUND THEN RAISE EXCEPTION 'Sabor não encontrado ou esgotado: %', v_sabor->>'produto_id'; END IF;
        v_preco_base := v_preco_base + ROUND(v_sabor_record.preco * 0.5, 2);
      END LOOP;
    ELSE
      v_preco_base := v_produto_record.preco;
    END IF;

    v_preco_unitario := v_preco_base;

    IF jsonb_typeof(v_item->'adicionais') = 'array' THEN
      FOR v_adicional IN SELECT * FROM jsonb_array_elements_text(v_item->'adicionais')
      LOOP
        SELECT preco INTO v_adicional_record FROM public.adicionais WHERE id = v_adicional::text AND ativo = true;
        IF FOUND THEN v_preco_unitario := v_preco_unitario + v_adicional_record.preco; END IF;
      END LOOP;
    END IF;

    v_cortesia_de_index := (v_item->>'cortesia_de_item_index')::INT;

    INSERT INTO public.pedido_itens (
      pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario, observacoes, cortesia_de_item_id, estacao
    ) VALUES (
      v_pedido_id, v_produto_record.id, v_produto_record.nome, (v_item->>'quantidade')::int,
      v_preco_base, v_preco_unitario, v_item->>'observacoes',
      CASE WHEN v_cortesia_de_index IS NOT NULL THEN v_inseridos[v_cortesia_de_index + 1] ELSE NULL END,
      v_produto_record.estacao
    ) RETURNING id INTO v_pedido_item_id;

    v_inseridos := array_append(v_inseridos, v_pedido_item_id);

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

    v_item_index := v_item_index + 1;
  END LOOP;

  PERFORM public.aplicar_promocoes_pedido(v_pedido_id);

  SELECT COALESCE(SUM(quantidade * preco_unitario - desconto), 0) INTO v_total
  FROM public.pedido_itens WHERE pedido_id = v_pedido_id;

  UPDATE public.pedidos SET total = v_total WHERE id = v_pedido_id;

  RETURN jsonb_build_object('id', v_pedido_id, 'total', v_total);
END;
$$;

-- 4. Função para busca preditiva de clientes no PDV (< 300ms)
CREATE OR REPLACE FUNCTION public.buscar_clientes_pdv(
  p_termo TEXT,
  p_limite INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  telefone TEXT,
  aceita_contato BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_digits TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_digits := regexp_replace(COALESCE(p_termo, ''), '\D', '', 'g');

  RETURN QUERY
  SELECT c.id, c.nome, c.telefone, c.aceita_contato
  FROM public.clientes c
  WHERE c.ativo = true 
    AND c.anonimizado = false
    AND (
      lower(c.nome) LIKE '%' || lower(trim(p_termo)) || '%'
      OR (length(v_digits) >= 3 AND c.telefone LIKE '%' || v_digits || '%')
    )
  ORDER BY 
    CASE 
      WHEN lower(c.nome) LIKE lower(trim(p_termo)) || '%' THEN 1
      ELSE 2
    END,
    c.nome ASC
  LIMIT p_limite;
END;
$$;

-- 5. Função para obter ficha completa do cliente com histórico e métricas
CREATE OR REPLACE FUNCTION public.obter_ficha_cliente(p_cliente_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_cliente RECORD;
  v_total_gasto NUMERIC(10,2) := 0;
  v_total_visitas INT := 0;
  v_ticket_medio NUMERIC(10,2) := 0;
  v_primeira_visita TIMESTAMPTZ := NULL;
  v_ultima_visita TIMESTAMPTZ := NULL;
  v_top_produtos JSONB := '[]'::JSONB;
  v_ultimos_pedidos JSONB := '[]'::JSONB;
BEGIN
  v_role := public.get_user_role();
  IF v_role NOT IN ('barista', 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  -- Resumo de compras
  SELECT 
    COALESCE(SUM(total), 0),
    COUNT(*),
    MIN(created_at),
    MAX(created_at)
  INTO 
    v_total_gasto,
    v_total_visitas,
    v_primeira_visita,
    v_ultima_visita
  FROM public.pedidos
  WHERE cliente_id = p_cliente_id AND status != 'cancelado';

  IF v_total_visitas > 0 THEN
    v_ticket_medio := ROUND(v_total_gasto / v_total_visitas, 2);
  END IF;

  -- Top 5 produtos preferidos
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_top_produtos
  FROM (
    SELECT 
      pi.nome_produto,
      SUM(pi.quantidade)::INT AS quantidade_total,
      ROUND(SUM(pi.quantidade * pi.preco_unitario - pi.desconto), 2) AS valor_total
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id
    WHERE p.cliente_id = p_cliente_id AND p.status != 'cancelado'
    GROUP BY pi.nome_produto
    ORDER BY quantidade_total DESC, valor_total DESC
    LIMIT 5
  ) sub;

  -- Últimos 10 pedidos
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_ultimos_pedidos
  FROM (
    SELECT 
      p.id,
      p.numero_pedido,
      p.total,
      p.status,
      p.status_pagamento,
      p.forma_pagamento,
      p.mesa_codigo,
      p.para_viagem,
      p.created_at,
      COALESCE((
        SELECT string_agg(pi.quantidade || 'x ' || pi.nome_produto, ', ')
        FROM public.pedido_itens pi
        WHERE pi.pedido_id = p.id
      ), '') AS itens_resumo
    FROM public.pedidos p
    WHERE p.cliente_id = p_cliente_id
    ORDER BY p.created_at DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'cliente', row_to_json(v_cliente),
    'resumo', jsonb_build_object(
      'total_gasto', v_total_gasto,
      'total_visitas', v_total_visitas,
      'ticket_medio', v_ticket_medio,
      'primeira_visita', v_primeira_visita,
      'ultima_visita', v_ultima_visita
    ),
    'top_produtos', v_top_produtos,
    'ultimos_pedidos', v_ultimos_pedidos
  );
END;
$$;

-- 6. Função para mesclar clientes duplicados (Admin)
CREATE OR REPLACE FUNCTION public.mesclar_clientes(
  p_cliente_origem_id UUID,
  p_cliente_destino_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_qtd_pedidos INT;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem mesclar clientes';
  END IF;

  IF p_cliente_origem_id = p_cliente_destino_id THEN
    RAISE EXCEPTION 'Cliente de origem e destino não podem ser iguais';
  END IF;

  -- Mover pedidos
  UPDATE public.pedidos
  SET cliente_id = p_cliente_destino_id
  WHERE cliente_id = p_cliente_origem_id;

  GET DIAGNOSTICS v_qtd_pedidos = ROW_COUNT;

  -- Desativar cliente de origem
  UPDATE public.clientes
  SET ativo = false,
      observacoes = COALESCE(observacoes, '') || ' [Mesclado com cliente ' || p_cliente_destino_id::text || ' em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ']',
      updated_at = now()
  WHERE id = p_cliente_origem_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'pedidos_migrados', v_qtd_pedidos
  );
END;
$$;

-- 7. Função para anonimizar cliente (LGPD)
CREATE OR REPLACE FUNCTION public.anonimizar_cliente(p_cliente_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem anonimizar dados de clientes';
  END IF;

  UPDATE public.clientes
  SET nome = 'Cliente Anonimizado',
      telefone = NULL,
      email = NULL,
      data_nascimento = NULL,
      observacoes = NULL,
      aceita_contato = false,
      anonimizado = true,
      ativo = false,
      updated_at = now()
  WHERE id = p_cliente_id;

  -- Manter pedidos.cliente_id intacto para relatórios e contabilidade,
  -- mas o cliente_nome no pedido histórico pode ser ajustado para proteção dos dados
  UPDATE public.pedidos
  SET cliente_nome = 'Cliente Anonimizado'
  WHERE cliente_id = p_cliente_id;

  RETURN jsonb_build_object('sucesso', true, 'anonimizado', true);
END;
$$;

-- 8. Configurar RLS na tabela clientes
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de clientes para barista e admin" ON public.clientes;
CREATE POLICY "Permitir leitura de clientes para barista e admin"
  ON public.clientes
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('barista', 'admin'));

DROP POLICY IF EXISTS "Permitir insercao de clientes para barista e admin" ON public.clientes;
CREATE POLICY "Permitir insercao de clientes para barista e admin"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('barista', 'admin'));

DROP POLICY IF EXISTS "Permitir atualizacao de clientes para barista e admin" ON public.clientes;
CREATE POLICY "Permitir atualizacao de clientes para barista e admin"
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() IN ('barista', 'admin'))
  WITH CHECK (public.get_user_role() IN ('barista', 'admin'));

DROP POLICY IF EXISTS "Permitir exclusao de clientes para admin" ON public.clientes;
CREATE POLICY "Permitir exclusao de clientes para admin"
  ON public.clientes
  FOR DELETE
  TO authenticated
  USING (public.get_user_role() = 'admin');
