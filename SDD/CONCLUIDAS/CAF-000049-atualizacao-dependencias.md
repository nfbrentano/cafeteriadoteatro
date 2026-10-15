# [CHORE] Atualização de Dependências (sharp e vite)

<!--
Propósito: identificação rápida e clara da tarefa. Título conciso e significativo,
que permita a qualquer membro do time compreender imediatamente o objetivo.

Tags padronizadas (use sempre colchetes, alinhadas aos tipos de commit do repositório):
[FEAT] nova funcionalidade · [FIX] correção · [UI] interface/estilo · [SEO] otimização de busca
[REFACTOR] refatoração sem mudança de comportamento · [CHORE] infraestrutura/configuração · [DOCS] documentação
-->

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael Fernando Gatti Brentano · **Criada em:** 2026-10-14 · **Atualizada em:** 2026-10-14

## Detalhes da Atividade

<!--
Contexto completo do trabalho. Deve ser correto, preciso, completo, consistente e verificável.
Descreva o problema e o resultado esperado, não a solução técnica.
-->

- **O que precisa ser feito:** Atualizar as dependências de desenvolvimento do projeto (`sharp` e `vite`) para suas versões mais recentes (`sharp@0.35.5` e `vite@8.3.4`), eliminando o alerta de segurança CVE-2026-96889 reportado pelo `npm audit` e garantindo estabilidade e melhorias no bundling de produção com Vite.
- **Problema e evidência:** O comando `npm outdated` aponta:
  - `sharp`: Atual `0.35.4`, Desejada `0.35.5`, Última `0.35.5`
  - `vite`: Atual `8.2.2` (especificado `^8.2.1`), Desejada `8.3.4`, Última `8.3.4`
  Além disso, o `npm audit` acusa vulnerabilidade de alta severidade no `sharp <0.35.5` (CVE-2026-96889 em dependência do `librsvg`).
- **Impacto de não fazer:** Manutenção de vulnerabilidade de alta severidade no ambiente de processamento de imagens com Sharp, potencial débito técnico no ferramental de build e perda de correções de compatibilidade/performance do Vite 8.3.
- **Para quem é destinado:** Desenvolvedores e mantenedores do projeto, garantindo segurança no pipeline e build do site da cafeteria.
- **História de usuário:** Como mantenedor do projeto Cafeteria do Teatro, quero atualizar o `sharp` e o `vite` para as versões mais recentes e seguras, para eliminar vulnerabilidades de segurança e garantir um processo de build estável e atualizado sem introduzir quebras ou regressões.
- **Como saberemos que deu certo:**
  - `npm outdated` não reporta mais `sharp` ou `vite` pendentes.
  - `npm run build` compila 100% dos assets (HTMLs, CSS inlined, módulos JS, cópia de estáticos) sem erros.
  - `node scripts/otimizar-logo.mjs` executa e gera as imagens WebP com sucesso.
  - `npm audit` elimina a vulnerabilidade associada ao `sharp`.

## Requisitos da Atividade

<!--
Condições e dependências necessárias para executar a tarefa, evitando que o time
inicie o trabalho sem todos os elementos necessários.

Prioridade:
- P0: obrigatório; sem ele a atividade não resolve o problema.
- P1: melhora bastante a experiência, mas o essencial funciona sem ele.
- P2: fora do escopo agora, mas a arquitetura não deve impedi-lo (liste em "Considerado para o futuro").
Se tudo for P0, nada é P0.
-->

### Requisitos funcionais

<!-- O que o sistema deve fazer. Referencie os CAs que validam cada requisito. -->

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Atualizar o pacote `sharp` de `^0.35.4` para `^0.35.5` em `package.json` e `package-lock.json`. | P0 | CA01, CA03 |
| RF02 | Atualizar o pacote `vite` de `^8.2.1` para `^8.3.4` em `package.json` e `package-lock.json`. | P0 | CA02, CA04 |

### Requisitos não-funcionais

<!--
Restrições de qualidade, desempenho, segurança, acessibilidade.
Use valores mensuráveis (ex.: "< 2s", "WCAG AA", "funciona sem login"), nunca "rápido" ou "intuitivo".
-->

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Não introduzir nenhuma regressão de build no pipeline Vite (tempo de compilação < 1s). | P0 | CA04 |
| RNF02 | Eliminar a vulnerabilidade CVE-2026-96889 apontada pelo `npm audit` para o `sharp`. | P0 | CA03 |
| RNF03 | Manter compatibilidade do plugin customizado `inlineCssPlugin` e `viteStaticCopy` sem alteração de comportamento. | P0 | CA04 |

### Dependências técnicas

<!-- Código, serviços, APIs, tabelas/migrations ou outras tarefas das quais esta depende -->

- Node.js e npm instalados no ambiente de desenvolvimento.
- Conexão com o registro npm para download dos pacotes.

### Recursos necessários

<!-- Pessoas, acessos, credenciais de ambiente, ferramentas ou assets (ícones, textos, mockups) -->

- Acesso ao terminal local para execução de `npm install` e `npm run build`.

## Critérios de Aceitação / Entregas

<!--
Definition of Done. Critérios objetivos, mensuráveis, testáveis e acordados entre
time e stakeholders. Formato: "Dado que [contexto], quando [ação], então [resultado esperado]".

Cubra: fluxo principal, cenário de erro, caso-limite (vazio, limite máximo, sem permissão)
e pelo menos um caso negativo (o que NÃO deve acontecer).
Cada critério deve poder ser testado de forma independente.
-->

- [x] **CA01:** Dado que as dependências foram atualizadas, quando executado `npm outdated`, então `sharp` e `vite` não aparecem mais na lista de desatualizados.
- [x] **CA02:** Dado que `package.json` foi atualizado, quando inspecionado o arquivo, então as versões refletem `^0.35.5` para `sharp` e `^8.3.4` para `vite`.
- [x] **CA03:** Dado que `sharp` foi atualizado para `^0.35.5`, quando executado `node scripts/otimizar-logo.mjs`, então o script é executado sem erros gerando os arquivos `.webp`.
- [x] **CA04:** Dado que `vite` foi atualizado para `^8.3.4`, quando executado `npm run build`, então os bundles de produção para todos os pontos de entrada (`index`, `cardapio`, `admin`, `pedidos`, `cozinha`, `404`) são gerados com sucesso na pasta `dist/` com CSS inline preservado.
- [x] **CA05:** Dado que a branch `chore/atualizar-dependencias` foi criada e testada, quando todas as validações forem concluídas, então este arquivo SDD será movido para `SDD/CONCLUIDAS/CAF-000049-atualizacao-dependencias.md`.

## O que a atividade não inclui

<!--
Limites do escopo para evitar "scope creep": previne mal-entendidos, evita trabalho
fora do escopo, facilita a estimativa e protege o time de sobrecarga.
Todo item deve ter um motivo.
-->

- `npm audit fix --force`: motivo: rebaixaria `vite-plugin-static-copy` para `0.2.0`, o que quebraria a configuração atual do Vite 8.
- Criação de novas dependências ou alteração de código das páginas HTML/JS de regras de negócio: motivo: atividade restrita à manutenção de tooling de dev (`devDependencies`).

### Considerado para o futuro (P2)

<!-- O que não entra agora, mas não deve ser inviabilizado pelas decisões desta atividade -->

- Configuração de suíte de testes unitários automatizados (ex.: Vitest ou Playwright).

## Dúvidas em aberto

<!--
Questões que precisam de resposta antes ou durante a implementação.
Uma atividade só deve passar para "Aprovada" sem dúvidas bloqueantes pendentes.
-->

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O escopo deve focar estritamente na atualização de `sharp` e `vite` sem forçar `audit fix --force`? | Dev/PO | Não | Sim, manter `vite-plugin-static-copy@^4.1.1` e atualizar apenas `sharp` e `vite`. |

## Sugestões de casos de teste

<!--
Garante a testabilidade: define como validar a implementação, facilita testes
automatizados, reduz bugs e retrabalho, e traz exemplos concretos do comportamento esperado.
Todo CA deve ser coberto por pelo menos um caso de teste.
-->

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Verificação de pacotes desatualizados | Manual / CLI | CA01 | Rodar `npm outdated` | Saída vazia / código de saída 0 |
| CT02 | Execução do script de otimização de imagens | Integração / CLI | CA03 | Rodar `node scripts/otimizar-logo.mjs` | Finaliza com código 0 e log das imagens geradas |
| CT03 | Build de produção completo do Vite | Integração / CLI | CA04 | Rodar `npm run build` | Saída gerada em `dist/` com CSS inlined e 0 erros |

## URL Complementar

<!--
Rastreabilidade e contexto adicional: documentação técnica, protótipos/mockups,
discussões relacionadas, referências de design, requisitos originais.
-->

- Documentação técnica: [Vite Releases](https://github.com/vitejs/vite/releases), [Sharp Changelog](https://sharp.pixelplumbing.com/changelog)
- Vulnerabilidade de segurança: [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- Issue / PR relacionado: Atualização de dependências via npm outdated
