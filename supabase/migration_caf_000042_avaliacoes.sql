-- =========================================================
-- MIGRATION: CAF-000042 - AVALIAÇÃO DO PEDIDO E DO ATENDIMENTO PELO CLIENTE
-- =========================================================

-- 1. Garante que todo pedido tenha pedido_token (inclusive pedidos lançados no PDV pelo barista para o QR do cupom)
ALTER TABLE public.pedidos
  ALTER COLUMN pedido_token SET DEFAULT gen_random_uuid();

UPDATE public.pedidos
SET pedido_token = gen_random_uuid()
WHERE pedido_token IS NULL;

-- 2. Tabela principal de avaliações (1 por pedido)
CREATE TABLE IF NOT EXISTS public.avaliacoes (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  nota_produto SMALLINT NOT NULL CHECK (nota_produto BETWEEN 1 AND 5),
  nota_atendimento SMALLINT NOT NULL CHECK (nota_atendimento BETWEEN 1 AND 5),
  comentario TEXT CHECK (comentario IS NULL OR char_length(comentario) <= 500),
  contato_telefone TEXT,
  aceita_contato BOOLEAN NOT NULL DEFAULT false,
  origem TEXT NOT NULL DEFAULT 'cupom' CHECK (origem IN ('qr_mesa', 'online', 'totem', 'cupom')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_created_at ON public.avaliacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_notas ON public.avaliacoes(nota_produto, nota_atendimento);

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacoes_admin_read" ON public.avaliacoes;
CREATE POLICY "avaliacoes_admin_read"
  ON public.avaliacoes
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Tabela opcional de avaliação por item do pedido
CREATE TABLE IF NOT EXISTS public.avaliacao_itens (
  id BIGSERIAL PRIMARY KEY,
  avaliacao_id BIGINT NOT NULL REFERENCES public.avaliacoes(id) ON DELETE CASCADE,
  produto_id TEXT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome_produto TEXT,
  nota SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avaliacao_itens_produto ON public.avaliacao_itens(produto_id);

ALTER TABLE public.avaliacao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avaliacao_itens_admin_read" ON public.avaliacao_itens;
CREATE POLICY "avaliacao_itens_admin_read"
  ON public.avaliacao_itens
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Configuração da URL de avaliação no Google
INSERT INTO public.configuracoes_sistema (chave, valor)
VALUES ('google_review_url', '"https://g.page/r/Cbcr-OkxGJmNEBM/review"'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 5. RPC: consultar_pedido_avaliacao(p_token)
CREATE OR REPLACE FUNCTION public.consultar_pedido_avaliacao(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido RECORD;
  v_ja_avaliado BOOLEAN := false;
  v_expirado BOOLEAN := false;
  v_itens JSONB;
  v_google_url TEXT := 'https://g.page/r/Cbcr-OkxGJmNEBM/review';
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('encontrado', false, 'motivo', 'TOKEN_AUSENTE');
  END IF;

  SELECT id, numero_pedido, mesa_codigo, cliente_nome, origem, status, created_at
  INTO v_pedido
  FROM public.pedidos
  WHERE pedido_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false, 'motivo', 'TOKEN_INVALIDO');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.avaliacoes WHERE pedido_id = v_pedido.id
  ) INTO v_ja_avaliado;

  IF (now() - v_pedido.created_at) > INTERVAL '48 hours' THEN
    v_expirado := true;
  END IF;

  SELECT COALESCE(trim(both '"' from (valor)::text), v_google_url)
  INTO v_google_url
  FROM public.configuracoes_sistema
  WHERE chave = 'google_review_url';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'produto_id', sub.produto_id,
        'nome_produto', sub.nome_produto
      )
    ),
    '[]'::jsonb
  ) INTO v_itens
  FROM (
    SELECT DISTINCT produto_id, nome_produto
    FROM public.pedido_itens
    WHERE pedido_id = v_pedido.id
      AND cancelado = false
      AND produto_id IS NOT NULL
  ) sub;

  RETURN jsonb_build_object(
    'encontrado', true,
    'pedido_id', v_pedido.id,
    'numero_pedido', v_pedido.numero_pedido,
    'mesa_codigo', v_pedido.mesa_codigo,
    'cliente_nome', split_part(trim(coalesce(v_pedido.cliente_nome, '')), ' ', 1),
    'created_at', v_pedido.created_at,
    'ja_avaliado', v_ja_avaliado,
    'expirado', v_expirado,
    'google_review_url', v_google_url,
    'itens', v_itens
  );
END;
$$;

-- 6. RPC: registrar_avaliacao(p_token, p_payload)
CREATE OR REPLACE FUNCTION public.registrar_avaliacao(
  p_token UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido RECORD;
  v_nota_produto SMALLINT;
  v_nota_atendimento SMALLINT;
  v_comentario TEXT;
  v_contato TEXT;
  v_aceita_contato BOOLEAN;
  v_origem_aval TEXT;
  v_avaliacao_id BIGINT;
  v_item JSONB;
  v_nota_item SMALLINT;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Token de avaliação ausente.';
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos
  WHERE pedido_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado para este link de avaliação.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.avaliacoes WHERE pedido_id = v_pedido.id) THEN
    RAISE EXCEPTION 'AVALIACAO_DUPLICADA: Este pedido já foi avaliado. Muito obrigado!';
  END IF;

  IF (now() - v_pedido.created_at) > INTERVAL '48 hours' THEN
    RAISE EXCEPTION 'TOKEN_EXPIRADO: O prazo de 48 horas para avaliar este pedido expirou.';
  END IF;

  v_nota_produto := COALESCE((p_payload->>'nota_produto')::smallint, 0);
  v_nota_atendimento := COALESCE((p_payload->>'nota_atendimento')::smallint, 0);

  IF v_nota_produto NOT BETWEEN 1 AND 5 OR v_nota_atendimento NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Informe uma nota de 1 a 5 estrelas para produtos e atendimento.';
  END IF;

  v_comentario := NULLIF(LEFT(TRIM(COALESCE(p_payload->>'comentario', '')), 500), '');
  v_aceita_contato := COALESCE((p_payload->>'aceita_contato')::boolean, false);
  v_contato := CASE WHEN v_aceita_contato THEN NULLIF(LEFT(TRIM(COALESCE(p_payload->>'contato_telefone', '')), 30), '') ELSE NULL END;

  v_origem_aval := CASE
    WHEN v_pedido.origem = 'cliente_qr' THEN 'qr_mesa'
    WHEN v_pedido.origem IN ('online', 'online_retirada') THEN 'online'
    WHEN v_pedido.origem = 'totem' THEN 'totem'
    ELSE 'cupom'
  END;

  INSERT INTO public.avaliacoes (
    pedido_id,
    nota_produto,
    nota_atendimento,
    comentario,
    contato_telefone,
    aceita_contato,
    origem
  ) VALUES (
    v_pedido.id,
    v_nota_produto,
    v_nota_atendimento,
    v_comentario,
    v_contato,
    v_aceita_contato,
    v_origem_aval
  ) RETURNING id INTO v_avaliacao_id;

  -- Insere notas individuais por produto, se informadas
  IF jsonb_typeof(p_payload->'itens') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'itens')
    LOOP
      v_nota_item := COALESCE((v_item->>'nota')::smallint, 0);
      IF v_nota_item BETWEEN 1 AND 5 AND (v_item->>'produto_id') IS NOT NULL THEN
        INSERT INTO public.avaliacao_itens (avaliacao_id, produto_id, nome_produto, nota)
        VALUES (
          v_avaliacao_id,
          v_item->>'produto_id',
          COALESCE(v_item->>'nome_produto', 'Produto'),
          v_nota_item
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'avaliacao_id', v_avaliacao_id,
    'nota_produto', v_nota_produto,
    'nota_atendimento', v_nota_atendimento
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consultar_pedido_avaliacao(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_avaliacao(UUID, JSONB) TO anon, authenticated;
