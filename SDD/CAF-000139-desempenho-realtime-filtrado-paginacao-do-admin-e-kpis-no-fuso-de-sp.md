# [FIX] Desempenho: realtime filtrado no admin e no site, paginação do admin e KPIs no fuso de SP

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer cada tela ouvir só as tabelas que exibe e recarregar só o que mudou; paginar as listas do admin para que nada seja cortado em silêncio; calcular os indicadores do dia no fuso de São Paulo.
- **Problema e evidência:**
  - `subscribeToChanges` assina `postgres_changes` com `{ event: '*', schema: 'public' }`, sem tabela (`js/db.js:2087-2094`). É usado no admin (`js/admin/auth.js:74`, `subscribeToChanges(() => window.cafeteriaAdmin.loadData())`), na home (`js/home-dynamic.js:224`) e duas vezes no cardápio, porque `cardapio.html:397,399` carrega `js/cardapio-dynamic.js` (`:431`) e `js/cardapio.js` (`:176`), cada um com sua assinatura.
  - No repositório, a publicação `supabase_realtime` só tem `pedidos` e `pedido_itens` (`supabase/pedidos_schema.sql:181,188`), e a leitura dessas tabelas é só para `authenticated` (`supabase/pedidos_schema.sql:122,154`). Se produção estiver igual (D01): o site público nunca recebe mudança de catálogo, e o admin recebe **todo** pedido e item alterado.
  - Cada evento no admin chama `loadData()` (`js/admin/main.js:318-357`): 7 consultas em paralelo + estoque + fichas técnicas e, no fim, `refreshCurrentPage()` → `navigateTo(página ativa)` (`:360-363`), que re-renderiza a página e pode apagar um formulário em edição. A página Pedidos já tem canal próprio filtrado e com debounce (`js/admin/pedidos-admin.js:611-619`), então a assinatura global é redundante.
  - Listas sem limite (o PostgREST corta em 1000 linhas sem avisar): lista e CSV de pedidos usam `buildPedidosQuery()` com `select('*, pedido_itens(*, ...)')` e nenhum `.range()` (`js/admin/pedidos-admin.js:131-180`, usado em `:226,667,699`); período "todos" usa início em 2000 (`:178-180`). Relatório de clientes busca todos os pedidos dos clientes do período (`js/admin/relatorios-admin.js:537-542`); fallback de RFV carrega todos os pedidos com cliente (`js/admin/clientes-admin.js:360-364`); avaliações em "todos" não têm limite (`js/admin/avaliacoes-admin.js:39-48`).
  - KPI do dia usa a meia-noite do navegador: `hojeStart.setHours(0, 0, 0, 0)` (`js/admin/pedidos-admin.js:104-105`), enquanto a lista ao lado já usa `datasSP` (`:149-158`).
- **Impacto de não fazer:** No intervalo do espetáculo o admin aberto no caixa refaz ~9 consultas a cada item lançado, gasta cota do Supabase e pode perder o que o gerente digitava; relatórios e exportações com mais de 1000 linhas saem incompletos sem aviso; faturamento do dia errado em aparelho com fuso diferente.
- **Para quem é destinado:** Gerente/admin, e visitante do site (cardápio).
- **História de usuário:** Como gerente, quero editar produtos com o caixa movimentado sem a tela recarregar sozinha, e exportar todos os pedidos do mês sem perder linhas.
- **Como saberemos que deu certo:** ≤ 1 recarga de catálogo por mudança de catálogo; 0 recargas de catálogo no admin por pedido criado; nenhuma lista ou CSV do admin com corte silencioso em 1000 linhas.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Trocar `subscribeToChanges` por `assinarTabelas(tabelas, aoMudar, { debounceMs })`, um filtro `table` por tabela e debounce; remover a assinatura de schema inteiro | P0 | CA01, CA02 |
| RF02 | Cardápio e home: uma única assinatura por página, só das tabelas de catálogo (produtos, categorias, adicionais, promoções, horários, hero/configurações) | P0 | CA01, CA02 |
| RF03 | Admin: remover a assinatura global de `auth.js`; cada página assina só o que usa e recarrega apenas a coleção afetada (`appData.produtos`, `appData.categorias` ...) | P0 | CA03, CA05 |
| RF04 | Com formulário ou modal aberto, a atualização não re-renderiza a página: mostra aviso "Dados atualizados — recarregar" | P0 | CA04 |
| RF05 | Lista de pedidos do admin paginada (`.range()` + `count: 'exact'`, 50 por página) com total visível | P0 | CA06, CA10 |
| RF06 | Exportação CSV em lotes de 1000 até o total, com aviso do total antes de começar e progresso | P1 | CA07 |
| RF07 | Relatório de clientes e fallback de RFV calculados por RPC agregada (primeiro pedido, frequência, valor) em vez de trazer pedidos brutos; avaliações paginadas | P1 | CA08 |
| RF08 | KPIs do dia a partir de `datasSP.inicioDoDiaSP(datasSP.hojeSP())` | P0 | CA09 |
| RF09 | Migration idempotente que adiciona as tabelas de catálogo à publicação `supabase_realtime`, se D01/D02 confirmarem a necessidade | P1 | CA11 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Rajada de 5 eventos de catálogo em 1 s gera no máximo 1 recarga (debounce ≥ 1 s) | P0 | CA02 |
| RNF02 | No máximo 1 canal realtime aberto por página pública | P0 | CA01 |
| RNF03 | Primeira página da lista de pedidos traz no máximo 50 pedidos | P0 | CA06 |
| RNF04 | Nenhuma consulta de listagem do admin sem limite explícito ou sem aviso quando o total passa do retornado | P1 | CA06, CA07, CA08 |

### Dependências técnicas

- `js/db.js`, `js/admin/main.js`, `js/admin/auth.js`, `js/admin/pedidos-admin.js`, `js/admin/relatorios-admin.js`, `js/admin/clientes-admin.js`, `js/admin/avaliacoes-admin.js`, `js/home-dynamic.js`, `js/cardapio.js`, `js/cardapio-dynamic.js`, `js/utils/datas-sp.js`.
- Diagnóstico ampliado da publicação realtime (CAF-000138, RF07).

### Recursos necessários

- Acesso ao SQL Editor de produção para listar `pg_publication_tables`.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o cardápio aberto, quando um pedido é criado ou alterado, então nenhuma consulta de catálogo é disparada e há no máximo 1 canal realtime na página.
- [ ] **CA02:** Dado o cardápio aberto, quando o admin altera um produto gerando 5 eventos em 1 s, então o catálogo é recarregado exatamente 1 vez.
- [ ] **CA03:** Dado o admin na página Produtos, quando um pedido é criado, então `loadData` não é chamado e nenhuma consulta de catálogo sai.
- [ ] **CA04:** Dado o formulário de produto aberto com texto digitado, quando outra pessoa altera uma categoria, então o formulário e o texto permanecem e aparece o aviso "Dados atualizados — recarregar".
- [ ] **CA05:** Dado o admin na página Pedidos, quando um pedido é criado, então só a lista de pedidos é recarregada (uma vez, pelo canal próprio).
- [ ] **CA06:** Dado 2.500 pedidos no período "todos", quando abro a lista, então vejo 50, o total "2.500" e consigo navegar até a última página.
- [ ] **CA07:** Dado 2.500 pedidos no filtro, quando exporto CSV, então vejo o aviso com o total e o arquivo tem 2.500 linhas de dados.
- [ ] **CA08:** Dado 1.500 clientes com pedidos no período, quando abro o relatório de clientes, então a "primeira compra" está preenchida para os 1.500.
- [ ] **CA09:** Dado o navegador em UTC e 22h30 em São Paulo, quando abro os KPIs, então o faturamento soma só pedidos desde 00:00 de São Paulo.
- [ ] **CA10:** Dado erro na consulta paginada, quando a lista carrega, então aparece mensagem de erro e não "0 pedidos" (caso negativo).
- [ ] **CA11:** Dado a migration de publicação aplicada, quando consulto `pg_publication_tables`, então as tabelas de catálogo estão lá e aplicar de novo não dá erro.

## O que a atividade não inclui

- Realtime do PDV, KDS e retirada: motivo: canais próprios tratados em CAF-000133 e CAF-000134.
- Mudar RLS de `pedidos` para leitura pública: motivo: risco de expor dados de clientes; o site não precisa de pedidos.
- Realtime Broadcast no lugar de `postgres_changes`: motivo: complexo demais agora.
- Unificar `window.supabaseClient` e `window.cafeteriaSupabase` (usados em `avaliacoes-admin.js`): motivo: CAF-000137.

### Considerado para o futuro (P2)

- Cache por coleção com versão (ETag) para evitar recarga quando nada mudou.
- Paginação por cursor (`created_at`, `id`) quando o volume passar de dezenas de milhares.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Quais tabelas estão na publicação `supabase_realtime` em produção? | dev | Sim (para RF09) | |
| D02 | O site público precisa refletir mudança de catálogo ao vivo, ou basta atualizar ao voltar o foco/recarregar? | PO | Não | |
| D03 | 50 pedidos por página atende ao uso do gerente? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Evento de pedido no cardápio | integração (happy-dom, cliente Supabase simulado que emite eventos) | CA01 | Emitir evento `pedidos` | 0 consultas de catálogo; 1 canal |
| CT02 | Rajada de catálogo | unit (timers falsos) | CA02 | 5 eventos `produtos` em 1 s | 1 recarga |
| CT03 | Admin em Produtos | integração | CA03 | Emitir evento `pedidos` | `loadData` não chamado |
| CT04 | Formulário preservado | integração (DOM) | CA04 | Digitar no formulário; emitir `categorias` | Texto mantido; aviso visível |
| CT05 | Página Pedidos | integração | CA05 | Emitir evento `pedidos` | Só lista recarrega |
| CT06 | Paginação | integração (mock com 2.500 linhas e `count`) | CA06, CA10 | Abrir lista; simular erro | 50 + total; erro visível |
| CT07 | CSV em lotes | integração | CA07 | Exportar | 3 lotes; 2.500 linhas |
| CT08 | RPC de clientes | pgTAP | CA08 | 1.500 clientes semeados | 1.500 linhas com primeira compra |
| CT09 | Fuso | unit (`TZ=UTC`, relógio fixo) | CA09 | Calcular início do dia | 03:00Z do dia de SP |
| CT10 | Publicação | pgTAP | CA11 | Aplicar 2 vezes; consultar catálogo | Tabelas presentes; sem erro |
| CT11 | Pico real | manual | CA03, CA05 | Admin aberto durante intervalo; DevTools > Rede | Sem rajada de consultas de catálogo |

## URL Complementar

- Documentação técnica: `js/db.js`, `js/admin/main.js`, `js/admin/pedidos-admin.js`, `js/utils/datas-sp.js`, `supabase/pedidos_schema.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000080](CONCLUIDAS/CAF-000080-fuso-horario-e-corte-do-dia-operacional.md), [CAF-000089](CONCLUIDAS/CAF-000089-cobertura-de-testes-gestao-e-admin.md), [CAF-000121](CONCLUIDAS/CAF-000121-modularizacao-pdv-e-admin.md); novas: CAF-000133, CAF-000134, CAF-000137, CAF-000138
- Referências de design: —
- Requisitos originais: auditoria de 2026-11-20
- Issue / PR relacionado: —
