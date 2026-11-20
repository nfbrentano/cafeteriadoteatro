# [FEAT] Cardápio e preço por horário (dayparting) e cardápio expresso do intervalo

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Permitir que categorias e produtos fiquem visíveis e vendáveis só em certas faixas de dia e horário, com preço próprio em algumas faixas, e criar o "cardápio expresso do intervalo": durante o intervalo de um espetáculo, os canais do cliente mostram só os itens rápidos. O servidor aplica a mesma regra, para que o preço exibido seja o cobrado.
- **Problema e evidência:**
  - *Hoje no sistema:* produtos e categorias não têm horário. O snapshot de produção não traz nenhuma coluna de janela de horário em `produtos` nem em `categorias` (`tests/fixtures/schema-snapshot.json`). A disponibilidade é só `ativo`/`disponivel`/esgotado. O horário existe apenas para a loja inteira (`business_hours`, `loja_esta_aberta`).
  - As promoções têm só dia da semana: `promocoes.dias_semana` (`supabase/migration_fase3_final.sql:55`) e o filtro `EXTRACT(DOW FROM p_data) = ANY(p.dias_semana)` em `promocoes_do_dia` (`:235`). Não existe "happy hour" das 15h às 17h.
  - O modo dia de espetáculo (CAF-000062) mostra o aviso e permite reservar para o intervalo (`js/totem.js:457-465`, `:1113-1115`; `js/utils/theater-mode.js`), mas o cardápio continua inteiro. No intervalo, o cliente pode pedir um crepe de 15 minutos que não fica pronto antes do segundo ato.
  - *Mercado:* o Square tem categorias com dias e horários na loja online; o Goomer ajusta pratos e preços por horário.
  - *Regra:* pelo Decreto 5.903/2006, o preço exibido deve ser o preço cobrado. Logo, o servidor aplica a faixa vigente no momento do pedido, e não o front.
- **Impacto de não fazer:** Pedidos lentos no intervalo atrasam todos os outros; não há como oferecer preço diferente para o público universitário diurno (ex.: café + pão de queijo das 7h às 10h) sem cadastrar produtos duplicados; itens de almoço aparecem à noite.
- **Para quem é destinado:** Cliente (QR, online, totem), operador do PDV, dono (configuração).
- **História de usuário:** Como dono, quero que no intervalo o cardápio do QR e do totem mostre só bebidas e itens de balcão, e que de manhã o combo universitário tenha preço especial, para vender o que a equipe consegue entregar a tempo.
- **Como saberemos que deu certo:** 0 pedidos de itens fora da faixa aceitos pelo servidor; tempo médio de preparo dos pedidos do intervalo menor que hoje (medido por `iniciado_em`→`pronto_em`) no primeiro mês; preço cobrado = preço exibido em 100% dos testes de virada de faixa.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Tabela `faixas_horario` (nome, dias da semana, hora início/fim no fuso de SP, ativa) e vínculos com categorias e produtos (`disponivel_em_faixas`); item sem vínculo fica disponível o dia todo, como hoje | P0 | CA01, CA02 |
| RF02 | Preço por faixa: `produto_precos_faixa` (produto, faixa, preço); fora da faixa vale `produtos.preco` | P1 | CA03 |
| RF03 | Função de servidor `fn_produto_vigente(produto_id, momento)` devolvendo disponível/preço, usada em todas as RPCs de criação de pedido e em `adicionar_itens_pedido` | P0 | CA04, CA05 |
| RF04 | Cardápio expresso do intervalo: marcar categorias/produtos como "expresso"; com o modo espetáculo ativo, da abertura do intervalo até o fim, QR, online e totem mostram só itens expressos (o PDV mostra tudo, com selo) | P0 | CA06, CA07 |
| RF05 | Pré-pedido do intervalo (CAF-000062) só aceita itens expressos | P0 | CA08 |
| RF06 | QR/online/totem: itens fora da faixa somem da lista; se o cliente tinha o item no carrinho e a faixa virou, o envio avisa e oferece remover | P0 | CA09 |
| RF07 | Admin: editor de faixas com pré-visualização "o cardápio às 21h de sábado" | P1 | CA10 |
| RF08 | Promoções com faixa horária, além de dia da semana | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Horário sempre no fuso `America/Sao_Paulo` no servidor (`fn_inicio_dia_sp` / CAF-000080), independente do relógio do aparelho | P0 | CA05 |
| RNF02 | Virada de faixa: tolerância de 2 minutos para carrinho iniciado antes da virada (preço antigo honrado), registrada no pedido | P1 | CA11 |
| RNF03 | Sem faixas cadastradas, o cardápio e os preços são exatamente os atuais | P0 | CA02 |
| RNF04 | Catálogo público continua em cache do service worker; a faixa é recalculada no cliente a cada minuto sem recarregar | P1 | CA09 |

### Dependências técnicas

- Modo dia de espetáculo (CAF-000062, `js/utils/theater-mode.js`), promoções (`supabase/migration_fase3_final.sql`), fuso (CAF-000080).
- CAF-000128 (preço calculado no servidor) e CAF-000135 (pedido do intervalo respeitado pelo servidor e promoção por categoria) antes desta.
- CAF-000130 (fuso horário) e CAF-000140 (cache do catálogo).
- Telas: `js/cardapio-cliente-pedido.js`, `js/cardapio-dynamic.js`, `js/totem.js`, `js/pdv/catalogo.js`, `js/admin/categories.js`, `js/admin/products.js`.

### Recursos necessários

- Lista dos itens expressos e das faixas/preços desejados (manhã universitária etc.).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado a categoria "Almoço" vinculada à faixa seg–sex 11h–14h, quando o cliente abre o QR às 15h de terça, então a categoria não aparece; às 12h, aparece.
- [ ] **CA02:** Dado nenhum vínculo de faixa, quando qualquer canal carrega o cardápio, então todos os itens ativos aparecem com o preço de hoje (caso negativo: nada muda).
- [ ] **CA03:** Dado o "Combo Universitário" a R$ 14,00 na faixa 7h–10h e R$ 17,00 fora dela, quando pedido às 9h, então custa R$ 14,00; às 11h, R$ 17,00.
- [ ] **CA04:** Dado um payload enviado às 15h com um item da faixa do almoço, quando chega ao servidor, então é recusado com "Item disponível das 11h às 14h".
- [ ] **CA05:** Dado um aparelho com o relógio errado (2 horas adiantado), quando envia um pedido, então vale o horário do servidor em SP.
- [ ] **CA06:** Dado o modo espetáculo ativo com intervalo às 21:00, quando o cliente abre o QR às 21:02, então vê só os itens expressos e um aviso "Cardápio do intervalo".
- [ ] **CA07:** Dado o mesmo momento, quando o operador abre o PDV, então vê todos os itens e os expressos com selo.
- [ ] **CA08:** Dado um pré-pedido do intervalo com um crepe (não expresso), quando enviado, então o servidor recusa e indica o item.
- [ ] **CA09:** Dado um cliente com item da faixa no carrinho quando a faixa termina, quando toca em enviar, então vê o aviso e a opção de remover o item, sem perder o resto do carrinho.
- [ ] **CA10:** Dado o editor do admin, quando escolho "sábado 21h", então a pré-visualização mostra exatamente os itens e preços que o cliente veria.
- [ ] **CA11:** Dado um carrinho montado às 9:59 com o preço da manhã, quando enviado às 10:01, então o preço da manhã é honrado e o pedido registra a tolerância; enviado às 10:03, vale o preço novo.

## O que a atividade não inclui

- Preço diferente por canal (QR mais barato que balcão): motivo: decisão comercial ainda não tomada; a estrutura de faixa permite depois.
- Agenda de faixas por data específica (feriados): motivo: baixo impacto; feriados usam `business_hours`.
- Ocultar itens no PDV: motivo: o operador precisa vender qualquer item em exceção; usa o selo.

### Considerado para o futuro (P2)

- Promoções por faixa horária (RF08).
- Faixas automáticas a partir da agenda de espetáculos da bilheteria (CAF-000153).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Quais itens são "expressos" e até quantos minutos de preparo? | PO | Sim (para ligar o expresso) | |
| D02 | O cardápio expresso começa no início do intervalo ou X minutos antes (pré-pedidos)? | PO | Não | |
| D03 | Tolerância de virada de faixa de 2 minutos é aceitável? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Visibilidade por faixa | unit (`tests/caf-000151-dayparting.test.js`, `js/utils/faixas-horario.js` com relógio fixo) | CA01, CA02 | Avaliar às 12h e 15h | Aparece/some |
| CT02 | Preço por faixa no servidor | pgTAP (`supabase/tests/faixas_horario.test.sql`, `now()` controlado) | CA03, CA04 | Criar pedidos às 9h, 11h e 15h | Preço e recusa corretos |
| CT03 | Relógio do aparelho | pgTAP | CA05 | Payload com horário do cliente divergente | Vale o servidor |
| CT04 | Expresso no QR e PDV | DOM (QR e `js/pdv/catalogo.js`) | CA06, CA07 | Modo espetáculo às 21:02 | Filtrado no QR; selo no PDV |
| CT05 | Pré-pedido com item não expresso | pgTAP | CA08 | Enviar crepe | Recusa |
| CT06 | Carrinho na virada | DOM (QR) | CA09 | Avançar o relógio | Aviso e remoção |
| CT07 | Pré-visualização | integração (admin) | CA10 | Escolher sábado 21h | Lista igual à do cliente |
| CT08 | Tolerância | pgTAP | CA11 | Enviar às 10:01 e 10:03 | Preço antigo e novo |
| CT09 | Sem regressão | pgTAP + suítes existentes | CA02 | Rodar `criar_pedido.test.sql` | Sem diferença |

## URL Complementar

- Documentação técnica: `js/utils/theater-mode.js`, `js/totem.js`, `js/cardapio-cliente-pedido.js`, `js/pdv/catalogo.js`, `supabase/migration_fase3_final.sql`, `supabase/migration_caf_000062_dia_de_espetaculo.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000062](CONCLUIDAS/CAF-000062-modo-dia-de-espetaculo-reserva-intervalo.md), [CAF-000080](CONCLUIDAS/CAF-000080-fuso-horario-e-corte-do-dia-operacional.md), [CAF-000017](CONCLUIDAS/CAF-000017-aba-promos-no-cardapio-publico.md), [CAF-000025](CONCLUIDAS/CAF-000025-tempo-alvo-de-preparo-e-semaforo.md); novas: CAF-000128, CAF-000130, CAF-000135, CAF-000140, CAF-000146, CAF-000153
- Referências de design: Square categorias por horário (https://squareup.com/help/article/7075-set-up-time-based-categories-in-your-square-online-store)
- Requisitos originais: Decreto 5.903/2006 (preço exibido = cobrado)
- Issue / PR relacionado: —
