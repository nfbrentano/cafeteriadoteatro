-- =========================================================
-- ROTINA DE CONTAGEM DIÁRIA DE ACESSOS NO SUPABASE
-- 1. Tabela 'acessos' (registra cada visita no site)
-- 2. Tabela 'contador' (registra data de ontem, acessos e seq)
-- 3. Função de consolidação 'consolidar_contador_dia_anterior'
-- =========================================================

-- 1. Criar a tabela 'acessos' para registrar as visitas ao site
CREATE TABLE IF NOT EXISTS public.acessos (
    id BIGSERIAL PRIMARY KEY,
    pagina TEXT DEFAULT '/',
    data_visita DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('America/Sao_Paulo'::text, now())
);

-- Índices para buscas rápidas por data
CREATE INDEX IF NOT EXISTS idx_acessos_data_visita ON public.acessos(data_visita);

-- Habilitar RLS na tabela acessos
ALTER TABLE public.acessos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir inserção anônima de acessos"
ON public.acessos FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);

CREATE POLICY "Permitir leitura de acessos"
ON public.acessos FOR SELECT TO anon, authenticated, service_role USING (true);


-- 2. Criar a tabela 'contador' (resumo diário consolidado)
CREATE TABLE IF NOT EXISTS public.contador (
    id BIGSERIAL PRIMARY KEY,
    numero BIGINT NOT NULL,
    data_referencia DATE NOT NULL UNIQUE,
    quantidade_acessos BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('America/Sao_Paulo'::text, now())
);

-- Habilitar RLS na tabela contador
ALTER TABLE public.contador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública do contador"
ON public.contador FOR SELECT TO anon, authenticated, service_role USING (true);

CREATE POLICY "Permitir inserção e atualização no contador"
ON public.contador FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);


-- 3. Função que calcula acessos do dia anterior e insere o próximo número sequencial
CREATE OR REPLACE FUNCTION public.consolidar_contador_dia_anterior()
RETURNS public.contador
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    data_ontem DATE;
    total_acessos_ontem BIGINT;
    proximo_numero BIGINT;
    registro_contador public.contador;
BEGIN
    -- Calcula a data de ontem no fuso horário de Brasília
    data_ontem := ((now() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '1 day')::date;

    -- Conta o total de acessos registrados na tabela 'acessos' para a data de ontem
    SELECT COUNT(*) INTO total_acessos_ontem
    FROM public.acessos
    WHERE data_visita = data_ontem;

    -- Calcula o próximo número sequencial da tabela contador
    SELECT COALESCE(MAX(numero), 0) + 1 INTO proximo_numero
    FROM public.contador;

    -- Insere o registro consolidado (ou atualiza caso já tenha sido rodado no mesmo dia)
    INSERT INTO public.contador (numero, data_referencia, quantidade_acessos, created_at)
    VALUES (proximo_numero, data_ontem, total_acessos_ontem, timezone('America/Sao_Paulo'::text, now()))
    ON CONFLICT (data_referencia) 
    DO UPDATE SET 
        quantidade_acessos = EXCLUDED.quantidade_acessos,
        created_at = timezone('America/Sao_Paulo'::text, now())
    RETURNING * INTO registro_contador;

    RETURN registro_contador;
END;
$$;
