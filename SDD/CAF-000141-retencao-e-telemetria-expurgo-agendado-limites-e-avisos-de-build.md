# [CHORE] Retenção e telemetria: expurgo agendado, limites de payload, contador via service role e avisos de lint/build

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Apagar automaticamente dados técnicos antigos, limitar o que qualquer visitante consegue gravar na telemetria, contar só visitas reais do site e zerar os avisos de lint e build para que avisos novos não passem despercebidos.
- **Problema e evidência:**
  - Telemetria de erros: `registrar_erro_cliente` é `SECURITY DEFINER` executável por `anon` (`supabase/migration_caf_000115_erros_cliente.sql:232`); corta mensagem e stack (`:71-72`), mas grava `p_metadados` inteiro (`:109`, `COALESCE(p_metadados, '{}'::jsonb)`), e o único limite de frequência está no navegador (`js/utils/error-reporter.js:224-228`), que um script ignora. O expurgo `limpar_erros_antigos` só roda quando um admin clica no botão (`js/admin/erros-admin.js:192` → `js/db.js:2072-2083`) e exige cargo admin (`supabase/migration_caf_000115_erros_cliente.sql:219`), então nem um agendamento com service role conseguiria usá-lo. Não há pg_cron no repositório.
  - Acessos: `db.acessos.registrar()` grava uma linha por carga de página e só exclui `admin.html` (`js/db.js:635-656`); é chamado automaticamente em toda página que carrega `js/db.js` (`js/db.js:2098-2102`), o que inclui o PDV (`pedidos.html`) e o totem (`totem.html`). Cada recarga do PDV ou do totem conta como visita do site. A tabela `acessos` nunca é expurgada.
  - Contador: a policy `contador_update_public` permite UPDATE por `anon` em qualquer linha (`supabase/migration_caf_000107_hardening_supabase_advisors.sql:151`) e há `GRANT SELECT, INSERT, UPDATE ... TO anon` (`:155`), embora o front só leia `contador` (`js/db.js:660-684`). O workflow diário chama a RPC com a chave anon, aceita até de `vars` (`.github/workflows/contador_diario.yml:19,29-30`), o que deixa de funcionar quando a CAF-000126 revogar `anon`.
  - Avisos: `npm run lint` termina com 19 warnings `no-unused-vars` (ex.: `js/db.js:193` `uploadData`, `js/retirada.js:342` `channel`, `js/retirada.js:370` `pollingIntervalId`, `js/totem.js:1110` `subtotalPedido`, `js/utils/receipt-formatter.js:25` `clienteTelefone`) e o CI aceita (`.github/workflows/deploy.yml:52`). `npm run build` avisa `COMMONJS_VARIABLE_IN_ESM` por `module.exports` em módulo ES (`js/admin/caixa-admin.js:996-997`). `js/pix-brcode.js`, que monta o QR de cobrança, está fora da cobertura (`vitest.config.js:30`). O vitest sugere `pool: 'vmThreads'` ao final da suíte (130 arquivos, 948 testes, 11 s em 2026-11-20).
- **Impacto de não fazer:** Banco cresce sem limite com dados sem valor; qualquer pessoa pode encher `erros_cliente` com JSON grande; métrica de visitas inflada pela operação; qualquer visitante pode alterar o histórico do contador; avisos reais somem no meio de 19 conhecidos.
- **Para quem é destinado:** Dono/gerente (métricas confiáveis) e dev (manutenção).
- **História de usuário:** Como dono, quero que o número de visitas do site conte só clientes, para saber se a divulgação está funcionando.
- **Como saberemos que deu certo:** 0 linhas em `erros_cliente` com mais de 30 dias e em `acessos` com mais de 90 dias; 0 visitas registradas por PDV/totem; `npm run lint` com 0 warnings e build sem `COMMONJS_VARIABLE_IN_ESM`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Função `expurgar_dados_antigos()` executável só por `service_role`/`postgres`: apaga `erros_cliente` > 30 dias e `acessos` > 90 dias **somente** de dias já consolidados em `contador` | P0 | CA01, CA02, CA03 |
| RF02 | Agendamento diário do expurgo e da consolidação: pg_cron, se disponível no plano; senão workflow agendado com service role | P0 | CA04 |
| RF03 | `registrar_erro_cliente` corta `p_metadados` acima de 4 KB (grava `{"truncado": true, "tamanho_original": N}`) | P0 | CA05 |
| RF04 | Limite no servidor: no máximo 30 registros por minuto por sessão (`p_metadados->>'sessao'`) e 120 por minuto no total; acima disso descarta sem erro | P1 | CA06 |
| RF05 | `acessos.registrar()` só grava em páginas de uma lista permitida (`/`, `/index.html`, `/cardapio.html`) | P0 | CA07, CA08 |
| RF06 | Remover INSERT/UPDATE de `anon` em `contador` (policy e GRANT); escrita só pela função de consolidação | P0 | CA09 |
| RF07 | `contador_diario.yml` usa `secrets.SUPABASE_SERVICE_ROLE_KEY`; README atualizado (onde criar o secret, quem tem acesso) | P1 | CA04, CA10 |
| RF08 | Zerar os 19 warnings e rodar `eslint js/ --max-warnings 0` no CI | P1 | CA11 |
| RF09 | Remover `module.exports` de `js/admin/caixa-admin.js` (testes passam a importar como módulo ES) | P1 | CA12 |
| RF10 | Incluir `js/pix-brcode.js` na cobertura com piso próprio de 90% de linhas | P1 | CA13 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Chave service role só em secret do GitHub; nunca no front, em `vars` ou em log | P0 | CA10 |
| RNF02 | Expurgo diário termina em < 30 s com 1 milhão de linhas em `acessos` (índice por `data_visita` e por `criado_em`) | P1 | CA01 |
| RNF03 | `registrar_erro_cliente` nunca devolve erro à tela, mesmo quando descarta (mantém a regra da CAF-000115) | P0 | CA05, CA06 |
| RNF04 | Nenhum IP é gravado em texto; se usado para limite, só hash com sal diário | P0 | CA06 |

### Dependências técnicas

- CAF-000138 (traz `consolidar_contador_dia_anterior` para o manifesto e o pgTAP que roda de verdade).
- CAF-000126 (revogação de `anon` nas RPCs), que quebra o workflow atual se esta atividade não vier antes ou junto.
- `js/db.js`, `js/utils/error-reporter.js`, `supabase/migration_caf_000115_erros_cliente.sql`, `.github/workflows/contador_diario.yml`, `vitest.config.js`, `eslint.config.js`.

### Recursos necessários

- Acesso ao painel da Supabase para conferir/ativar pg_cron e copiar a service role key para o secret do GitHub.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado erros com 31 e 29 dias, quando o expurgo roda, então só o de 31 dias é apagado.
- [ ] **CA02:** Dado acessos com 91 dias de um dia já consolidado em `contador`, quando o expurgo roda, então são apagados e o total do dia em `contador` não muda.
- [ ] **CA03:** Dado acessos com 91 dias de um dia **sem** linha em `contador`, quando o expurgo roda, então não são apagados (caso negativo).
- [ ] **CA04:** Dado o agendamento configurado, quando chega 00:10 de São Paulo, então consolidação e expurgo rodam e o resultado fica registrado (log do workflow ou `cron.job_run_details`).
- [ ] **CA05:** Dado `p_metadados` de 50 KB, quando `anon` chama `registrar_erro_cliente`, então a linha gravada tem metadados ≤ 4 KB com `truncado = true` e a chamada devolve sucesso.
- [ ] **CA06:** Dado 31 chamadas em 1 minuto com a mesma sessão, quando a 31ª chega, então ela não é gravada e a resposta não é erro.
- [ ] **CA07:** Dado o PDV ou o totem aberto, quando a página carrega, então nenhuma linha é inserida em `acessos`.
- [ ] **CA08:** Dado o cardápio aberto, quando a página carrega, então exatamente 1 linha é inserida com `pagina = '/cardapio.html'`.
- [ ] **CA09:** Dado o papel `anon`, quando tenta `UPDATE contador SET quantidade_acessos = 0`, então recebe erro de permissão.
- [ ] **CA10:** Dado o workflow do contador sem o secret da service role, quando roda, então falha com mensagem clara e não usa a chave anon.
- [ ] **CA11:** Dado um `no-unused-vars` novo, quando o CI roda o lint, então o job falha.
- [ ] **CA12:** Dado `npm run build`, quando termina, então não há aviso `COMMONJS_VARIABLE_IN_ESM` e os testes do caixa continuam passando.
- [ ] **CA13:** Dado `npm run test:coverage`, quando roda, então `js/pix-brcode.js` aparece no relatório e a suíte falha se ficar abaixo de 90% de linhas.

## O que a atividade não inclui

- Revogar `anon` das RPCs: motivo: CAF-000126.
- Expurgo de `log_auditoria`, pedidos ou dados financeiros: motivo: têm valor legal e fiscal; retenção depende de decisão do dono e da contabilidade.
- Política de privacidade e consentimento para a telemetria: motivo: CAF-000132.
- Trocar a telemetria própria por um serviço externo (Sentry etc.): motivo: custo e dados pessoais saindo do Supabase.

### Considerado para o futuro (P2)

- `pool: 'vmThreads'` no vitest, se a medição mostrar ganho real de tempo.
- Contagem de visitas por página e por origem (UTM) em tabela diária agregada.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O plano da Supabase tem pg_cron habilitável? Define RF02 (banco ou GitHub Actions) | dev | Não | |
| D02 | Prazos de retenção (30 dias erros, 90 dias acessos brutos) estão bons? | PO | Não | |
| D03 | Quem guarda a service role key e quem pode ver os secrets do repositório? | PO | Sim | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Expurgo de erros | pgTAP | CA01 | Semear 31 e 29 dias; rodar | Só 31 apagado |
| CT02 | Expurgo de acessos | pgTAP | CA02, CA03 | Dias com e sem `contador` | Apaga só consolidados |
| CT03 | Expurgo restrito | pgTAP (`has_function_privilege` para `anon`/`authenticated`) | CA01 | Conferir privilégio | Só `service_role` |
| CT04 | Agendamento | manual (Actions ou `cron.job_run_details`) | CA04 | Aguardar 1 execução | Registro de sucesso |
| CT05 | Metadados grandes | pgTAP (`SET ROLE anon`) | CA05 | Enviar 50 KB | ≤ 4 KB, `truncado` |
| CT06 | Limite por sessão | pgTAP | CA06 | 31 chamadas | 30 gravadas; sem erro |
| CT07 | Lista permitida | unit (`tests/caf-000141-*.test.js`, importa `js/db.js` com `location` simulado) | CA07, CA08 | `/pedidos.html`, `/totem.html`, `/cardapio.html` | 0, 0, 1 inserções |
| CT08 | Contador protegido | pgTAP (`SET ROLE anon`) | CA09 | UPDATE | `42501` |
| CT09 | Workflow sem secret | manual (workflow_dispatch) | CA10 | Rodar sem secret | Falha clara |
| CT10 | Lint e build | integração (CI) | CA11, CA12 | Rodar `lint` e `build` | 0 warnings; sem aviso CommonJS |
| CT11 | Cobertura do Pix | integração (`test:coverage`) | CA13 | Rodar | `pix-brcode.js` ≥ 90% |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000115_erros_cliente.sql`, `supabase/contador_rotina.sql`, `js/db.js`, `js/utils/error-reporter.js`, `.github/workflows/contador_diario.yml`, `vitest.config.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000107](CONCLUIDAS/CAF-000107-seguranca-supabase-advisors-policies-search-path-views.md), [CAF-000115](CONCLUIDAS/CAF-000115-observabilidade-erros-front-em-producao.md), [CAF-000119](CONCLUIDAS/CAF-000119-qualidade-eslint-e-cobertura-real-no-ci.md), [CAF-000122](CONCLUIDAS/CAF-000122-higiene-do-repositorio-ci-e-readme.md); novas: CAF-000126, CAF-000132, CAF-000138
- Referências de design: https://supabase.com/docs/guides/database/extensions/pg_cron
- Requisitos originais: auditoria de 2026-11-20
- Issue / PR relacionado: —
