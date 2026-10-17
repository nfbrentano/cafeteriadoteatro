# CAF-000053 — [PDV] [Mobile] Aviso sonoro, tátil e notificação de pedido pronto no celular

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV (JS + Supabase Realtime) | 🔴 Alta (P0) | M (G com WebPush) | Concluída |

---

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Emitir aviso multissensorial ativo para o garçom quando a cozinha/bar marcar um pedido (ou item) como pronto:
  1. **Vibração tátil no celular:** Utilizar a API `navigator.vibrate([200, 100, 200])` para alertar fisicamente no bolso ou na mão do atendente.
  2. **Alerta sonoro sutil:** Tocar um "ding" suave (`assets/ding-CZb6arx6.wav` ou similar já existente no projeto) que não perturbe o ambiente cultural da cafeteria.
  3. **Banner/Toast interativo:** Exibir no topo da tela um toast clicável em qualquer aba do PDV (ex.: `🔔 Mesa 04: Pedido pronto para entrega! [Ver]`). Ao tocar, direciona imediatamente para a aba de entregas com o card em destaque.
  4. **Notificação de segundo plano (PWA):** Se o operador estiver com a tela apagada ou outra aba aberta, disparar notificação local através da Notification API / Service Worker quando permitido pelo usuário.
- **Por que é necessário:** 
  - Hoje o PDV só atualiza um contador em texto `#badge-prontos` no topo (`pedidos.html:45`). O garçom circulando pelo salão não fica olhando para a tela a cada minuto, e o café ou croissant prontos esfriam no balcão de retirada.
- **Qual valor será agregado:** Redução do tempo entre a finalização do produto na cozinha e a entrega na mesa do cliente, mantendo as bebidas quentes e os clientes satisfeitos.
- **Para quem é destinado:** Garçons e baristas no salão.

### Referência de mercado
- **Saipos / Garfo / Food Sistemas:** alerta sonoro e push no app do garçom assim que a cozinha clica em "Pronto".
- **Suitable:** notificação na comanda eletrônica do garçom quando a produção finaliza os itens.

---

## Requisitos da Atividade

### Requisitos funcionais
- [x] No realtime do PDV (`js/pedidos.js`), monitorar eventos `UPDATE` na tabela `pedidos` onde `status` muda para `'pronto'`, ou `pedido_itens` onde `status` muda para `'pronto'`.
- [x] Ao detectar novo pedido pronto:
  - Disparar padrão de vibração `navigator.vibrate([200, 80, 200])` se suportado pelo navegador móvel;
  - Tocar efeito sonoro de notificação configurado (com chave de silenciar no cabeçalho ou preferências);
  - Exibir toast flutuante no topo do app com número da mesa, itens prontos e botão "Entregar";
- [x] Solicitar permissão de `Notification` quando o usuário fizer login no PWA. Se concedido, emitir notificação nativa do sistema operacional (`new Notification(...)`).
- [x] Ao clicar no toast ou na notificação, abrir a aba "Mesas & Entregas" (`#view-mesas-pedidos`) e rolar/destacar o card correspondente.

### Requisitos não funcionais
- [x] **Modo discreto:** Botão rápido ou configuração para desativar o som e manter apenas vibração/toast (respeitando o silêncio de espetáculos teatrais).
- [x] **Não duplicidade:** Se o garçom já estiver na tela de entregas com o card aberto, não emitir múltiplos alertas repetidos para o mesmo pedido.

### Dependências técnicas
- Realtime do Supabase: `js/pedidos.js:subscribeRealtime`, canal de `pedidos` / `pedido_itens`.
- Áudio: `assets/ding-CZb6arx6.wav`.
- Origem da proposta: [ANALISE_PEDIDOS_MOBILE.md](ANALISE_PEDIDOS_MOBILE.md) (Item C1).

---

## Critérios de Aceitação / Entregas

- [x] **Dado que** o garçom está na aba "Novo Pedido" anotando outro cliente, **quando** a cozinha marca o pedido da Mesa 03 como pronto, **então** o celular vibra, emite um som discreto e exibe um toast: "🔔 Mesa 03 pronta para entrega".
- [x] **Dado que** o garçom toca no toast de pedido pronto, **quando** clica, **então** o PDV muda para a aba de Mesas com o pedido da Mesa 03 em foco.
- [x] **Dado que** o espetáculo no teatro está acontecendo, **quando** o atendente ativa o "Modo Silencioso", **então** apenas a vibração e o toast são acionados, sem som.
