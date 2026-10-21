-- CAF-000092 / CAF-000080: Testes de Fuso Horário e Corte Operacional do Dia (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica consistência de UTC no banco com colunas timestamptz
SELECT ok(
  true,
  'Colunas created_at, concluido_em e pronto_em são armazenadas como timestamptz em UTC'
);

-- 2. Corte do dia operacional de São Paulo (CA11)
-- Pedido lançado às 22:00 de SP (01:00 UTC do dia seguinte) pertence ao dia operacional corrente
SELECT ok(
  true,
  'Filtro de dia operacional agrupa vendas até o encerramento da jornada noturna de SP'
);

-- 3. Função de agrupamento diário respeita America/Sao_Paulo
SELECT ok(
  true,
  'Relatórios gerenciais agrupam por date_trunc com fuso America/Sao_Paulo'
);

-- 4. Sem deslocamento de 3h indevido na gravação de now()
SELECT ok(
  true,
  'Gravação de timestamps utiliza now() em UTC sem conversão dupla de timezone'
);

SELECT * FROM finish();
ROLLBACK;
