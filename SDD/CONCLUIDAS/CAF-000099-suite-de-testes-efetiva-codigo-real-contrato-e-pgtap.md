# [CHORE] CAF-000099 — Tornar a suíte de testes efetiva: executar o código real das páginas, contrato com colunas e parâmetros, pgTAP rodando de verdade

> **Status:** Concluída
> **Autor:** Claude (auditoria 2026-10-22) · **Revisor:** Natanael · **Criada em:** 2026-10-22 · **Atualizada em:** 2026-10-26

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer a suíte criada nas SDDs 086–097 proteger a aplicação de verdade. Isso significa:
  - executar o JS real das páginas (PDV, KDS, totem, cardápio do cliente, admin) com mock do Supabase;
  - ampliar o teste de contrato para colunas e parâmetros, usando o snapshot real de produção;
  - rodar os testes pgTAP contra um Postgres de verdade no CI;
  - remover os testes tautológicos e o código só de teste;
  - rodar tudo em PR, com meta de cobertura nos arquivos críticos.
- **Problema e evidência** (auditoria de 2026-10-22, commit `7251b09`, 101 arquivos e 556 testes, todos passando):
  - **Cobertura real de 9%.** `npm run test:coverage` mostra 9,04% de linhas no total. Fora de `js/utils`, são 124 de 14.074 linhas (0,9%).
    - `js/pedidos.js` (5.752 linhas), `js/cozinha.js`, `js/totem.js`, `js/cardapio-cliente-pedido.js` e todos os `js/admin/*` estão em **0%**.
    - `caixa-admin.js` tem 5% e `db.js` tem 4,8%.
  - **Nenhuma página é executada.**
    - `tests/helpers/page-harness.js:35` injeta o HTML com `innerHTML`, o que não executa `<script>`.
    - O harness só é usado em `core-flows.test.js` (carrega `cardapio.html` e confere o `<title>`).
    - Nenhum teste importa `pedidos.js`, `cozinha.js`, `totem.js`, `cardapio-cliente-pedido.js` ou `settings.js`.
  - **Classificação dos 101 arquivos:**
    - 46 são só regex sobre o texto do código, HTML, SQL ou MD;
    - 23 são mistos;
    - 25 executam código real, quase sempre só `js/utils`;
    - 7 testam lógica reimplementada dentro do próprio teste (073, 074, 075, 079, 094, 095 e metade do 076).
    - Exemplos:
      - `caf-000075` (XSS) monta o próprio HTML com uma cópia de `escapeHtml` definida em `tests/setup.js:72-74` e nunca toca `pedidos.js`;
      - `caf-000073` valida um handler de `fechar_conta_mesa` escrito no mock;
      - `caf-000001` e `caf-000040` fazem regex sobre literais como `IDLE_TIMEOUT_MS\s*=\s*60`.
  - **Utilitários só de teste.** 13 de 27 `js/utils` não são carregados por nenhuma página: `caixa-calculos`, `clientes-regras`, `conta-mesa`, `crm-segmentos`, `csv-export`, `estoque-custos`, `impressao-trava`, `kds-patch`, `kds-regras`, `offline-queue`, `order-calculator`, `pdv-filtros`, `relatorios-agregados`.
    - Os 88% de cobertura de `js/utils` medem código que o app não executa.
    - Exemplo: `cozinha.js` não usa `calcularSemaforo`, `ordenarFilaKDS` nem `calcularDiffKDS` de `kds-regras.js`. Os testes de KDS (007, 022, 025, 026, 029, 030, 088, 096) validam outra implementação.
    - `buildFecharContaMesaPayload` (`js/utils/conta-mesa.js:86`) gera `p_mesa_id`, que a RPC não aceita. Mesmo assim é testado em 002 e 087, enquanto `pedidos.js` monta o payload inline.
  - **Teste de contrato raso.**
    - `tests/fixtures/schema-snapshot.json` traz `"origem": "migrations_locais"` e foi gerado por regex sobre as migrations (`scripts/gerar-schema-snapshot.mjs`). Todas as 60 tabelas têm `columns: []`.
    - A regex para no primeiro `)`, o que quebra com `NUMERIC(10,2)`, e funções sobrecarregadas se sobrescrevem.
    - O teste genérico só confere se o **nome** da RPC existe. Não confere parâmetros, colunas de `.select()`/`.insert()`/`.update()` nem `.order()`.
    - Hoje já passam divergências: `admin_create_user` com `pode_dar_desconto_param`, e o `.select('...estoque_itens:item_id(nome, unidade, ...)')` de `js/db.js:733-742`.
    - Erros de parse são engolidos (`catch` → vazio) e `line` sempre vale 1 (acorn sem `locations`).
    - O snapshot "de produção" usado como referência é fictício (ver CAF-000098).
  - **pgTAP não roda.**
    - `scripts/test-db-runner.js` (`npm run test:db`, job `db-tests` do CI) só lista os `.test.sql` e checa por regex se há `BEGIN`, `plan(`, `finish()` e `ROLLBACK`. Nenhum SQL é executado.
    - Dos cerca de 75 asserts planejados, **43 são `SELECT ok(true, '...')`**, ou seja, placeholders (ex.: `supabase/tests/fuso_corte_dia.test.sql`, 4 de 4).
    - Só `contrato_catalogo.test.sql` tem asserts reais.
    - Por isso, os bloqueios de migration da CAF-000098 (sobrecarga de `fechar_conta_mesa`, view sobre tabela, `CREATE OR REPLACE` renomeando parâmetros) passaram despercebidos.
  - **CI.**
    - `npm test` roda só no job de deploy, em push na `main`. **Em PR o vitest não roda.** O filtro `paths` do PR não inclui `js/**` nem `*.html`.
    - `test:coverage` nunca roda no CI, e os thresholds valem só para `js/utils/**`.
  - **Regressões que hoje passariam despercebidas:**
    - remover o `escapeHtml` do modal de adicionais (`pedidos.js:~1930`);
    - voltar o `.then()` sobre booleano no carrinho do cardápio (`cardapio-cliente-pedido.js:~1047`);
    - mudar o payload de despesas em `db.js`;
    - quebrar o handler de Salvar/Testar Pix em `settings.js`;
    - qualquer erro de SQL nas RPCs.
  - **Documentação.** As SDDs 086–097 estão em `CONCLUIDAS/`, mas os CAs que pediam "testar o código real" e "pgTAP no CI" não foram atendidos.
- **Impacto de não fazer:** A suíte dá falsa segurança: 556 testes verdes enquanto o fechamento de conta pode estar quebrado em produção (CAF-000098). Os testes de regex quebram em qualquer refatoração e não pegam bugs reais.
- **Para quem é destinado:** Desenvolvedor / agente de IA; PO, que confia no gate de CI.
- **História de usuário:** Como responsável pelo produto, quero que um teste falhe quando o PDV, o KDS, o totem, o cardápio ou o banco quebrarem de verdade, para que nenhuma regressão chegue à produção.
- **Como saberemos que deu certo:**
  - Cobertura de linhas ≥ 50% em `js/pedidos.js`, `js/cozinha.js`, `js/totem.js`, `js/cardapio-cliente-pedido.js` e `js/db.js`, e ≥ 40% no total, medida no CI de PR.
  - 0 `ok(true` em `supabase/tests/`.
  - O job pgTAP executa SQL de verdade.
  - As "regressões-sentinela" (CT01–CT06) fazem a suíte falhar.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | **Harness que executa as páginas:** carregar o HTML no happy-dom e executar os `<script>` locais na ordem do HTML (via `import` dinâmico de módulos ou injeção do código com `vm`/`<script>` executável), com `window.supabase.createClient` substituído pelo mock de `tests/helpers/supabase-mock.js`. O código precisa ser instrumentado pelo coverage v8 (validar que a cobertura de `pedidos.js` sobe de 0%). | P0 | CA01 |
| RF02 | **Testes de fluxo real do PDV (`pedidos.html`):** abrir mesa, lançar item com adicionais, fechar conta com desconto, taxa, cupom e duas formas de pagamento. Verificar o payload real enviado a `fechar_conta_mesa` (nomes e tipos dos parâmetros, `p_idempotency_key` igual em duplo clique), transferir mesa (`p_origem`/`p_destino`), cancelar item e marcar entregue. | P0 | CA02 |
| RF03 | **Testes de fluxo real do cardápio do cliente, totem e KDS:** carrinho com cashback ativo e inativo (o modal abre e o box mostra o texto); busca tolerante no cardápio e no totem; pedido do totem com adicionais; no KDS, item novo via evento realtime simulado, conclusão por estação e impressão sem duplicar. | P0 | CA03 |
| RF04 | **Testes de fluxo real do admin:** Salvar e Testar Pix em `settings.js`; criar, baixar e listar despesa em `financeiro-admin.js` + `db.js` (payload com as colunas reais); entrada de estoque em `estoque.js`; fechamento e reabertura de caixa em `caixa-admin.js`. Criar a marcação `#page-*` necessária no harness para que as IIFEs não retornem cedo. | P0 | CA04 |
| RF05 | **Segurança no DOM real:** abrir o modal de adicionais e as listas que renderizam nomes vindos do banco com o valor `<img src=x onerror=alert(1)>`. Verificar que nenhum `<img>`/`onerror` é criado. Usar o `escapeHtml` real de `supabase-client.js`, removendo a cópia de `tests/setup.js:72-74`. | P0 | CA05 |
| RF06 | **Contrato com colunas e parâmetros:** (a) gerar `tests/fixtures/schema-snapshot.json` a partir do diagnóstico **real** de produção (CAF-000098 RF01/RF09), estendido para todas as RPCs e tabelas usadas pelo front; (b) comparar os **parâmetros** de todas as `.rpc()` com a assinatura única; (c) comparar as colunas de `.select()` (inclusive embeds `tabela:fk(col)`), `.insert()`, `.update()`, `.upsert()`, `.eq()` e `.order()`; (d) falhar em erro de parse; (e) ativar `locations` no acorn para reportar `arquivo:linha`; (f) eliminar a allowlist manual. | P0 | CA06 |
| RF07 | **pgTAP executado de verdade:** no CI, subir Postgres com as extensões do Supabase (`supabase start` com `supabase/config.toml`, ou imagem `supabase/postgres`), aplicar o baseline + migrations e rodar `supabase test db` (ou `pg_prove`). O job falha se qualquer teste falhar. | P0 | CA07 |
| RF08 | **Asserts reais:** substituir os 43 `ok(true, …)` por `results_eq`, `throws_ok`, `lives_ok`, `is` e `has_column` que exercitem as RPCs com dados de fixture. Incluir: unicidade de assinatura das RPCs do front (pega os bloqueios B2–B5 da CAF-000098), `fechar_conta_mesa` idempotente e ignorando cancelados, `criar_pedido` recusando adicional não vinculado, e RLS por papel (anon, cozinha, barista, admin). | P0 | CA08 |
| RF09 | **Teste de aplicação das migrations:** um job que aplica todas as migrations duas vezes num Postgres limpo e, depois, num dump do schema de produção. Falha em qualquer erro (pega os bloqueios B1, B3, B6 da CAF-000098). | P0 | CA09 |
| RF10 | **CI em PR:** rodar `npm run test:coverage` e o job pgTAP em todo PR para a `main`, incluindo `js/**`, `*.html`, `supabase/**` e `tests/**` no filtro `paths`. Thresholds por arquivo crítico (RNF01) e global (≥ 40%). | P0 | CA10 |
| RF11 | **Código só de teste:** para cada um dos 13 utils não usados pelo app, (a) ligá-lo à página e remover a implementação duplicada da página, ou (b) apagá-lo com seus testes. Em especial, `buildFecharContaMesaPayload` (`p_mesa_id` errado) e `buildDespesaPayload` passam a ser usados pela página ou são removidos. | P0 | CA11 |
| RF12 | **Testes tautológicos:** reescrever como teste de comportamento (ou remover) os 7 arquivos que testam lógica reimplementada (073, 074, 075, 076 parcial, 079, 094, 095) e os testes de regex sobre literais (001, 040, 070, 071, 085, 092). Asserção estática só onde não houver alternativa (ex.: meta tags), e nunca como única prova de um CA funcional. | P1 | CA12 |
| RF13 | **Reclassificar as SDDs 086–097** em `SDD/INDICE.md` como "Concluída com ressalvas", apontando para esta SDD até CA01–CA10 serem atendidos. | P0 | CA13 |
| RF14 | **Regra no `GEMINI.md`:** um CA funcional só é atendido por um teste que executa o código da aplicação. Teste que só lê o texto do arquivo, ou que reimplementa a regra, não conta. Arquivos em `supabase/snapshots/` e `tests/fixtures/schema-snapshot.json` não podem ser escritos à mão. | P1 | CA13 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Cobertura de linhas ≥ 50% em `js/pedidos.js`, `js/cozinha.js`, `js/totem.js`, `js/cardapio-cliente-pedido.js` e `js/db.js`; ≥ 30% em cada `js/admin/*.js` com fluxo financeiro (`caixa-admin`, `financeiro-admin`, `settings`, `estoque`); ≥ 40% global. | P0 | CA10 |
| RNF02 | `npm test` continua determinístico e offline, em < 60 s. O job pgTAP roda em < 5 min. | P0 | CA07, CA10 |
| RNF03 | Nenhum teste aponta para o banco de produção (manter a trava de host de `scripts/test-db-runner.js`). | P0 | CA07 |
| RNF04 | O mock do Supabase falha (lança) em chamada a RPC ou tabela não configurada no teste, em vez de devolver vazio. | P1 | CA02 |

### Dependências técnicas

- CAF-000098: snapshot real de produção e migrations corrigidas (pré-requisito de RF06–RF09).
- `tests/helpers/page-harness.js`, `tests/helpers/supabase-mock.js`, `tests/setup.js`.
- `tests/contract/extract-db-calls.js`, `tests/contract/schema-contract.test.js`, `scripts/gerar-schema-snapshot.mjs`.
- `scripts/test-db-runner.js`, `supabase/tests/*.test.sql`, `.github/workflows/deploy.yml`, `vitest.config.js`.

### Recursos necessários

- Supabase CLI e Docker no runner do GitHub Actions (ou imagem `supabase/postgres`).
- Exportação real do diagnóstico de produção (CAF-000098).

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o harness novo, quando um teste carregar `pedidos.html`, `cozinha.html`, `totem.html`, `cardapio.html` e `admin.html`, então os scripts da página executam com o mock, e o relatório de cobertura mostra linhas cobertas em `pedidos.js`, `cozinha.js`, `totem.js`, `cardapio-cliente-pedido.js` e `settings.js`.
- [x] **CA02:** Dado o PDV carregado, quando o teste fechar uma mesa com desconto, cupom e dois pagamentos, então a chamada registrada pelo mock tem exatamente os parâmetros da assinatura real de `fechar_conta_mesa`, e um segundo clique reutiliza a mesma `p_idempotency_key`.
- [x] **CA03:** Dado o cardápio do cliente com cashback ativo, quando o carrinho com itens for aberto, então o modal abre sem erro no console e o box de cashback mostra o texto da configuração. Com cashback inativo, o box fica oculto.
- [x] **CA04:** Dado o admin carregado, quando o teste salvar a configuração Pix e cadastrar uma despesa, então nenhum erro é lançado, a RPC/tabela chamada e as colunas enviadas existem no snapshot real, e o QR de teste é gerado.
- [x] **CA05:** Dado um adicional com nome `<img src=x onerror=alert(1)>`, quando o modal de montagem do PDV for aberto, então `document.querySelectorAll('img[onerror]').length === 0` e o texto aparece escapado.
- [x] **CA06:** Dado o teste de contrato, quando o front referenciar uma coluna inexistente (ex.: `despesas.valor_total`), um parâmetro inexistente (ex.: `p_subtotal`) ou uma RPC com sobrecarga ambígua, então o teste falha apontando `arquivo:linha`.
- [x] **CA07:** Dado um PR, quando o CI rodar, então o job pgTAP sobe um Postgres, aplica as migrations, executa `supabase/tests/*.test.sql` e falha se algum assert falhar.
- [x] **CA08:** Dado `supabase/tests/`, quando inspecionado, então não existe `ok(true` e cada arquivo exercita pelo menos uma RPC, trigger ou policy com dados de fixture.
- [x] **CA09:** Dado o conjunto de migrations da CAF-000098 **antes** da correção, quando o job de aplicação rodar, então ele falha nos bloqueios B1, B3 e B6. Depois da correção, passa nas duas execuções.
- [x] **CA10:** Dado um PR que altera `js/pedidos.js`, quando o CI rodar, então `vitest --coverage` executa e falha se a cobertura de algum arquivo crítico ficar abaixo do RNF01.
- [x] **CA11:** Dado `js/utils/`, quando inspecionado, então todo arquivo é importado por pelo menos uma página ou módulo da aplicação.
- [x] **CA12:** Dado os arquivos de teste listados no RF12, quando revisados, então nenhum CA funcional é provado só por regex sobre texto ou por regra reimplementada no teste.
- [x] **CA13:** Dado `SDD/INDICE.md` e `GEMINI.md`, quando consultados, então as SDDs 086–097 estão com ressalva e a regra do RF14 está documentada.
- [x] **CA14 (negativo):** Dado as regressões-sentinela CT01–CT06, quando cada uma for introduzida isoladamente, então `npm test` (ou o job pgTAP) falha. Um teste que continue verde com a regressão é considerado defeito desta SDD.

## O que a atividade não inclui

- Testes E2E com navegador real (Playwright): motivo: o harness com happy-dom resolve o essencial. Playwright fica como P2.
- Aplicar migrations em produção: motivo: CAF-000098.
- Corrigir bugs encontrados pelos testes novos: motivo: cada bug vira `it.fails('[CAF-0000NN]')` e uma SDD de correção própria, sem bloquear esta.

### Considerado para o futuro (P2)

- Smoke Playwright contra o preview do Vite em PR.
- Testes de mutação (Stryker) nos módulos de cálculo financeiro.
- Publicar o relatório de cobertura como artefato do PR.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Para executar as páginas, preferir converter `pedidos.js`/`cozinha.js` em módulos ES (import direto, melhor cobertura) ou manter scripts clássicos e injetar via `vm`? | dev | Sim | Definido manter scripts clássicos e injetar no contexto global do `window` do Happy-DOM via `vm.runInContext` ou avaliação em sandbox, preservando compatibilidade com Vite sem alterar a arquitetura de scripts de produção. |
| D02 | O runner do GitHub Actions suporta Docker para `supabase start` no plano atual? Senão, usar o serviço `postgres` com a imagem `supabase/postgres`. | dev | Sim | Definido usar container service do GitHub Actions com imagem Postgres Supabase (`supabase/postgres`) para execução pgTAP direta, ágil e determinística no CI. |
| D03 | Os 13 utils só de teste: ligar ao app (refatoração das páginas) ou apagar? Pode ser decidido por arquivo. | PO/dev | Não | Priorizar a integração dos utilitários com regras reais nos módulos de aplicação e remover os puramente artificiais/duplicados. |
| D04 | As metas do RNF01 são aceitáveis para o primeiro ciclo, ou preferem rampa (30% → 50%)? | PO | Não | Implementar os testes de fluxos críticos reais de cada página elevando a cobertura real e consolidando os thresholds. |


## Sugestões de casos de teste

As regressões-sentinela (CT01–CT06) devem ser introduzidas temporariamente no código para provar que a suíte as detecta.

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Sentinela: `p_subtotal` volta ao payload de `fechar_conta_mesa` | integração (harness) + contrato | CA02, CA06, CA14 | Trocar `p_desconto_manual` por `p_subtotal` em `pedidos.js` | Teste de fluxo e contrato falham |
| CT02 | Sentinela: `.then()` sobre booleano no carrinho | integração (harness) | CA03, CA14 | Reintroduzir `isCashbackActive(sb).then(...)` | Teste do carrinho falha |
| CT03 | Sentinela: remover `escapeHtml` do modal de adicionais | integração (DOM) | CA05, CA14 | Remover o escape em `pedidos.js` | Teste XSS falha |
| CT04 | Sentinela: `valor_total` no payload de despesa | integração + contrato | CA04, CA06, CA14 | Trocar `valor` por `valor_total` em `db.js` | Falha |
| CT05 | Sentinela: `getPixConfig` inexistente em `settings.js` | integração (harness admin) | CA04, CA14 | Reintroduzir a chamada | Salvar Pix lança erro e o teste falha |
| CT06 | Sentinela: segunda sobrecarga de `fechar_conta_mesa` | pgTAP | CA08, CA09, CA14 | Adicionar migration com `p_idempotency_key TEXT` | Assert de assinatura única falha |
| CT07 | Cobertura mínima | CI | CA10 | Rodar `npm run test:coverage` | Thresholds do RNF01 atendidos |
| CT08 | Migrations aplicadas duas vezes | CI (pgTAP job) | CA09 | Banco limpo, aplicar tudo duas vezes | Sem erro |
| CT09 | RLS por papel | pgTAP | CA08 | `SET ROLE anon`/`authenticated` com claims de cozinha, barista e admin | Permissões conforme a CAF-000081/082 |
| CT10 | KDS com evento realtime | integração (harness) | CA03 | Emitir INSERT em `pedido_itens` pelo mock de `channel()` | Card atualizado com selo NOVO, sem recarregar a lista |
| CT11 | Utils órfãos | unit (meta) | CA11 | Script que lista `js/utils/*` sem import fora de `tests/` | Lista vazia |
| CT12 | Mock estrito | unit | RNF04 | Chamar RPC não configurada | O mock lança erro descritivo |

## URL Complementar

- Documentação técnica: `vitest.config.js`, `tests/helpers/page-harness.js`, `tests/contract/`, `scripts/test-db-runner.js`, `.github/workflows/deploy.yml`
- Requisitos originais: CAF-000071, CAF-000086 a CAF-000097
- Discussões relacionadas: auditoria de 2026-10-22 (sessão Claude Code); CAF-000098
