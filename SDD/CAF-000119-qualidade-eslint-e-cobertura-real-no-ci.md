# [CHORE] Qualidade contínua: ESLint, cobertura medida sobre o código real das telas e limites mínimos no CI

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Colocar análise estática no projeto e fazer o número de cobertura representar o que os testes realmente executam, com um piso que o CI faz valer.
- **Problema e evidência:**
  - Não há ESLint, Prettier nem checagem de tipos (nenhum arquivo de configuração na raiz). Em 30 mil linhas de JS com variáveis globais entre arquivos (`window.*` atribuído 35 vezes só em `js/pedidos.js`), erros de nome e variável não declarada só aparecem em execução.
  - O relatório em `coverage/` (gerado em 2026-10-26) mostra 20,4% de linhas no total e **0%** em 23 arquivos, entre eles `js/admin/clientes-admin.js` (956 linhas), `js/admin/estoque.js` (532), `js/admin/products.js` (462), `js/admin/relatorios-admin.js` (376) e `js/retirada.js` (185); `js/db.js` aparece com 8%. Como existem suítes para essas áreas (CAF-000089, 000093, 000097), ou o harness executa o código de um jeito que o V8 não contabiliza, ou essas telas de fato não são exercitadas. Nos dois casos o número atual não serve para decidir nada.
  - `vitest.config.js` só define limite para `js/utils/**`; o CI (`deploy.yml`) roda `npm test`, sem cobertura.
- **Impacto de não fazer:** Regressões nas telas administrativas (caixa, financeiro, estoque) passam pelo CI; a regra do `GEMINI.md` de "testar código real" não tem como ser auditada.
- **Para quem é destinado:** Desenvolvedor.
- **História de usuário:** Como desenvolvedor, quero que o CI aponte erro estático e queda de cobertura, para não publicar uma tela quebrada.
- **Como saberemos que deu certo:** `npm run lint` com 0 erros no CI; cobertura das telas refletindo a execução do harness; piso por pasta configurado e nenhum arquivo de tela com 0%.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | ESLint (flat config) com regras de erro real: `no-undef`, `no-unused-vars`, `no-redeclare`, `no-implicit-globals` desligada por ora, globais do projeto declaradas | P0 | CA01 |
| RF02 | `npm run lint` roda no CI antes dos testes e bloqueia o deploy | P0 | CA02 |
| RF03 | Diagnóstico e correção do motivo de 0% nas telas: o harness (`tests/helpers/page-harness.js`) passa a carregar os arquivos de forma que a cobertura V8 os atribua ao arquivo de origem | P0 | CA03 |
| RF04 | Limites mínimos por pasta em `vitest.config.js` (`js/utils/**` mantém 85%; `js/admin/**` e arquivos de tela ganham piso definido a partir da medição corrigida) | P0 | CA04 |
| RF05 | CI roda `npm run test:coverage` e publica o resumo no job | P1 | CA05 |
| RF06 | Telas ainda sem nenhum teste após a medição corrigida ganham ao menos um teste de fumaça que carrega a página real | P1 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Lint completo em menos de 30 s | P1 | CA02 |
| RNF02 | Nenhuma mudança de comportamento: só correções apontadas pelo lint que sejam bugs reais; o resto vira aviso | P0 | CA01 |

### Dependências técnicas

- `tests/helpers/page-harness.js`, `vitest.config.js`, `.github/workflows/deploy.yml`.
- Antecede a CAF-000121 (a modularização precisa dessa rede de segurança).

### Recursos necessários

- Nenhum.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o repositório, quando rodo `npm run lint`, então termina com 0 erros (avisos permitidos e contados).
- [ ] **CA02:** Dado um PR com variável não declarada em `js/`, quando o CI roda, então o job falha antes dos testes.
- [ ] **CA03:** Dado um teste que carrega `admin.html` pelo harness e abre a aba Clientes, quando rodo a cobertura, então `js/admin/clientes-admin.js` aparece com cobertura maior que 0%.
- [ ] **CA04:** Dado um PR que derruba a cobertura de uma pasta abaixo do piso, quando o CI roda, então o job falha.
- [ ] **CA05:** Dado um push, quando o CI termina, então o resumo de cobertura aparece no job.
- [ ] **CA06:** Dado o relatório final, quando listo os arquivos de `js/` (fora das exclusões), então nenhum está com 0% de linhas.

## O que a atividade não inclui

- Migrar para TypeScript: motivo: complexo demais agora; ver P2.
- Prettier/reformatar todo o código: motivo: geraria um diff enorme sem ganho funcional.
- Corrigir todos os avisos do lint: motivo: baixo impacto; só erros bloqueiam.

### Considerado para o futuro (P2)

- Checagem de tipos via JSDoc + `tsc --checkJs` nos módulos de `js/utils/`.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual a causa do 0%: execução via `eval`/`new Function` no harness ou ausência de execução? Define o tamanho do RF03 | dev | Sim | |
| D02 | Qual o piso inicial para `js/admin/**` (sugestão: valor medido menos 2 pontos, subindo a cada SDD)? | dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Lint limpo | integração (CI) | CA01, CA02 | Rodar `npm run lint` | 0 erros |
| CT02 | Lint pega global não declarada | unit (ESLint API sobre fixture) | CA02 | Fixture com variável não declarada | Erro `no-undef` |
| CT03 | Cobertura atribuída à tela | integração | CA03 | Carregar Admin no harness com cobertura | Arquivo com linhas cobertas |
| CT04 | Piso de cobertura | integração (CI) | CA04, CA05 | Rodar `test:coverage` | Falha abaixo do piso; resumo publicado |
| CT05 | Sem arquivos zerados | unit (lê `coverage-summary.json`) | CA06 | Verificar o resumo | Nenhum arquivo com 0% |

## URL Complementar

- Documentação técnica: `vitest.config.js`, `tests/helpers/page-harness.js`, `coverage/coverage-summary.json`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000086](CONCLUIDAS/CAF-000086-infraestrutura-de-testes-e-contrato-front-schema.md), [CAF-000099](CONCLUIDAS/CAF-000099-suite-de-testes-efetiva-codigo-real-contrato-e-pgtap.md)
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
