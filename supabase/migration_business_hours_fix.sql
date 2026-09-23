CREATE TABLE IF NOT EXISTS public.business_hours (
    id SERIAL PRIMARY KEY,
    seg_qui_abre TEXT,
    seg_qui_fecha TEXT,
    sex_abre TEXT,
    sex_fecha TEXT,
    sab_dom_ativo BOOLEAN DEFAULT false,
    sab_dom_abre TEXT,
    sab_dom_fecha TEXT,
    aviso_especial TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS seg_qui_abre TEXT;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS seg_qui_fecha TEXT;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS sex_abre TEXT;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS sex_fecha TEXT;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS sab_dom_ativo BOOLEAN DEFAULT false;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS sab_dom_abre TEXT;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS sab_dom_fecha TEXT;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS aviso_especial TEXT;
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Permite acesso de leitura para todos
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_hours_select" ON public.business_hours;
CREATE POLICY "business_hours_select" ON public.business_hours FOR SELECT USING (true);

-- Permite update e insert para admin
DROP POLICY IF EXISTS "business_hours_admin" ON public.business_hours;
CREATE POLICY "business_hours_admin" ON public.business_hours FOR ALL USING (public.get_user_role() = 'admin');

-- Recarrega o cache (Importante)
NOTIFY pgrst, reload_schema;
