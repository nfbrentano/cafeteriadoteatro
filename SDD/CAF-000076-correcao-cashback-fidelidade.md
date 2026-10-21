# [FIX] CAF-000076 — Correção do cashback: carrinho quebrado, crédito no PDV, estorno e RPC segura

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Corrigir a integração do cashback (CAF-000063) com o cardápio público, o PDV e o totem; implementar o estorno quando o pedido é cancelado; e blindar a RPC `processar_cashback_pedido`, que hoje permite creditar saldo arbitrário.
- **Problema e evidência:**
  - **Carrinho do cardápio público quebrado:** em `js/cardapio-cliente-pedido.js:1047-1066`, o código chama `window.cafeteriaCashback.isCashbackActive(sb).then(...)`. Porém `isCashbackActive` (`js/utils/cashback.js:17-20`) é **síncrona**, recebe um objeto de configuração e devolve um booleano. Chamar `.then` sobre um booleano gera `TypeError` dentro de `abrirModalCarrinho()`, interrompendo o modal sempre que há `window.cafeteriaCashback`. Com isso, o checkout via QR na mesa (CAF-000037) e o pedido online (CAF-000038) ficam bloqueados. O mesmo bloco chama `getCashbackPrompt(sb).then` com o mesmo erro.
  - **Cashback nunca creditado no PDV:**
    - `js/pedidos.js:4893` passa o client do Supabase para `isCashbackActive`, que sempre retorna `false`.
    - `js/pedidos.js:4899-4904` chama `processOrderCashback(sb, { clienteId, valorElegivel, pedidoId, mesaCodigo })`, mas a assinatura é posicional: `(client, pedidoId, clienteId, valorElegivel)` (`js/utils/cashback.js:78`).
    - O PDV lê `cbResult.cashbackGerado` e `cbResult.mensagem`, mas a RPC devolve `valor_cashback` e `novo_saldo`.
  - **Não há loader de configuração:** a configuração fica em linhas separadas de `configuracoes_sistema` (`cashback_ativo`, `cashback_percentual` e `cashback_valor_minimo`; `migration_caf_000063_cashback_fidelidade.sql:12-16`), e nenhuma função monta o objeto que `isCashbackActive` e `getCashbackPrompt` esperam.
  - **Estorno inexistente:** o CA07 da CAF-000063 está marcado `[x]`, mas nenhum trigger ou RPC reverte o cashback quando um pedido é cancelado.
  - **Totem sem lembrete de cashback,** que era previsto na 063.
  - **RPC insegura:** `processar_cashback_pedido` (`migration_caf_000063_cashback_fidelidade.sql:47-148`) é `SECURITY DEFINER` e tem `GRANT EXECUTE … TO anon` (`:150`). Ela confia em `p_valor_elegivel` vindo do cliente e só checa duplicidade quando `p_pedido_id IS NOT NULL` (`:94`). Qualquer pessoa com a chave pública pode creditar qualquer valor em qualquer cliente, repetidamente, passando `p_pedido_id = null`.
  - **Saldo calculado de forma inconsistente:** o saldo é atualizado em `clientes.saldo_conta` (`:132-134`), mas o retorno soma `cliente_conta_movimentos` (`:136-139`). As duas fontes podem divergir das regras da conta do cliente (CAF-000034).
  - **Testes cobrem só o util:** `tests/caf-000063-cashback.test.js` não exercita `pedidos.js` nem `cardapio-cliente-pedido.js`, por isso os erros passaram.
- **Impacto de não fazer:** Clientes não conseguem finalizar pedido pelo QR ou online (perda direta de venda). O programa de fidelidade não credita nada. Há risco financeiro de fraude (saldo criado pela API e usado como pagamento via conta do cliente).
- **Para quem é destinado:** Cliente final (cardápio/QR/online/totem), caixa no PDV, gestor do programa de fidelidade.
- **História de usuário:** Como cliente identificado, quero receber cashback quando pago meu pedido e perdê-lo se o pedido for cancelado, para confiar no programa de fidelidade.
- **Como saberemos que deu certo:**
  - Modal do carrinho abre em 100% dos casos, com cashback ativo ou inativo.
  - Teste E2E de "pagar e receber cashback" passa.
  - Chamada anônima à RPC retorna erro de permissão.
  - Pedido cancelado zera o cashback correspondente.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar `loadCashbackConfig(client)` (async) em `js/utils/cashback.js`, que lê as 3 chaves de `configuracoes_sistema` e devolve `{ ativo, percentual, valor_minimo }`, com cache por sessão. Falha de leitura equivale a desativado | P0 | CA01, CA02 |
| RF02 | Corrigir `js/cardapio-cliente-pedido.js:1047-1066`: `await loadCashbackConfig`, e só depois os helpers síncronos. O bloco é envolvido em `try/catch` e **nunca** impede a abertura do modal | P0 | CA01, CA02 |
| RF03 | Corrigir `js/pedidos.js:4888-4912`: usar `loadCashbackConfig`, chamar `processOrderCashback` com a assinatura certa e ler os campos reais do retorno (`valor_cashback`, `novo_saldo`) usando `formatCashbackNotification` | P0 | CA03 |
| RF04 | Mover o cálculo para o servidor: a RPC recebe `p_fechamento_id` ou `p_pedido_id` (obrigatório) e calcula o valor elegível a partir dos pagamentos gravados, ignorando qualquer valor vindo do cliente | P0 | CA04, CA05 |
| RF05 | Revogar `EXECUTE` de `anon`. Para `authenticated`, exigir a permissão de PDV. Pedidos de QR, online e totem recebem cashback **no fechamento/pagamento** feito pelo PDV, ou por trigger, nunca por chamada direta do cliente | P0 | CA05 |
| RF06 | Garantir unicidade por pedido/fechamento com constraint (substituir o índice baseado em `motivo ILIKE '%cashback%'` por uma coluna `tipo = 'cashback'` + `UNIQUE(pedido_id, tipo)`) | P0 | CA06 |
| RF07 | Estorno: quando o pedido (ou o fechamento) é cancelado ou estornado, lançar um movimento `estorno_cashback` com o valor negativo, uma única vez, e recalcular o saldo. Se o saldo ficaria negativo porque o cliente já usou o crédito, registrar o saldo negativo e sinalizar no CRM (D01) | P0 | CA07 |
| RF08 | Usar uma única fonte de saldo, alinhada à CAF-000034: `v_cliente_saldo`/movimentos ou `clientes.saldo_conta` mantido por trigger. A RPC não atualiza as duas manualmente | P1 | CA08 |
| RF09 | Exibir no totem o lembrete "Informe seu WhatsApp para ganhar X% de cashback" quando ativo | P1 | CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Erros de cashback nunca bloqueiam carrinho, fechamento ou pedido: são logados e engolidos | P0 | CA01, CA03 |
| RNF02 | Nenhuma função `SECURITY DEFINER` de crédito financeiro fica executável por `anon` | P0 | CA05 |
| RNF03 | Valores em centavos, com arredondamento `ROUND(…, 2)` só no servidor | P0 | CA04 |

### Dependências técnicas

- `js/utils/cashback.js`, `js/cardapio-cliente-pedido.js`, `js/pedidos.js`, `js/totem.js`.
- `supabase/migration_caf_000063_cashback_fidelidade.sql`, `migration_caf_000034_conta_cliente.sql`.
- CAF-000073 (o fechamento fornece `fechamento_id`), CAF-000082 (política geral de RPCs para `anon`), CAF-000072 (assinatura atual em produção).

### Recursos necessários

- Decisão do PO sobre estorno com saldo já usado (D01).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado cashback **desativado**, quando o cliente abrir o carrinho no cardápio (QR ou online) com itens, então o modal abre, lista os itens e não mostra caixa de cashback, sem erro no console.
- [ ] **CA02:** Dado cashback **ativo** a 5%, quando o cliente abrir o carrinho, então o modal abre e mostra "ganhar 5% de cashback". Se a leitura da configuração falhar, o modal abre sem a mensagem.
- [ ] **CA03:** Dado cashback ativo, mínimo de R$ 10,00 e uma mesa com cliente identificado, quando o caixa fechar R$ 40,00 em Pix, então o cliente recebe R$ 2,00 e o PDV mostra o toast com o valor e o novo saldo.
- [ ] **CA04:** Dado um fechamento de R$ 40,00 pago, quando a RPC for chamada tentando informar valor elegível de R$ 4.000,00, então o crédito é calculado sobre os R$ 40,00 gravados.
- [ ] **CA05 (negativo):** Dado a chave anônima, quando alguém chamar `processar_cashback_pedido` direto, então recebe erro de permissão. Chamada com `p_pedido_id = null` também é recusada.
- [ ] **CA06:** Dado um pedido que já recebeu cashback, quando o crédito for disparado de novo (reenvio, duplo clique), então nada é creditado e não ocorre erro visível.
- [ ] **CA07:** Dado um pedido que gerou R$ 2,00 de cashback, quando o pedido for cancelado, então surge um movimento de −R$ 2,00 e o saldo volta ao anterior. Um segundo cancelamento não gera novo estorno.
- [ ] **CA08:** Dado créditos, usos e estornos, quando o saldo for consultado no CRM, no PDV e no retorno da RPC, então os três valores são iguais.
- [ ] **CA09:** Dado cashback ativo, quando o cliente chegar à etapa de identificação no totem, então vê o lembrete com o percentual. Com cashback inativo, o lembrete não aparece.

## O que a atividade não inclui

- Programa "10º café grátis" (cartão fidelidade por contagem): motivo: nova feature, P2.
- Expiração de cashback: motivo: regra de negócio nova, P2.

### Considerado para o futuro (P2)

- Validade do crédito de cashback (ex.: 90 dias).
- Notificação por WhatsApp do saldo após cada compra.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Se o cliente já usou o cashback e o pedido de origem é cancelado, o saldo pode ficar negativo ou o estorno é limitado ao saldo disponível? | PO | Sim | |
| D02 | Pedidos pagos em `conta_cliente` (fiado) geram cashback? Hoje a lista de formas elegíveis exclui (`js/utils/cashback.js:9-15`) | PO | Não | |
| D03 | Já houve créditos indevidos via API em produção? (Auditar `cliente_conta_movimentos` com `pedido_id IS NULL` e motivo de cashback) | dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Carrinho com cashback desativado | unit DOM (happy-dom) carregando `cardapio-cliente-pedido.js` real | CA01 | Mock de config `false`; adicionar item; abrir carrinho | Modal visível, itens renderizados, sem exceção |
| CT02 | Carrinho com cashback ativo e com falha de config | unit DOM | CA02 | Mock ativo; depois mock com erro | Mensagem exibida; com falha, o modal abre sem mensagem |
| CT03 | Crédito no fechamento do PDV | integração (pedidos.js + supabase-mock) | CA03 | Simular fechamento com cliente | RPC chamada com assinatura correta; toast com valor |
| CT04 | Valor calculado no servidor | integração (Supabase local) | CA04 | Chamar com valor adulterado | Crédito sobre o valor gravado |
| CT05 | Anon e pedido nulo | integração | CA05 | Chamar com a chave anônima e com `p_pedido_id` nulo | Recusado |
| CT06 | Idempotência | integração | CA06 | 2 chamadas no mesmo pedido | 1 crédito |
| CT07 | Estorno no cancelamento | integração | CA07 | Cancelar pedido com cashback, duas vezes | 1 estorno |
| CT08 | Saldo consistente | integração | CA08 | Créditos, usos e estornos | Saldos iguais nas 3 fontes |
| CT09 | Lembrete no totem | unit DOM | CA09 | Config ativa e inativa | Exibe ou oculta |

## URL Complementar

- Documentação técnica: `js/utils/cashback.js`, `js/cardapio-cliente-pedido.js:1040-1070`, `js/pedidos.js:4888-4914`, `supabase/migration_caf_000063_cashback_fidelidade.sql:47-150`
- Requisitos originais: CAF-000063, CAF-000034
- Issue / PR relacionado: CAF-000072, CAF-000073, CAF-000082
