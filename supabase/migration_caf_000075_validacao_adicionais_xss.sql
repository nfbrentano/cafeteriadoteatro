BEGIN;

-- 1. Assegurar tabela adicional_vinculos e view v_adicionais_produto
CREATE TABLE IF NOT EXISTS public.adicional_vinculos (
  id BIGSERIAL PRIMARY KEY,
  adicional_id TEXT NOT NULL REFERENCES public.adicionais(id) ON DELETE CASCADE,
  produto_id TEXT REFERENCES public.produtos(id) ON DELETE CASCADE,
  categoria_id TEXT REFERENCES public.categorias(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_adicional_produto UNIQUE (adicional_id, produto_id),
  CONSTRAINT uq_adicional_categoria UNIQUE (adicional_id, categoria_id)
);

CREATE OR REPLACE VIEW public.v_adicionais_produto AS
SELECT DISTINCT
  p.id AS produto_id,
  a.id AS adicional_id,
  a.nome,
  a.preco,
  a.ordem,
  a.nome AS adicional_nome,
  a.preco AS adicional_preco,
  a.ativo AS adicional_ativo
FROM public.produtos p
JOIN public.adicionais a ON a.ativo = true
JOIN public.adicional_vinculos v 
  ON (v.produto_id = p.id OR v.categoria_id = p.categoria_id)
  AND v.adicional_id = a.id
WHERE p.ativo = true AND p.permite_adicionais = true;

-- 2. View de compatibilidade para produto_adicionais_permitidos (B1)
-- Se produto_adicionais_permitidos for uma tabela física, migra dados e renomeia antes de criar a view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'produto_adicionais_permitidos' AND c.relkind = 'r'
  ) THEN
    INSERT INTO public.adicional_vinculos (adicional_id, produto_id)
    SELECT adicional_id::text, produto_id::text
    FROM public.produto_adicionais_permitidos
    ON CONFLICT DO NOTHING;

    ALTER TABLE public.produto_adicionais_permitidos RENAME TO produto_adicionais_permitidos_legado;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.produto_adicionais_permitidos AS
SELECT produto_id, adicional_id FROM public.v_adicionais_produto;

-- 3. Função central de validação de adicionais por item
CREATE OR REPLACE FUNCTION public.fn_validar_adicionais_item(
  p_produto_id TEXT,
  p_adicionais JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permite_adicionais BOOLEAN;
  v_total_adicionais NUMERIC(10,2) := 0;
  v_adicional_id TEXT;
  v_adicional_record RECORD;
BEGIN
  -- Se não há adicionais informados, retorna 0
  IF p_adicionais IS NULL OR jsonb_array_length(p_adicionais) = 0 THEN
    RETURN 0.00;
  END IF;

  -- 1. Verifica se o produto permite adicionais
  SELECT COALESCE(permite_adicionais, true) INTO v_permite_adicionais
  FROM public.produtos
  WHERE id = p_produto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado.', p_produto_id;
  END IF;

  IF NOT v_permite_adicionais THEN
    RAISE EXCEPTION 'O produto % não permite adicionais.', p_produto_id;
  END IF;

  -- 2. Valida cada adicional contra a view unificada v_adicionais_produto e calcula o total seguro
  FOR v_adicional_id IN SELECT jsonb_array_elements_text(p_adicionais)
  LOOP
    SELECT a.id, a.nome, a.preco
    INTO v_adicional_record
    FROM public.v_adicionais_produto vap
    JOIN public.adicionais a ON a.id = vap.adicional_id
    WHERE vap.produto_id = p_produto_id AND vap.adicional_id = v_adicional_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Adicional % não é permitido para o produto %.', v_adicional_id, p_produto_id;
    END IF;

    v_total_adicionais := v_total_adicionais + v_adicional_record.preco;
  END LOOP;

  RETURN v_total_adicionais;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validar_adicionais_item(TEXT, JSONB) TO anon, authenticated;

-- Registro de aplicação (RF04)
INSERT INTO public.app_migrations (versao, arquivo)
VALUES ('075', 'migration_caf_000075_validacao_adicionais_xss.sql')
ON CONFLICT (versao) DO NOTHING;

COMMIT;
