BEGIN;

-- ==============================================================================
-- MIGRATION: CAF-000124 — Emissão de NFC-e no Fechamento da Conta via Provedor Fiscal
-- Implementa: CAF-000124
-- Descrição:
--   1. Configurações fiscais padrão em public.configuracoes_sistema.
--   2. Colunas fiscais em public.produtos e public.categorias (NCM, CFOP, CSOSN).
--   3. Tabela public.notas_fiscais com RLS, índices e histórico de emissão/cancelamento.
--   4. Função utilitária fn_gerar_chave_acesso_nfce para chave SEFAZ de 44 dígitos.
--   5. RPCs:
--      - public.obter_dados_fiscais_fechamento (validação de cadastro fiscal de produtos e categorias)
--      - public.registrar_emissao_nfce (registro idempotente de emissão)
--      - public.cancelar_nfce (cancelamento com PIN/permissão de supervisor)
--      - public.listar_notas_fiscais (relatório e download de notas)
-- ==============================================================================

-- 1. Configurações fiscais em public.configuracoes_sistema
INSERT INTO public.configuracoes_sistema (chave, valor, updated_at)
VALUES
  ('nfce_ativa', 'true'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_modo_emissao', '"sob_demanda"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_ambiente', '"homologacao"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_provedor', '"sandbox"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_serie', '1'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_proximo_numero', '1'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_csc_id', '"000001"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_csc_codigo', '"000000000000"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_cnpj', '"00.000.000/0001-91"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_razao_social', '"Cafeteria do Teatro Ltda"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_nome_fantasia', '"Cafeteria do Teatro"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_ie', '"123456789"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_uf', '"RS"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_municipio', '"Lajeado"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_ibge', '"4311403"'::jsonb, timezone('America/Sao_Paulo', now())),
  ('nfce_emitente_regime_tributario', '"simples_nacional"'::jsonb, timezone('America/Sao_Paulo', now()))
ON CONFLICT (chave) DO NOTHING;

-- 2. Colunas fiscais em public.produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS ncm TEXT DEFAULT '21011110',
  ADD COLUMN IF NOT EXISTS cfop TEXT DEFAULT '5102',
  ADD COLUMN IF NOT EXISTS csosn TEXT DEFAULT '102',
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT '0',
  ADD COLUMN IF NOT EXISTS unidade_tributavel TEXT DEFAULT 'UN';

-- 3. Colunas fiscais padrão em public.categorias
ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS ncm_padrao TEXT DEFAULT '21011110',
  ADD COLUMN IF NOT EXISTS cfop_padrao TEXT DEFAULT '5102',
  ADD COLUMN IF NOT EXISTS csosn_padrao TEXT DEFAULT '102';

-- 4. Tabela public.notas_fiscais
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id UUID REFERENCES public.fechamentos(id) ON DELETE SET NULL,
  pedido_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL,
  mesa_codigo TEXT,
  numero BIGINT NOT NULL,
  serie INTEGER NOT NULL DEFAULT 1,
  chave_acesso TEXT UNIQUE,
  protocolo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'autorizada', 'rejeitada', 'cancelada', 'contingencia')),
  motivo_status TEXT,
  consumidor_cpf_cnpj TEXT,
  consumidor_nome TEXT,
  valor_produtos NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  formas_pagamento JSONB NOT NULL DEFAULT '[]'::jsonb,
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  qr_code_url TEXT,
  danfe_url TEXT,
  xml_url TEXT,
  ambiente TEXT NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  provedor TEXT NOT NULL DEFAULT 'sandbox',
  payload_envio JSONB,
  resposta_provedor JSONB,
  cancelada_em TIMESTAMPTZ,
  cancelada_por UUID REFERENCES auth.users(id),
  cancelada_por_nome TEXT,
  motivo_cancelamento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Sao_Paulo', now())
);

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_fechamento_id ON public.notas_fiscais (fechamento_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_status ON public.notas_fiscais (status);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_created_at ON public.notas_fiscais (created_at DESC);

ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notas_fiscais_select_staff" ON public.notas_fiscais;
CREATE POLICY "notas_fiscais_select_staff" ON public.notas_fiscais
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista', 'gerente') 
    OR public.tem_permissao('pdv.vender')
    OR public.tem_permissao('admin.geral')
  );

DROP POLICY IF EXISTS "notas_fiscais_modify_staff" ON public.notas_fiscais;
CREATE POLICY "notas_fiscais_modify_staff" ON public.notas_fiscais
  FOR ALL TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'barista', 'gerente') 
    OR public.tem_permissao('pdv.vender')
    OR public.tem_permissao('admin.geral')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'barista', 'gerente') 
    OR public.tem_permissao('pdv.vender')
    OR public.tem_permissao('admin.geral')
  );

REVOKE ALL ON public.notas_fiscais FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON public.notas_fiscais TO authenticated;

-- 5. Função utilitária para gerar chave de acesso de 44 dígitos com dígito verificador Módulo 11
CREATE OR REPLACE FUNCTION public.fn_gerar_chave_acesso_nfce(
  p_uf TEXT,
  p_cnpj TEXT,
  p_serie INT,
  p_numero BIGINT,
  p_tipo_emissao INT DEFAULT 1,
  p_codigo_numerico TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_uf_cod TEXT := '43'; -- Padrão RS
  v_aamm TEXT := to_char(timezone('America/Sao_Paulo', now()), 'YYMM');
  v_cnpj_limpo TEXT := regexp_replace(COALESCE(p_cnpj, '00000000000191'), '[^0-9]', '', 'g');
  v_mod TEXT := '65'; -- NFC-e
  v_serie_fmt TEXT := LPAD(COALESCE(p_serie, 1)::text, 3, '0');
  v_num_fmt TEXT := LPAD(COALESCE(p_numero, 1)::text, 9, '0');
  v_tp_emis TEXT := LPAD(COALESCE(p_tipo_emissao, 1)::text, 1, '1');
  v_cnf TEXT;
  v_base43 TEXT;
  v_soma INT := 0;
  v_peso INT := 2;
  v_resto INT;
  v_dv INT;
  v_i INT;
  v_char CHAR;
BEGIN
  IF LENGTH(v_cnpj_limpo) < 14 THEN
    v_cnpj_limpo := LPAD(v_cnpj_limpo, 14, '0');
  ELSIF LENGTH(v_cnpj_limpo) > 14 THEN
    v_cnpj_limpo := SUBSTRING(v_cnpj_limpo FROM 1 FOR 14);
  END IF;

  IF p_codigo_numerico IS NOT NULL AND LENGTH(regexp_replace(p_codigo_numerico, '[^0-9]', '', 'g')) = 8 THEN
    v_cnf := regexp_replace(p_codigo_numerico, '[^0-9]', '', 'g');
  ELSE
    v_cnf := LPAD(TRUNC(ABS(SIN(COALESCE(p_numero, 1)) * 100000000))::text, 8, '0');
  END IF;

  v_base43 := v_uf_cod || v_aamm || v_cnpj_limpo || v_mod || v_serie_fmt || v_num_fmt || v_tp_emis || v_cnf;

  -- Cálculo do dígito verificador Módulo 11 (pesos de 2 a 9 da direita para a esquerda)
  v_peso := 2;
  v_soma := 0;
  FOR v_i IN REVERSE LENGTH(v_base43)..1 LOOP
    v_char := SUBSTRING(v_base43 FROM v_i FOR 1);
    v_soma := v_soma + (v_char::INT * v_peso);
    v_peso := v_peso + 1;
    IF v_peso > 9 THEN
      v_peso := 2;
    END IF;
  END LOOP;

  v_resto := v_soma % 11;
  IF v_resto = 0 OR v_resto = 1 THEN
    v_dv := 0;
  ELSE
    v_dv := 11 - v_resto;
  END IF;

  RETURN v_base43 || v_dv::text;
END;
$$;

-- 6. RPC: obter_dados_fiscais_fechamento
-- Recupera os itens consumidos (seja por fechamento parcial ou mesa completa) e valida dados fiscais
CREATE OR REPLACE FUNCTION public.obter_dados_fiscais_fechamento(p_fechamento_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento RECORD;
  v_item RECORD;
  v_pag RECORD;
  v_itens_json JSONB := '[]'::jsonb;
  v_pags_json JSONB := '[]'::jsonb;
  v_incompleto BOOLEAN := false;
  v_prods_incompletos TEXT[] := ARRAY[]::TEXT[];
  v_ncm TEXT;
  v_cfop TEXT;
  v_csosn TEXT;
  v_origem TEXT;
  v_unidade TEXT;
  v_tem_itens_parciais BOOLEAN := false;
  v_codigo_sefaz TEXT;
BEGIN
  SELECT * INTO v_fechamento
  FROM public.fechamentos
  WHERE id = p_fechamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento % não encontrado.', p_fechamento_id;
  END IF;

  -- 1. Verifica se é fechamento parcial com itens específicos gravados
  SELECT EXISTS (
    SELECT 1 FROM public.fechamento_itens WHERE fechamento_id = p_fechamento_id
  ) INTO v_tem_itens_parciais;

  IF v_tem_itens_parciais THEN
    FOR v_item IN
      SELECT 
        fi.id AS fechamento_item_id,
        pi.id AS pedido_item_id,
        pi.produto_id,
        COALESCE(pi.nome_produto, p.nome) AS nome,
        fi.quantidade,
        fi.valor_unitario,
        fi.subtotal,
        p.ncm AS prod_ncm,
        p.cfop AS prod_cfop,
        p.csosn AS prod_csosn,
        p.origem AS prod_origem,
        p.unidade_tributavel AS prod_unidade,
        c.ncm_padrao AS cat_ncm,
        c.cfop_padrao AS cat_cfop,
        c.csosn_padrao AS cat_csosn
      FROM public.fechamento_itens fi
      JOIN public.pedido_itens pi ON pi.id = fi.pedido_item_id
      LEFT JOIN public.produtos p ON p.id = pi.produto_id
      LEFT JOIN public.categorias c ON c.id = p.categoria_id
      WHERE fi.fechamento_id = p_fechamento_id
    LOOP
      v_ncm := COALESCE(NULLIF(TRIM(v_item.prod_ncm), ''), NULLIF(TRIM(v_item.cat_ncm), ''), '');
      v_cfop := COALESCE(NULLIF(TRIM(v_item.prod_cfop), ''), NULLIF(TRIM(v_item.cat_cfop), ''), '');
      v_csosn := COALESCE(NULLIF(TRIM(v_item.prod_csosn), ''), NULLIF(TRIM(v_item.cat_csosn), ''), '102');
      v_origem := COALESCE(NULLIF(TRIM(v_item.prod_origem), ''), '0');
      v_unidade := COALESCE(NULLIF(TRIM(v_item.prod_unidade), ''), 'UN');

      IF v_ncm = '' OR LENGTH(regexp_replace(v_ncm, '[^0-9]', '', 'g')) != 8 OR v_cfop = '' THEN
        v_incompleto := true;
        v_prods_incompletos := array_append(v_prods_incompletos, v_item.nome);
      END IF;

      v_itens_json := v_itens_json || jsonb_build_object(
        'produto_id', v_item.produto_id,
        'pedido_item_id', v_item.pedido_item_id,
        'nome', v_item.nome,
        'quantidade', v_item.quantidade,
        'valor_unitario', v_item.valor_unitario,
        'valor_total', v_item.subtotal,
        'ncm', v_ncm,
        'cfop', v_cfop,
        'csosn', v_csosn,
        'origem', v_origem,
        'unidade', v_unidade,
        'incompleto', (v_ncm = '' OR v_cfop = '')
      );
    END LOOP;
  ELSE
    -- Fechamento total da mesa: recupera itens de todos os pedidos vinculados
    FOR v_item IN
      SELECT 
        pi.id AS pedido_item_id,
        pi.produto_id,
        COALESCE(pi.nome_produto, p.nome) AS nome,
        pi.quantidade,
        pi.preco_unitario AS valor_unitario,
        (pi.quantidade * pi.preco_unitario - COALESCE(pi.desconto, 0)) AS subtotal,
        p.ncm AS prod_ncm,
        p.cfop AS prod_cfop,
        p.csosn AS prod_csosn,
        p.origem AS prod_origem,
        p.unidade_tributavel AS prod_unidade,
        c.ncm_padrao AS cat_ncm,
        c.cfop_padrao AS cat_cfop,
        c.csosn_padrao AS cat_csosn
      FROM public.fechamento_pedidos fp
      JOIN public.pedido_itens pi ON pi.pedido_id = fp.pedido_id
      LEFT JOIN public.produtos p ON p.id = pi.produto_id
      LEFT JOIN public.categorias c ON c.id = p.categoria_id
      WHERE fp.fechamento_id = p_fechamento_id
        AND COALESCE(pi.cancelado, false) = false
    LOOP
      v_ncm := COALESCE(NULLIF(TRIM(v_item.prod_ncm), ''), NULLIF(TRIM(v_item.cat_ncm), ''), '');
      v_cfop := COALESCE(NULLIF(TRIM(v_item.prod_cfop), ''), NULLIF(TRIM(v_item.cat_cfop), ''), '');
      v_csosn := COALESCE(NULLIF(TRIM(v_item.prod_csosn), ''), NULLIF(TRIM(v_item.cat_csosn), ''), '102');
      v_origem := COALESCE(NULLIF(TRIM(v_item.prod_origem), ''), '0');
      v_unidade := COALESCE(NULLIF(TRIM(v_item.prod_unidade), ''), 'UN');

      IF v_ncm = '' OR LENGTH(regexp_replace(v_ncm, '[^0-9]', '', 'g')) != 8 OR v_cfop = '' THEN
        v_incompleto := true;
        v_prods_incompletos := array_append(v_prods_incompletos, v_item.nome);
      END IF;

      v_itens_json := v_itens_json || jsonb_build_object(
        'produto_id', v_item.produto_id,
        'pedido_item_id', v_item.pedido_item_id,
        'nome', v_item.nome,
        'quantidade', v_item.quantidade,
        'valor_unitario', v_item.valor_unitario,
        'valor_total', v_item.subtotal,
        'ncm', v_ncm,
        'cfop', v_cfop,
        'csosn', v_csosn,
        'origem', v_origem,
        'unidade', v_unidade,
        'incompleto', (v_ncm = '' OR v_cfop = '')
      );
    END LOOP;
  END IF;

  -- 2. Formas de pagamento realizadas no fechamento
  FOR v_pag IN
    SELECT forma, valor
    FROM public.fechamento_pagamentos
    WHERE fechamento_id = p_fechamento_id
  LOOP
    v_codigo_sefaz := CASE LOWER(v_pag.forma)
      WHEN 'dinheiro' THEN '01'
      WHEN 'cartao_credito' THEN '03'
      WHEN 'credito' THEN '03'
      WHEN 'cartao_debito' THEN '04'
      WHEN 'debito' THEN '04'
      WHEN 'conta_cliente' THEN '05'
      WHEN 'fiado' THEN '05'
      WHEN 'pix' THEN '17'
      ELSE '99'
    END;

    v_pags_json := v_pags_json || jsonb_build_object(
      'forma', v_pag.forma,
      'valor', v_pag.valor,
      'codigo_sefaz', v_codigo_sefaz
    );
  END LOOP;

  RETURN jsonb_build_object(
    'fechamento_id', v_fechamento.id,
    'mesa_codigo', v_fechamento.mesa_codigo,
    'total_conta', v_fechamento.total_conta,
    'desconto_manual', COALESCE(v_fechamento.desconto_manual, 0),
    'taxa_servico', COALESCE(v_fechamento.taxa_servico, 0),
    'troco', COALESCE(v_fechamento.troco, 0),
    'parcial', COALESCE(v_fechamento.parcial, false),
    'itens', v_itens_json,
    'formas_pagamento', v_pags_json,
    'incompleto', v_incompleto,
    'produtos_incompletos', to_jsonb(v_prods_incompletos)
  );
END;
$$;

-- 7. RPC: registrar_emissao_nfce
-- Idempotente: se já existir nota autorizada ou processando para este fechamento, retorna a existente
CREATE OR REPLACE FUNCTION public.registrar_emissao_nfce(
  p_fechamento_id UUID,
  p_consumidor_cpf_cnpj TEXT DEFAULT NULL,
  p_consumidor_nome TEXT DEFAULT NULL,
  p_itens JSONB DEFAULT '[]'::jsonb,
  p_formas_pagamento JSONB DEFAULT '[]'::jsonb,
  p_chave_acesso TEXT DEFAULT NULL,
  p_numero BIGINT DEFAULT NULL,
  p_serie INT DEFAULT 1,
  p_status TEXT DEFAULT 'autorizada',
  p_protocolo TEXT DEFAULT NULL,
  p_motivo_status TEXT DEFAULT NULL,
  p_qr_code_url TEXT DEFAULT NULL,
  p_danfe_url TEXT DEFAULT NULL,
  p_xml_url TEXT DEFAULT NULL,
  p_ambiente TEXT DEFAULT 'homologacao',
  p_provedor TEXT DEFAULT 'sandbox',
  p_payload_envio JSONB DEFAULT NULL,
  p_resposta_provedor JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nota_existente RECORD;
  v_fechamento RECORD;
  v_proximo_numero BIGINT;
  v_serie INT := COALESCE(p_serie, 1);
  v_chave TEXT := p_chave_acesso;
  v_protocolo TEXT := p_protocolo;
  v_nova_nota RECORD;
  v_valor_total NUMERIC(10,2) := 0;
  v_valor_produtos NUMERIC(10,2) := 0;
  v_valor_desconto NUMERIC(10,2) := 0;
  v_cpf_cnpj_limpo TEXT := NULLIF(regexp_replace(COALESCE(p_consumidor_cpf_cnpj, ''), '[^0-9]', '', 'g'), '');
BEGIN
  -- 1. Idempotência (CA04): se já existir nota autorizada para este fechamento, retorna a nota existente
  SELECT * INTO v_nota_existente
  FROM public.notas_fiscais
  WHERE fechamento_id = p_fechamento_id
    AND status = 'autorizada'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ja_emitida', true,
      'nota', row_to_json(v_nota_existente)
    );
  END IF;

  -- 2. Carrega fechamento para dados complementares
  SELECT * INTO v_fechamento
  FROM public.fechamentos
  WHERE id = p_fechamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento % inexistente.', p_fechamento_id;
  END IF;

  -- 3. Define número e série sequencial
  IF p_numero IS NOT NULL THEN
    v_proximo_numero := p_numero;
  ELSE
    SELECT COALESCE((valor::text)::BIGINT, 1)
    INTO v_proximo_numero
    FROM public.configuracoes_sistema
    WHERE chave = 'nfce_proximo_numero';

    IF v_proximo_numero IS NULL THEN
      v_proximo_numero := 1;
    END IF;

    -- Atualiza próximo número no banco
    UPDATE public.configuracoes_sistema
    SET valor = to_jsonb(v_proximo_numero + 1),
        updated_at = timezone('America/Sao_Paulo', now())
    WHERE chave = 'nfce_proximo_numero';
  END IF;

  -- 4. Chave de acesso de 44 dígitos
  IF v_chave IS NULL OR LENGTH(v_chave) != 44 THEN
    v_chave := public.fn_gerar_chave_acesso_nfce(
      p_uf := '43',
      p_cnpj := '00000000000191',
      p_serie := v_serie,
      p_numero := v_proximo_numero,
      p_tipo_emissao := CASE WHEN p_status = 'contingencia' THEN 9 ELSE 1 END
    );
  END IF;

  -- Protocolo padrão de homologação caso não fornecido
  IF v_protocolo IS NULL AND p_status = 'autorizada' THEN
    v_protocolo := '143' || to_char(timezone('America/Sao_Paulo', now()), 'YY') || LPAD(v_proximo_numero::text, 10, '0');
  END IF;

  -- 5. Totais
  v_valor_total := COALESCE(v_fechamento.total_conta, 0);
  v_valor_desconto := COALESCE(v_fechamento.desconto_manual, 0);
  v_valor_produtos := v_valor_total + v_valor_desconto;

  -- 6. Insere registro em public.notas_fiscais
  INSERT INTO public.notas_fiscais (
    fechamento_id,
    mesa_codigo,
    numero,
    serie,
    chave_acesso,
    protocolo,
    status,
    motivo_status,
    consumidor_cpf_cnpj,
    consumidor_nome,
    valor_produtos,
    valor_desconto,
    valor_total,
    formas_pagamento,
    itens,
    qr_code_url,
    danfe_url,
    xml_url,
    ambiente,
    provedor,
    payload_envio,
    resposta_provedor
  ) VALUES (
    p_fechamento_id,
    v_fechamento.mesa_codigo,
    v_proximo_numero,
    v_serie,
    v_chave,
    v_protocolo,
    p_status,
    p_motivo_status,
    v_cpf_cnpj_limpo,
    p_consumidor_nome,
    v_valor_produtos,
    v_valor_desconto,
    v_valor_total,
    COALESCE(p_formas_pagamento, '[]'::jsonb),
    COALESCE(p_itens, '[]'::jsonb),
    COALESCE(p_qr_code_url, 'https://dfe-portal.svrs.rs.gov.br/nfce/qrCode?p=' || v_chave || '|2|1|1|' || MD5(v_chave)),
    p_danfe_url,
    p_xml_url,
    COALESCE(p_ambiente, 'homologacao'),
    COALESCE(p_provedor, 'sandbox'),
    p_payload_envio,
    p_resposta_provedor
  ) RETURNING * INTO v_nova_nota;

  RETURN jsonb_build_object(
    'sucesso', true,
    'ja_emitida', false,
    'nota', row_to_json(v_nova_nota)
  );
END;
$$;

-- 8. RPC: cancelar_nfce
-- Cancelamento com exigência de permissão/PIN de supervisor (CA08)
CREATE OR REPLACE FUNCTION public.cancelar_nfce(
  p_nota_id UUID,
  p_motivo TEXT,
  p_pin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nota RECORD;
  v_user_role TEXT := public.get_user_role();
  v_tem_permissao BOOLEAN := false;
  v_operador_nome TEXT := 'Supervisor';
  v_pin_valido RECORD;
BEGIN
  SELECT * INTO v_nota
  FROM public.notas_fiscais
  WHERE id = p_nota_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota fiscal % não encontrada.', p_nota_id;
  END IF;

  IF v_nota.status = 'cancelada' THEN
    RETURN jsonb_build_object('sucesso', true, 'nota_id', p_nota_id, 'status', 'cancelada', 'ja_cancelada', true);
  END IF;

  IF v_nota.status != 'autorizada' AND v_nota.status != 'contingencia' THEN
    RAISE EXCEPTION 'Apenas notas autorizadas ou em contingência podem ser canceladas. Status atual: %', v_nota.status;
  END IF;

  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 15 THEN
    RAISE EXCEPTION 'O motivo de cancelamento deve conter no mínimo 15 caracteres conforme exigência fiscal.';
  END IF;

  -- Verificação de autorização (CA08): perfil admin/gerente, ou validação de PIN de supervisor
  IF v_user_role IN ('admin', 'gerente') OR public.tem_permissao('admin.geral') THEN
    v_tem_permissao := true;
  ELSIF p_pin IS NOT NULL AND LENGTH(TRIM(p_pin)) >= 4 THEN
    BEGIN
      SELECT p.id, p.nome INTO v_pin_valido
      FROM public.perfis p
      WHERE p.pin_hash = public.fn_hash_pin(p_pin)
        AND p.ativo = true
        AND (p.cargo_id IN (SELECT id FROM public.cargos WHERE nome ILIKE '%admin%' OR nome ILIKE '%gerente%' OR nome ILIKE '%superv%')
             OR p.nome ILIKE '%admin%');

      IF FOUND THEN
        v_tem_permissao := true;
        v_operador_nome := v_pin_valido.nome;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_tem_permissao := false;
    END;
  END IF;

  IF NOT v_tem_permissao THEN
    RAISE EXCEPTION 'Permissão negada para cancelamento de nota fiscal. PIN de supervisor ou perfil administrativo obrigatório.';
  END IF;

  UPDATE public.notas_fiscais
  SET status = 'cancelada',
      motivo_cancelamento = p_motivo,
      cancelada_em = timezone('America/Sao_Paulo', now()),
      cancelada_por = auth.uid(),
      cancelada_por_nome = v_operador_nome,
      updated_at = timezone('America/Sao_Paulo', now())
  WHERE id = p_nota_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'nota_id', p_nota_id,
    'status', 'cancelada',
    'cancelada_em', timezone('America/Sao_Paulo', now()),
    'cancelada_por_nome', v_operador_nome
  );
END;
$$;

-- 9. RPC: listar_notas_fiscais
-- Listagem e totais para o relatório mensal fiscal (CA10)
CREATE OR REPLACE FUNCTION public.listar_notas_fiscais(
  p_ano_mes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notas JSONB := '[]'::jsonb;
  v_resumo RECORD;
  v_filtro_mes TEXT := p_ano_mes;
BEGIN
  IF v_filtro_mes IS NULL OR v_filtro_mes = '' THEN
    v_filtro_mes := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');
  END IF;

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE status = 'autorizada'), 0) AS total_autorizadas,
    COALESCE(SUM(valor_total) FILTER (WHERE status = 'autorizada'), 0) AS valor_total_autorizado,
    COALESCE(COUNT(*) FILTER (WHERE status = 'cancelada'), 0) AS total_canceladas,
    COALESCE(SUM(valor_total) FILTER (WHERE status = 'cancelada'), 0) AS valor_total_cancelado,
    COALESCE(COUNT(*) FILTER (WHERE status = 'rejeitada'), 0) AS total_rejeitadas,
    COALESCE(COUNT(*) FILTER (WHERE status = 'pendente'), 0) AS total_pendentes,
    COALESCE(COUNT(*) FILTER (WHERE status = 'contingencia'), 0) AS total_contingencia,
    COALESCE(COUNT(*), 0) AS total_geral
  INTO v_resumo
  FROM public.notas_fiscais
  WHERE to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = v_filtro_mes;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'fechamento_id', n.fechamento_id,
      'mesa_codigo', n.mesa_codigo,
      'numero', n.numero,
      'serie', n.serie,
      'chave_acesso', n.chave_acesso,
      'protocolo', n.protocolo,
      'status', n.status,
      'motivo_status', n.motivo_status,
      'consumidor_cpf_cnpj', n.consumidor_cpf_cnpj,
      'consumidor_nome', n.consumidor_nome,
      'valor_total', n.valor_total,
      'valor_desconto', n.valor_desconto,
      'formas_pagamento', n.formas_pagamento,
      'qr_code_url', n.qr_code_url,
      'danfe_url', n.danfe_url,
      'xml_url', n.xml_url,
      'ambiente', n.ambiente,
      'created_at', n.created_at,
      'cancelada_em', n.cancelada_em,
      'motivo_cancelamento', n.motivo_cancelamento
    ) ORDER BY n.numero DESC
  ) INTO v_notas
  FROM public.notas_fiscais n
  WHERE to_char(n.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = v_filtro_mes
    AND (p_status IS NULL OR p_status = '' OR n.status = p_status);

  RETURN jsonb_build_object(
    'periodo', v_filtro_mes,
    'resumo', row_to_json(v_resumo),
    'notas', COALESCE(v_notas, '[]'::jsonb)
  );
END;
$$;

-- 10. Concessão de permissões
REVOKE ALL ON FUNCTION public.obter_dados_fiscais_fechamento FROM anon, public;
REVOKE ALL ON FUNCTION public.registrar_emissao_nfce FROM anon, public;
REVOKE ALL ON FUNCTION public.cancelar_nfce FROM anon, public;
REVOKE ALL ON FUNCTION public.listar_notas_fiscais FROM anon, public;

GRANT EXECUTE ON FUNCTION public.obter_dados_fiscais_fechamento(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_emissao_nfce(UUID, TEXT, TEXT, JSONB, JSONB, TEXT, BIGINT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_nfce(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_notas_fiscais(TEXT, TEXT) TO authenticated;

COMMIT;
