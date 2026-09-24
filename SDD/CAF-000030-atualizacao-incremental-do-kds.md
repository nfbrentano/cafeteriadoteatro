# CAF-000030 — [Cozinha] [Performance] Atualização incremental do KDS e coluna "Prontos" enxuta

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + PDV | 🟢 Baixa | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Trocar a recarga completa do board a cada evento de realtime por uma **atualização só do pedido afetado**.
  2. Manter a coluna "Prontos" enxuta, com os pedidos entregues recolhidos e um histórico sob demanda.
- **Por que é necessário:**
  - Cada evento em `pedidos` **ou** `pedido_itens` chama `fetchPedidosIniciais()` (`js/cozinha.js:656-662`, `:722`, `:736`), que busca **todos** os pedidos abertos e **todos** os concluídos e entregues do dia, com itens, adicionais e sabores. Um único pedido gera vários eventos (insert do pedido, dos itens, marcações de pronto), e cada tela aberta (KDS e PDV, que faz o mesmo em `js/pedidos.js:2721-2726`) repete a consulta inteira.
  - Em dia de espetáculo, perto do fim do expediente, são centenas de linhas por evento.
  - `renderList` recria todo o HTML (`container.innerHTML = ''`, `js/cozinha.js:349`) a cada evento e a cada 60 s, o que faz perder a rolagem da coluna e causa piscadas no tablet.
  - A coluna "Prontos (Hoje)" acumula **todos** os pedidos do dia, inclusive os já entregues (`js/cozinha.js:321-323`).
- **Qual valor será agregado:** KDS mais rápido e estável em tablets modestos, menor consumo do plano do Supabase e uma coluna "Prontos" que mostra só o que ainda precisa sair.
- **Para quem é destinado:** cozinha, bar e baristas (e o custo da operação).

### Referência de mercado

- **Padrão de mercado em KDS:** os pedidos saem da tela ao serem "expedidos" (*bump*), e o histórico fica numa função de **recall** ("chamar de volta os últimos pedidos") em vez de uma lista infinita.
- **SAIPOS:** a tela de pedidos tem filtros e movimentações por status. Os concluídos não ficam na tela de produção.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Realtime incremental no KDS:
  - `INSERT` ou `UPDATE` em `pedidos`: buscar só aquele pedido (select completo) e atualizar o array `pedidos`.
  - `DELETE`: remover do array.
  - Eventos em `pedido_itens`: buscar só o pedido de `payload.new.pedido_id`.
- [ ] Agrupar eventos do mesmo pedido num intervalo de 300 ms (debounce **por pedido**, não global).
- [ ] Recarga completa só no login, no `online` e no `visibilitychange` depois de mais de 60 s escondido.
- [ ] Renderização por card (chave `pedido.id`): criar, atualizar ou remover só o card que mudou, preservando a rolagem.
  - O timer de 60 s atualiza só os textos de tempo (compartilhado com a [CAF-000025](CAF-000025-tempo-alvo-de-preparo-e-semaforo.md)).
- [ ] Coluna "Prontos": mostra só os `concluido` (não entregues). Os `entregue` saem da coluna.
  - Botão "🕘 Histórico" abre os últimos 20 pedidos concluídos ou entregues do dia, com a opção de "Desfazer" ou reimprimir (*recall*).
- [ ] Aplicar a mesma estratégia incremental ao `loadActivePedidos` do PDV (`js/pedidos.js:1696`).

### Requisitos não funcionais
- [ ] **Desempenho:** no máximo 1 consulta de pedido único por evento e por tela. A renderização de 40 cards abertos leva menos de 50 ms num tablet de entrada.
- [ ] **Consistência:** se um evento de realtime se perder (reconexão), a recarga completa em `online`/`visibilitychange` corrige o estado.
- [ ] **Sem regressão:** alertas de novo pedido, cancelamento e impressão automática continuam como hoje.

### Dependências técnicas
- [CAF-000009](CONCLUIDAS/CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md) (canal em `pedido_itens`) e [CAF-000018](CONCLUIDAS/CAF-000018-tolerancia-a-queda-de-internet.md) (reconexão).
- A constante de select completo da [CAF-000023](CAF-000023-correcoes-comanda-e-chamada-por-voz.md).

### Recursos necessários
- Massa de teste com cerca de 150 pedidos no dia (script SQL de seed) para medir antes e depois.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o KDS tem 150 pedidos no dia, **quando** um item é marcado como pronto em outra tela, **então** a aba Network mostra 1 requisição de pedido único, e não a lista do dia.
- [ ] **Dado que** a cozinha rolou a coluna "Pendentes", **quando** chega um evento de realtime, **então** a rolagem é mantida.
- [ ] **Dado que** o barista marcou um pedido como entregue, **quando** o evento chega ao KDS, **então** ele sai da coluna "Prontos" e fica disponível no "Histórico".
- [ ] **Dado que** o tablet ficou 5 min em repouso, **quando** volta, **então** o board é recarregado por inteiro e fica consistente.

---

## O que a atividade não inclui

- Paginação ou histórico de dias anteriores no KDS (isso fica no admin).
- Mudanças no schema do banco.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Evento único | Marcar item pronto | 1 requisição de pedido único |
| 2 | Rajada | Pedido com 6 itens | 1 fetch por pedido (debounce) |
| 3 | Rolagem | Rolar e receber evento | Posição mantida |
| 4 | Entregue | Marcar entregue no PDV | Sai de Prontos |
| 5 | Histórico | Abrir "Histórico" | Últimos 20; desfazer funciona |
| 6 | Reconexão | Offline → online | Recarga completa |
| 7 | Repouso | Aba oculta > 60 s | Recarga completa |
| 8 | Alertas | Novo pedido / cancelamento | Som e impressão como antes |
| 9 | PDV | Mesmo teste na aba Pedidos | Incremental |

---

## URL Complementar

- Código: `js/cozinha.js:288-336` (busca e render), `js/cozinha.js:349` (innerHTML), `js/cozinha.js:656-662` e `:693-745` (debounce e realtime), `js/pedidos.js:1696-1733` e `:2721-2770`
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
- SAIPOS — Filtros e movimentações na tela de pedidos: https://meajuda.saipos.com/hc/pt-br/articles/20211500841108-Filtros-e-movimenta%C3%A7%C3%B5es-na-tela-de-pedidos
