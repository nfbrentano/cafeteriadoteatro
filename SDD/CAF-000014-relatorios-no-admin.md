# CAF-000014 — [Admin] Relatórios de vendas, cortesias e preparo

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin | 🟡 Média | G | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar uma aba de relatórios no admin com filtros por período, cobrindo vendas, cortesias, promoções, formas de pagamento e tempo de preparo.
- **Por que é necessário:** hoje o admin só tem os KPIs do dia (faturamento, pedidos concluídos, ticket médio e abertos — `js/admin/pedidos-admin.js:64`). O relatório de cortesias concedidas, pedido pelo cliente, ficou pendente ([TAREFAS.md](TAREFAS.md) 5.11), e não há como ver produtos mais vendidos ou horários de pico.
- **Qual valor será agregado:** decisões de cardápio, promoções e escala da equipe baseadas em dados reais.
- **Para quem é destinado:** administração / dona do café.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Filtro de período: hoje, ontem, 7 dias, mês atual, intervalo personalizado.
- [ ] **Cortesias concedidas:** total e por prato liberador (só itens `cancelado = false`).
- [ ] **Produtos mais vendidos:** quantidade e faturamento, com filtro por categoria.
- [ ] **Faturamento por forma de pagamento** (usa a tabela de pagamentos da [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md) quando existir).
- [ ] **Desconto concedido por promoção** (`pedido_itens.promocao_id` e `desconto`).
- [ ] **Tempo médio de preparo:** fila (criado → em preparo) e preparo (em preparo → pronto). Exige gravar `pedidos.iniciado_em`; `concluido_em` já é gravado (`js/cozinha.js:452`).
- [ ] **Horários de pico:** pedidos por hora do dia e por dia da semana.
- [ ] **Ticket médio** no período (hoje só existe para o dia).
- [ ] Gráficos simples + tabela com os números.

### Requisitos não funcionais
- [ ] Cálculos feitos no banco (views ou RPCs), não no navegador.
- [ ] Datas agrupadas no fuso `America/Sao_Paulo`.
- [ ] Pedidos cancelados e itens cancelados ficam fora dos totais.
- [ ] Relatório de um mês carrega em menos de 3 s.
- [ ] Acesso só para `admin`.

### Dependências técnicas
- Coluna `pedidos.iniciado_em` gravada ao passar para `em_preparo` (`js/cozinha.js:444`).
- [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md) para pagamentos reais.
- Biblioteca de gráficos leve via CDN (ou SVG próprio).

### Recursos necessários
- Base com pelo menos algumas semanas de pedidos para validar.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** foram concedidas 12 cortesias na semana, 1 delas cancelada, **quando** o admin filtra "7 dias", **então** o relatório mostra 11 cortesias, separadas por prato liberador.
- [ ] **Dado que** o período é o mês atual, **quando** o admin abre "Mais vendidos", **então** vê a lista ordenada por quantidade com o faturamento de cada produto.
- [ ] **Dado que** os pedidos têm `iniciado_em` e `concluido_em`, **quando** o admin abre "Tempo de preparo", **então** vê o tempo médio de fila e de preparo.
- [ ] **Dado que** houve promoções no período, **quando** o admin abre "Promoções", **então** vê o total de desconto por promoção.
- [ ] **Dado que** um pedido foi cancelado, **quando** qualquer relatório é gerado, **então** ele não entra nos totais.

---

## O que a atividade não inclui

- Fechamento de caixa ([CAF-000015](CAF-000015-fechamento-de-caixa-do-dia.md)).
- Exportação CSV ([CAF-000016](CAF-000016-exportar-csv.md)).
- Relatórios de custo, margem ou estoque.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Cortesias | 3 cortesias, 1 cancelada | Relatório mostra 2 |
| 2 | Mais vendidos | 5 cafés, 2 baguetes | Café em 1º |
| 3 | Cancelados | Pedido cancelado no período | Fora dos totais |
| 4 | Fuso | Pedido às 23:30 de Brasília | Conta no dia correto |
| 5 | Tempo de preparo | Pedidos com horários conhecidos | Média correta |
| 6 | Promoção | 2ª unidade 50% aplicada 4 vezes | Soma dos descontos correta |
| 7 | Permissão | Barista acessa a rota/RPC | Recusado |
| 8 | Período vazio | Filtro sem pedidos | Mensagem "Sem dados" |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 14
- Pendência herdada: [TAREFAS.md](TAREFAS.md) · seção 5.11
- Código: `js/admin/pedidos-admin.js:64` (`updateKPIs`), `js/cozinha.js:444`
- Schema: `supabase/migration_fase3_final.sql` (`pedido_itens.promocao_id`, `desconto`, `cortesia_de_item_id`)
