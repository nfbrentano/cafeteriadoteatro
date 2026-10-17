# CAF-000051 — [PDV] [Mobile] Correções de formulário mobile: anti-zoom no iOS e teclados semânticos

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (CSS + HTML) | 🔴 Alta (P0) | P | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  1. **Eliminar auto-zoom em celulares (iOS/Safari):** Garantir que todos os campos de formulário (`input`, `select`, `textarea`) no PDV (`pedidos.html` e `css/pedidos.css`) tenham tamanho de fonte mínimo de 16px em telas móveis (`@media (max-width: 900px)` e estilos inline), impedindo que o Safari/WebKit dê zoom automático ao focar no campo.
  2. **Teclados mobile adequados via atributos semânticos:**
     - Adicionar `inputmode="decimal"` nos campos monetários (descontos, valor a pagar, dinheiro recebido);
     - Adicionar `inputmode="numeric"` nos campos numéricos inteiros (número de pessoas, quantidades);
     - Adicionar `enterkeyhint="search"`, `autocapitalize="off"` e `autocorrect="off"` no campo de busca de produtos (`#product-search`);
     - Adicionar `enterkeyhint="next"` ou `"done"` nos campos dos modais.
- **Por que é necessário:** 
  - No iPhone, qualquer campo com fonte menor que 16px (`.search-wrap input` tem 14px, `.mesa-selector select` tem 15px e modais possuem campos com 13px inline) faz o Safari aplicar um zoom brusco de aproximação, cortando as bordas do PDV e obrigando o garçom a usar pinça com dois dedos para des-zoom.
  - Campos de valores abrem teclados alfanuméricos genéricos em vários aparelhos Android/iOS, atrasando o fechamento da conta.
- **Qual valor será agregado:** Agilidade e ergonomia no preenchimento de campos pelo celular, com tela estável e teclado correto no primeiro toque.
- **Para quem é destinado:** Garçons e baristas operando o PDV em smartphones.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] No CSS móvel (`css/pedidos.css`), garantir `font-size: 16px` para `input`, `select` e `textarea` em `@media (max-width: 900px)`.
- [x] Remover ou sobrescrever declarações inline de `font-size: 13px` / `14px` em inputs e selects dentro de `pedidos.html` (especialmente em `#modal-fechar-conta`).
- [x] Adicionar `inputmode="decimal"` em:
  - `#fechar-conta-desconto-valor`
  - `#fechar-conta-valor`
  - `#fechar-conta-dinheiro-recebido`
- [x] Adicionar `inputmode="numeric"` em:
  - `#fechar-conta-num-pessoas`
- [x] No `#product-search`, adicionar `enterkeyhint="search"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`.

### Requisitos não funcionais
- [x] **Não regressão desktop:** Em telas desktop (`> 900px`), os tamanhos compactos de inputs e modais devem ser preservados.
- [x] **Acessibilidade:** Nenhum campo com contraste reduzido ou perda de legibilidade.

### Dependências técnicas
- Código relacionado: `pedidos.html`, `css/pedidos.css`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Item A1).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom toca no campo de busca `#product-search` em um iPhone, **quando** o teclado se abre, **então** a tela permanece com zoom estável 1:1, sem aproximação automática.
- [x] **Dado que** o operador toca no campo de dinheiro recebido `#fechar-conta-dinheiro-recebido`, **quando** o teclado abre, **então** é exibido diretamente o teclado numérico com separador decimal.
- [x] **Dado que** o operador foca no campo de divisão por pessoas `#fechar-conta-num-pessoas`, **quando** o teclado abre, **então** é exibido o teclado numérico inteiro (0-9).
- [x] **Dado que** a página é acessada em monitor desktop (1920x1080), **quando** os formulários são exibidos, **então** mantêm a proporção visual original de desktop.
