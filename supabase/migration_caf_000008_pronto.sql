-- migration_caf_000008_pronto.sql
-- Adiciona coluna para controle de preparo item a item

-- Adicionar a coluna pronto_em
ALTER TABLE pedido_itens ADD COLUMN pronto_em TIMESTAMPTZ DEFAULT NULL;

-- Permitir que a cozinha (e admin) possa atualizar o status dos itens
DROP POLICY IF EXISTS "Permitir update em pedido_itens para admin/cozinha" ON pedido_itens;
CREATE POLICY "Permitir update em pedido_itens para admin/cozinha" ON pedido_itens
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM perfis 
    WHERE id = auth.uid() 
    AND (role = 'admin' OR role = 'cozinha')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM perfis 
    WHERE id = auth.uid() 
    AND (role = 'admin' OR role = 'cozinha')
  )
);
