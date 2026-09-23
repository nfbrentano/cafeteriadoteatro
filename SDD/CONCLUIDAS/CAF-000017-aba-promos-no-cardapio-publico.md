# CAF-000017 — [Cardápio] Aba "Promos" no cardápio público

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cardápio | 🟢 Baixa | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** exibir no cardápio público as promoções de preço do dia e da semana.
- **Por que é necessário:** as promoções por dia da semana já existem no banco (`promocoes`, `promocoes_do_dia`) e são aplicadas no PDV, mas `js/cardapio-dynamic.js` não as mostra. O cliente só descobre a promoção se o barista contar. Item pendente do [TAREFAS.md](TAREFAS.md) 7.11.
- **Qual valor será agregado:** divulgação das promoções para quem consulta o cardápio (inclusive pelo QR na mesa) e aumento das vendas dos itens promovidos.
- **Para quem é destinado:** clientes do café.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Aba "🔥 Promos" no topo do cardápio, com duas visões: **Hoje** e **Na semana** (agenda Seg → Dom).
- [ ] Cada promoção mostra nome, descrição, tipo em texto claro ("2ª unidade com 50%") e os produtos/categorias participantes.
- [ ] Selo "PROMO HOJE" nos cards dos produtos em promoção no dia.
- [ ] Esconder a aba quando não houver promoção ativa.
- [ ] Respeitar vigência (`vigencia_inicio` / `vigencia_fim`) e `ativo`.

### Requisitos não funcionais
- [ ] Dia da semana calculado no fuso `America/Sao_Paulo`.
- [ ] Não piorar o carregamento do cardápio (uma consulta a mais, no máximo).
- [ ] Leitura pública via RLS de `SELECT` já existente.
- [ ] Layout funcionando em 360 px sem scroll horizontal.

### Dependências técnicas
- Tabelas `promocoes` e `promocao_itens` e função `promocoes_do_dia` (`supabase/migration_fase3_final.sql:47`, `:226`).
- Cache do service worker (`sw.js`) não pode deixar promoções de outro dia.

### Recursos necessários
- Imagens das promoções, se o cliente quiser usar `imagem_url`.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** existe "Terça do Cappuccino", **quando** um cliente abre o cardápio numa terça, **então** vê a promoção em "Hoje" e o selo nos cappuccinos.
- [ ] **Dado que** é quarta, **quando** o cliente abre "Na semana", **então** vê a promoção de terça na agenda, mas sem selo nos produtos.
- [ ] **Dado que** não há promoção ativa, **quando** o cardápio carrega, **então** a aba "Promos" não aparece.
- [ ] **Dado que** a promoção terminou ontem (vigência), **quando** o cardápio carrega, **então** ela não aparece.

---

## O que a atividade não inclui

- Banner/barra de campanha (`promotions`), que já existe e continua separado.
- Pedido pelo próprio cliente.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Promo do dia | Abrir na terça | Aparece em "Hoje" + selo |
| 2 | Agenda | Abrir na quarta | Terça na agenda, sem selo |
| 3 | Sem promo | Desativar todas | Aba escondida |
| 4 | Vigência | Promo expirada | Não aparece |
| 5 | Fuso | Acessar às 23:30 de segunda (Brasília) | Ainda mostra promo de segunda |
| 6 | Mobile | 360 px | Sem scroll horizontal |
| 7 | Categoria | Promo por categoria | Todos os produtos da categoria com selo |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 17
- Pendência herdada: [TAREFAS.md](TAREFAS.md) · seção 7.11
- Código: `js/cardapio-dynamic.js`, `cardapio.html`, `js/pedidos.js:289` (`loadPromocoes`)
- Schema: `supabase/migration_fase3_final.sql:47`, `:226`
