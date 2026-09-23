-- =========================================================
-- MIGRATION: CAF-000001 (Status Entregue)
-- =========================================================

-- Adiciona as colunas de controle de entrega
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregue_por UUID REFERENCES auth.users(id);

-- Para podermos atualizar a constraint de CHECK da coluna status, precisamos remover a antiga.
-- O PostgreSQL gera um nome automático (ex: pedidos_status_check), então vamos tentar removê-lo.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.pedidos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.pedidos DROP CONSTRAINT ' || quote_ident(constraint_name);
    END IF;
END $$;

-- Adiciona a nova constraint permitindo o status 'entregue'
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('pendente', 'em_preparo', 'concluido', 'entregue', 'cancelado'));
