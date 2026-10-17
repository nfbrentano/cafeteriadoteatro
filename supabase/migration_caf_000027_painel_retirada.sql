-- ==============================================================================
-- CAF-000027: View Pública Mínima para Painel de Senhas / TV de Retirada
-- ==============================================================================

-- 1. Criação da View v_painel_retirada
-- Projeção segura contendo apenas dados essenciais para o painel de senhas do salão.
-- Zero dados sensíveis expostos (sem preços, sem itens, sem sobrenome, sem dados fiscais).

CREATE OR REPLACE VIEW v_painel_retirada WITH (security_invoker = false) AS
SELECT 
  id,
  numero_pedido,
  split_part(trim(coalesce(cliente_nome, '')), ' ', 1) AS primeiro_nome,
  status,
  pronto_em,
  concluido_em,
  para_viagem,
  mesa_codigo,
  created_at
FROM pedidos
WHERE created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
  AND status IN ('pendente', 'em_preparo', 'concluido');

-- 2. Permissão de leitura para anon (TV pública sem login) e authenticated
GRANT SELECT ON v_painel_retirada TO anon, authenticated;

COMMENT ON VIEW v_painel_retirada IS 'View pública e sanitizada (LGPD) para o Painel de Senhas/TV de Retirada no salão (CAF-000027)';
