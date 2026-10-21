# [CHORE] CAF-000086 — Infraestrutura de Testes, Cobertura e Teste de Contrato Front ↔ Schema

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Concluir o que ficou pendente da CAF-000071: script `test:coverage`, dependência `@vitest/coverage-v8` e thresholds de cobertura por arquivo no `vitest.config.js`.
  2. Criar um **harness de página** (`tests/helpers/page-harness.js`) que carrega um HTML do projeto (`pedidos.html`, `cozinha.html`, `admin.html`, `cardapio.html`, `totem.html`, `retirada.html`) no happy-dom, injeta o mock do Supabase em `window.cafeteriaSupabase`/`window.supabaseClient`/`window.supabase.createClient`, executa os scripts da página e expõe utilitários (`clicar`, `preencher`, `aguardarRender`, `rpcCalls`).
  3. Definir e aplicar a **regra de extração incremental**: lógica pura (cálculos, montagem de payload, filtros, formatação) usada pelas SDDs 001–060 sai de `js/pedidos.js`, `js/cozinha.js` e `js/admin/*.js` para módulos em `js/utils/` (ESM + exposição em `window.*` como os utils atuais), **sem mudar comportamento**. A extração ocorre sob demanda pelas SDDs 087–089.
  4. Reescrever `tests/core-flows.test.js` para importar código real do app (hoje recalcula a lógica dentro do próprio teste e não protege nada).
  5. Criar o **teste de contrato front ↔ schema** (`tests/contract/schema-contract.test.js`): um extrator estático percorre `js/**/*.js` e coleta toda chamada `.rpc('nome', { params })` e `.from('tabela')` com as colunas usadas em `select`, `insert`, `update`, `upsert`, `eq/order/filter`; o teste compara o resultado com `tests/fixtures/schema-snapshot.json` (funções com nomes de parâmetros, tabelas/views com colunas, check constraints relevantes) e com a API pública dos módulos `window.cafeteria*` (ex.: `cafeteriaPix.getPixConfig`).
  6. Criar o script `scripts/gerar-schema-snapshot.mjs` que converte o CSV do `supabase/diagnostico_schema_producao.sql` (baseline da CAF-000072) no `schema-snapshot.json`.
  7. Atualizar o `GEMINI.md`: (a) toda mudança de migration atualiza o snapshot; (b) teste que falha por bug conhecido usa `it.fails`/`it.todo` com referência à SDD de correção.
- **Problema e evidência:** a auditoria de 2026-10-20 encontrou **80 testes verdes** com bugs bloqueantes em produção, todos do tipo "front chama algo que não existe": `fechar_conta_mesa` chamada com `p_subtotal`/`p_desconto` quando o banco espera `p_desconto_manual` (js/pedidos.js:4870); `despesas.valor_total`/`data_pagamento`/`status` inexistentes (confirmado em produção, erro 42703); `estoque_itens.unidade_medida`/`saldo_atual` e `estoque_movimentos.data_validade` inexistentes; `cafeteriaPix.getPixConfig`/`gerarPayload` inexistentes (js/admin/settings.js:593, 618); `isCashbackActive(...).then` em função síncrona (js/cardapio-cliente-pedido.js:1049). `tests/core-flows.test.js` testa lógica escrita dentro do próprio teste. Não existe script de cobertura nem `@vitest/coverage-*` instalado.
- **Impacto de não fazer:** as SDDs 087–089 não têm onde se apoiar; continuaremos entregando SDDs "Concluídas" com integração quebrada e suíte verde.
- **Para quem é destinado:** Desenvolvedor / Agente de IA e PO (gate de qualidade).
- **História de usuário:** Como desenvolvedor, quero uma infraestrutura que teste o código real das páginas e acuse divergências entre o front e o schema do banco, para que nenhum deploy chegue em produção chamando colunas, parâmetros ou funções que não existem.
- **Como saberemos que deu certo:** reintroduzindo qualquer um dos 5 bugs da evidência num branch, `npm test` falha apontando arquivo:linha; `npm run test:coverage` gera relatório e aplica thresholds; `core-flows.test.js` importa apenas código de `js/`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Instalar `@vitest/coverage-v8` (mesma major do vitest), adicionar `"test:coverage": "vitest run --coverage"` e configurar `coverage.include: ['js/**/*.js']`, `exclude: ['js/libs/**']` e thresholds | P0 | CA01 |
| RF02 | Thresholds: global ≥ 40% linhas na entrega desta SDD; `js/utils/**` ≥ 90% linhas/85% branches; metas por arquivo crescentes definidas nas SDDs 087–089 (ratchet: threshold nunca diminui) | P0 | CA01, CA08 |
| RF03 | `tests/helpers/page-harness.js` carrega HTML + scripts locais em happy-dom, ignora CDNs, injeta mock Supabase e registra chamadas `rpc/from` para asserções | P0 | CA02 |
| RF04 | Estender `tests/helpers/supabase-mock.js`: `or`, `in`, `is`, `gte/lte`, `limit`, `range`, `maybeSingle`, `channel().on().subscribe()` com disparo manual de eventos realtime, respostas de erro configuráveis por RPC e **modo estrito** que rejeita RPC/coluna fora do snapshot (mesma mensagem do PostgREST: PGRST202 / 42703) | P0 | CA02, CA05 |
| RF05 | Extrator estático `tests/contract/extract-db-calls.js` (parse por AST, ex.: `acorn`/`espree` como devDependency) coleta `rpc` com chaves do objeto literal e `from(...)` com colunas dos métodos encadeados; chamadas dinâmicas não resolvíveis vão para uma lista de exceções explícita | P0 | CA03 |
| RF06 | `tests/contract/schema-contract.test.js` falha para: RPC inexistente; parâmetro enviado que a função não tem; tabela/coluna inexistente; valor literal fora de CHECK conhecido (ex.: `recorrencia='unica'`) | P0 | CA03, CA04 |
| RF07 | Teste de contrato da API global: para cada `window.cafeteria*.<fn>` chamado em `js/**`, o módulo que o define precisa exportá-lo; e chamada `.then` sobre função síncrona conhecida é sinalizada | P0 | CA04 |
| RF08 | `scripts/gerar-schema-snapshot.mjs` gera `tests/fixtures/schema-snapshot.json` a partir do CSV do diagnóstico (seções 1_funcao, 3_coluna, 6_check) | P0 | CA06 |
| RF09 | Reescrever `tests/core-flows.test.js` importando funções reais (totais/troco/desconto extraídos de pedidos.js, normalização de telefone do util existente) | P0 | CA07 |
| RF10 | Documentar no `GEMINI.md` e no `SDD/MODELO_ATIVIDADE.md` a regra de bug conhecido (`it.fails('… [CAF-0000NN]')`) e de atualização do snapshot em toda migration | P1 | CA08 |
| RF11 | Etapa de cobertura no `.github/workflows/deploy.yml` (`npm run test:coverage`) no lugar de `npm test`, publicando `coverage/` como artefato | P1 | CA09 |
| RF12 | Smoke E2E com Playwright contra `vite preview` e Supabase mockado por interceptação de rede | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhum teste acessa a rede ou o Supabase de produção; o harness bloqueia `fetch` externo e falha o teste se ocorrer | P0 | CA02 |
| RNF02 | `npm test` completo (incluindo contrato e harness de páginas) em < 30 s local e em CI | P0 | CA01 |
| RNF03 | Extrações para `js/utils` não alteram comportamento: diff de páginas restrito a substituir o corpo da função por chamada ao util; `npm run build` sem warnings novos | P0 | CA07 |
| RNF04 | Snapshot sem dados sensíveis (só nomes de objetos, tipos e constraints) | P0 | CA06 |

### Dependências técnicas

- CAF-000071 (Vitest, setup e mock existentes).
- CAF-000072 (baseline/diagnóstico do schema de produção) — fornece o CSV de origem do snapshot. Até lá, o snapshot pode ser gerado das migrations + sondagens já feitas, marcado como `"origem": "provisorio"`.
- `supabase/diagnostico_schema_producao.sql`.

### Recursos necessários

- Execução do diagnóstico no SQL Editor do Supabase (acesso do PO/admin).
- devDependencies: `@vitest/coverage-v8`, parser JS (`acorn` + `acorn-walk` ou `espree`).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o projeto instalado, quando `npm run test:coverage` for executado, então gera relatório text/html em `coverage/` e falha com código ≠ 0 se algum threshold configurado não for atingido.
- [ ] **CA02:** Dado o harness de página, quando um teste carrega `pedidos.html` com mock do Supabase, então os scripts da página inicializam sem erro, nenhuma requisição externa é feita e as chamadas `rpc/from` ficam registradas para asserção.
- [ ] **CA03:** Dado o código atual com `fechar_conta_mesa({ p_subtotal, p_desconto, ... })`, quando o teste de contrato roda contra o snapshot, então falha citando `js/pedidos.js` e os parâmetros inexistentes `p_subtotal`, `p_desconto`.
- [ ] **CA04:** Dado o código atual, quando o teste de contrato roda, então acusa também `despesas.valor_total`/`data_pagamento`/`status`, `estoque_itens.unidade_medida`/`saldo_atual`, `estoque_movimentos.data_validade`, `recorrencia='unica'` e `cafeteriaPix.getPixConfig`/`gerarPayload`. Enquanto as SDDs 073–079 não forem entregues, esses casos ficam registrados como `it.fails` com o ID da SDD de correção, e a suíte permanece verde.
- [ ] **CA05:** Dado o mock em modo estrito, quando um teste chama uma RPC com parâmetro fora do snapshot, então recebe erro `PGRST202` igual ao do PostgREST (caso negativo: chamadas válidas não geram erro).
- [ ] **CA06:** Dado um CSV do diagnóstico, quando `node scripts/gerar-schema-snapshot.mjs <csv>` roda, então produz `tests/fixtures/schema-snapshot.json` determinístico (mesma entrada → mesmo arquivo, chaves ordenadas).
- [ ] **CA07:** Dado o novo `core-flows.test.js`, quando se altera propositalmente o cálculo de troco em `js/utils/*`, então o teste falha (hoje não falharia).
- [ ] **CA08:** Dado um bug conhecido marcado com `it.fails('[CAF-000073] …')`, quando a correção é entregue e o comportamento passa a estar certo, então o `it.fails` passa a falhar, obrigando a converter para `it` (garante que o teste acompanhe a correção).
- [ ] **CA09:** Dado um push na `main`, quando o workflow de deploy roda, então executa a cobertura antes do build e bloqueia o deploy se teste ou threshold falhar.

## O que a atividade não inclui

- Escrever os testes de cada SDD funcional: motivo: escopo das SDDs 087–089 (e das demais de cobertura).
- Corrigir os bugs que o contrato encontrar: motivo: escopo das SDDs de correção 073–084.
- Testes de RLS/policies executados em Postgres real: motivo: exige banco de teste (Supabase local/CLI) ainda inexistente no projeto.

### Considerado para o futuro (P2)

- Supabase CLI local + pgTAP para testar RPCs, triggers e policies em banco real no CI.
- Smoke E2E Playwright (RF12).
- Job agendado que roda o diagnóstico contra produção e abre alerta quando o snapshot divergir.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Snapshot deve refletir produção (diagnóstico) ou as migrations do repositório? Recomendação: produção, até a CAF-000072 reconciliar os dois. | PO/dev | Sim | |
| D02 | Aceitamos devDependency de parser (acorn) só para o extrator? | dev | Não | |
| D03 | Threshold global inicial de 40% é aceitável para não bloquear deploys enquanto 087–089 avançam? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cobertura com threshold | integração | CA01 | Rodar `npm run test:coverage` com threshold acima do real | Exit code ≠ 0 e mensagem de threshold |
| CT02 | Harness carrega pedidos.html | integração (DOM) | CA02 | `loadPage('pedidos.html', { supabase: mock })` | Sem erros no console; `rpcCalls` vazio até interação |
| CT03 | Harness bloqueia rede | integração | CA02, RNF01 | Script faz `fetch('https://…')` | Teste falha com mensagem "rede bloqueada" |
| CT04 | Contrato acusa fechar_conta_mesa | contrato | CA03 | Rodar extrator no código atual | Divergência listada com arquivo:linha |
| CT05 | Contrato acusa colunas de despesas/estoque | contrato | CA04 | Idem | 7 divergências esperadas listadas |
| CT06 | Contrato acusa API global inexistente | contrato | CA04 | Idem | `getPixConfig` e `gerarPayload` listados |
| CT07 | Contrato sem falso positivo | contrato (negativo) | CA03 | Código com `criar_pedido({ p_payload })` | Nenhuma divergência |
| CT08 | Mock estrito | unit | CA05 | `rpc('fechar_conta_mesa', { p_x: 1 })` | Erro `PGRST202` |
| CT09 | Gerador de snapshot determinístico | unit | CA06 | Rodar 2× com mesmo CSV | Arquivos idênticos |
| CT10 | core-flows usa código real | unit | CA07 | Mutar util de troco | Teste falha |
| CT11 | it.fails acompanha correção | unit | CA08 | Corrigir o bug simulado | `it.fails` passa a falhar |

## URL Complementar

- Documentação técnica: `vitest.config.js`, `tests/setup.js`, `tests/helpers/supabase-mock.js`, `.github/workflows/deploy.yml`, `GEMINI.md`
- Discussões relacionadas: auditoria de SDDs de 2026-10-20 (sessão Claude Code); `supabase/diagnostico_schema_producao.sql`
- Requisitos originais: CAF-000071 (RF01 `test:coverage` e RF04 não entregues)
- Issue / PR relacionado: CAF-000072 (baseline de schema), CAF-000087, CAF-000088, CAF-000089
