# [FIX] PDV: envio de pedido sem perda, recebimento do totem, cancelamento por RPC, observações, toasts e fila offline

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-24

## Detalhes da Atividade

- **O que precisa ser feito:** Garantir que nenhum pedido lançado no PDV se perca entre o toque em "Enviar" e a gravação no banco, e corrigir as operações de balcão que hoje alteram pedidos sem passar pelo servidor ou mostram sucesso em caso de erro.
- **Problema e evidência:**
  - **Envio otimista sem rede de segurança:** `js/pdv/carrinho.js:854-874` limpa o carrinho e o rascunho (`estadoPDV.cart = []; limparRascunhoCarrinho();`) antes de qualquer gravação. A chamada `rpc('criar_pedido')` (`:891`) não tem timeout. `dbSalvarPedidoOffline` é chamado sem `try/catch` dentro de uma função `async` anônima sem tratamento (`:884`, `:955`). Se a página recarregar com a requisição pendurada, o pedido some. Erro de negócio só pode ser desfeito pelo botão "Restaurar" de um toast de 8 s (`:908-944`).
  - **Fallback que mente:** `js/pdv/offline.js:43-55` cai para `localStorage` quando o IndexedDB não abre, e o `catch` só loga e `return true` (`:51-54`), então o PDV avisa "guardado na fila" mesmo quando nada foi gravado.
  - **Receber pedido do totem:** se a RPC falha, `js/pdv/mesas.js:1196-1208` faz `.update({ status: 'pendente', status_pagamento: 'pago' })` direto na tabela. A RPC `receber_pedido_totem` (`supabase/migration_caf_000040_totem.sql:504-519`) não confere se o pedido ainda está `aguardando_pagamento` e o botão não é desabilitado durante a chamada. Um pedido já pronto pode voltar para "pendente" no KDS e ser marcado pago fora do caixa.
  - **Cancelar pedido inteiro:** `js/pdv/mesas.js:1068-1080` faz `update({ status: 'cancelado' ... })` direto, ignora o `{ error }` e mostra "Pedido cancelado com sucesso!" (`:1081`). O item usa a RPC `cancelar_item` com permissão (`supabase/migration_caf_000081_seguranca_pin_rls.sql:190-206`); o pedido inteiro não.
  - **Observação escapada na digitação:** `js/pdv/carrinho.js:328` e `:426` gravam `observacoes = escapeHtml(...)`. A saída escapa de novo (`js/cozinha.js:1380`, `js/pedido-print.js:196`), e o modal de edição recarrega o valor já escapado (`:413`). Resultado: "sem açúcar & canela" chega ao KDS como `sem açúcar &amp; canela` e piora a cada edição; o banco guarda texto sujo.
  - **Toasts:** `showToast` (`js/pdv/sessao.js:8-25`) trata o 2º argumento string como rótulo de botão de ação e mantém `tipo = 'info'`. 35 das 83 chamadas em `js/pdv/` usam `showToast(msg, 'error' | 'success' | 'warning')`: erros aparecem neutros, com um botão "error" inútil, e somem em 4 s.
  - **Fila offline:** `js/pdv/offline.js:292` escapa `statusHtml`, que já é markup (o barista vê `<span style=...>` na tela); o nome do cliente é escapado duas vezes (`:275` e `:288`); itens com status `falha` voltam a ser enviados a cada 15 s para sempre sem alerta (`:209-226`, `:360-364`); `total_estimado` usa só `produto.preco * quantidade` (`js/pdv/carrinho.js:770`), sem adicionais, meio a meio ou promoção; `openOfflineDB` abre uma conexão nova a cada chamada e nunca fecha (`js/pdv/offline.js:15-40`).
- **Impacto de não fazer:** Pedido pago que não chega à cozinha no pico do intervalo; dinheiro recebido fora do caixa; cancelamentos sem auditoria; comandas com texto ilegível; erros que o barista não vê.
- **Para quem é destinado:** Barista/operador do PDV e cozinha (KDS), que dependem do pedido chegar inteiro.
- **História de usuário:** Como barista, quero ter certeza de que o pedido enviado foi gravado (ou está guardado para reenvio) e ver erros com clareza, para não perder venda nem refazer pedido.
- **Como saberemos que deu certo:** 0 pedidos perdidos em teste de recarga da página com rede lenta/pendurada; 0 updates diretos em `pedidos.status` a partir de `js/pdv/`; todo toast de erro visível até ser fechado.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Envio "grava antes": o pedido vai para a fila IndexedDB (chave `client_id`, já idempotente no servidor) antes da chamada; só depois o carrinho é limpo; sucesso remove da fila | P0 | CA01, CA02 |
| RF02 | `AbortController` com 10 s na chamada `criar_pedido`; timeout mantém o pedido na fila para reenvio | P0 | CA03 |
| RF03 | Falha ao gravar na fila (IndexedDB e fallback) gera erro persistente e mantém o carrinho intacto; o fallback não retorna `true` quando falha | P0 | CA04 |
| RF04 | Erro de negócio do servidor devolve o carrinho automaticamente (sem depender do toast de 8 s) e remove o item da fila | P0 | CA05 |
| RF05 | Receber pedido do totem: remover o fallback de update direto; RPC só altera pedido com `status = 'aguardando_pagamento'` e devolve erro claro caso contrário; botão desabilitado durante a chamada | P0 | CA06, CA07 |
| RF06 | RPC `cancelar_pedido(p_pedido_id, p_motivo)` com checagem de permissão (`pdv.cancelar_item` ou admin), motivo obrigatório e registro em `pedido_eventos`; o PDV usa a RPC e trata o erro | P0 | CA08, CA09 |
| RF07 | Observações gravadas como texto puro (sem `escapeHtml` na entrada); escape só na saída; migration que desfaz o escape duplo nos registros existentes de `pedido_itens.observacoes` e `pedidos.observacoes` | P1 | CA10, CA11 |
| RF08 | `showToast` reconhece `'error' | 'success' | 'warning' | 'info'` como tipo; toast de erro só some ao ser fechado | P1 | CA12 |
| RF09 | Fila offline: status renderizado sem escape duplo; reenvio de `falha` com backoff (30 s, 1, 2, 5 min; máx. 5 tentativas automáticas) e banner com contagem de falhas; `total_estimado` com o mesmo cálculo do carrinho; uma única conexão IndexedDB reutilizada | P1 | CA13, CA14, CA15 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | O toque em "Enviar" libera a tela para o próximo pedido em < 300 ms (gravação local antes da rede) | P0 | CA01 |
| RNF02 | Nenhum update direto em `pedidos.status`/`status_pagamento` a partir de `js/pdv/` (regra de lint ou teste de contrato) | P0 | CA06, CA08 |
| RNF03 | Normalização de observações idempotente (rodar duas vezes não altera o resultado) | P0 | CA11 |

### Dependências técnicas

- `criar_pedido` idempotente por `client_id` e fila offline (CAF-000018/057, migration `migration_caf_000026_idempotencia.sql`), `receber_pedido_totem` (040), `cancelar_item` (081), `pedido_eventos` (019).
- CAF-000128 (PIN de supervisor), se o cancelamento do pedido inteiro passar a exigir PIN.
- CAF-000137 move a fila para `js/utils/offline-queue.js`; esta SDD corrige o comportamento e pode ser feita antes ou junto.

### Recursos necessários

- Tablet do balcão para teste manual com rede limitada (DevTools "Slow 3G"/offline).

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um carrinho com 2 itens e rede normal, quando o barista toca "Enviar", então o pedido é gravado na fila local, o carrinho é limpo, a RPC é chamada e, ao sucesso, a fila fica vazia.
- [x] **CA02:** Dado um envio em andamento, quando a página é recarregada antes da resposta, então ao abrir de novo o pedido está na fila e é reenviado; o servidor não duplica (mesmo `client_id`).
- [x] **CA03:** Dado que a RPC não responde, quando passam 10 s, então a chamada é abortada, o pedido fica "aguardando envio" e o toast avisa.
- [x] **CA04:** Dado IndexedDB e `localStorage` indisponíveis, quando o barista envia, então aparece erro persistente e o carrinho não é limpo (caso negativo: não aparece "guardado na fila").
- [x] **CA05:** Dado um produto que ficou indisponível, quando o servidor recusa o pedido, então o carrinho volta preenchido e o erro fica visível até ser fechado.
- [x] **CA06:** Dado um pedido do totem já em `pendente` ou `pronto`, quando outro operador tenta "Receber", então a RPC recusa, o pedido não muda e nenhum pagamento é lançado.
- [x] **CA07:** Dado um pedido `aguardando_pagamento`, quando o operador toca "Receber" duas vezes rápido, então só uma chamada é feita e existe um único registro em `pedido_pagamentos`.
- [x] **CA08:** Dado um usuário sem permissão de cancelamento, quando tenta cancelar o pedido inteiro, então a RPC recusa e o PDV mostra o erro (não mostra sucesso).
- [x] **CA09:** Dado um usuário com permissão, quando cancela o pedido com motivo, então o pedido fica `cancelado` com autor, horário e motivo, e há um evento em `pedido_eventos`.
- [x] **CA10:** Dado a observação `sem açúcar & <canela>`, quando lançada, editada duas vezes e enviada, então o banco guarda exatamente esse texto e o KDS e a comanda mostram o texto igual, sem entidades HTML.
- [x] **CA11:** Dado registros antigos com `&amp;amp;` e `&lt;`, quando a normalização roda duas vezes, então o texto fica `&` e `<` e a segunda execução não altera nada.
- [x] **CA12:** Dado `showToast('Falha', 'error')`, quando chamado, então o toast tem a classe `toast--error`, sem botão de ação, e permanece até o clique em fechar.
- [x] **CA13:** Dado um pedido em `falha` na fila, quando o card é exibido, então o status aparece formatado (sem tags visíveis) e o nome do cliente aparece uma única vez escapado.
- [x] **CA14:** Dado um pedido que falha sempre por regra de negócio, quando passam 30 min, então houve no máximo 5 tentativas automáticas e o banner mostra "1 pedido com falha".
- [x] **CA15:** Dado um item meio a meio com adicional, quando vai para a fila offline, então o `total_estimado` é igual ao total exibido no carrinho.

## O que a atividade não inclui

- Reescrever o PDV para os módulos de `js/utils/`: motivo: CAF-000137.
- PIN de supervisor no cancelamento: motivo: CAF-000128 define a regra; aqui só se usa a permissão existente.
- Service Worker com Background Sync: motivo: suporte desigual nos tablets e o reenvio por intervalo já cobre o caso.

### Considerado para o futuro (P2)

- Painel no admin com pedidos que falharam no reenvio de todos os PDVs.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Cancelar pedido inteiro já pago deve exigir admin/PIN ou basta a permissão de cancelar item? | PO | Não | Usuários com permissão `pdv.cancelar_item` ou `admin` podem cancelar pedidos pendentes/em preparo. Se o pedido já possuir `status_pagamento = 'pago'`, exige estritamente perfil `admin` ou permissão `pdv.cancelar_item_pago` (alinhado à RPC `cancelar_item`). |
| D02 | Após 5 falhas automáticas, o pedido fica na fila esperando ação manual ou é descartado após X horas? (sugestão: fica até ação manual) | PO | Não | O pedido permanece preservado localmente com status `falha_manual` sem ser descartado silenciosamente; o reenvio automático é suspenso para poupar recursos e o banner exibe alerta de atenção manual com opções de "Reenviar agora" ou "Descartar". |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Ordem grava→envia→remove | integração (harness `carrinho.js` + `fake-indexeddb`, Supabase simulado) | CA01 | Enviar | Fila vazia ao final; RPC chamada 1 vez |
| CT02 | Recarga no meio | integração | CA02 | RPC pendente; recriar módulo | Pedido na fila e reenviado |
| CT03 | Timeout | integração (timers falsos) | CA03 | RPC nunca resolve; avançar 10 s | Abortado; "aguardando envio" |
| CT04 | Sem armazenamento | integração | CA04 | IndexedDB nulo e `localStorage.setItem` lança | Erro persistente; carrinho intacto |
| CT05 | Erro de negócio | integração | CA05 | RPC devolve erro | Carrinho restaurado |
| CT06 | Totem fora do estado | pgTAP | CA06 | `receber_pedido_totem` em pedido `pronto` | Exceção; sem `pedido_pagamentos` |
| CT07 | Clique duplo | integração (harness `mesas.js`) | CA07 | Dois cliques | 1 chamada; botão desabilitado |
| CT08 | `cancelar_pedido` sem permissão | pgTAP (claims de barista sem permissão) | CA08 | Chamar RPC | Exceção |
| CT09 | `cancelar_pedido` com permissão | pgTAP | CA09 | Chamar RPC | Status, autor e evento gravados |
| CT10 | Observação ida e volta | integração (carrinho → payload → `pedido-print.js`) | CA10 | Digitar, editar, imprimir | Texto idêntico |
| CT11 | Normalização | pgTAP | CA11 | Rodar a função 2 vezes | Resultado estável |
| CT12 | Tipos de toast | unit (DOM de `sessao.js`) | CA12 | Chamar com `'error'` | Classe e persistência corretas |
| CT13 | Card da fila | integração (DOM de `offline.js`) | CA13 | Renderizar item em falha | Sem `<span` visível no texto |
| CT14 | Backoff | integração (timers falsos) | CA14 | Falha permanente por 30 min | ≤ 5 tentativas; banner |
| CT15 | Total estimado | unit | CA15 | Item meio a meio + adicional | Igual ao carrinho |
| CT16 | Rede real instável | manual (tablet, DevTools) | CA01–CA03 | Enviar 10 pedidos alternando offline | 10 pedidos no KDS, sem duplicata |

## URL Complementar

- Documentação técnica: `js/pdv/carrinho.js`, `js/pdv/offline.js`, `js/pdv/mesas.js`, `js/pdv/sessao.js`, `supabase/migration_caf_000040_totem.sql`, `supabase/migration_caf_000081_seguranca_pin_rls.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000018](CONCLUIDAS/CAF-000018-tolerancia-a-queda-de-internet.md), [CAF-000057](CONCLUIDAS/CAF-000057-carrinho-persistente-e-status-offline.md), [CAF-000040](CONCLUIDAS/CAF-000040-totem-de-autoatendimento-no-balcao.md), [CAF-000004](CONCLUIDAS/CAF-000004-cancelar-item-individual.md), [CAF-000056](CONCLUIDAS/CAF-000056-dialogos-nativos-bottom-sheets-e-toasts.md), [CAF-000075](CONCLUIDAS/CAF-000075-correcao-validacao-adicionais-e-xss-no-pdv.md); novas: CAF-000128, CAF-000137
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
