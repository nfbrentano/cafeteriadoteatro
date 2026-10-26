# [FIX] Resolução dos Alertas CodeQL #14 e #19 de DOM XSS em pedidos.js

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-26 · **Atualizada em:** 2026-10-26

## Detalhes da Atividade

A análise estática do GitHub CodeQL identificou 2 alertas abertos de alta severidade (`js/xss-through-dom`) no arquivo `js/pedidos.js`:
- **Alerta #19:** Linha 1559 (`card.innerHTML = ...`) na função `renderProducts()`.
- **Alerta #14:** Linha 2276 (`div.innerHTML = ...`) na função `renderCart()`.

O rastreamento de fluxo de dados (taint tracking) do CodeQL detectou que ambos os alertas se originam de duas leituras de campos de formulário DOM:
1. `js/pedidos.js:1997` — `modalMontagemObs.value` (campo de observação no modal de adicionais/montagem).
2. `js/pedidos.js:2099` — `modalObsInput.value` (campo de observação no modal de edição de observação do item do carrinho).

Como o valor lido do DOM (`.value`) era atribuído diretamente a `item.observacoes` e armazenado no array `cart`, o analisador marcou o objeto do carrinho como "tainted" e flagrou o uso de propriedades do item em `renderCart()` e `renderProducts()`.

- **O que precisa ser feito:**
  1. Definir a função local `escapeHtml` com visibilidade estática direta no escopo de `pedidos.js` (em vez de depender apenas de `window.escapeHtml`).
  2. Higienizar imediatamente as leituras de texto do DOM na origem:
     - Linha 1997: `activeMontagemItem.observacoes = escapeHtml(modalMontagemObs.value.trim());`
     - Linha 2099: `cart[activeObsCartIndex].observacoes = escapeHtml(modalObsInput.value.trim());`
  3. Eliminar a interpolação de `item.observacoes` dentro de strings `innerHTML` em `renderCart()`:
     - Criar o elemento de observação via `document.createElement('div')` e atribuir o texto via `.textContent`, eliminando completamente o sink de injeção HTML.
  4. Garantir sanitização por conversão numérica estrita (`parseInt(..., 10)`) nas quantidades do carrinho renderizadas em `renderProducts()` (`qtyVal` e `totalQtyVal`).
  5. Higienizar também a renderização de observações e dados de pedidos de clientes aguardando aprovação em `pedidos.js:3091-3135` (`item.observacoes`, `item.nome_produto`, `ad.nome_adicional`, `pedido.observacoes`).
  6. Atualizar a suíte de testes `tests/caf-000100-seguranca-codeql.test.js` e criar `tests/caf-000101-xss-pedidos-obs.test.js` cobrindo estes fluxos com 100% de sucesso.
- **Problema e evidência:** Alertas CodeQL #14 e #19 no GitHub Security Code Scanning em `js/pedidos.js`.
- **Impacto de não fazer:** Alertas de segurança persistentes no GitHub Actions; risco de ataque XSS via injeção em campos de observação.
- **Para quem é destinado:** Operadores de atendimento e baristas que usam o PDV de pedidos.
- **História de usuário:** Como mantenedor do sistema, quero que as observações do carrinho e a grade de produtos utilizem atribuição segura ao DOM (via `textContent` e sanitização imediata na fonte), para eliminar qualquer vulnerabilidade de DOM XSS sinalizada pelo CodeQL.
- **Como saberemos que deu certo:** Testes automatizados passando 100%, build de produção gerado limpo e alertas #14 e #19 resolvidos no CodeQL do GitHub.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Definir função estática `escapeHtml` local em `pedidos.js` | P0 | CA01 |
| RF02 | Sanitizar na fonte as observações lidas de `modalMontagemObs.value` (L1997) e `modalObsInput.value` (L2099) | P0 | CA02 |
| RF03 | Usar `.textContent` para renderizar `item.observacoes` no carrinho sem passar por `innerHTML` | P0 | CA03 |
| RF04 | Cast explícito `parseInt(..., 10)` em quantidades do carrinho inseridas nos cards de produto | P0 | CA04 |
| RF05 | Sanitizar observações e dados do cliente em `listaPedidosClienteAguardando` (L3091-3135) | P0 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Preservar a integridade dos acentos e caracteres de língua portuguesa nas observações | P0 | CA02 a CA05 |
| RNF02 | 100% dos testes da suíte passando (`npm test` e `npm run test:db`) | P0 | CA01 a CA05 |
| RNF03 | Build de produção concluído com sucesso (`npm run build`) | P0 | CA01 a CA05 |

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o módulo `js/pedidos.js`, quando `escapeHtml` for chamado no escopo local, então ele deve sanitizar caracteres `&`, `<`, `>`, `"`, `'` de forma síncrona e estática.
- [x] **CA02:** Dado um usuário digitando payload XSS (`<script>alert(1)</script>`) nos modais de observação ou montagem, quando a observação for salva no item do carrinho, então ela deve ser higienizada imediatamente antes de ser armazenada no array `cart`.
- [x] **CA03:** Dado um item com observação no carrinho, quando `renderCart()` for executado, então a observação deve ser renderizada através de nó DOM com `.textContent`, garantindo que nenhuma tag HTML seja interpretada.
- [x] **CA04:** Dado o grid de produtos renderizado por `renderProducts()`, quando um produto estiver no carrinho, então as badges de quantidade e contador devem utilizar inteiros seguros via `parseInt`, quebrando qualquer propagação de taint do CodeQL.
- [x] **CA05:** Dado pedidos de clientes aguardando aprovação contendo observações com caracteres HTML, quando `renderPedidosClienteAguardando()` for executado, então todos os campos devem ser protegidos contra XSS.

---

## O que a atividade não inclui

- Alterações nas regras de negócio ou estrutura do banco de dados Supabase.
- Modificações em outros arquivos JS já saneados e fechados no CodeQL.
