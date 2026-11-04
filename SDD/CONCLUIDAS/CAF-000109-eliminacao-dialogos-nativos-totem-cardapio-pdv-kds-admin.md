# [FIX] Eliminação de Diálogos Nativos Bloqueantes (`alert`/`confirm`/`prompt`) e Modal de Recebimento de Pedidos do Totem no PDV

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-11-04

## Detalhes da Atividade

- **O que precisa ser feito:**
  Substituir todas as chamadas remanescentes a diálogos nativos bloqueantes do navegador (`window.alert`, `window.confirm` e `window.prompt`) nas telas de operação e autoatendimento (`pedidos.js`, `totem.js`, `cardapio-cliente-pedido.js`, `cozinha.js` e módulos de `js/admin/`) por componentes próprios da interface (Bottom Sheets com botões de seleção rápida, modais acessíveis e Toasts não-bloqueantes):
  1. **Correção do Recebimento de Pedido do Totem no PDV (`window.baristaReceberPedidoTotem` em `js/pedidos.js:3654`):** Hoje, quando um cliente faz um pedido no Totem no modo "Pagar no Balcão", o PDV abre um `prompt()` de texto livre pedindo para o barista digitar `"pix, dinheiro, cartao_debito, cartao_credito"`. Se o barista digitar `"debito"`, `"credito"` ou `"cartão"`, o código cai silenciosamente no fallback `'pix'`, registrando a venda na forma de pagamento errada no caixa! Deve ser substituído por um Bottom Sheet / Modal com 4 botões grandes de toque único (`Pix`, `Cartão Débito`, `Cartão Crédito`, `Dinheiro`).
  2. **Substituição de `prompt()` de Motivos no PDV e KDS (`js/pedidos.js` e `js/cozinha.js`):** Substituir os `prompt()` de motivo de cancelamento de item (`pedidos.js:960`), recusa de pedido QR (`pedidos.js:3271`), cliente não compareceu (`pedidos.js:3642`) e motivo de prioridade (`pedidos.js:3724`, `cozinha.js:2147`) por um Bottom Sheet / Modal com chips de motivos rápidos (1 toque) + campo de texto opcional.
  3. **Eliminação do `alert()` Bloqueante no Totem (`js/totem.js:1186`):** Em um quiosque em tela cheia, um `alert()` nativo congela a interface e pode tirar o navegador do modo fullscreen. Substituir pelo modal/banner de erro próprio do Totem com fechamento automático ou botão grande "Tentar Novamente".
  4. **Eliminação dos 14 `alert()` e `confirm()` no Cardápio Digital do Cliente (`js/cardapio-cliente-pedido.js`):** Substituir avisos de validação, ativação do modo intervalo e confirmação de "Chamar Atendente / Pedir Conta" por toasts estilizados e bottom sheet de confirmação.
  5. **Padronização nos Módulos Admin (`js/admin/`):** Substituir os `alert()`, `confirm()` e `prompt()` remanescentes em `mesas-admin.js`, `pedidos-admin.js`, `financeiro-admin.js`, `promocoes.js`, `adicionais-admin.js`, `caixa-admin.js`, `usuarios-admin.js`, `relatorios-admin.js` e `settings.js` pelos utilitários `admin.toast()`, `admin.confirm()` e `admin.prompt()` em `js/admin/main.js`.
- **Problema e evidência:**
  - `js/pedidos.js:3659`: `const forma = prompt('Receber Pedido ... Informe a forma de pagamento (pix, dinheiro, cartao_debito, cartao_credito):', ...)` com fallback silencioso `: 'pix'` na linha 3665.
  - `js/totem.js:1186`: `alert('Não foi possível registrar o pedido: ' + msg);`
  - `js/cardapio-cliente-pedido.js`: 13 chamadas a `alert(...)` e 1 a `confirm(...)`.
  - `js/cozinha.js`: 11 chamadas a `alert(...)` e 1 a `prompt(...)`.
  - `js/admin/*.js`: 28 chamadas diretas a `alert`, `confirm` e `prompt` apesar de `window.admin.confirm` e `window.admin.toast` já existirem.
- **Impacto de não fazer:**
  - Erro financeiro direto no caixa sempre que o barista digita `"debito"` ou `"credito"` sem o prefixo `cartao_` ao receber pedidos do Totem.
  - Travamento da tela do Totem em caso de falha de rede ou item esgotado.
  - Quebra do modo tela cheia (PWA/Kiosk) no iOS/Android ao abrir diálogos nativos do navegador.
- **Para quem é destinado:**
  Clientes (Cardápio Digital e Totem), baristas, garçons, equipe de cozinha e administradores.
- **História de usuário:**
  Como barista e cliente, quero interagir apenas com modais, botões rápidos e toasts integrados ao design da cafeteria, sem caixas de texto nativas do navegador, para selecionar a forma de pagamento com 1 toque sem risco de erro de digitação e sem travar o Totem ou o celular.
- **Como saberemos que deu certo:**
  1. Zero chamadas a `window.alert(`, `window.confirm(` ou `window.prompt(` nos arquivos de operação (`pedidos.js`, `totem.js`, `cardapio-cliente-pedido.js`, `cozinha.js` e `js/admin/*.js`).
  2. Receber um pedido do Totem no PDV exibe botões claros para `Pix`, `Cartão de Débito`, `Cartão de Crédito` e `Dinheiro`, gravando o valor exato da enumeração sem digitação manual.
  3. 100% dos testes passando em `npm test` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Substituir o `prompt()` em `window.baristaReceberPedidoTotem` (`js/pedidos.js`) por um Bottom Sheet / Modal de seleção de forma de pagamento com botões grandes (`pix`, `cartao_debito`, `cartao_credito`, `dinheiro`) | P0 | CA01 |
| RF02 | Criar helper `window.showPromptBottomSheet({ titulo, mensagem, opcoesRapidas, valorPadrao, obrigatorio })` no PDV/KDS e substituir todos os `prompt()` em `js/pedidos.js` e `js/cozinha.js`, bem como todos os `alert()` em `js/cozinha.js` por toasts | P0 | CA02, CA03 |
| RF03 | Substituir o `alert()` em `js/totem.js` por feedback visual nativo do Totem (modal/toast grande com botão de ação de 56px+) | P0 | CA04 |
| RF04 | Substituir todos os `alert()` e `confirm()` em `js/cardapio-cliente-pedido.js` por toasts e bottom sheet de confirmação do cardápio | P1 | CA05 |
| RF05 | Adicionar método `admin.prompt({ title, msg, placeholder, defaultValue, options })` em `js/admin/main.js` e migrar os `alert`, `confirm` e `prompt` remanescentes em `js/admin/*.js` | P1 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Alvos de toque nos modais/bottom sheets com altura mínima de `48px` (`56px` no Totem) e fechamento via tecla `Escape` ou toque no backdrop | P0 | CA01 a CA06 |
| RNF02 | Acessibilidade: uso de `role="dialog"` / `role="alertdialog"`, `aria-modal="true"` e foco automático no primeiro botão ou campo | P1 | Todos |

### Dependências técnicas

- `js/pedidos.js`, `js/cozinha.js`, `js/totem.js`, `js/cardapio-cliente-pedido.js`, `js/admin/main.js`.

### Recursos necessários

- N/A.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um pedido de Totem aguardando pagamento no balcão, quando o barista clicar em "Receber" no PDV, então abre-se um modal/sheet com botões para `Pix`, `Cartão Débito`, `Cartão Crédito` e `Dinheiro` (sem `prompt()` de texto), e ao tocar em `Cartão Débito`, o pedido é recebido com `forma_pagamento = 'cartao_debito'`.
- [x] **CA02:** Dado que o operador no PDV ou KDS aciona cancelar item, recusar pedido de QR Code, marcar "não retirado" ou definir prioridade, quando o diálogo abrir, então exibe chips de motivos rápidos selecionáveis com 1 toque e campo de texto, sem utilizar `window.prompt()`.
- [x] **CA03:** Dado um erro de comunicação ou aviso operacional na tela da cozinha (`cozinha.html`), quando o evento ocorrer, então é exibido um toast/modal da própria aplicação, com zero chamadas a `window.alert()`.
- [x] **CA04:** Dado o Totem de autoatendimento (`totem.html`), quando ocorrer erro ao registrar o pedido (ex.: produto esgotado ou queda de rede), então é exibido um modal de erro próprio do Totem com botão grande para voltar/tentar novamente, sem `window.alert()`.
- [x] **CA05:** Dado o cliente no Cardápio Digital (`cardapio.html`), quando tentar enviar pedido com campo obrigatório ausente ou clicar em "Chamar Atendente / Pedir Conta", então recebe feedback via toast e modal de confirmação próprio, sem `window.alert()` ou `window.confirm()`.
- [x] **CA06:** Dado qualquer módulo do painel Admin (`admin.html`), quando o administrador excluir um registro, cancelar pedido ou reabrir caixa, então são utilizados `admin.confirm()`, `admin.prompt()` e `admin.toast()`, sem diálogos nativos do navegador.

## O que a atividade não inclui

- Alteração nas regras de negócio de cálculo de caixa ou permissões no banco: motivo: escopo focado na camada de interface e prevenção de erro de entrada humana.

### Considerado para o futuro (P2)

- Sons personalizados distintos para toasts de erro × sucesso no KDS.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Se o cliente escolheu "Pix" no Totem no modo pagar no balcão, o botão Pix já deve vir pré-destacado no modal do barista? | dev | Não | Sim, a forma sugerida pelo pedido vem destacada no modal para confirmação em 1 toque. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Recebimento de pedido do Totem com Cartão de Débito via botão | integração (Happy DOM) | CA01 | Acionar `baristaReceberPedidoTotem`, clicar no botão `Cartão Débito` | RPC/update chamado com `'cartao_debito'`, sem `window.prompt` |
| CT02 | Fluxo de recusa/cancelamento com chip rápido de motivo | integração (Happy DOM) | CA02 | Acionar cancelamento/recusa, clicar em chip de motivo e confirmar | Motivo enviado corretamente sem `window.prompt` |
| CT03 | Erro no envio de pedido no Totem sem `alert()` | integração (Happy DOM) | CA04 | Simular falha na RPC `criar_pedido_totem` | Modal de erro do Totem visível no DOM; `window.alert` não chamado |
| CT04 | Varredura AST/estática de ausência de `alert`/`confirm`/`prompt` | unit | CA01 a CA06 | Verificar ausência de chamadas nativas nos arquivos-alvo | Zero ocorrências |

## URL Complementar

- Referência: [CAF-000056](CONCLUIDAS/CAF-000056-dialogos-nativos-bottom-sheets-e-toasts.md) e [CAF-000084](CONCLUIDAS/CAF-000084-pendencias-ux-kds-e-cardapio.md)
