# CAF-000010 — [PDV] [Cozinha] [Impressão] Nome do cliente e pedido para viagem

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + cozinha + impressão | 🟡 Média | P | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir informar o nome do cliente e marcar o pedido como "para viagem" / balcão, sem obrigar a escolha de mesa.
- **Por que é necessário:** hoje `pedidos.mesa_codigo` é obrigatório (`NOT NULL`, `supabase/pedidos_schema.sql:96`) e a chamada por voz usa o número do pedido e a mesa. Pedidos de balcão ou para levar precisam de uma "mesa fictícia", e a cozinha não sabe que precisa embalar.
- **Qual valor será agregado:** chamada mais humana ("Pedido da Ana, pronto!"), embalagem correta para viagem e menos confusão no balcão.
- **Para quem é destinado:** baristas, cozinha e clientes.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Colunas `pedidos.cliente_nome TEXT` e `pedidos.para_viagem BOOLEAN NOT NULL DEFAULT false`.
- [ ] Tornar `mesa_codigo` opcional **ou** criar a mesa especial `BALCAO` — definir (sugestão: mesa `BALCAO`, para não mexer nas regras de cortesia por mesa).
- [ ] Carrinho: campo "Nome do cliente" (opcional) e toggle "🥡 Para viagem".
- [ ] `criar_pedido` recebe e grava os novos campos.
- [ ] Cozinha: destaque "🥡 VIAGEM" e nome do cliente no card.
- [ ] Comanda impressa com nome e "VIAGEM".
- [ ] Chamada por voz usa o nome quando existir ("Pedido da Ana, pronto!").
- [ ] Nome aparece nos cards do PDV e na lista do admin.

### Requisitos não funcionais
- [ ] Nome limitado a 40 caracteres e exibido com `escapeHtml`.
- [ ] Campo não obrigatório, para não atrasar o atendimento.

### Dependências técnicas
- RPC `criar_pedido` (`supabase/migration_fase3_final.sql:311`).
- Funções de voz `chamarPedidoVoz` (`js/pedidos.js:377`, `js/cozinha.js:174`).

### Recursos necessários
- Decisão do cliente: mesa `BALCAO` ou mesa opcional.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o barista informou "Ana" e marcou "Para viagem", **quando** envia o pedido, **então** a cozinha vê "🥡 VIAGEM · Ana" e a comanda sai com essas informações.
- [ ] **Dado que** o pedido tem nome, **quando** fica pronto e é chamado por voz, **então** a voz diz "Pedido da Ana, pronto".
- [ ] **Dado que** o pedido não tem nome, **quando** é chamado, **então** a voz usa número e mesa, como hoje.
- [ ] **Dado que** o nome tem `<b>teste</b>`, **quando** aparece na cozinha, **então** é exibido como texto literal.

---

## O que a atividade não inclui

- Cadastro de clientes, telefone ou histórico.
- Envio de mensagem (WhatsApp/SMS) quando o pedido fica pronto.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Viagem com nome | Nome "Ana" + viagem | Destaque na cozinha e comanda |
| 2 | Só nome | Nome sem viagem | Nome aparece; sem selo de viagem |
| 3 | Sem nome | Pedido comum | Igual ao atual |
| 4 | Voz | Chamar pedido com nome | Fala o nome |
| 5 | XSS | Nome com HTML | Texto literal |
| 6 | Balcão | Pedido sem mesa (mesa `BALCAO`) | Aceito e exibido como Balcão |
| 7 | Limite | Nome com 60 caracteres | Cortado/recusado em 40 |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 10
- Código: `js/pedidos.js:377`, `js/cozinha.js:174`, `js/pedido-print.js`
- Schema: `supabase/pedidos_schema.sql:93`
