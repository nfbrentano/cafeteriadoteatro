# [FIX] KDS e impressão: fila de impressão, trava por estação, ressincronização no reconnect, SLA de agendados e voz

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer cada comanda sair uma vez e inteira, para a estação certa, mesmo com pedidos simultâneos ou queda de conexão; manter o KDS sincronizado depois de quedas silenciosas do realtime; medir o atraso de encomendas a partir do horário em que deveriam começar; e não cortar anúncios de voz no pico.
- **Problema e evidência:**
  - **Iframe único de impressão:** `executePrint` (`js/pedido-print.js:48-59`) escreve o HTML no `#print-frame` compartilhado (`doc.open(); doc.write(html)`) e chama `print()` 400 ms depois. Todas as impressões passam por ele (`:240`, `:336`, `:477`, `:605`, `:723`, `:872`). Em `js/cozinha.js:566-588` a comanda da cozinha e a do bar são disparadas em sequência sem esperar, e as etiquetas antes delas (`:553-555`). Em pedido misto, ou dois pedidos chegando juntos, o segundo `doc.write` substitui o primeiro antes do `print()`: uma comanda sai duplicada e a outra não sai.
  - **Trava gravada antes de imprimir:** `requisitarTravaImpressao` (`js/cozinha.js:463-481`) insere o registro em `pedido_impressoes` (índice único por pedido/estação/tipo, `supabase/migration_caf_000028_tela_impressora.sql:18-19`) antes de `printPedido`. Se a impressão falha ou é sobrescrita, o banco diz "impresso" e ninguém reimprime; não há confirmação nem liberação.
  - **Verificação sem estação:** `verificarImpressaoPendentesAoConectar` (`js/cozinha.js:592-603`) usa `logs.some(l => l.tipo === 'comanda')`. A tela do bar que volta da queda vê a comanda da cozinha e conclui que a dela já saiu.
  - **Reconnect silencioso:** PDV (`js/pdv/realtime.js:824-830`) e KDS (`js/cozinha.js:3046-3052`) só atualizam o indicador no `SUBSCRIBED`. Recarga completa só no evento `online` do navegador ou após mais de 60 s com a aba oculta (`js/pdv/realtime.js:843-853`, `js/cozinha.js:3067-3079`). O intervalo de 30 s do KDS só re-renderiza o que já está na memória (`js/cozinha.js:607-612`, `:1668-1670`). Quando o websocket cai e volta sem o Wi-Fi cair, os INSERTs desse intervalo nunca aparecem.
  - **SLA de agendados:** `calcularEstadoTempoPedido` (`js/cozinha.js:1059-1070`) e `updateTimers` (`:1606-1607`) medem desde `created_at`. Encomendas só entram no KDS 20 min antes de `retirada_em` (`isPedidoLiberadoParaKds`, `:497-504`). A ordenação (`:1205-1208`) e o beep de atraso (`:1634-1637`) usam esse valor. Exemplo: encomenda feita às 18h para 21h30 entra às 21h10 já com ~190 min de "atraso", dispara o alarme e vai para o topo da fila, à frente de pedidos de quem está no balcão.
  - **Voz:** `chamarPedidoVoz` chama `speechSynthesis.cancel()` a cada anúncio (`js/pdv/realtime.js:92`, `js/cozinha.js:794`). No pico, só o último pedido é anunciado.
- **Impacto de não fazer:** Comanda perdida no intervalo do espetáculo (produção atrasada ou esquecida); comanda duplicada (desperdício); pedidos invisíveis no KDS até alguém recarregar; fila reordenada por alarme falso; clientes não chamados.
- **Para quem é destinado:** Equipe da cozinha e do bar (KDS e impressora térmica) e barista do balcão (chamada por voz).
- **História de usuário:** Como cozinheiro, quero que toda comanda da minha estação saia uma única vez e que o KDS mostre todos os pedidos mesmo após oscilação, para não esquecer nenhum pedido.
- **Como saberemos que deu certo:** Em teste com 10 pedidos mistos chegando em 5 s, 20 comandas impressas (10 cozinha + 10 bar), sem duplicata; após queda forçada do websocket, pedidos criados durante a queda aparecem no KDS em até 60 s; 0 encomendas marcadas como atrasadas no momento em que entram no KDS.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Fila de impressão serializada em `pedido-print.js`: um trabalho por vez, próximo só após `afterprint` (ou tempo-limite de 5 s), com iframe novo por trabalho | P0 | CA01, CA02 |
| RF02 | `pedido_impressoes` ganha confirmação (`confirmado_em`); a trava vira "reservada" e só conta como impressa após a fila confirmar; reserva sem confirmação por mais de 2 min pode ser retomada | P0 | CA03, CA04 |
| RF03 | KDS mostra selo "não impresso" e botão "Reimprimir" em pedidos cuja comanda da estação não foi confirmada | P1 | CA04 |
| RF04 | Verificação de pendentes filtra por estação da tela (`l.estacao === estação && l.tipo === 'comanda'`) | P0 | CA05 |
| RF05 | Em todo `SUBSCRIBED` após o primeiro, PDV e KDS refazem a carga incremental desde o último `updated_at` conhecido | P0 | CA06 |
| RF06 | Verificação de consistência leve a cada 45 s (ids e `updated_at` dos pedidos ativos) que busca o que faltar | P1 | CA07 |
| RF07 | SLA, ordenação e beep usam `inicio = max(created_at, retirada_em - antecedência)`; card de encomenda mostra o horário de retirada | P0 | CA08, CA09 |
| RF08 | Fila de falas: anúncios entram em fila e são falados em ordem, limite de 5 na fila (descarta os mais antigos com aviso no log) e sem `cancel()` entre eles | P1 | CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Intervalo entre o pedido chegar e a comanda iniciar < 3 s com fila vazia | P1 | CA01 |
| RNF02 | Ressincronização após reconnect consulta só pedidos alterados (sem recarga completa da tela) | P0 | CA06 |
| RNF03 | Consulta de consistência ≤ 1 requisição a cada 45 s por tela | P1 | CA07 |

### Dependências técnicas

- `js/pedido-print.js`, `js/cozinha.js`, `js/pdv/realtime.js`; `travar_impressao_pedido` (última versão em `supabase/migration_caf_000082_seguranca.sql:14`).
- CAF-000137 pode mover regras para `js/utils/kds-regras.js` e `js/utils/impressao-trava.js`; combinar para não editar o mesmo código duas vezes.
- CAF-000135 passa a gravar `retirada_em` no pedido do intervalo do PDV, o que aumenta o número de pedidos afetados pelo RF07.

### Recursos necessários

- Impressora térmica e dois tablets (cozinha e bar) para teste manual.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado uma tela configurada para "todas" as estações, quando chega um pedido com 1 café (bar) e 1 croissant (cozinha), então saem duas comandas, uma de cada estação, na ordem de chegada.
- [ ] **CA02:** Dado dois pedidos chegando com 100 ms de diferença, quando a impressão automática roda, então cada pedido gera exatamente uma comanda, sem trocar conteúdo.
- [ ] **CA03:** Dado que o `print()` lança erro, quando o trabalho falha, então o registro não recebe `confirmado_em` e o pedido aparece como "não impresso".
- [ ] **CA04:** Dado um pedido "não impresso", quando o operador toca "Reimprimir", então a comanda sai e o selo some.
- [ ] **CA05:** Dado a tela do bar offline enquanto a cozinha imprime a comanda dela, quando o bar reconecta, então o bar imprime a sua comanda (caso negativo: não considerar a da cozinha).
- [ ] **CA06:** Dado o canal realtime em `CLOSED` e depois `SUBSCRIBED` sem evento `online`, quando um pedido foi criado durante a queda, então ele aparece no KDS e no PDV logo após o `SUBSCRIBED`.
- [ ] **CA07:** Dado um evento realtime perdido sem queda detectada, quando passa a verificação de 45 s, então o pedido faltante aparece.
- [ ] **CA08:** Dado uma encomenda feita às 18h para 21h30 com antecedência de 20 min, quando entra no KDS às 21h10, então o cronômetro mostra 00:00, o semáforo está verde e não toca beep.
- [ ] **CA09:** Dado um pedido sem `retirada_em`, quando exibido, então o tempo continua medido desde `created_at` (comportamento atual preservado).
- [ ] **CA10:** Dado 3 pedidos marcados como prontos em 2 s, quando o som está ativo, então os 3 anúncios são falados em ordem; dado 8 em fila, só os 5 mais recentes são falados.

## O que a atividade não inclui

- Impressão direta via ESC/POS (WebUSB/serial) sem diálogo do navegador: motivo: depende de hardware e driver; outra iniciativa.
- Filtro do realtime por canal/tabela no admin e no site: motivo: CAF-000139.
- Mudar a antecedência padrão de 20 min: motivo: já é configuração do admin.

### Considerado para o futuro (P2)

- Painel de saúde das impressoras (última comanda confirmada por estação) no admin.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O navegador do tablet da cozinha dispara `afterprint` com impressão silenciosa (kiosk-printing)? Se não, usar só o tempo-limite | dev | Não | |
| D02 | Limite da fila de voz: 5 é suficiente no intervalo? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Pedido misto | integração (harness `pedido-print.js` + `cozinha.js`, `print` simulado) | CA01 | Disparar pedido com 2 estações | 2 trabalhos, conteúdos distintos |
| CT02 | Concorrência | integração | CA02 | Dois pedidos com 100 ms | 2 impressões corretas, ordem preservada |
| CT03 | Falha de impressão | integração | CA03 | `print` lança | Sem confirmação; selo visível |
| CT04 | Confirmação e retomada | pgTAP | CA03, CA04 | Reservar, não confirmar, avançar 2 min, reservar de novo | Segunda reserva aceita |
| CT05 | Reimprimir | integração (DOM do KDS) | CA04 | Clicar no botão | Trabalho enfileirado; selo some |
| CT06 | Filtro por estação | unit/integração | CA05 | Logs só da cozinha; tela bar | Bar imprime |
| CT07 | Reconnect | integração (canal realtime simulado) | CA06 | Emitir `CLOSED` → `SUBSCRIBED` | Carga incremental chamada |
| CT08 | Consistência | integração (timers falsos) | CA07 | Omitir evento; avançar 45 s | Pedido carregado |
| CT09 | SLA de encomenda | unit (relógio fixo) | CA08, CA09 | Calcular estado de pedido com e sem `retirada_em` | Tempo 0 e verde / desde criação |
| CT10 | Fila de voz | unit (`speechSynthesis` simulado) | CA10 | 3 e 8 anúncios | Ordem e limite respeitados |
| CT11 | Pico real | manual | CA01, CA02, CA06 | 10 pedidos mistos com Wi-Fi oscilando | 20 comandas, nenhuma faltando |

## URL Complementar

- Documentação técnica: `js/pedido-print.js`, `js/cozinha.js`, `js/pdv/realtime.js`, `supabase/migration_caf_000028_tela_impressora.sql`, `supabase/migration_caf_000082_seguranca.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000023](CONCLUIDAS/CAF-000023-correcoes-comanda-e-chamada-por-voz.md), [CAF-000025](CONCLUIDAS/CAF-000025-tempo-alvo-de-preparo-e-semaforo.md), [CAF-000028](CONCLUIDAS/CAF-000028-tela-impressora-e-comanda-por-estacao.md), [CAF-000030](CONCLUIDAS/CAF-000030-atualizacao-incremental-do-kds.md), [CAF-000038](CONCLUIDAS/CAF-000038-pedido-online-para-retirada.md), [CAF-000043](CONCLUIDAS/CAF-000043-etiqueta-de-copo-e-embalagem.md); novas: CAF-000135, CAF-000137, CAF-000139
- Referências de design: MDN, "Window: afterprint event"; MDN, "SpeechSynthesis"
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
