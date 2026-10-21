# CAF-000052 — [PDV] [Mobile] Seleção e visualização de mesas em grade no celular

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-09-23 · **Atualizada em:** 2026-10-21

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (JS + HTML + CSS) | 🔴 Alta (P0) | M | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Substituir o elemento `<select id="mesa-select">` no fluxo de novo pedido no celular por uma experiência visual em grade com toque direto (ou um *bottom sheet* de seleção de mesa):
  1. No topo do cardápio, exibir um botão/badge interativo de mesa em destaque (ex.: `📍 Mesa 04` ou `📍 Toque para selecionar a mesa`).
  2. Ao tocar ou ao iniciar um pedido sem mesa definida, abrir um seletor visual em grade de botões com as mesas da cafeteria:
     - Botão destacado "🥡 Balcão / Viagem";
     - Cores de estado em tempo real: verde (livre), vermelho/laranja (ocupada / com pedidos ativos);
     - Indicação de total consumido ou tempo de ocupação na mesa ocupada;
  3. Selecionar a mesa com apenas 1 toque, fechando o seletor e atualizando o carrinho instantaneamente.
- **Por que é necessário:** 
  - O `<select>` atual (`pedidos.html:72-78`) abre a lista nativa do sistema operacional (rodinha no iOS ou lista longa no Android), que não mostra se a mesa está livre ou ocupada. O garçom precisa ir até a aba "Mesas & Entregas" para checar o status e voltar para "Novo Pedido" para escolher a mesa.
- **Qual valor será agregado:** Escolha de mesa com 1 toque, redução de erros de lançamento em mesas erradas e visualização imediata da ocupação do salão.
- **Para quem é destinado:** Garçons e baristas atendendo pelo celular.

### Referência de mercado
- **Kyte / Saipos / Consumer:** telas de seleção com mapa de mesas em botões com código de cores (livre/ocupada).
- **Suitable:** visualização de mesas em cartões com status de ocupação e consumo.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] Criar modal/bottom sheet de seleção de mesa (`#modal-selecionar-mesa`) para dispositivos móveis, acionado ao tocar no seletor de mesa do topo ou quando o carrinho necessita de identificação.
- [x] No seletor, listar:
  - Botão fixo no topo: "🥡 Balcão / Para Viagem";
  - Grade de botões grandes (mínimo 60 × 60px) com o número/nome de cada mesa cadastrada no Supabase.
- [x] Cores de status dinâmicas em cada botão:
  - Livre (neutro/verde suave);
  - Ocupada com pedidos ativos (amarelo/laranja/vermelho, com ícone de xícara ou total);
- [x] Toque em uma mesa livre define a mesa no carrinho e fecha a grade em 1 toque.
- [x] Toque em uma mesa ocupada seleciona a mesa e avisa sutilmente: "Mesa já possui pedidos em aberto. Os novos itens serão adicionados à comanda existente."
- [x] Manter compatibilidade com a versão desktop (pode manter o dropdown ou adotar a mesma grade).

### Requisitos não funcionais
- [x] **Desempenho:** Renderização instantânea utilizando o cache de mesas já existente no PDV (`cafeteria_cache_pdv_mesas`).
- [x] **Acessibilidade móvel:** Área de toque generosa (≥ 48px) para cada mesa.

### Dependências técnicas
- Código relacionado: `pedidos.html:72-78`, `js/pedidos.js:renderMesasSelector`, `css/pedidos.css`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Item B1).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom está no celular e precisa abrir um pedido para a Mesa 03, **quando** toca no seletor de mesa, **então** uma grade visual é exibida com todas as mesas e suas cores de status.
- [x] **Dado que** a Mesa 05 tem pedidos ativos, **quando** visualizada na grade, **então** ela aparece destacada como ocupada.
- [x] **Dado que** o garçom toca no botão da Mesa 02, **quando** seleciona, **então** o carrinho atualiza para "Mesa 02" e a grade fecha automaticamente.
- [x] **Dado que** o pedido é para viagem, **quando** toca em "Balcão / Viagem", **então** o carrinho marca automaticamente o checkbox de viagem.
