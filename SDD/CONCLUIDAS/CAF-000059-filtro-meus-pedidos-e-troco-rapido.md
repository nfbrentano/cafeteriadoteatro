# CAF-000059 — [PDV] [Mobile] Operação ágil de salão: filtro Meus Pedidos, troco rápido e envio otimista

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (JS + CSS + HTML) | 🟡 Média (P1) | M | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Implementar três melhorias de produtividade para garçons em salões cheios:
  1. **Filtro "Meus Pedidos" na aba Mesas & Entregas:** Adicionar um seletor rápido no topo da lista de pedidos: `[ Meus ] [ Todos ]`. No modo "Meus", exibe apenas os pedidos criados pelo barista/garçom logado (`pedido.criado_por === currentUser.id`), eliminando a poluição visual de pedidos dos colegas de equipe.
  2. **Chips de dinheiro e troco rápido:** No passo de pagamento do fechamento (CAF-000054), quando a forma for dinheiro, incluir chips de valores rápidos baseados no valor a receber em dinheiro:
     - Botão "Valor Exato" (preenche o valor a receber, sem troco);
     - Próximas notas comerciais redondas maiores que o valor (ex.: se o valor der R$ 26,00, exibir: `[ R$ 30 ] [ R$ 50 ] [ R$ 100 ]`);
     - O troco é calculado e exibido em destaque verde instantaneamente.
  3. **Envio com confirmação otimista (Optimistic UI):** Ao tocar em "Enviar para Cozinha", o botão não bloqueia a tela esperando a RPC. O carrinho é limpo imediatamente, um toast informativo surge ("Enviando pedido da Mesa 04...") e se transforma em "✓ Pedido enviado à cozinha!" em segundo plano.
- **Por que é necessário:** 
  - Com 20 a 30 comandas abertas em noites de teatro, o garçom perde tempo procurando quais pedidos são das mesas que ele está servindo.
  - Digitar centavos e calcular troco de cabeça em notas comuns gera filas no balcão e erros de caixa.
  - Hoje, no caminho online, o botão fica desabilitado em "Enviando..." até a RPC `criar_pedido` responder (`js/pedidos.js:2116-2117` e `:2198`). Em internet móvel lenta o garçom fica parado esperando antes de ir para a próxima mesa.
- **Qual valor será agregado:** Foco nas próprias mesas, cálculo de troco sem erro em 2 toques e atendimento contínuo sem travamentos.
- **Para quem é destinado:** Garçons e atendentes no salão da cafeteria.

---

## Estado atual do código (revisão de 2026-10-16)

Conferido contra o código com as mudanças das CAF-000051 a 058 aplicadas.

| Ponto | Como está hoje | Impacto nesta CAF |
|---|---|---|
| Lista de pedidos | `renderPedidosCards()` filtra por `currentFilterStatus` e `currentFilterScope`. Chips de status em `#pedidos-filtro-barista` e escopo em `#pedidos-filtro-escopo`. | O filtro "Meus" é um segundo critério, combinado com o de status, aplicado em `renderPedidosCards()`. |
| Grade de mesas | `renderMesasSection()` usa todos os `activePedidos`. | A grade continua mostrando todas as mesas para não esconder ocupação geral do salão. |
| Autor do pedido | `pedidos.criado_por` (UUID) é gravado no servidor com `auth.uid()` pela RPC `criar_pedido`. O id do usuário logado é `currentUser.id`. | Comparação `p.criado_por === currentUser.id \|\| p.usuario_id === currentUser.id`. |
| Pedidos na fila offline | A fila é do próprio aparelho. | Contam sempre como "meus". |
| Envio | O envio otimista libera o carrinho em 0ms e fecha a gaveta móvel, com recuperação via toast se houver recusa da RPC. | Despacho de background sem travamento de interface. |
| Toast | `window.showToast` suporta ações interativas como "Restaurar". | Permite recuperar o carrinho se o pedido for recusado. |
| Troco | `renderPainelPagamento()` calcula troco instantâneo com base no dinheiro e nos chips. | Chips rápidos dinâmicos integrados ao bloco de dinheiro recebido. |
| Preferências locais | Padrão `localStorage` com chave `cafeteria_pedidos_filtro_escopo`. | Lembra a escolha do filtro de pedidos. |
| Aviso de pedido pronto | `focarPedidoPronto()` alterna automaticamente para "Todos" se o pedido for de outro garçom. | Garante que o garçom veja o pedido focado. |

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] **RF01 – Filtro Meus/Todos:** na seção "Pedidos em Andamento" da aba "Mesas & Entregas" (`#view-mesas-pedidos`), incluir um controle segmentado `Meus` / `Todos`, separado dos chips de status e combinável com eles.
  - `Meus`: `p.criado_por === currentUser.id` (mais os pedidos ainda na fila offline do aparelho);
  - `Todos`: comportamento atual;
  - A escolha persiste em `localStorage` (`cafeteria_pedidos_filtro_escopo`).
  - Estado vazio específico: "Você não possui pedidos ativos nesta categoria."
- [x] **RF02 – Chips de troco:** no bloco `#div-dinheiro-recebido`, gerar dinamicamente chips com: "Exato", a próxima nota/valor redondo acima (múltiplo de R$ 5 ou R$ 10) e as notas de R$ 50 e R$ 100 que forem maiores que o valor, sem repetir valores.
  - Base: dinheiro já lançado na parte ativa; se zero, o que falta pagar da parte.
  - Ao tocar, preencher `#fechar-conta-dinheiro-recebido`, atualizar `pt.dinheiro_recebido` e `#fechar-conta-troco-lbl`.
  - Recalcular os chips ao trocar de parte e ao lançar/remover pagamento.
- [x] **RF03 – Envio otimista:** no handler de `#btn-enviar-pedido`:
  - Montar o payload com `client_id` e snapshot dos dados;
  - Limpar o carrinho e fechar a gaveta móvel **antes** de chamar a RPC;
  - Mostrar toast "Enviando pedido da Mesa X..." e trocá-lo por "✓ Pedido enviado à cozinha!" no sucesso;
  - Erro de rede ou exceção: salvar na fila offline com toast discreto;
  - Erro de negócio da RPC: toast de erro com ação "Restaurar carrinho", que devolve itens, mesa e observações.
- [x] **RF04 – Integração com aviso de pronto:** `focarPedidoPronto()` volta o filtro para `Todos` quando o pedido não for do usuário, e utiliza o seletor `data-filter`.

### Requisitos não funcionais
- [x] **Sem travamento de UI:** o carrinho fica liberado em menos de 100 ms após o toque em "Enviar", independente da rede.
- [x] **Sem duplicidade:** o `client_id` UUID garante idempotência total no envio.
- [x] **Acessibilidade:** chips e controle segmentado com contraste adequado e área de toque mínima confortável; suporte a feedback tátil de vibração.

### Dependências técnicas
- Código relacionado: `js/pedidos.js:renderPedidosCards`, filtro de status e escopo, handler de envio otimista, `renderPainelPagamento`, `renderTrocoChips`, `focarPedidoPronto`; `pedidos.html` e `css/pedidos.css`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Itens C2, D2 e E3).

---

## Critérios de Aceitação / Entregas

- [x] **CA01 – Dado que** há 15 pedidos em aberto no salão e o garçom Lucas abre a aba de entregas, **quando** ativa o filtro "Meus", **então** vê apenas os pedidos que ele registrou, e a escolha continua ativa ao recarregar o PWA.
- [x] **CA02 – Dado que** o filtro "Meus" e o chip "🟢 Prontos" estão ativos, **então** vejo só os meus pedidos prontos.
- [x] **CA03 – Dado que** o filtro "Meus" está ativo e fica pronto um pedido de outro garçom, **quando** toco no aviso, **então** a lista muda para "Todos" e mostra o pedido.
- [x] **CA04 – Dado que** a parte ativa tem R$ 34,00 lançados em dinheiro e o cliente entrega uma nota de R$ 50, **quando** o atendente toca no chip "[ R$ 50 ]", **então** o campo preenche R$ 50,00 e exibe "Troco: R$ 16,00" em 1 toque.
- [x] **CA05 – Dado que** a conta foi dividida em 2 partes, **quando** troco de parte, **então** os chips são recalculados para o valor da nova parte.
- [x] **CA06 – Dado que** o garçom toca em "Enviar para Cozinha" com rede lenta, **então** o carrinho é liberado na hora, o toast "Enviando..." aparece e vira "✓ Pedido enviado" quando a RPC responde.
- [x] **CA07 – Dado que** a RPC recusa o pedido por regra de negócio, **quando** aparece o toast de erro, **então** "Restaurar" devolve os itens, a mesa e as observações.
