# Análise: fluxo de pedidos no celular (Out/2026)

Levantamento feito a partir do código atual do PDV (`pedidos.html`, `js/pedidos.js`, `css/pedidos.css`), pensando no garçom ou barista que anota pedidos **em pé, com uma mão só, no celular**, circulando pelo salão e muitas vezes com internet fraca.
Cada proposta abaixo pode virar uma CAF própria, criada a partir do [MODELO_ATIVIDADE.md](MODELO_ATIVIDADE.md), depois que você aprovar.

> **Situação em 2026-10-19:** todas as propostas 1 a 9 do resumo (CAF-000051 a 059) foram implementadas e concluídas. Os números de linha citados em "O que já temos" e "Problemas encontrados" são do código **antes** dessas mudanças.

> **Fora desta análise (já têm CAF):**
> - Pedido feito pelo próprio cliente via QR Code na mesa: [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md).
> - Pedido online para retirada: [CAF-000038](CAF-000038-pedido-online-para-retirada.md).
> - PIX com QR Code: [CAF-000039](CAF-000039-pix-qr-code-e-taxas-de-pagamento.md).
> - Operação por teclado: [CAF-000029](CAF-000029-prioridade-e-operacao-por-teclado.md). É o oposto deste documento: lá o foco é o desktop.

---

## O que já temos no celular

- **Layout responsivo:** breakpoints em 900, 480 e 340 px (`css/pedidos.css:1155`, `:1666`, `:1693`).
- **Carrinho em gaveta (drawer):** barra flutuante "Ver Pedido ➔" com contagem e total (`pedidos.html:163-174`). Fecha arrastando para baixo (`js/pedidos.js:1333`).
- **Puxar para atualizar** na aba Mesas (`js/pedidos.js:1808`).
- **Vibração curta** ao adicionar produto (`js/pedidos.js:1243`).
- **Fila offline** com indicador de conexão e contador de pendentes (`pedidos.html:51-57`).
- **PWA:** `manifest.json`, `apple-mobile-web-app-capable` e `viewport-fit=cover` (`pedidos.html:5-14`).

## Problemas encontrados no código

| # | Problema | Evidência | Efeito no celular |
|---|----------|-----------|-------------------|
| P1 | Campos com fonte menor que 16 px | `.search-wrap input` 14 px (`css/pedidos.css:311`), `.mesa-selector select` 15 px (`:294`) e campos do modal de fechamento com `font-size: 13px` inline (`pedidos.html:362-368`) | O iPhone dá zoom automático ao tocar no campo, e o layout "pula" |
| P2 | Nenhum `inputmode` nos campos numéricos | `grep inputmode` não encontra nada. Valor, desconto, dinheiro recebido e nº de pessoas usam só `type="number"` | Teclado errado ou sem vírgula decimal em alguns Androids |
| P3 | 12 `alert()`/`confirm()` nativos | `js/pedidos.js` | Pop-up do sistema bloqueia a tela, quebra o visual da PWA e é fácil de tocar errado |
| P4 | Mesa escolhida num `<select>` no topo | `pedidos.html:72-78` | No celular, o seletor nativo esconde o mapa de mesas e não mostra quais estão ocupadas |
| P5 | Fechar conta concentrado num modal longo, com estilos inline e larguras fixas (`width: 150px`, `max-width: 200px`) | `pedidos.html:315-447` | Muita rolagem dentro do modal e botões de confirmação fora do alcance do polegar |
| P6 | Topbar com logo, 2 abas, status, pendentes, nome e "Sair" | `pedidos.html:37-61` | Ocupa altura útil e deixa as abas no topo, longe do polegar |
| P7 | Sem aviso quando o pedido fica pronto, a não ser que a aba Mesas esteja aberta | Só o `badge-prontos` (`pedidos.html:45`) | O garçom que está no salão não percebe que precisa buscar o pedido |

---

## Propostas

Prioridade: **P0** obrigatório para usar bem no celular · **P1** melhora muito · **P2** para depois.

### Bloco A: Ergonomia e toque

#### A1. Correções básicas de formulário no mobile (P0)
- **O quê:** todos os `input`, `select` e `textarea` com no mínimo 16 px no mobile. `inputmode="decimal"` nos valores, `inputmode="numeric"` em pessoas e quantidade, `enterkeyhint="search"` na busca, `autocomplete="off"` onde fizer sentido.
- **Resolve:** P1, P2.
- **CA sugerido:** dado um iPhone, quando toco em qualquer campo do PDV, então a página **não** dá zoom e o teclado certo aparece.
- **Esforço:** P (só CSS e atributos).

#### A2. Navegação inferior (bottom nav) no celular (P1)
- **O quê:** abaixo de 900 px, mover as abas "Novo Pedido" e "Mesas & Entregas" para uma barra fixa embaixo, com ícone, rótulo e badge de prontos, respeitando `env(safe-area-inset-bottom)`. A topbar fica só com o status de conexão e um menu (nome, pendentes, sair).
- **Resolve:** P6.
- **Cuidado:** a barra do carrinho (`mobile-cart-bar`) precisa ficar logo acima da bottom nav, sem cobrir o último produto da grade.
- **CA sugerido:** dado o celular em pé, quando uso o PDV com uma mão, então alcanço as abas e o carrinho com o polegar, sem esticar até o topo.

#### A3. Áreas de toque e feedback (P1)
- **O quê:** botões e chips com no mínimo 48 × 48 px e 8 px de espaço entre eles. Estado `:active` visível em tudo que é tocável. Vibração diferente para sucesso (pedido enviado) e para erro.
- **CA sugerido:** nenhum botão do fluxo de pedido tem área de toque abaixo de 48 px (conferir no DevTools).

#### A4. Diálogos próprios no lugar de `alert`/`confirm` (P1)
- **O quê:** substituir os 12 diálogos nativos por um *bottom sheet* de confirmação e por *toasts* com "Desfazer" (ex.: remover item do carrinho → toast "Item removido · Desfazer" por 5 s, sem pedir confirmação antes).
- **Resolve:** P3.
- **CA sugerido:** nenhum `alert()`/`confirm()` restante em `js/pedidos.js`. Remover um item por engano pode ser desfeito em até 5 s.

### Bloco B: Lançar pedido mais rápido

#### B1. Escolha da mesa por mapa em grade (P0)
- **O quê:** trocar o `<select>` de mesa por uma grade de botões grandes (ou um sheet que abre ao tocar no badge da mesa), com as cores livre/ocupada/aguardando conta e uma opção "Balcão / Viagem" em destaque.
- **Resolve:** P4.
- **CA sugerido:** dado o celular, quando inicio um pedido, então escolho a mesa com 1 toque e vejo quais estão ocupadas.

#### B2. Favoritos e "mais pedidos" no topo (P1)
- **O quê:** primeira aba de categoria "⭐ Rápidos" com os 8 a 12 produtos mais vendidos dos últimos 30 dias (a partir dos relatórios da CAF-000014) ou fixados pelo admin.
- **CA sugerido:** os itens mais vendidos ficam acessíveis sem rolar e sem buscar.

#### B3. Quantidade e ações direto no card (P1)
- **O quê:** depois do primeiro toque, o card do produto mostra um contador `– 2 +`. Toque longo (ou deslizar) abre a personalização (`modal-montagem`). Produtos sem adicionais não abrem modal.
- **CA sugerido:** lançar "3 espressos" leva no máximo 3 toques.

#### B4. Busca tolerante (P2)
- **O quê:** ignorar acentos e aceitar erros de digitação simples ("capucino" encontra "Cappuccino"), além de buscar pelo apelido do produto.

#### B5. Ditado por voz na observação (P2)
- **O quê:** botão de microfone nas observações usando a Web Speech API (`SpeechRecognition`, pt-BR), quando o navegador suportar. Se não suportar, o botão não aparece.

#### B6. Repetir pedido / rodada (P1)
- **O quê:** no consumo da mesa (`modal-mesa`), botão "🔁 Repetir rodada" que copia os itens do último pedido para o carrinho, para conferir e enviar.
- **CA sugerido:** pedir "mais uma rodada" leva no máximo 2 toques mais a confirmação.

### Bloco C: Acompanhar e entregar

#### C1. Aviso de pedido pronto no celular (P0)
- **O quê:** quando um pedido do garçom (ou da mesa que ele atende) ficar pronto: vibração longa, som curto e toast clicável, em qualquer aba. Com o app em segundo plano, notificação via Notification API / Web Push, que depende de permissão e, no iOS, de a PWA estar instalada.
- **Resolve:** P7.
- **Dependência:** o realtime de `pedido_itens` já existe (CAF-000009). Para o push com a tela bloqueada, é preciso um service worker com push e um backend que envie (Edge Function do Supabase).
- **CA sugerido:** dado que estou na aba "Novo Pedido", quando a cozinha marca meu pedido como pronto, então o celular vibra e aparece um aviso em até 3 s.

#### C2. "Meus pedidos" e filtro por garçom (P1)
- **O quê:** na aba Mesas, um filtro padrão "Meus" que mostra só os pedidos lançados pelo usuário logado, com a opção de ver "Todos".
- **CA sugerido:** com 20 pedidos ativos, vejo só os meus com 1 toque.

#### C3. Marcar como entregue deslizando (P2)
- **O quê:** deslizar o card do pedido pronto para a direita para "Entregue", com toast de desfazer.

#### C4. Tela sempre ligada durante o turno (P2)
- **O quê:** opção "Manter tela ligada" usando a Screen Wake Lock API, reativada quando a aba volta a ficar visível.

### Bloco D: Fechamento de conta no celular

#### D1. Fechar conta em etapas (P0)
- **O quê:** transformar o `modal-fechar-conta` num fluxo de tela cheia com 3 passos: **Resumo → Ajustes (taxa/desconto/divisão) → Pagamento**. O total e o botão principal ficam fixos no rodapé. Tirar os estilos inline e as larguras fixas.
- **Resolve:** P5.
- **CA sugerido:** em 375 px de largura, nenhum campo fica cortado e o botão "Confirmar" está sempre visível sem rolar.

#### D2. Teclado de valores e notas rápidas (P1)
- **O quê:** em pagamento em dinheiro, botões rápidos "Valor exato", "R$ 20", "R$ 50", "R$ 100", com o troco calculado na hora.
- **CA sugerido:** receber em dinheiro e ver o troco leva no máximo 2 toques.

#### D3. Enviar comprovante pelo WhatsApp (P2)
- **O quê:** quando não houver impressora por perto, "Compartilhar comprovante" usando a Web Share API (texto ou imagem do cupom). Se não houver suporte, cai num link `wa.me`.

### Bloco E: Confiabilidade em rede móvel

#### E1. Indicador de offline mais claro (P1)
- **O quê:** faixa fina e colorida no topo quando estiver offline ou reconectando, com o texto "Seus pedidos estão salvos e serão enviados". Hoje o aviso é um ponto de 8 px mais um texto pequeno (`pedidos.html:54-57`).

#### E2. Proteção contra perda do carrinho (P1)
- **O quê:** salvar o carrinho em andamento (mesa, itens e observações) no `localStorage` e restaurar se a aba for recarregada ou o navegador matar a página em segundo plano, o que é comum no iOS.
- **CA sugerido:** dado um carrinho com 3 itens, quando fecho e reabro o PWA, então o carrinho volta igual.

#### E3. Envio com confirmação otimista (P2)
- **O quê:** ao tocar em "Enviar para Cozinha", limpar o carrinho na hora e mostrar o status do envio num toast ("Enviando… → Enviado ✓"), sem travar a tela esperando o servidor. A idempotência da fila offline já garante que o pedido não duplica.

---

## Resumo e ordem sugerida

| Ordem | Proposta | Prioridade | Esforço | Atividade SDD |
|:-:|---|:-:|:-:|---|
| 1 | A1. Correções de formulário (zoom/teclado) | P0 | P | [CAF-000051](CONCLUIDAS/CAF-000051-correcoes-formulario-mobile-e-anti-zoom.md) ✓ |
| 2 | B1. Mesa por grade | P0 | M | [CAF-000052](CONCLUIDAS/CAF-000052-selecao-de-mesas-em-grade-no-mobile.md) ✓ |
| 3 | C1. Aviso de pedido pronto | P0 | M (G com push) | [CAF-000053](CONCLUIDAS/CAF-000053-aviso-de-pedido-pronto-no-celular.md) ✓ |
| 4 | D1. Fechar conta em etapas | P0 | G | [CAF-000054](CONCLUIDAS/CAF-000054-fechamento-de-conta-em-etapas-no-mobile.md) ✓ |
| 5 | A2 + A3. Bottom nav e áreas de toque | P1 | M | [CAF-000055](CONCLUIDAS/CAF-000055-bottom-nav-e-areas-de-toque-mobile.md) ✓ |
| 6 | A4. Diálogos próprios + desfazer | P1 | M | [CAF-000056](CONCLUIDAS/CAF-000056-dialogos-nativos-bottom-sheets-e-toasts.md) ✓ |
| 7 | E1 + E2. Carrinho persistente e status offline | P1 | P | [CAF-000057](CONCLUIDAS/CAF-000057-carrinho-persistente-e-status-offline.md) ✓ |
| 8 | B2 + B3 + B6. Lançamento rápido | P1 | M | [CAF-000058](CONCLUIDAS/CAF-000058-lancamento-rapido-favoritos-e-repetir-rodada.md) ✓ |
| 9 | C2 + D2 + E3. Operação ágil de salão | P1 | M | [CAF-000059](CONCLUIDAS/CAF-000059-filtro-meus-pedidos-e-troco-rapido.md) ✓ |
| — | B4, B5, C3, C4, D3 | P2 | — | Considerado para o futuro |

Esforço: **P** até meio dia · **M** 1 a 2 dias · **G** 3 dias ou mais.

## Dúvidas em aberto

| # | Dúvida | Responsável | Bloqueante? | Resposta |
|---|--------|-------------|-------------|----------|
| D01 | Os garçons usam o celular pessoal ou aparelhos da casa? Quais modelos (iPhone/Android)? Isso define se o push no iOS é viável | PO | Sim, para C1 | |
| D02 | O PDV está instalado como PWA na tela inicial ou é aberto pelo navegador? | PO | Não | |
| D03 | Cada garçom atende mesas fixas (setor) ou qualquer mesa? Isso afeta C1 e C2 | PO | Não | |
| D04 | No celular, o fechamento de conta deve ser permitido para todos ou só para caixa/gerente (ver CAF-000036)? | PO | Não | |
