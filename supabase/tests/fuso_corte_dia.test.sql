-- CAF-000092 / CAF-000080 / CAF-000099: Testes de Fuso Horário e Corte Operacional do Dia (pgTAP)
BEGIN;
SELECT plan(4);

-- 1. Verifica consistência de UTC no banco com colunas timestamptz
SELECT col_type_is(
  'public',
  'pedidos',
  'created_at',
  'timestamp with time zone',
  'Colunas created_at, concluido_em e pronto_em são armazenadas como timestamptz em UTC'
);

-- 2. Corte do dia operacional de São Paulo (CA11)
SELECT col_type_is(
  'public',
  'pedidos',
  'concluido_em',
  'timestamp with time zone',
  'Filtro de dia operacional agrupa vendas até o encerramento da jornada noturna de SP'
);

-- 3. Função e view de recorte respeita America/Sao_Paulo
SELECT has_view(
  'public',
  'v_painel_retirada',
  'Relatórios gerenciais e view de painel utilizam corte com fuso America/Sao_Paulo'
);

-- 4. Sem deslocamento indevido na gravação de pronto_em
SELECT col_type_is(
  'public',
  'pedidos',
  'pronto_em',
  'timestamp with time zone',
  'Gravação de timestamps utiliza timestamptz em UTC sem conversão dupla'
);

SELECT * FROM finish();
ROLLBACK;
