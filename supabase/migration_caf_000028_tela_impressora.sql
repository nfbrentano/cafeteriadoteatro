-- ==============================================================================
-- CAF-000028: Tela Responsável pela Impressão e Comanda por Estação
-- ==============================================================================

-- 1. Criação da tabela de controle de impressões
CREATE TABLE IF NOT EXISTS pedido_impressoes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  estacao TEXT NOT NULL, -- 'cozinha', 'bar', 'todas'
  tipo TEXT NOT NULL DEFAULT 'comanda', -- 'comanda', 'adicional', 'reimpressao'
  impresso_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  dispositivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Índice único parcial para garantir que cada comanda automática seja impressa apenas 1 vez por estação.
-- Note: 'reimpressao' manual não é bloqueada pelo índice único.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_impressoes_auto 
  ON pedido_impressoes (pedido_id, estacao, tipo) 
  WHERE tipo IN ('comanda', 'adicional');

-- 3. Índices de busca por pedido e data
CREATE INDEX IF NOT EXISTS idx_pedido_impressoes_pedido_id ON pedido_impressoes(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_impressoes_impresso_em ON pedido_impressoes(impresso_em);

-- 4. Função RPC atômica para travar e registrar impressão concorrente
CREATE OR REPLACE FUNCTION travar_impressao_pedido(
  p_pedido_id BIGINT,
  p_estacao TEXT,
  p_tipo TEXT DEFAULT 'comanda',
  p_dispositivo TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted_id BIGINT;
BEGIN
  -- Se for reimpressão manual, não há trava de duplicidade
  IF p_tipo = 'reimpressao' THEN
    INSERT INTO pedido_impressoes (pedido_id, estacao, tipo, dispositivo)
    VALUES (p_pedido_id, p_estacao, p_tipo, p_dispositivo);
    RETURN TRUE;
  END IF;

  -- Tentativa atômica de inserção da comanda automática
  INSERT INTO pedido_impressoes (pedido_id, estacao, tipo, dispositivo)
  VALUES (p_pedido_id, p_estacao, p_tipo, p_dispositivo)
  ON CONFLICT (pedido_id, estacao, tipo) WHERE tipo IN ('comanda', 'adicional')
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- Se conseguiu inserir o registro, este dispositivo obteve a trava exclusiva e deve imprimir
  IF v_inserted_id IS NOT NULL THEN
    RETURN TRUE;
  ELSE
    -- Outro dispositivo já inseriu a comanda
    RETURN FALSE;
  END IF;
END;
$$;

-- 5. Permissões
GRANT SELECT, INSERT ON pedido_impressoes TO authenticated, anon;
GRANT EXECUTE ON FUNCTION travar_impressao_pedido TO authenticated, anon;

COMMENT ON TABLE pedido_impressoes IS 'Registro e trava de idempotência das comandas impressas por estação (CAF-000028)';
