# Melhorias de UX — Mobile

Levantamento das melhorias de experiência no celular, ordenadas por prioridade.
A tela de pedidos do barista (`pedidos.html`) é a mais crítica, porque é usada com pressa, com uma mão, durante o atendimento.

---

## 🔴 Prioridade alta — Tela de pedidos (barista)

### 1. Zoom automático do iOS ao focar campos
O Safari dá zoom quando um input tem `font-size` menor que 16px. Hoje:
- Busca e seleção de mesa: 14px (`css/pedidos.css:1100`, `css/pedidos.css:1110`)
- Observação do pedido: 13px (`css/pedidos.css:597`)

Cada toque num campo amplia a tela e o barista precisa desfazer com pinça.

**Correção:**
```css
@media (max-width: 900px) {
  input, select, textarea { font-size: 16px; }
}
```

- [x] Aplicar em `css/pedidos.css`
- [x] Conferir também `css/admin.css` e `css/cozinha.css`

### 2. Botões do carrinho pequenos demais
O `.cart-btn` tem 28×28px (`css/pedidos.css:549`), e o mínimo recomendado para toque é 44px. Os botões de +, − e remover ficam colados (gap de 6px), então é fácil remover um item sem querer.

- [x] Aumentar `.cart-btn` para 40–44px no mobile
- [x] Separar mais o botão "remover" dos botões de quantidade
- [x] Mostrar um toast "Item removido · Desfazer" em vez de apagar direto

### 3. Adicionar produto: área de toque e feedback
O `.btn-add-badge` tem fonte de 10px e padding de 2px (`css/pedidos.css:1147`).

- [x] Garantir que o card inteiro seja clicável, e não só o badge
- [x] Vibração curta ao adicionar (`navigator.vibrate?.(10)`)
- [x] Animação no contador da barra flutuante do carrinho

### 4. Gaveta do carrinho (bottom sheet)
- [x] Adicionar uma alça visual no topo e deixar fechar arrastando para baixo
- [x] Fechar com o botão "voltar" do Android (`history.pushState` ao abrir, `popstate` para fechar)
- [x] Revisar `.cart-items { max-height: 38vh }` (`css/pedidos.css:1216`): com o teclado aberto na observação, sobra pouco espaço. Considerar deixar a gaveta inteira rolar, e não só a lista.

### 5. Trocar `alert()` e `confirm()` nativos
Exemplos: `js/pedidos.js:103`, `js/pedidos.js:767`, `js/cozinha.js:455`. No celular eles bloqueiam a tela e ficam fora do visual do app.

- [x] Erros: usar toast
- [x] Confirmações (ex.: lançar cortesia): usar um modal/bottom sheet próprio

### 6. Modais no mobile
Os selects de sabor usam estilo inline (`pedidos.html:198-199`) e ficam lado a lado com `flex:1`, apertados em telas de 360px.

- [x] Mover os estilos inline para o CSS
- [x] Empilhar os selects no mobile
- [x] Exibir os modais como bottom sheet, com os botões de ação ao alcance do polegar

### 7. Navegação entre abas
As abas "Novo pedido" e "Mesas" ficam no topo com fonte de 11px em telas ≤480px (`css/pedidos.css:1400`).

- [x] Avaliar uma barra de abas fixa na parte de baixo (ícone + texto), mais ergonômica para uso com uma mão

---

## 🟡 Prioridade média — Mesas e entregas

- [x] Filtros (`.filter-chip`, 12px) rolam na horizontal sem indicativo: adicionar um degradê na borda direita
- [ ] Botão "🔄 Atualizar": trocar por pull-to-refresh (pendente de implementação nativa touch)
- [x] Botões "Entregar" e "Chamar" têm o mesmo peso visual: destacar mais o botão principal (Entregar)

---

## 🟢 Site público — Home e cardápio

### Cardápio
- [x] Aumentar a altura dos botões de categoria de 38px para 44px (`css/cardapio.css:521`)
- [x] Rolar a categoria ativa para ficar visível na barra quando o usuário rola a página

### Carrossel do hero
- [x] Setas com 34px em ≤480px (`css/home.css:462`) e dots com 8px: aumentar a área de toque via padding, mantendo o visual
- [x] Permitir arrastar com o dedo para trocar de imagem
- [x] Revisar `min-height: 500px` junto com `70svh` (`css/home.css`), que empurra o conteúdo muito para baixo em celulares pequenos

### Ações rápidas
- [x] Botão fixo de "Como chegar" ou WhatsApp na home (hoje não há links `tel:` ou `wa.me`)

### Performance
- [x] Trocar o iframe do Google Maps por uma imagem estática com botão "Abrir no Maps", carregando o iframe só se o usuário pedir. O iframe pesa muito no 4G.

---

## ⚪ Geral

- [x] Adicionar `viewport-fit=cover` em `index.html`, `cardapio.html` e `admin.html` (hoje só `pedidos.html` e `cozinha.html` têm), se a ideia for rodar como PWA em tela cheia (já existe `manifest.json`)
- [x] Estados de toque: vários componentes só têm `:hover`, dentro de `@media (hover: hover)`. Adicionar `:active` com um leve `scale(0.97)`, como já existe em `.mobile-cart-bar__btn`
- [x] Remover o flash azul ao tocar: `-webkit-tap-highlight-color: transparent`, junto com um estado `:active` próprio

---

## Por onde começar

Os itens **1 (zoom do iOS)** e **2 (botões do carrinho)** são mudanças pequenas de CSS com impacto imediato no dia a dia do barista.
