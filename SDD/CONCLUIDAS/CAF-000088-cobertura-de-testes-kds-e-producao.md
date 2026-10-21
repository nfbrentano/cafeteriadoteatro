# [CHORE] CAF-000088 — Cobertura de Testes: KDS, Estações e Produção (SDDs 006–009, 022–030, 043)

> **Status:** Concluída
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-21

## Detalhes da Atividade

- **O que precisa ser feito:** escrever testes funcionais automatizados para as 14 SDDs da cozinha/KDS já entregues e sem teste: um arquivo `tests/caf-0000XX-*.test.js` por SDD original, cobrindo os CAs originais. Lógica pura de `js/cozinha.js` e `js/retirada.js` (semáforo, ordenação, agrupamento por estação, consolidação de produção, trava de impressão, atualização incremental) é extraída para `js/utils/` conforme a CAF-000086. Eventos realtime são simulados pelo mock (`channel().on()` com disparo manual).
- **Problema e evidência:** nenhuma SDD do KDS tem teste (auditoria de 2026-10-20). Bugs já encontrados sem teste que os pegasse: `novosPendentesCount` calculado e nunca exibido (js/cozinha.js:1312, CAF-000024); pedidos "adicionais" sem marca na cozinha (CAF-000005); `pedido_impressoes` aceita INSERT de anônimo (CAF-000028); `DEFAULT 15` em `categorias.tempo_alvo_min` anula o padrão global (CAF-000025); timestamps com possível deslocamento de 3 h (`timezone('America/Sao_Paulo', now())` em `timestamptz`) afetando o semáforo e a ordenação.
- **Impacto de não fazer:** o KDS é a tela que mais muda (030 refez a renderização incremental); sem testes, uma regressão faz pedidos sumirem, duplicarem ou imprimirem duas vezes no horário de pico.
- **Para quem é destinado:** Desenvolvedor / Agente de IA; indiretamente baristas e cozinha.
- **História de usuário:** Como responsável pelo produto, quero testes automatizados para cada regra do KDS, para que fila, semáforo, estações, impressão e painel de senhas continuem corretos a cada mudança.
- **Como saberemos que deu certo:** 14 arquivos de teste; 100% dos CAs originais cobertos (ou `it.todo` justificado); cobertura ≥ 90% nos utils extraídos e ≥ 35% em `js/cozinha.js`; reintroduzir duplicação de impressão ou item sumindo após evento realtime faz a suíte falhar.

## Requisitos da Atividade

### Requisitos funcionais

Matriz SDD-alvo → CAs → tipo → arquivo:

| SDD original | CAs a cobrir | Tipo de teste | Arquivo esperado | Bug conhecido (SDD de correção) |
|---|---|---|---|---|
| 006 Produto esgotado | CA01–CA13 (toggle, some do cardápio/PDV, bloqueio no pedido) | DOM (pedidos.html, cardapio.html) + contrato | `tests/caf-000006-produto-esgotado.test.js` | — |
| 007 Estação bar × cozinha | CA01–CA13 | unit (agrupamento por estação extraído) + DOM | `tests/caf-000007-estacoes.test.js` | — |
| 008 Item a item pronto | CA01–CA14 (progresso, pedido pronto quando todos prontos) | unit + DOM | `tests/caf-000008-item-pronto.test.js` | — |
| 009 Realtime em pedido_itens | CA01–CA13 (debounce, reconexão) | DOM + realtime simulado (fake timers) | `tests/caf-000009-realtime-itens.test.js` | — |
| 022 Conclusão por estação | CA01–CA18 | unit + contrato | `tests/caf-000022-conclusao-estacao.test.js` | horários com fuso → CAF-000080 |
| 023 Comanda / voz / apóstrofo | CA01–CA11 (nomes com `'`, select completo, chamada por voz) | DOM + unit | `tests/caf-000023-comanda-voz.test.js` | `onclick` com texto interpolado (js/pedidos.js:4624, 3765) → CAF-000084 |
| 024 Itens lançados depois | CA01–CA13 (selo NOVO, "+N itens", volta para a fila) | DOM + realtime | `tests/caf-000024-itens-lancados-depois.test.js` | "+N" não exibido e selo sem horário → CAF-000084 |
| 025 Tempo alvo e semáforo | CA01–CAnn (verde/amarelo/vermelho, desvio de relógio, ordenação) | unit (fake timers) | `tests/caf-000025-semaforo.test.js` | DEFAULT 15 anula padrão global → CAF-000084 |
| 026 Visão consolidada de produção | todos os CAs | unit (consolidação extraída) + DOM | `tests/caf-000026-producao-consolidada.test.js` | — |
| 027 Painel de senhas/retirada | todos os CAs (só pedidos do dia, campos mínimos) | DOM (retirada.html) + contrato | `tests/caf-000027-painel-retirada.test.js` | view expõe colunas extras / recorte do dia → CAF-000082, CAF-000080 |
| 028 Impressora e comanda por estação | todos os CAs (sem duplicar, reimpressão manual) | unit (trava extraída) + DOM | `tests/caf-000028-impressao-estacao.test.js` | INSERT anônimo em `pedido_impressoes` → CAF-000082 |
| 029 Prioridade e teclado | todos os CAs (atalhos, foco, prioridade no topo) | DOM (eventos de teclado) | `tests/caf-000029-prioridade-teclado.test.js` | — |
| 030 Atualização incremental do KDS | todos os CAs (patch sem re-render total, sem duplicar/sumir) | DOM + realtime | `tests/caf-000030-kds-incremental.test.js` | — |
| 043 Etiqueta de copo | todos os CAs (conteúdo, trava por pedido+estação) | unit (pedido-print.js) + DOM | `tests/caf-000043-etiqueta-copo.test.js` | itens lançados depois sem etiqueta automática → CAF-000084 |

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar os 14 arquivos da matriz, um `it` por CA original (nome inicia com o ID do CA) | P0 | CA01 |
| RF02 | Extrair para `js/utils/kds-regras.js`: cor do semáforo por tempo decorrido/alvo, ordenação da fila (prioridade, horário), agrupamento por estação, conclusão por estação, consolidação de produção | P0 | CA02, CA03 |
| RF03 | Extrair para `js/utils/impressao-trava.js` a decisão "imprimir ou não" por pedido+estação e para `js/utils/kds-patch.js` o cálculo de diff incremental (inserir/atualizar/remover cards) | P0 | CA04, CA05 |
| RF04 | Mock realtime: helper `emitRealtime(tabela, evento, payload)` no supabase-mock para INSERT/UPDATE/DELETE em `pedidos` e `pedido_itens` | P0 | CA05 |
| RF05 | Testes de tempo com `vi.useFakeTimers()` e relógio do servidor com desvio simulado (025) | P0 | CA03 |
| RF06 | Bugs conhecidos como `it.fails('[CAF-0000NN] …')` | P0 | CA06 |
| RF07 | Metas de cobertura nos thresholds: `kds-regras.js`, `impressao-trava.js`, `kds-patch.js` ≥ 90% linhas/85% branches; `js/cozinha.js` ≥ 35%; `js/retirada.js` ≥ 50%; `js/pedido-print.js` ≥ 50% | P1 | CA07 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Testes determinísticos: nada depende do relógio real nem de ordem de chegada de eventos (fake timers + emissão controlada) | P0 | CA03, CA05 |
| RNF02 | Suíte desta SDD < 8 s, sem rede | P0 | CA01 |
| RNF03 | Extrações sem mudança de comportamento (teste DOM antes/depois) | P0 | CA02 |

### Dependências técnicas

- CAF-000086 (harness, mock estrito com realtime, snapshot).
- SDDs de correção: CAF-000080, CAF-000082, CAF-000084.

### Recursos necessários

- SDDs originais em `SDD/CONCLUIDAS/` como fonte dos CAs.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o fim desta atividade, quando `npm test` roda, então existem os 14 arquivos da matriz e cada CA original aparece em pelo menos um `it` (ou `it.todo` justificado).
- [x] **CA02:** Dado um pedido com café (bar) e sanduíche (cozinha), quando o KDS de cada estação renderiza, então cada uma vê só seus itens e o pedido só fica pronto quando as duas estações concluem.
- [x] **CA03:** Dado tempo alvo de 5 min e pedido criado há 4, 6 e 9 min (relógio do servidor 2 min adiantado), quando o semáforo é calculado, então as cores são verde, amarelo e vermelho considerando o desvio.
- [x] **CA04:** Dado um pedido já impresso na estação bar, quando chega UPDATE realtime do mesmo pedido, então não há nova impressão automática; a reimpressão manual continua possível.
- [x] **CA05:** Dado o KDS com 10 cards, quando chegam INSERT de item novo, UPDATE de status e DELETE (cancelamento) via realtime, então só os cards afetados mudam, nenhum card some ou duplica e o item novo recebe o selo NOVO.
- [x] **CA06:** Dado os bugs conhecidos da matriz, quando a suíte roda, então eles aparecem como `it.fails` com a SDD de correção, e passam a falhar quando a correção é entregue.
- [x] **CA07:** Dado `npm run test:coverage`, quando roda, então as metas do RF07 são atingidas e registradas como thresholds.
- [x] **CA08 (negativo):** Dado um produto esgotado, quando o PDV ou o cardápio tentam adicioná-lo, então o item não é adicionado e nenhuma RPC de pedido é chamada.

## O que a atividade não inclui

- Corrigir os bugs da matriz: motivo: SDDs 080, 082 e 084.
- Impressão física/ESC/POS: motivo: a impressão atual é pelo navegador; teste valida o HTML gerado.
- Testes de carga do realtime: motivo: dependem de infraestrutura Supabase.

### Considerado para o futuro (P2)

- pgTAP para a RPC de impressão e para os triggers de conclusão por estação.
- Teste visual (screenshot) do painel de senhas em resolução de TV.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Limiares do semáforo (amarelo/vermelho) são % do alvo ou minutos fixos? Teste segue a implementação atual da 025. | PO | Não | |
| D02 | Itens lançados depois devem gerar nova etiqueta automática? (hoje não geram) | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Esgotar produto | DOM | 006, CA08 | Marcar esgotado → tentar adicionar | Bloqueado |
| CT02 | Separação por estação | unit | CA02 | Pedido misto | Grupos bar/cozinha corretos |
| CT03 | Pronto item a item | DOM | 008 | Marcar 2 de 3 itens | Progresso 2/3; pedido não pronto |
| CT04 | Debounce realtime | DOM (fake timers) | 009 | 5 eventos em 100 ms | 1 re-render |
| CT05 | Conclusão por estação | unit | 022 | Bar conclui, cozinha não | Pedido segue na fila da cozinha |
| CT06 | Nome com apóstrofo | DOM | 023 | Cliente "D'Ávila" | Card renderiza e botões funcionam |
| CT07 | Item lançado depois | DOM | 024 | INSERT em pedido concluído | Volta para a fila com selo NOVO e "+1 item" (`it.fails` até 084) |
| CT08 | Semáforo com desvio | unit | CA03 | 4/6/9 min, desvio 2 min | verde/amarelo/vermelho |
| CT09 | Produção consolidada | unit | 026 | 3 pedidos com cappuccino | "Cappuccino × 3" |
| CT10 | Painel só do dia | DOM | 027 | Pedido de ontem pronto | Não aparece |
| CT11 | Impressão sem duplicar | unit | CA04 | 2 UPDATEs do mesmo pedido | 1 impressão |
| CT12 | Atalhos de teclado | DOM | 029 | Teclas 1–9 / Enter | Card focado conclui |
| CT13 | Patch incremental | DOM | CA05 | INSERT/UPDATE/DELETE | Só cards afetados mudam |
| CT14 | Etiqueta de copo | unit | 043 | Pedido com 2 bebidas | 2 etiquetas com nome e item |

## URL Complementar

- Documentação técnica: `js/cozinha.js`, `js/retirada.js`, `js/pedido-print.js`, `cozinha.html`, `retirada.html`
- Discussões relacionadas: auditoria de SDDs de 2026-10-20
- Requisitos originais: `SDD/CONCLUIDAS/CAF-000006` … `CAF-000030`, `CAF-000043`
- Issue / PR relacionado: CAF-000086 (pré-requisito), CAF-000080, CAF-000082, CAF-000084
