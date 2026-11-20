# [FEAT] Capacidade por janela do intervalo e tempo estimado de retirada dinâmico

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Trocar o limite fixo de "N pedidos por janela de 15 minutos" por uma capacidade calculada a partir do tempo de preparo dos itens e da equipe em cada estação, com janelas de 5 minutos no intervalo do espetáculo. O tempo de retirada prometido ao cliente passa a considerar a fila real do KDS.
- **Problema e evidência:**
  - *Hoje no sistema:* `criar_pedido_online` conta pedidos na mesma janela fixa de 15 minutos e compara com um número fixo (`supabase/migration_caf_000038_pedido_online.sql:294-306`, `IF v_ocupacao_janela >= v_limite_janela`). O limite vem de `pedido_online_limite_janela` (padrão 5, `:110` e `:157`). Um pedido de 1 espresso pesa o mesmo que um de 8 bebidas geladas.
  - O tempo prometido é fixo: `v_retirada_em := v_agora + (v_tempo_estimado || ' minutes')` (`:291`), com `pedido_online_tempo_estimado_min` = 15 (`:37`), mesmo com o KDS lotado ou vazio. `consultar_janelas_ocupadas_online` devolve só contagem por janela de 15 min (`:70-95`), e o cardápio monta as janelas a partir dela (`js/cardapio-cliente-pedido.js:730-740`).
  - Só entram na conta pedidos com `retirada_em` preenchido. Pedidos do totem, do QR da mesa e do PDV que estão na fila do KDS não contam.
  - Os dados para calcular carga já existem: `categorias.tempo_alvo_min` e `produtos.tempo_alvo_min` (CAF-000025; `supabase/migration_caf_000029_tempo_alvo_semaforo.sql:8-21`, cafés quentes 5 min, gelados 7 min) e a estação de cada item (`pedido_itens.estacao`).
  - A falta de lock e a contagem de `aguardando_aprovacao` são defeitos tratados na CAF-000131. Esta SDD é a evolução funcional e parte dessa correção.
  - *Mercado:* a Toast calcula o "quote time" (SmartQuote) pela carga da cozinha e limita pedidos por janela de 15 min. A Starbucks usa o Smart Queue para sequenciar pedidos do app e testa agendamento com até 1 h de antecedência.
- **Impacto de não fazer:** No intervalo (cerca de 15 a 20 minutos), o bar aceita mais bebidas do que consegue entregar ou recusa pedidos pequenos sem necessidade; cliente que volta ao lugar sem a bebida; promessa de horário que não se cumpre e reclamação na avaliação.
- **Para quem é destinado:** Cliente que faz pré-pedido do intervalo ou pedido online; barista e gerente (configuração da capacidade).
- **História de usuário:** Como espectador, quero escolher uma janela de 5 minutos no intervalo que o bar realmente consiga cumprir, para pegar minha bebida e voltar a tempo para o segundo ato.
- **Como saberemos que deu certo:** Pelo menos 90% dos pedidos agendados ficam prontos até o fim da janela prometida (medido por `pronto_em` contra `retirada_em`); 0 janelas com carga acima de 110% da capacidade configurada; erro médio do tempo estimado "o quanto antes" ≤ 5 min.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Configuração de capacidade por estação (`capacidade_producao`: estação, minutos de preparo por janela, por modo: dia normal / dia de espetáculo) no admin | P0 | CA01 |
| RF02 | Carga do pedido = soma por estação de `quantidade × tempo_alvo_min` (produto, senão categoria, senão padrão de 5 min); função `fn_carga_pedido(itens)` usada no servidor | P0 | CA02 |
| RF03 | Reserva de capacidade: `criar_pedido_online` (e o pré-pedido do intervalo) só aceita se a carga da estação mais exigida cabe na janela escolhida, com lock por janela (`pg_advisory_xact_lock`) | P0 | CA03, CA04 |
| RF04 | Janelas de 5 min durante o intervalo do dia de espetáculo (horário em `espetaculo_horario_intervalo`, CAF-000062) e de 15 min no resto do dia, ambos configuráveis | P0 | CA05 |
| RF05 | `consultar_disponibilidade_janelas(data, itens)` devolve, para o carrinho atual, quais janelas cabem, sem expor quantos pedidos existem | P0 | CA06 |
| RF06 | Tempo estimado "o quanto antes" = carga pendente no KDS da estação (itens sem `pronto_em`) ÷ capacidade por minuto + preparo do próprio pedido, arredondado para cima em múltiplos de 5 min, com mínimo configurável | P1 | CA07 |
| RF07 | Pedidos de totem, QR e PDV entram na carga das janelas como consumo imediato (sem reservar janela futura) | P1 | CA08 |
| RF08 | Painel no admin/KDS com a ocupação de cada janela do intervalo (barra por estação) e botão para pausar novas reservas | P1 | CA09 |
| RF09 | Ao lotar a janela escolhida, oferecer as duas próximas janelas livres | P1 | CA10 |
| RF10 | Ajuste automático do tempo de preparo pelo histórico (`iniciado_em` → `pronto_em`) | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Sem *overbooking* sob concorrência: 50 pedidos simultâneos na mesma janela nunca passam da capacidade | P0 | CA04 |
| RNF02 | `consultar_disponibilidade_janelas` responde em < 300 ms com 500 pedidos no dia | P1 | CA06 |
| RNF03 | Endpoint anônimo devolve só "cabe/não cabe" por janela (sem contagem nem dados de pedidos) | P0 | CA06 |
| RNF04 | Com a capacidade desligada, o comportamento é o atual (limite fixo) | P0 | CA11 |

### Dependências técnicas

- CAF-000131 (lock e contagem correta na janela) e CAF-000135 (`is_intervalo` respeitado pelo servidor) antes desta.
- CAF-000025 (`tempo_alvo_min`), CAF-000062 (modo dia de espetáculo), CAF-000038 (pedido online).
- Telas: `js/cardapio-cliente-pedido.js` (seleção de janela), `js/totem.js` (pré-pedido do intervalo), `js/admin/settings.js` (configuração), `cozinha.html` (painel de ocupação).

### Recursos necessários

- Medição de quantas bebidas por minuto o bar entrega no intervalo com 1, 2 e 3 baristas (para calibrar a capacidade inicial).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o admin, quando configura o bar com 20 minutos de preparo por janela de 5 min em dia de espetáculo, então o valor fica salvo e é usado só nesse modo.
- [ ] **CA02:** Dado um pedido com 2 cappuccinos (5 min) e 1 frappé (7 min), quando a carga é calculada, então resulta em 17 minutos para o bar.
- [ ] **CA03:** Dado a janela 21:05–21:10 com 15 de 20 minutos ocupados, quando chega um pedido com carga 7, então é recusado com sugestão de janelas; com carga 5, é aceito.
- [ ] **CA04:** Dado 50 chamadas simultâneas para a mesma janela, quando todas terminam, então a carga aceita não passa de 20 minutos.
- [ ] **CA05:** Dado modo dia de espetáculo com intervalo às 21:00, quando o cliente abre a seleção, então vê janelas de 5 min (21:00, 21:05, 21:10…) e, fora do intervalo, janelas de 15 min.
- [ ] **CA06:** Dado um usuário anônimo, quando consulta a disponibilidade, então recebe só a lista de janelas com "disponível: sim/não", sem quantidades nem pedidos.
- [ ] **CA07:** Dado 30 minutos de carga pendente no bar e capacidade de 4 min/min, quando um cliente pede "o quanto antes" um latte (5 min), então o tempo prometido é de 15 minutos (7,5 + 5 = 12,5, arredondado para 15).
- [ ] **CA08:** Dado 10 bebidas lançadas no totem às 21:02, quando um pedido online tenta a janela 21:00–21:05, então essa carga já conta como ocupada.
- [ ] **CA09:** Dado o gerente pausando as reservas no painel, quando um cliente tenta reservar, então nenhuma janela aparece disponível e os pedidos já aceitos continuam.
- [ ] **CA10:** Dado a janela escolhida lotada, quando o cliente envia, então vê as duas próximas janelas livres para escolher, sem perder o carrinho.
- [ ] **CA11:** Dado a capacidade dinâmica desligada, quando pedidos online chegam, então vale o limite fixo de `pedido_online_limite_janela` (caso negativo: nenhuma regra nova é aplicada).

## O que a atividade não inclui

- Sequenciamento automático da fila do KDS (reordenar itens): motivo: o KDS já tem prioridade manual (CAF-000029); avaliar depois de medir.
- Capacidade por pessoa escalada: motivo: depende da escala (CAF-000154); aqui a capacidade é configurada.
- Previsão de demanda do intervalo: motivo: prematuro; precisa de histórico com janelas de 5 min.

### Considerado para o futuro (P2)

- Ajuste automático do preparo pelo histórico (RF10).
- Capacidade derivada da escala do turno (CAF-000154).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Duração real do intervalo e se há mais de um intervalo por espetáculo | PO | Não | |
| D02 | Capacidade inicial por estação (minutos de preparo por janela) | PO | Sim (para ligar em produção) | |
| D03 | Mostrar ao cliente o tempo estimado como faixa ("15–20 min") ou valor único? | design | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Configuração por modo | integração (`tests/caf-000146-capacidade-janelas.test.js`, admin com Supabase simulado) | CA01 | Salvar capacidade | Linha por estação/modo |
| CT02 | Cálculo de carga | pgTAP (`supabase/tests/capacidade_janelas.test.sql`) + unit (`js/utils/capacidade.js`) | CA02 | Itens com tempos diferentes | 17 min |
| CT03 | Aceite e recusa | pgTAP | CA03, CA10 | Janela 15/20 com cargas 7 e 5 | Recusa com sugestões; aceite |
| CT04 | Concorrência | integração (script com 50 chamadas paralelas ao banco de teste) | CA04 | Disparar em paralelo | Carga ≤ 20 |
| CT05 | Janelas de 5 min | unit (`js/utils/theater-mode.js` + gerador de janelas) | CA05 | Modo espetáculo às 21:00 | Janelas corretas |
| CT06 | Privacidade da consulta | pgTAP (`SET ROLE anon`) | CA06 | Chamar a RPC | Só booleanos |
| CT07 | Tempo estimado dinâmico | pgTAP + unit | CA07 | Fila de 30 min | 15 min |
| CT08 | Carga imediata | pgTAP | CA08 | Itens do totem pendentes | Janela ocupada |
| CT09 | Pausa | integração | CA09 | Pausar e consultar | Nenhuma disponível |
| CT10 | Desligado | pgTAP (`pedidos_cliente.test.sql`) | CA11 | Capacidade off | Regra antiga |
| CT11 | Intervalo real | manual (ensaio num espetáculo) | CA03, CA07 | Medir `pronto_em` x `retirada_em` | ≥ 90% no prazo |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000038_pedido_online.sql`, `supabase/migration_caf_000029_tempo_alvo_semaforo.sql`, `supabase/migration_caf_000062_dia_de_espetaculo.sql`, `js/cardapio-cliente-pedido.js`, `js/utils/theater-mode.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000025](CONCLUIDAS/CAF-000025-tempo-alvo-de-preparo-e-semaforo.md), [CAF-000038](CONCLUIDAS/CAF-000038-pedido-online-para-retirada.md), [CAF-000062](CONCLUIDAS/CAF-000062-modo-dia-de-espetaculo-reserva-intervalo.md), [CAF-000029](CONCLUIDAS/CAF-000029-prioridade-e-operacao-por-teclado.md); novas: CAF-000131, CAF-000135, CAF-000154
- Referências de design: Toast quote time (https://support.toasttab.com/en/article/Managing-Your-Quote-Time-Strategy); Starbucks Smart Queue (https://www.customerexperiencedive.com/news/starbucks-ceo-niccol-bringing-order-to-mobile-ordering/738894/) e agendamento (https://www.nrn.com/top-500-restaurants/starbucks-is-testing-out-an-ability-to-schedule-orders-ahead-of-time)
- Requisitos originais: —
- Issue / PR relacionado: —
