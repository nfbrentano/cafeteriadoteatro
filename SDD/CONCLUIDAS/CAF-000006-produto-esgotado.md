# CAF-000006 — [PDV] [Admin] [Cardápio] Produto esgotado

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + admin + cardápio | 🟡 Média | P | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar um jeito rápido de marcar um produto como esgotado no dia, sem desativá-lo do cadastro.
- **Por que é necessário:** hoje só existe `produtos.ativo`, usado para tirar o produto do cardápio de vez. Quando acaba a torta do dia, a opção é desativar o produto no admin (e lembrar de reativar) ou avisar a equipe de boca. Isso gera pedidos de itens que não existem e retrabalho com o cliente.
- **Qual valor será agregado:** menos pedidos de itens em falta, cardápio público sempre correto e controle na mão do barista durante o turno.
- **Para quem é destinado:** baristas, admin e clientes que consultam o cardápio.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Coluna `produtos.disponivel BOOLEAN NOT NULL DEFAULT true`, separada de `ativo`.
- [ ] PDV: pressionar e segurar o card do produto abre "Marcar como esgotado / disponível".
- [ ] Admin: toggle "Disponível" na lista de produtos.
- [ ] Produto esgotado aparece no PDV com selo "ESGOTADO", acinzentado e sem adicionar ao carrinho.
- [ ] `criar_pedido` e `adicionar_itens_pedido` recusam produto indisponível.
- [ ] Cardápio público mostra "Indisponível hoje" no item.
- [ ] Realtime: a mudança aparece nos outros PDVs sem recarregar.
- [ ] (Opcional) Reativar todos automaticamente na virada do dia.

### Requisitos não funcionais
- [ ] Barista e admin podem alterar `disponivel`; só admin altera os demais campos do produto (RLS por coluna ou RPC dedicada).

### Dependências técnicas
- `js/pedidos.js:339` (`loadProdutos`), `js/admin/products.js`, `js/cardapio-dynamic.js`.
- Cache do service worker (`sw.js`) não pode segurar o cardápio desatualizado.

### Recursos necessários
- Acesso ao Supabase para migration.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a torta de limão acabou, **quando** o barista a marca como esgotada no PDV, **então** ela não pode mais ser adicionada ao carrinho em nenhum PDV aberto.
- [ ] **Dado que** o produto está esgotado, **quando** um cliente abre o cardápio público, **então** vê "Indisponível hoje".
- [ ] **Dado que** o produto está esgotado, **quando** alguém tenta criar pedido com ele pela API, **então** o banco recusa.
- [ ] **Dado que** o produto voltou, **quando** o barista o marca como disponível, **então** ele volta a funcionar normalmente.

---

## O que a atividade não inclui

- Controle de estoque por quantidade (fica como evolução opcional).
- Ficha técnica / baixa de insumos.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Esgotar no PDV | Segurar card → "Esgotado" | Card acinzentado, não adiciona |
| 2 | Outro PDV | Esgotar em uma aba | Outra aba atualiza |
| 3 | API | Chamar `criar_pedido` com produto esgotado | Erro do banco |
| 4 | Cardápio | Abrir cardápio público | "Indisponível hoje" |
| 5 | Reativar | Marcar como disponível | Volta a adicionar |
| 6 | Permissão | Barista tenta alterar preço via API | Recusado |
| 7 | Carrinho | Produto já no carrinho é esgotado em outro PDV | Aviso ao enviar e item bloqueado |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 6
- Código: `js/pedidos.js:339`, `js/admin/products.js`, `js/cardapio-dynamic.js`
