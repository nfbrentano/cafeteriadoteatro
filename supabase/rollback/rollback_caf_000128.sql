-- Rollback CAF-000128: Integridade Monetária no Servidor

-- 1. Remove CHECK constraints
ALTER TABLE public.fechamentos DROP CONSTRAINT IF EXISTS chk_fechamentos_taxa_servico_positiva;
ALTER TABLE public.fechamentos DROP CONSTRAINT IF EXISTS chk_fechamentos_desconto_manual_positivo;
ALTER TABLE public.fechamento_pagamentos DROP CONSTRAINT IF EXISTS chk_fechamento_pagamentos_valor_positivo;
ALTER TABLE public.fechamento_pagamentos DROP CONSTRAINT IF EXISTS chk_fechamento_pagamentos_forma_valida;
ALTER TABLE public.pedido_itens DROP CONSTRAINT IF EXISTS chk_pedido_itens_quantidade_positiva;

-- 2. Remove tabela de tokens de autorização
DROP TABLE IF EXISTS public.autorizacoes_pin_tokens CASCADE;

-- 3. Remove registro da migration
DELETE FROM public.app_migrations WHERE versao = '128';
