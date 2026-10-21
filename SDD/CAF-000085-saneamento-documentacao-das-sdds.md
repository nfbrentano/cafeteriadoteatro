# [DOCS] CAF-000085 — Saneamento da documentação das SDDs (status, critérios de aceitação, IDs e rastreabilidade)

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer a documentação em `SDD/` refletir a realidade do código. Isso inclui padronizar o cabeçalho de status e marcar os CAs realmente atendidos. Também inclui:
  - eliminar o ID duplicado;
  - mapear migration ↔ SDD;
  - atualizar os documentos de acompanhamento;
  - reclassificar como "Concluída com ressalvas" as SDDs que têm bugs abertos, apontando a SDD de correção;
  - endurecer a regra para mover uma SDD para `SDD/CONCLUIDAS/`.
- **Problema e evidência (auditoria de 2026-10-20):**
  - **Status/CAs desatualizados:**
    - CAF-000001 a 017 e CAF-000020 (vínculo de adicionais) estão em `CONCLUIDAS/` com status "A fazer" e 0 CAs marcados. Exemplos: CAF-000001 tem 14 `[ ]`; CAF-000020-vinculo tem 30 `[ ]`.
    - CAF-000064 a 067, 070 e 071 declaram `> **Status:** Concluída`, mas com todos os CAs `[ ]`.
    - CAF-000020-menu-flutuante-whatsapp não tem campo Status.
    - CAF-000021 diz "Análise concluída · correção a fazer", mas a correção foi entregue via CAF-000070.
    - As SDDs anteriores à 061 usam uma tabela `| Área | Prioridade | Esforço | Status |` em vez do cabeçalho `> **Status:**` do `SDD/MODELO_ATIVIDADE.md`. Só 18 das 71 seguem o modelo.
  - **ID duplicado:** existem dois arquivos `CAF-000020-*` (menu flutuante WhatsApp e vínculo de adicionais).
  - **Migration ↔ SDD divergentes:** 10 migrations têm número diferente da SDD que implementam:

    | Migration | Implementa |
    |---|---|
    | `migration_caf_000005.sql` | CAF-000006 |
    | `migration_caf_000006_estacoes.sql` | CAF-000007 |
    | `migration_caf_000021_cliente_viagem.sql` | CAF-000010 |
    | `migration_caf_000022_transferir_mesa.sql` | CAF-000011 |
    | `migration_caf_000023_taxa_desconto.sql` | CAF-000013 |
    | `migration_caf_000024_relatorios.sql` | CAF-000014 |
    | `migration_caf_000025_caixa.sql` | CAF-000015 |
    | `migration_caf_000026_idempotencia.sql` | CAF-000018 |
    | `migration_caf_000027_conclusao_estacao.sql` | CAF-000022 |
    | `migration_caf_000028_itens_lancados_depois.sql` | CAF-000024 |

    Além disso, `migration_caf_000029_tempo_alvo_semaforo.sql` implementa a CAF-000025, e há dois arquivos `_000027_` e dois `_000028_`/`_000029_` para SDDs diferentes. Quem lê uma migration não sabe a qual SDD ela pertence, e quem aplica em ordem alfabética pode aplicar fora da ordem real.
  - **Documentos de acompanhamento desatualizados:**
    - `SDD/CONCLUIDAS/FEATURES_PENDENTES.md` tem todos os checkboxes das CAF-000001 a 020 `[ ]`, embora o código exista.
    - `SDD/CONCLUIDAS/TAREFAS.md` tem os itens 1.x a 8.x `[ ]` com `criar_pedido`, `adicionar_itens_pedido`, `validar_cortesia` e outros já implementados.
    - `SDD/CONCLUIDAS/MELHORIAS_UX.md` tem tudo `[ ]`, embora a maior parte tenha sido entregue nas CAF-000051 a 059 e 070.
  - **Concluídas com bugs abertos:** a auditoria encontrou falhas em SDDs marcadas como concluídas. Exemplos: fechamento de conta (002/012/013), adicionais (020b), estoque e ficha técnica (031/032), financeiro (035), Pix admin (039), cashback (063), cupons (061) e segurança (028/037/041). Hoje nada na pasta `CONCLUIDAS/` indica isso.
  - **Regra frouxa:** `GEMINI.md:3,5` exige mover para `CONCLUIDAS/` ao finalizar e ter testes, mas não exige CAs marcados nem impede mover sem o arquivo de teste. Por isso 60 SDDs foram movidas sem nenhum teste automatizado.
- **Impacto de não fazer:** a pasta `CONCLUIDAS/` deixa de ser fonte confiável. O PO não sabe o que de fato funciona, novas auditorias repetem o mesmo trabalho e bugs conhecidos ficam invisíveis.
- **Para quem é destinado:** PO (Natanael), devs e agentes de IA que leem `SDD/` como fonte da verdade.
- **História de usuário:** Como PO, quero que o status e os CAs de cada SDD reflitam o que está realmente entregue e testado, para decidir prioridades sem precisar auditar o código.
- **Como saberemos que deu certo:**
  - 100% das SDDs em `CONCLUIDAS/` com o cabeçalho `> **Status:**` padronizado.
  - 0 SDDs "Concluída" com CA `[ ]` sem justificativa.
  - 0 IDs duplicados.
  - Um índice `SDD/INDICE.md` com SDD → migration(s) → teste(s) → status para todas as SDDs.
  - Um teste automatizado que falha se essas regras forem violadas.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Padronizar o cabeçalho de todas as SDDs com `> **Status:** ...` e `> **Autor:** ... · **Criada em:** ...`, conforme o `MODELO_ATIVIDADE.md`. Nas SDDs antigas (001 a 059), substituir ou complementar a tabela `Área/Prioridade/Esforço/Status`. | P0 | CA01 |
| RF02 | Revisar os CAs de 001 a 017, 020a, 020b, 021, 064 a 067, 070 e 071 contra o código e o relatório da auditoria. Marcar `[x]` o que foi verificado; o que não está atendido fica `[ ]` com a nota "→ CAF-0000NN" apontando a SDD de correção. | P0 | CA02 |
| RF03 | Criar o status **"Concluída com ressalvas"** no modelo. Aplicá-lo às SDDs com bugs abertos, com uma linha `> **Ressalvas:**` listando os CAs não atendidos e a SDD de correção (de CAF-000072 a 084: por exemplo, cashback → CAF-000076, cupons → CAF-000077, segurança → CAF-000082, operação/caixa → CAF-000083, UX/KDS → CAF-000084). | P0 | CA03 |
| RF04 | Resolver o ID duplicado: manter `CAF-000020-vinculo-de-adicionais-por-produto` e renumerar o menu flutuante do WhatsApp para `CAF-000020A` ou para o próximo ID livre (decisão D01), atualizando as referências. | P0 | CA04 |
| RF05 | Atualizar a CAF-000021 para "Concluída", com a referência à CAF-000070 e a ressalva do tamanho do `mapa-estatico.webp` (→ CAF-000084). | P1 | CA02 |
| RF06 | Criar `SDD/INDICE.md` com uma tabela: ID, título, status, migration(s), arquivo(s) de teste, SDD de correção. Incluir a tabela de divergências migration ↔ SDD e a ordem real de aplicação das migrations. | P0 | CA05 |
| RF07 | Não renomear migrations já aplicadas em produção. Em vez disso, acrescentar no topo de cada migration divergente o comentário `-- Implementa: CAF-0000NN` e documentar no índice. A partir da CAF-000072, o nome da migration passa a ser obrigatoriamente o ID da SDD. | P1 | CA05 |
| RF08 | Atualizar `FEATURES_PENDENTES.md`, `TAREFAS.md` e `MELHORIAS_UX.md`: marcar o que foi entregue (com a SDD de referência) e manter abertos só os pendentes reais (por exemplo, pull-to-refresh, ESC/POS, NFC-e, push via SW, fidelidade "10º café"). | P1 | CA06 |
| RF09 | Endurecer a regra em `GEMINI.md` e no `MODELO_ATIVIDADE.md`: uma SDD só vai para `CONCLUIDAS/` com todos os CAs `[x]` (ou status "Concluída com ressalvas" com SDD de correção), com `tests/caf-0000NN-*.test.js` existindo e importando código da aplicação, e com `npm test` e `npm run build` verdes. | P0 | CA07 |
| RF10 | Criar `tests/caf-000085-sdd-docs.test.js`, que lê `SDD/**/*.md` e falha se encontrar SDD sem cabeçalho de status, IDs duplicados, SDD "Concluída" com CA `[ ]`, ou SDD criada a partir da CAF-000061 em `CONCLUIDAS/` sem o arquivo de teste correspondente. | P0 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma alteração de código de aplicação ou de banco nesta atividade, só arquivos Markdown, comentários SQL e o teste de documentação. | P0 | CA05 |
| RNF02 | O teste de documentação roda em menos de 1 s, sem rede. | P1 | CA08 |
| RNF03 | Toda marcação `[x]` precisa ser rastreável (arquivo:linha ou teste) no índice ou na própria SDD. | P1 | CA02 |

### Dependências técnicas

- Relatório da auditoria de 2026-10-20 e as SDDs de correção CAF-000072 a 084, que já precisam ter IDs definidos para as referências.
- `GEMINI.md`, `SDD/MODELO_ATIVIDADE.md` e `vitest.config.js` (inclusão do novo teste).

### Recursos necessários

- Tempo do PO para validar a reclassificação ("Concluída" × "Concluída com ressalvas").

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado qualquer arquivo `SDD/**/CAF-*.md`, quando aberto, então a primeira linha após o título é `> **Status:** <um dos status do modelo>`.
- [ ] **CA02:** Dado as SDDs 001 a 017, 020a, 020b, 021, 064 a 067, 070 e 071, quando revisadas, então cada CA está `[x]` (verificado) ou `[ ]` com a nota "→ CAF-0000NN"; nenhuma fica com 0 CAs avaliados.
- [ ] **CA03:** Dado a CAF-000063 (cashback), quando aberta, então o status é "Concluída com ressalvas" e há uma linha `Ressalvas` citando a CAF-000076 e os CAs afetados.
- [ ] **CA04:** Dado a pasta `SDD/`, quando os IDs forem listados, então não há dois arquivos com o mesmo ID, e as referências ao ID renumerado foram atualizadas.
- [ ] **CA05:** Dado `SDD/INDICE.md`, quando consultado, então cada SDD tem migration(s), teste(s) e status. As 10+ migrations divergentes aparecem mapeadas e têm o comentário `-- Implementa:` no topo, sem terem sido renomeadas.
- [ ] **CA06:** Dado `FEATURES_PENDENTES.md`, `TAREFAS.md` e `MELHORIAS_UX.md`, quando lidos, então os itens entregues estão `[x]` com a SDD de referência e os abertos são só os pendentes reais.
- [ ] **CA07:** Dado `GEMINI.md` e o modelo, quando consultados, então a regra de conclusão exige CAs marcados (ou ressalvas com SDD de correção), arquivo de teste existente que importe código real e `npm test` + `npm run build` verdes.
- [ ] **CA08 (negativo):** Dado que alguém mova para `CONCLUIDAS/` uma SDD nova com CA `[ ]` ou sem o arquivo de teste, quando `npm test` rodar, então `tests/caf-000085-sdd-docs.test.js` falha apontando o arquivo.

## O que a atividade não inclui

- Corrigir os bugs encontrados: motivo: SDDs CAF-000072 a 084.
- Escrever os testes funcionais das SDDs antigas: motivo: SDDs de cobertura de testes dedicadas.
- Renomear migrations já aplicadas: motivo: risco de reaplicação ou confusão no histórico; usamos comentário e índice.

### Considerado para o futuro (P2)

- Gerar `SDD/INDICE.md` automaticamente por script a partir dos cabeçalhos.
- Checagem no CI de que toda migration nova referencia uma SDD existente.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Renumerar o menu flutuante do WhatsApp para `CAF-000020A` ou para o próximo ID livre? Recomendação: próximo ID livre, para manter o padrão numérico. | PO | Sim | |
| D02 | Valem as SDDs com bug crítico (fechamento de conta, adicionais, estoque) voltarem para `SDD/` (raiz) em vez de "Concluída com ressalvas"? | PO | Sim | |
| D03 | A regra do RF10 (teste obrigatório) vale retroativamente para as SDDs 001 a 060, ou só a partir da 061 até a cobertura de testes legada ser entregue? Recomendação: só a partir da 061, com allowlist temporária. | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cabeçalho padronizado | Unit (fs) | CA01 | Percorrer `SDD/**/CAF-*.md` e procurar a regex `^> \*\*Status:\*\*`. | Todas têm o cabeçalho. |
| CT02 | CAs avaliados | Manual + unit | CA02 | Revisar as SDDs listadas; no teste, contar `[x]` + `[ ] → CAF-`. | Nenhuma SDD com 0 CAs avaliados. |
| CT03 | Ressalvas apontam correção | Unit (fs) | CA03 | Para status "Concluída com ressalvas", exigir a linha `Ressalvas` com `CAF-0000\d\d`. | Presente. |
| CT04 | IDs únicos | Unit (fs) | CA04 | Extrair o ID dos nomes de arquivo e procurar duplicatas. | 0 duplicados. |
| CT05 | Índice completo | Unit (fs) | CA05 | Cruzar os IDs dos arquivos com as linhas do `INDICE.md`; conferir `-- Implementa:` nas migrations divergentes. | Todos presentes. |
| CT06 | Docs de acompanhamento | Manual | CA06 | Ler os 3 arquivos. | Pendentes reais só. |
| CT07 | Regra no GEMINI.md | Unit (fs) | CA07 | Procurar os termos "CAs marcados" e "importe código" em `GEMINI.md`. | Presentes. |
| CT08 | Gate negativo | Unit | CA08 | Criar uma fixture temporária de SDD "Concluída" com `[ ]` sem teste e rodar o validador. | O validador reporta erro com o caminho. |

## URL Complementar

- Documentação técnica: `SDD/MODELO_ATIVIDADE.md`, `GEMINI.md`.
- Discussões relacionadas: auditoria de SDDs de 2026-10-20.
- Requisitos originais: todas as SDDs de `SDD/CONCLUIDAS/`.
- Issue / PR relacionado: SDDs de correção CAF-000072 a 084.
