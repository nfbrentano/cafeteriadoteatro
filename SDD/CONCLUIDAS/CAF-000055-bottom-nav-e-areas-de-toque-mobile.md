# CAF-000055 — [PDV] [Mobile] Barra de navegação inferior (bottom nav) e alvos de toque no celular

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (HTML + CSS + JS) | 🟡 Média (P1) | M | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  1. **Navegação inferior (Bottom Navigation):** Em resoluções móveis (`<= 900px`), transferir as abas principais de navegação ("☕ Novo Pedido" e "📋 Mesas & Entregas") da barra do topo para uma barra de navegação fixa na parte inferior da tela, facilitando o alcance do polegar.
  2. **Organização da Topbar:** Manter na barra superior apenas a logo compacta, o indicador de conectividade/offline, o botão de pendentes e um menu de perfil compacto com logout.
  3. **Ajuste da barra flutuante do carrinho:** A barra do carrinho (`#mobile-cart-bar`) deve flutuar imediatamente acima da barra inferior de navegação, e o final da lista de produtos deve possuir padding inferior de respiro (`padding-bottom: 150px`) para nenhum item ficar oculto atrás das barras.
  4. **Padronização de alvos de toque (Touch Targets):** Garantir que todos os botões, chips de categoria, itens de cardápio e ícones de fechar tenham área de toque mínima de 48 × 48px, com espaçamento mínimo de 8px e feedback visual tátil claro (`:active` com leve escala ou escurecimento).
- **Por que é necessário:** 
  - Nos celulares atuais de 6 polegadas ou mais, alcançar o topo da tela com uma mão só para alternar entre "Novo Pedido" e "Mesas" é desconfortável e causa risco de queda do aparelho no salão.
  - A barra superior concentra muitos elementos espremidos no mobile.
- **Qual valor será agregado:** Operação do PDV 100% confortável com apenas uma das mãos (ergonomia "thumb zone").
- **Para quem é destinado:** Garçons e baristas.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] Criar componente de barra de navegação inferior (`.bottom-nav`) visível apenas em telas móveis (`@media (max-width: 900px)`).
- [x] A bottom nav deve conter:
  - Botão "Novo Pedido" (ícone de xícara + texto);
  - Botão "Mesas & Entregas" (ícone de prancheta + texto + badge de prontos `#badge-prontos`);
- [x] Posicionar `#mobile-cart-bar` ancorado acima da bottom nav quando o carrinho contiver itens.
- [x] Respeitar a área segura do iPhone: `padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom))`.
- [x] Assegurar área de clique/toque de no mínimo 48 × 48px em botões de ação e chips.
- [x] Adicionar feedback tátil sutil: micro-vibração no clique (`navigator.vibrate(10)`) e animação `:active { transform: scale(0.96); }`.

### Requisitos não funcionais
- [x] **Desktop:** A barra inferior não deve ser renderizada ou deve ficar `display: none` em telas desktop (`> 900px`), mantendo a navegação no topo.
- [x] **Sem sobreposição:** O scroll das páginas de produto e mesas deve permitir rolar até o último elemento com folga visual.

### Dependências técnicas
- Código relacionado: `pedidos.html:37-61`, `pedidos.html:163-174`, `css/pedidos.css`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Itens A2 e A3).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom segura o celular com a mão direita, **quando** quer alternar para "Mesas & Entregas", **então** alcança a aba na parte inferior com o polegar com facilidade.
- [x] **Dado que** há itens no carrinho, **quando** a barra flutuante do carrinho aparece, **então** ela fica visível logo acima da barra inferior sem encavalar.
- [x] **Dado que** o garçom rola o cardápio até o último produto, **quando** chega ao fim, **então** o último produto não fica coberto pelas barras inferiores.
- [x] **Dado que** o sistema é acessado pelo computador de mesa, **quando** carregado, **então** a navegação permanece na barra superior tradicional.
