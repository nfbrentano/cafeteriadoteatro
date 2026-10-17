# CAF-000058 — [PDV] [Mobile] Lançamento rápido: favoritos, contador direto no card e repetir rodada

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (JS + CSS + HTML) | 🟡 Média (P1) | M | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Acelerar o registro de pedidos repetitivos no salão através de 3 atalhos de alta produtividade:
  1. **Aba "⭐ Mais Pedidos / Rápidos":** Primeira aba de categorias com os 8 a 12 produtos de maior saída da cafeteria (ex: Café Expresso, Cappuccino, Pão de Queijo, Croissant Tradicional, Água sem Gás). Os itens ficam visíveis imediatamente ao abrir o PDV, sem exigir rolagem entre categorias ou digitação de busca.
  2. **Contador de quantidade direto no card:** Quando um produto sem adicionais obrigatórios já estiver no carrinho, o card na grade exibe um controle de quantidade inline `[ – ] [ 2 ] [ + ]` (ou badge de quantidade). Tocar no card ou no `+` incrementa a quantidade na hora, sem precisar abrir o modal de personalização.
  3. **Ação "🔁 Repetir Última Rodada":** Na tela de detalhes da mesa ocupada (`#modal-mesa`), adicionar um botão "🔁 Repetir Rodada" que clona os itens e adicionais do último pedido daquela mesa diretamente para o carrinho atual, pronto para envio ou pequenos ajustes.
- **Por que é necessário:** 
  - Em cafeterias e teatros, mais de 60% dos pedidos são itens idênticos (expressos, águas, salgados clássicos) ou pedidos de mesas grandes onde os clientes dizem: "traz mais uma rodada do mesmo chopp/café".
  - Abrir modal de montagem para um café expresso simples toma cliques desnecessários e gera fila no salão.
- **Qual valor será agregado:** Redução do tempo de anotação de mesa de 45 segundos para menos de 10 segundos.
- **Para quem é destinado:** Garçons e baristas em atendimento de salão.

### Referência de mercado
- **Saipos / Food Sistemas:** botão de "Repetir pedido / rodada" na comanda da mesa.
- **Suitable / Kyte:** exibição de produtos favoritos no topo e contador direto no card do produto.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] Criar categoria virtual dinâmica "⭐ Rápidos" como a primeira aba selecionada por padrão em `#categories-tabs`.
- [x] No card do produto (`.product-card`):
  - Produtos simples sem complementos: ao clicar, adiciona 1 unidade diretamente ao carrinho com feedback de vibração;
  - Se o item já estiver no carrinho, o card mostra contador `– 1 +`;
  - Produtos com adicionais vinculados continuam abrindo o modal de personalização (`modal-montagem`);
- [x] No modal de consumo da mesa (`#modal-mesa`), adicionar o botão `#btn-mesa-repetir-rodada`:
  - Ao clicar, identifica o último pedido não cancelado da mesa;
  - Transfere os itens para o carrinho;
  - Abre a gaveta do carrinho com os itens pré-selecionados para o garçom confirmar e enviar.

### Requisitos não funcionais
- [x] **Simplicidade:** O contador no card deve ter botões grandes e fáceis de tocar (mínimo 44px).
- [x] **Feedback tátil:** Vibração de 15ms ao incrementar ou decrementar quantidade no card.

### Dependências técnicas
- Código relacionado: `js/pedidos.js:renderProducts`, `js/pedidos.js:renderCart`, `pedidos.html:270-290`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Itens B2, B3 e B6).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom abre o PDV para atender um cliente que pediu apenas 2 Cafés Expressos, **quando** ele toca duas vezes no card de Café Expresso na aba "⭐ Rápidos", **então** o carrinho soma 2 expressos em menos de 3 segundos, sem abrir modais.
- [x] **Dado que** uma mesa pede "a mesma rodada de café e pão de queijo de antes", **quando** o garçom toca em "Repetir Rodada" no consumo da mesa, **então** o carrinho é preenchido automaticamente com a rodada anterior.
- [x] **Dado que** o produto possui adicionais obrigatórios ou opções de sabor (ex: Panqueca Doce), **quando** o atendente toca no card, **então** o modal de personalização continua abrindo normalmente.
