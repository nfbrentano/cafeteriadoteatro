# CAF-000003 — [PDV] Limitar pedidos ativos carregados no PDV

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV | 🔴 Alta | P | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** mudar a consulta de pedidos ativos do PDV para trazer só os pedidos que ainda importam para o atendimento.
- **Por que é necessário:** `loadActivePedidos` (`js/pedidos.js:~925`) busca todos os pedidos com status `pendente`, `em_preparo` e `concluido`, **sem filtro de data**. Todo pedido concluído desde o início do sistema entra na lista, então a aba Mesas mostra consumo de dias anteriores como se fosse atual e a consulta fica cada vez mais lenta. A cozinha já faz o certo, limitando os concluídos ao dia (`js/cozinha.js:264`).
- **Qual valor será agregado:** a aba Mesas mostra só o consumo real do dia, o PDV carrega mais rápido e a prévia da conta deixa de somar pedidos antigos.
- **Para quem é destinado:** baristas.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Carregar `pendente` e `em_preparo` sem limite de data (pedido esquecido de ontem ainda precisa aparecer).
- [ ] Carregar `concluido` só a partir das 00:00 do dia, no fuso `America/Sao_Paulo`.
- [ ] Depois da [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md): considerar ativa a mesa com pedidos não pagos, independentemente da data.
- [ ] Depois da [CAF-000001](CAF-000001-status-entregue-persistido-no-banco.md): excluir pedidos `entregue` **e** pagos.
- [ ] Extrair o cálculo de "início do dia" para uma função compartilhada entre PDV e cozinha.

### Requisitos não funcionais
- [ ] A consulta do PDV deve responder em menos de 1 s com 10 mil pedidos na base.
- [ ] Conferir se existe índice em `pedidos(created_at)`; criar se não houver.

### Dependências técnicas
- Nenhuma obrigatória. Os ajustes finais dependem de [CAF-000001](CAF-000001-status-entregue-persistido-no-banco.md) e [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md).

### Recursos necessários
- Base de teste com pedidos de dias diferentes.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** existem pedidos concluídos ontem na mesa 2, **quando** o barista abre a aba Mesas hoje, **então** a mesa 2 não mostra esse consumo.
- [ ] **Dado que** um pedido de ontem ficou `pendente`, **quando** o barista abre o PDV, **então** ele aparece na lista de pedidos ativos.
- [ ] **Dado que** são 00:30 no horário de Brasília, **quando** o PDV carrega, **então** o corte de "hoje" usa o fuso de São Paulo, e não o UTC.
- [ ] **Dado que** a base tem 10 mil pedidos, **quando** o PDV carrega, **então** a consulta volta em menos de 1 s.

---

## O que a atividade não inclui

- Paginação ou histórico de pedidos antigos no PDV (isso fica no admin).
- Mudanças na consulta da cozinha, além de reaproveitar a função de data.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Concluído de ontem | Inserir pedido `concluido` com `created_at` de ontem | Não aparece no PDV |
| 2 | Pendente de ontem | Inserir pedido `pendente` de ontem | Aparece no PDV |
| 3 | Concluído de hoje | Concluir pedido hoje | Aparece em "Prontos" |
| 4 | Virada do dia | Simular 23:59 e 00:01 (Brasília) | Corte correto nos dois horários |
| 5 | Prévia da conta | Mesa com pedido de ontem e de hoje | Prévia soma só o de hoje |
| 6 | Desempenho | Base com 10 mil pedidos | Carga < 1 s |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 3
- Código: `js/pedidos.js:~925` (`loadActivePedidos`), `js/cozinha.js:248` (`fetchPedidosIniciais`)
