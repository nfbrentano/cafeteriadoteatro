# [CHORE] CAF-000071 — Implementação de Ferramenta de Testes Automatizados e Regra Obrigatória de Testes Funcionais por Feature

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Configurar uma ferramenta de testes automatizados integrada ao ecossistema Vite do projeto (**Vitest + ambiente DOM (`jsdom`/`happy-dom`)** para testes funcionais de regras de negócio, fluxos de tela e integração com mocks do Supabase, com suporte a **Playwright** para fluxos E2E de navegador).
  2. Criar a estrutura base em `tests/` com helpers de simulação do DOM e mock transacional do cliente Supabase (`tests/helpers/supabase-mock.js`), permitindo testar fluxos completos (Cardápio, Totem, PDV, Cozinha, Caixa, Estoque, Financeiro, CRM e Avaliações) sem poluir o banco de produção.
  3. Atualizar as regras de fluxo de trabalho em `GEMINI.md` e o template `SDD/MODELO_ATIVIDADE.md` para tornar **obrigatório** que toda nova feature/SDD implementada inclua suíte de testes funcionais automatizados cobrindo todos os cenários possíveis (fluxo principal, casos de borda, cenários de erro/exceção e casos negativos) antes de ser movida para `SDD/CONCLUIDAS/`.
  4. Integrar a execução dos testes (`npm test`) no pipeline de deploy (`.github/workflows/deploy.yml`) para impedir que regressões cheguem em produção.
- **Problema e evidência:** Atualmente o `package.json` possui apenas scripts de `dev`, `build`, `preview` e `deploy`, sem ferramenta de testes automatizados. Embora cada SDD liste `Critérios de Aceitação (CA)` e `Sugestões de Casos de Teste (CT)`, a validação ainda depende de verificações manuais ou scripts avulsos.
- **Impacto de não fazer:** Conforme o sistema cresce (mais de 60 SDDs entregues entre PDV, KDS, Totem, Estoque, Financeiro e CRM), alterações em uma tela ou regra podem introduzir regressões silenciosas em outros fluxos críticos de caixa e pedidos.
- **Para quem é destinado:** Desenvolvedor / Agente de IA e PO/Gestor do projeto.
- **História de usuário:** Como responsável pelo produto, quero uma ferramenta de testes automatizados configurada no projeto e uma regra estrita que exija testes funcionais de todos os cenários possíveis a cada nova feature criada, para garantir que toda entrega funcione de ponta a ponta e nunca quebre funcionalidades existentes em produção.
- **Como saberemos que deu certo:** Comando `npm test` executando toda a suíte funcional em `< 10s` com `100%` de aprovação, regra documentada em `GEMINI.md`, gate ativo no GitHub Actions e todas as novas SDDs (`CAF-000061` a `CAF-000070` e futuras) acompanhadas de seus respectivos arquivos `tests/caf-XXXXXX-*.test.js`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Instalar e configurar o **Vitest** com ambiente DOM (`happy-dom` ou `jsdom`) no `vite.config.js` / `vitest.config.js` e adicionar os scripts `"test": "vitest run"`, `"test:watch": "vitest"` e `"test:coverage": "vitest run --coverage"` no `package.json` | P0 | CA01 |
| RF02 | Criar a arquitetura base em `tests/` contendo utilitários reutilizáveis (`tests/setup.js` e `tests/helpers/supabase-mock.js`) capazes de simular operações do Supabase (`from().select/insert/update/delete/upsert`, `rpc()`, `channel()`) e APIs do navegador (`localStorage`, `navigator.wakeLock`, `navigator.share`, `navigator.clipboard`, `SpeechRecognition`) | P0 | CA02 |
| RF03 | Atualizar o arquivo `GEMINI.md` adicionando a regra obrigatória **"Testes Funcionais Obrigatórios"**: toda implementação de SDD/feature deve criar ou atualizar testes funcionais automatizados cobrindo todos os cenários possíveis (caminho feliz, limites/borda, falhas de rede/validação e casos negativos de cada CA/CT), e uma tarefa só pode ser movida para `SDD/CONCLUIDAS/` após `npm test` e `npm run build` passarem sem erros | P0 | CA03 |
| RF04 | Criar uma suíte inicial de testes funcionais (`tests/core-flows.test.js`) validando fluxos críticos existentes (cálculo de carrinho/desconto/troco, fechamento de caixa cego, geração de payload Pix EMV, normalização de WhatsApp e regras de estoque/ficha técnica) | P0 | CA04 |
| RF05 | Adicionar etapa `Run Automated Functional Tests (npm test)` antes do `npm run build` no workflow `.github/workflows/deploy.yml` para bloquear deploys caso algum teste falhe | P1 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Os testes funcionais nunca devem executar mutações destrutivas contra o banco Supabase de produção (`nyretgvzbnbtiyeioeju.supabase.co`); devem rodar 100% isolados com mocks em memória ou ambiente de teste | P0 | CA02 |
| RNF02 | A execução de `npm test` deve ser determinística, rodar offline na sandbox local e concluir em `< 15s` | P0 | CA01, CA04 |

### Dependências técnicas

- `package.json`, `vite.config.js`, `.github/workflows/deploy.yml` e `GEMINI.md`.

### Recursos necessários

- Pacotes de desenvolvimento `vitest` e `happy-dom` (ou `jsdom`).

## Critérios de Aceitação / Entregas

- [x] **CA01:**** Dado que o desenvolvedor executa `npm test` no terminal, quando o comando rodar, então o Vitest deve inicializar o ambiente DOM, executar todas as suítes em `tests/**/*.test.js` e retornar código de saída `0` quando todos os testes passarem.
- [x] **CA02:**** Dado que um teste funcional exercita um módulo que consome o Supabase ou Web APIs (`localStorage`, `wakeLock`, `clipboard`, `fetch`), quando o teste rodar, então o helper de mock deve interceptar as chamadas sem realizar requisições reais para o banco de produção.
- [x] **CA03:**** Dado que uma nova feature é solicitada ou implementada, quando o fluxo de trabalho do `GEMINI.md` for consultado, então deve constar explicitamente a exigência de escrever testes funcionais cobrindo todos os cenários (positivos, negativos, casos-limite e erros) e executá-los antes de concluir qualquer SDD.
- [x] **CA04:**** Dado que uma regra de negócio testada sofra uma regressão proposital (ex.: cálculo incorreto de troco, desconto ou cashback ativado por engano), quando `npm test` for executado, então o teste correspondente deve falhar imediatamente apontando o cenário quebrado.
- [x] **CA05:**** Dado que um push é enviado para a branch `main`, quando o GitHub Actions executar `.github/workflows/deploy.yml`, então a etapa `npm test` deve rodar obrigatoriamente antes do build e interromper o deploy se houver qualquer falha.

## O que a atividade não inclui

- Testes de carga/stress contra a infraestrutura da Supabase Cloud: motivo: geraria consumo de cota em produção e não faz parte de testes funcionais de regras e interface.

### Considerado para o futuro (P2)

- Relatório visual de cobertura de código publicado como artefato no GitHub Actions.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Execução do runner via CLI | Integração | CA01 | Executar `npm test` na raiz do projeto | Runner executa todas as suítes em `tests/` e exibe resumo de aprovação |
| CT02 | Isolamento do banco de produção nos testes | Unit / Integração | CA02, RNF01 | Executar testes que simulam inserção/atualização de pedidos e configurações | Mock em memória responde às queries sem tráfego de rede externo |
| CT03 | Validação da regra em `GEMINI.md` | Manual | CA03 | Verificar presença da regra de cobertura funcional obrigatória em `GEMINI.md` | Regra documentada e ativa para todas as tarefas a partir da `CAF-000061` |
| CT04 | Gate de CI/CD no GitHub Actions | Integração | CA05 | Inspecionar `.github/workflows/deploy.yml` | Passo `npm test` configurado antes do `npm run build` |

## URL Complementar

- Documentação técnica: `GEMINI.md`, `package.json` e `.github/workflows/deploy.yml`
