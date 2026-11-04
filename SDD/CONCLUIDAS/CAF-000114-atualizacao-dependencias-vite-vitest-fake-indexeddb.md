# [CHORE] CAF-000114 — Atualização de Dependências de Desenvolvimento (vite, vitest, @vitest/coverage-v8 e fake-indexeddb)

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-11-03 · **Atualizada em:** 2026-11-03

## Detalhes da Atividade

- **O que precisa ser feito:** Atualizar as dependências de desenvolvimento desatualizadas identificadas via `npm outdated` (`@vitest/coverage-v8`, `fake-indexeddb`, `vite` e `vitest`) para suas respectivas versões estáveis mais recentes no `package.json` e `package-lock.json`, garantindo compatibilidade total com o bundler de produção, a camada de cache/fila offline em IndexedDB (`js/db.js`) e a suíte de testes automatizados.
- **Problema e evidência:** A execução de `npm outdated` apontou 4 pacotes desatualizados:
  - `@vitest/coverage-v8`: `5.0.5` → `5.1.0`
  - `fake-indexeddb`: `6.2.6` → `6.2.7`
  - `vite`: `8.3.4` → `8.3.5`
  - `vitest`: `5.0.5` → `5.1.0`
- **Impacto de não fazer:** Acúmulo de defasagem técnica nas ferramentas de build (`vite`), runner de testes/cobertura (`vitest` / `@vitest/coverage-v8`) e simulador de IndexedDB (`fake-indexeddb`), perdendo correções de bugs e melhorias de estabilidade.
- **Para quem é destinado:** Equipe de desenvolvimento e manutenção técnica do sistema Cafeteria do Teatro.
- **História de usuário:** Como desenvolvedor mantenedor da plataforma, quero manter as dependências de build e testes atualizadas nas últimas versões compatíveis, para garantir builds determinísticos, execução confiável da suíte de testes e ausência de pacotes defasados.
- **Como saberemos que deu certo:** `npm outdated` retornando vazio (código 0, sem pacotes desatualizados), `npm test` passando com 100% de sucesso em todas as suítes e `npm run build` gerando os artefatos de produção sem erros.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Atualizar `@vitest/coverage-v8` e `vitest` para `^5.1.0` no `package.json` e `package-lock.json` | P0 | CA01 |
| RF02 | Atualizar `vite` para `^8.3.5` no `package.json` e `package-lock.json` preservando a configuração de build multi-página (`vite.config.js`) | P0 | CA02 |
| RF03 | Atualizar `fake-indexeddb` para `^6.2.7` garantindo o funcionamento real do cache local e fila offline em `js/db.js` | P0 | CA03 |
| RF04 | Garantir que toda a suíte de testes e o build de produção executem sem regressões após a atualização | P0 | CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | `npm outdated` deve retornar 0 pacotes pendentes de atualização | P0 | CA01, CA02, CA03 |
| RNF02 | 100% dos testes automatizados devem passar em execução via `npm test` | P0 | CA04 |
| RNF03 | O build de produção (`npm run build`) deve concluir com código de saída 0 | P0 | CA02, CA04 |

### Dependências técnicas

- `package.json` e `package-lock.json`
- `vite.config.js`
- `js/db.js` (integração com IndexedDB testada via `fake-indexeddb`)

### Recursos necessários

- Acesso ao registro oficial do npm para atualização do `package-lock.json` e instalação dos pacotes em `node_modules`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o arquivo `package.json` e a árvore instalada em `node_modules`, quando as versões de `vitest` e `@vitest/coverage-v8` forem inspecionadas, então ambas devem estar na versão `>= 5.1.0` e alinhadas na mesma versão sem divergência entre runner e provedor de cobertura.
- [x] **CA02:** Dado o arquivo `package.json` e o `vite.config.js` real da aplicação, quando `vite` (`>= 8.3.5`) carregar a configuração de build multi-página (incluindo entradas HTML e cópia estática), então todas as entradas HTML da aplicação devem estar mapeadas e existentes no disco sem caminhos quebrados.
- [x] **CA03:** Dado o pacote `fake-indexeddb` (`>= 6.2.7`) integrado ao módulo real `js/db.js`, quando operações de cache local (`cacheSet`/`cacheGet`), fila offline (`enqueueOfflineOp`/`listOfflineQueue`/`removeOfflineOp`/`incrementOfflineAttempt`) e tratamento de entradas inválidas/expiradas forem executados, então os dados devem ser persistidos e recuperados corretamente no IndexedDB e rejeitados/limpos nos casos limites e negativos.
- [x] **CA04:** Dado o ambiente atualizado, quando `npm outdated`, `npm test` e `npm run build` forem executados, então não deve existir nenhum pacote listado como desatualizado, nem versões antigas (`5.0.5`, `6.2.6`, `8.3.4`) declaradas no `package.json`, e 100% dos testes e o build devem passar sem erros.

## O que a atividade não inclui

- Alteração de dependências de produção (`qrcode`, `qrcode-generator`): motivo: já estão nas versões mais recentes (`npm outdated` não apontou pendências).
- Mudanças em regras de negócio de telas ou migrations SQL: motivo: atividade estritamente de manutenção de infraestrutura e dependências (`[CHORE]`).

### Considerado para o futuro (P2)

- Automação periódica de verificação de `npm outdated` no pipeline de CI.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Nenhuma dúvida pendente; escopo validado pelo PO. | PO / Dev | Não | Atualizar todos os 4 pacotes listados pelo `npm outdated`. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Validação de versões instaladas e paridade entre `vitest` e `@vitest/coverage-v8` | Integração | CA01, CA04 | Importar `package.json` do projeto e `package.json` real instalado de `vitest`, `@vitest/coverage-v8`, `vite` e `fake-indexeddb`; verificar `>= 5.1.0`, `>= 8.3.5`, `>= 6.2.7` e ausência das versões antigas | Versões atualizadas, paridade exata entre `vitest` e `@vitest/coverage-v8` |
| CT02 | Carregamento da configuração real do Vite (`vite.config.js`) | Integração | CA02 | Importar `vite.config.js` e validar `build.rollupOptions.input` e existência física de todas as páginas HTML configuradas | Configuração válida e todas as entradas HTML existentes |
| CT03 | Persistência, expiração (TTL) e fila offline no IndexedDB via `fake-indexeddb` + `js/db.js` | Integração | CA03 | Executar `cacheSet`, `cacheGet` (dentro e fora do TTL), `enqueueOfflineOp`, `listOfflineQueue`, `incrementOfflineAttempt` e `removeOfflineOp` do módulo real `js/db.js` | Operações CRUD funcionam no IndexedDB real simulado; itens expirados retornam `null` |
| CT04 | Casos negativos e limites no `js/db.js` e versionamento | Unit / Integração | CA01, CA03, CA04 | Consultar chave inexistente no cache, remover ID inexistente da fila offline e garantir que nenhuma dependência alvo permaneceu na versão antiga | Retorno seguro (`null`/sem exceção) e zero regressões |

## URL Complementar

- Documentação técnica: `package.json`, `vite.config.js`, `js/db.js`
- Protótipo / mockup: N/A
- Discussões relacionadas: N/A
- Referências de design: N/A
- Requisitos originais: Verificação `npm outdated`
- Issue / PR relacionado: CAF-000114
