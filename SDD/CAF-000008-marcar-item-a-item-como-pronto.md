# CAF-000008 — [Cozinha] Marcar item a item como pronto

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha | 🟡 Média | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir que a cozinha marque cada item do pedido como pronto, com progresso visível no card.
- **Por que é necessário:** hoje o card só tem os botões de pedido inteiro ("Em preparo" e "Pronto", `js/cozinha.js:~380`). Em pedidos grandes, a equipe não sabe o que já saiu e o que falta, principalmente quando mais de uma pessoa trabalha no mesmo pedido.
- **Qual valor será agregado:** controle visual do preparo, menos itens esquecidos e base para medir tempo de preparo por item.
- **Para quem é destinado:** equipe da cozinha (e do bar, com a [CAF-000007](CAF-000007-separacao-por-estacao-bar-cozinha.md)).

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Coluna `pedido_itens.pronto_em TIMESTAMPTZ` (nulo = não pronto).
- [ ] Tocar no item do card alterna pronto/não pronto (item fica com ✓ e esmaecido).
- [ ] Barra de progresso no card: "2/4 itens".
- [ ] Marcar o primeiro item move o pedido para "Em preparo" automaticamente.
- [ ] Quando todos os itens não cancelados estiverem prontos, o pedido vai para "Prontos" automaticamente (ou pede confirmação, conforme decisão).
- [ ] Botão "Pronto" do pedido inteiro continua existindo e marca todos os itens.
- [ ] Itens cancelados e cortesias contam no progresso de forma coerente (cancelado não conta; cortesia conta).

### Requisitos não funcionais
- [ ] Área de toque do item com pelo menos 44 px de altura.
- [ ] Sincronizado entre KDS abertos em até 2 s.

### Dependências técnicas
- [CAF-000009](CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md) (realtime em `pedido_itens`).
- Política de `UPDATE` em `pedido_itens` para o perfil `cozinha`.

### Recursos necessários
- Tablet ou tela de toque na cozinha para validar a usabilidade.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um pedido tem 4 itens, **quando** a cozinha toca em 2 deles, **então** o card mostra "2/4" e os dois itens com ✓.
- [ ] **Dado que** o pedido está "Na fila", **quando** a cozinha marca o primeiro item, **então** o pedido passa para "Em preparo".
- [ ] **Dado que** faltava 1 item, **quando** a cozinha o marca, **então** o pedido vai para "Prontos" e o barista é avisado.
- [ ] **Dado que** um item foi marcado por engano, **quando** a cozinha toca de novo, **então** ele volta a "não pronto".
- [ ] **Dado que** um item foi cancelado, **quando** a cozinha vê o progresso, **então** o item não entra na contagem.

---

## O que a atividade não inclui

- Separação por estação ([CAF-000007](CAF-000007-separacao-por-estacao-bar-cozinha.md)).
- Relatório de tempo por item ([CAF-000014](CAF-000014-relatorios-no-admin.md)).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Progresso | Marcar 2 de 4 itens | "2/4" no card |
| 2 | Início automático | Marcar 1º item de pedido na fila | Vai para "Em preparo" |
| 3 | Fim automático | Marcar o último item | Vai para "Prontos" |
| 4 | Desmarcar | Tocar em item já pronto | Volta a "não pronto" |
| 5 | Pronto geral | Tocar "Pronto" do pedido | Todos os itens com ✓ |
| 6 | Cancelado | Pedido com 1 item cancelado | Não conta no total |
| 7 | Dois KDS | Marcar num tablet | Outro atualiza |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 8
- Código: `js/cozinha.js:300` (`renderList`), `js/cozinha.js:444` (`updateStatus`)
