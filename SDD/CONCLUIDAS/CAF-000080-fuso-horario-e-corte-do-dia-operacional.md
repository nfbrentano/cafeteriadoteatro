# [FIX] CAF-000080 — Fuso horário consistente (America/Sao_Paulo) e corte do dia operacional

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:**
  - Padronizar como o sistema grava e lê datas e horas: todo instante vai em `TIMESTAMPTZ` real (UTC), e "hoje" é sempre calculado no fuso `America/Sao_Paulo`.
  - Corrigir os pontos que hoje deslocam horários em 3 h ou cortam o dia no horário errado.
  - Fazer o PDV carregar só os pedidos operacionalmente ativos.
- **Problema e evidência:**
  1. **Gravação deslocada no banco.**
     - Várias migrations usam `timezone('America/Sao_Paulo', now())`, que devolve um `timestamp` **sem** fuso com o relógio de SP, como `DEFAULT` ou em `UPDATE` de colunas `TIMESTAMPTZ`. Exemplos:
       - `supabase/pedidos_schema.sql:11, 61, 108-109` (`created_at`/`updated_at` de `pedidos`, `pedido_itens` e outras);
       - `migration_caf_000027_conclusao_estacao.sql:330` (`concluido_em`);
       - `migration_caf_000028_itens_lancados_depois.sql:54-74, 106, 264` (`concluido_em`, `iniciado_em`, `updated_at`, `v_now`).
     - Ocorrências semelhantes nas migrations 019, 029, 031, 032, 036, 037, 038, 039, 040 e 069: 70+ ocorrências no total.
     - Se o `TimeZone` da sessão do Postgres for UTC (padrão do Supabase), esse valor é interpretado como UTC e fica **3 h no passado**.
  2. **Mistura com o front.** O JS grava instantes em UTC correto (`new Date().toISOString()`): `entregue_em`, `cancelado_em`, `impresso_em`, `concluido_em` em `js/cozinha.js:349, 447, 1854, 1914, 1955` e `js/admin/pedidos-admin.js:423`. Na mesma linha do tempo convivem valores corretos e valores deslocados em 3 h, o que distorce o tempo de preparo (CAF-000014/025) e o semáforo do KDS.
  3. **Corte do dia no servidor.** `CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'` em `migration_caf_000027_painel_retirada.sql:21` e `migration_caf_000038_pedido_online.sql:591`. `CURRENT_DATE` é a data **do servidor** (UTC). Das 21h às 23h59 de SP já é o dia seguinte em UTC, e o painel de senhas some com os pedidos da noite, justamente no horário de espetáculo.
  4. **Corte do dia no front.**
     - `js/cardapio-dynamic.js:32-34` monta um `Date` com o relógio de SP e chama `toISOString()`, que converte de novo para UTC. Após as 21h a "data de hoje" vira amanhã, e a aba Promos (CAF-000017) mostra ou esconde promoções erradas.
     - Mesmo padrão em `js/db.js:1170, 1176-1177, 1285` (vencidas e próximos 7 dias de despesas, data padrão de pagamento), em `js/admin/products.js:757, 867` e em `js/admin/relatorios-admin.js:228, 682, 698`.
  5. **Filtros do admin no fuso do navegador.**
     - `buildPedidosQuery` em `js/admin/pedidos-admin.js:145-165` usa `new Date(y, m, d, 0, 0, 0)`.
     - A exportação CSV (CAF-000016) usa `new Date(p.created_at).toLocaleString('pt-BR')` sem `timeZone` (`pedidos-admin.js:639`).
     - Um admin com o navegador em outro fuso exporta dias e horários errados.
  6. **PDV carrega o histórico inteiro (CAF-000003).** `loadActivePedidos` (`js/pedidos.js:2909-2922`) usa `.or(status.in.(pendente,em_preparo,aguardando_pagamento), status_pagamento.eq.pendente, status_pagamento.is.null, and(status.eq.concluido, created_at.gte.<inicio>))`. As condições `status_pagamento.eq.pendente` e `is.null` não têm limite de data nem excluem `cancelado`/`entregue`. Como `pendente` é o padrão, todo pedido que não passou pelo fechamento entra na lista, para sempre. O impacto piora enquanto o fechamento de conta estiver quebrado.
  - A função `window.getInicioDoDiaSaoPaulo` (`js/supabase-client.js:34-48`) já está correta e deve virar o helper único de "início do dia".
- **Impacto de não fazer:**
  - Relatórios de tempo de preparo e desempenho errados.
  - Painel de retirada vazio à noite.
  - Promoções do dia erradas após as 21h.
  - Despesas classificadas como vencidas um dia antes.
  - PDV cada vez mais lento por carregar todo o histórico.
- **Para quem é destinado:** Barista/caixa (PDV), cozinha (KDS), clientes (painel de senhas e cardápio) e gestor (relatórios e CSV).
- **História de usuário:** Como gestor, quero que todos os horários e o "dia de hoje" sigam o horário de Brasília em qualquer tela e relatório, para confiar nos tempos de preparo e ver as vendas no dia certo.
- **Como saberemos que deu certo:**
  - 0 ocorrências de `timezone('America/Sao_Paulo', now())` gravando em `TIMESTAMPTZ`.
  - Painel de retirada mostra os pedidos das 21h–23h59.
  - O PDV carrega no máximo os pedidos do dia mais os não fechados dos últimos 2 dias, menos de 200 linhas num dia normal.
  - Testes simulando 22h de SP passam.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Migration que troca `DEFAULT timezone('America/Sao_Paulo', now())` por `DEFAULT now()` em todas as colunas `TIMESTAMPTZ` e recria as funções que gravam `timezone(..., now())` em `TIMESTAMPTZ`, usando `now()` | P0 | CA01 |
| RF02 | Recortes de "hoje" no SQL usam `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'` (ou a função utilitária `fn_inicio_dia_sp()`), incluindo as views do painel de retirada (027/038) | P0 | CA02 |
| RF03 | Criar `js/utils/datas-sp.js` com `hojeSP()` (`YYYY-MM-DD`), `inicioDoDiaSP(data?)`, `fimDoDiaSP(data?)` e `formatarDataHoraSP(iso)` via `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'`, e substituir os usos de `toISOString().slice/split` para datas civis nos arquivos listados | P0 | CA03, CA04 |
| RF04 | Filtros de período e exportação CSV do admin usam os helpers de SP, independentemente do fuso do navegador | P0 | CA05 |
| RF05 | `loadActivePedidos` passa a carregar: (a) pedidos com status operacional ativo (`pendente`, `em_preparo`, `aguardando_pagamento`, `pronto`); (b) pedidos não pagos e não cancelados criados há no máximo N dias (padrão 2, configurável); (c) concluídos/entregues do dia de SP. Nunca cancelados antigos | P0 | CA06, CA07 |
| RF06 | Script de correção dos dados históricos: somar 3 h às colunas gravadas com o padrão errado, somente nas linhas e colunas afetadas, com backup prévio e relatório de linhas alteradas | P1 | CA08 |
| RF07 | Teste estático que falha se algum `.sql` novo usar `timezone('America/Sao_Paulo', now())` ou `CURRENT_DATE AT TIME ZONE` | P1 | CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Testes de data rodam com relógio simulado (`vi.setSystemTime`) e `TZ` do processo diferente de SP (ex.: `TZ=UTC` e `TZ=Asia/Tokyo`), garantindo independência do fuso da máquina | P0 | CA03, CA05 |
| RNF02 | Consulta de pedidos ativos do PDV com menos de 1 s e menos de 200 linhas em dia normal (medir antes e depois) | P0 | CA06 |
| RNF03 | Migrations idempotentes e reversíveis. A correção histórica (RF06) só roda com confirmação explícita e backup | P0 | CA08 |

### Dependências técnicas

- **CAF-000072**: baseline do schema de produção. Confirmar `current_setting('TimeZone')` (diagnóstico, seção `9_config`) e listar quais colunas e funções ativas usam o padrão errado (seção `2_corpo`).
- CAF-000073 — correção do fechamento de conta (`fechar_conta_mesa`): o filtro do PDV (RF05) depende de os pedidos voltarem a ser marcados como pagos.
- Arquivos afetados:
  - `js/supabase-client.js`, `js/pedidos.js`, `js/cardapio-dynamic.js`, `js/db.js`, `js/admin/pedidos-admin.js`, `js/admin/products.js`, `js/admin/relatorios-admin.js`, `js/cozinha.js`;
  - migrations listadas no problema.

### Recursos necessários

- Janela de manutenção curta para aplicar a migration e, se aprovado, a correção histórica.
- Backup do banco (Supabase → Database → Backups).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o servidor em UTC, quando um pedido é criado às 14:00 de SP, então `created_at` lido em SP mostra 14:00. Pedido marcado pronto às 14:12 pela RPC do KDS grava `concluido_em` às 14:12, e o tempo de preparo é 12 min.
- [ ] **CA02:** Dado que são 22:30 em SP, quando a TV do painel de retirada consulta a view, então os pedidos feitos desde 00:00 de SP aparecem (inclusive os das 21h–22h30).
- [ ] **CA03:** Dado que são 22:30 em SP de uma terça-feira, quando o cardápio monta a aba Promos, então são usadas as promoções de terça com vigência no dia de SP, não as de quarta.
- [ ] **CA04:** Dado que são 22:30 em SP de 20/10, quando a lista de despesas filtra "vencidas", então uma despesa com vencimento 20/10 **não** aparece como vencida.
- [ ] **CA05:** Dado um admin com o navegador em `Asia/Tokyo`, quando exporta o CSV de "hoje", então as linhas e os horários correspondem ao dia e ao horário de SP.
- [ ] **CA06:** Dado um banco com 5.000 pedidos antigos `status_pagamento = 'pendente'` de meses atrás, quando o PDV carrega, então nenhum deles vem na lista, e vêm apenas os ativos, os não pagos dos últimos N dias e os concluídos do dia.
- [ ] **CA07 (negativo):** Dado um pedido cancelado ontem com pagamento pendente, quando o PDV carrega, então ele não aparece.
- [ ] **CA08:** Dado o backup feito, quando o script de correção histórica roda em modo simulação, então lista quantas linhas e colunas seriam ajustadas. Em modo execução, os tempos de preparo históricos passam a bater com os valores gravados pelo JS.
- [ ] **CA09:** Dado um arquivo `.sql` novo contendo `timezone('America/Sao_Paulo', now())`, quando roda `npm test`, então o teste de lint de SQL falha apontando o arquivo.

## O que a atividade não inclui

- Suporte a múltiplos fusos/filiais: motivo: o sistema é de loja única. Multi-loja é um gap de paridade com SDD própria.
- Reescrever relatórios além da troca do recorte de datas: motivo: fora do escopo de correção.

### Considerado para o futuro (P2)

- Coluna de fuso por loja quando houver multi-loja.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual é o `TimeZone` da sessão em produção? (diagnóstico, seção 9). Se já for `America/Sao_Paulo`, o deslocamento não ocorre na gravação, mas a correção continua necessária para robustez | dev | Sim | |
| D02 | Os dados históricos devem ser corrigidos (RF06) ou só os novos? Relatórios passados mudariam | PO | Sim (para RF06) | |
| D03 | Qual janela N de dias para pedidos não pagos no PDV (padrão sugerido: 2)? Contas abertas de um dia para o outro existem? | PO | Não | |
| D04 | Expediente que passa da meia-noite (espetáculos): o "dia operacional" deve terminar às 00:00 ou em outro horário (ex.: 04:00)? | PO | Não | |

## Sugestões de casos de teste

Arquivo obrigatório: `tests/caf-000080-fuso-horario.test.js`. Ele testa os helpers reais de `js/utils/datas-sp.js` e também o código de aplicação que os consome:
- montagem da aba Promos de `js/cardapio-dynamic.js`;
- filtros e CSV de `js/admin/pedidos-admin.js`;
- query de `loadActivePedidos` de `js/pedidos.js`, verificando o filtro enviado ao `supabase-mock`.

Os testes usam `vi.setSystemTime` e rodam sob `TZ=UTC`. Os casos SQL ficam em `supabase/tests/caf-000080.sql`.

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Gravação de `created_at`/`concluido_em` | manual (SQL) | CA01 | Inserir e concluir pedido; ler `AT TIME ZONE 'America/Sao_Paulo'` | Horários de SP corretos |
| CT02 | View do painel às 22:30 | manual (SQL) | CA02 | Inserir pedido às 21:30 SP e consultar | Pedido presente |
| CT03 | Promos às 22:30 | integração (DOM + mock) | CA03 | Relógio às 01:30Z de quarta (22:30 de terça em SP) | Promos de terça |
| CT04 | Despesas vencidas às 22:30 | unit + integração | CA04 | Mesmo relógio, filtrar vencidas | Vencimento de hoje não aparece |
| CT05 | CSV com o navegador em Tóquio | integração | CA05 | `TZ=Asia/Tokyo`, exportar hoje | Datas e horas de SP |
| CT06 | Filtro do PDV | integração (mock) | CA06, CA07 | Mock com pedidos antigos, cancelados e de hoje | Só os esperados; filtro enviado sem `status_pagamento.eq.pendente` solto |
| CT07 | Correção histórica | manual (SQL) | CA08 | Rodar simulação e depois execução | Contagem e valores coerentes |
| CT08 | Lint de SQL | unit | CA09 | Arquivo fixture com o padrão proibido | Teste falha |

## URL Complementar

- Documentação técnica: `supabase/diagnostico_schema_producao.sql`, `js/supabase-client.js` (`getInicioDoDiaSaoPaulo`)
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs concluídas (2026-10-20)
- Referências de design: N/A
- Requisitos originais: CAF-000003, CAF-000014, CAF-000016, CAF-000017, CAF-000025, CAF-000027, CAF-000038
- Issue / PR relacionado: —
