# [FIX] Correção de Integridade Operacional: Transferência de Pedidos Já Entregues na Mesa, Débito Atômico da Conta do Cliente no Fechamento e Corte de Pagamento no Caixa

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-11-04

## Detalhes da Atividade

- **O que precisa ser feito:**
  Corrigir três falhas de integridade transacional e financeira identificadas nas RPCs operacionais do banco e no fluxo de fechamento de conta do PDV:
  1. **Transferência Completa de Mesa (`transferir_mesa`):** Na migration `081`, a RPC `transferir_mesa` filtra `WHERE mesa_codigo = TRIM(p_origem) AND status != 'cancelado' AND status != 'entregue' AND (status_pagamento IS NULL OR status_pagamento != 'pago')`. Quando um cliente já recebeu parte dos seus pedidos na mesa (`status = 'entregue'`, porém `status_pagamento = 'pendente'`) e solicita trocar de mesa ou juntar mesas, esses pedidos entregues e não pagos **ficam presos na mesa de origem**, dividindo a conta do cliente em duas mesas. A RPC deve transferir todos os pedidos não cancelados e ainda não pagos (`status != 'cancelado' AND (status_pagamento IS NULL OR status_pagamento != 'pago')`), independentemente de já terem sido entregues na mesa.
  2. **Atomicidade e Idempotência no Débito da Conta do Cliente no Fechamento de Mesa (`fechar_conta_mesa` + `js/pedidos.js`):** Hoje, `js/pedidos.js` (linhas 5050–5088) chama `lancar_movimento_conta` **antes** de chamar a RPC `fechar_conta_mesa`. Se a chamada a `fechar_conta_mesa` falhar (por queda momentânea de rede, timeout ou erro de validação), o saldo do cliente já foi debitado no banco e, quando o barista clica novamente em "Confirmar Fechamento", o cliente é debitado em **duplicidade**. O débito na conta do cliente deve ocorrer de forma transacional/idempotente vinculado ao fechamento (ou protegido por chave de idempotência/transação na própria RPC `fechar_conta_mesa`).
  3. **Apuração de Pedidos Agendados/Anteriores Pagos no Turno Atual (`fn_calcular_totais_caixa_interno`):** Hoje, a CTE `vendas_balcao` em `fn_calcular_totais_caixa_interno` (`migration_caf_000083`, linhas 194–197) filtra `p.created_at >= v_aberto_em AND p.created_at <= v_limite_fim`. Pedidos feitos antecipadamente (ex.: pedido online agendado ou reserva de intervalo de espetáculo criada antes da abertura do caixa, ou pedido do totem criado minutos antes de abrir o caixa) que são recebidos e marcados como `status_pagamento = 'pago'` durante o turno ficam **invisíveis na conferência do caixa**. O filtro temporal deve considerar o momento efetivo do pagamento (`COALESCE(p.pago_em, p.updated_at, p.created_at)`).
- **Problema e evidência:**
  - `supabase/migration_caf_000081_seguranca_pin_rls.sql` (linha 269): `AND status != 'entregue'` diverge de `fechar_conta_mesa` (`supabase/migration_caf_000077_cupons_uso_unico.sql`, linha 172), que soma todos os pedidos `status <> 'cancelado' AND (status_pagamento IS NULL OR status_pagamento != 'pago')`.
  - `js/pedidos.js` (linhas 5053–5088): duas chamadas separadas de rede sem proteção contra retry quando a segunda falha.
  - `supabase/migration_caf_000083_pendencias_operacao.sql` (linhas 196–197): filtro estrito por `p.created_at` em `vendas_balcao`.
- **Impacto de não fazer:**
  1. Contas de mesas transferidas ficam quebradas entre duas mesas, causando cobrança a menor no fechamento e sobra de pedidos órfãos na mesa antiga.
  2. Cobrança duplicada no saldo/fiado do cliente em caso de falha de rede durante o fechamento da mesa.
  3. Diferença de caixa inexplicável ao receber encomendas online ou pedidos do modo espetáculo feitos antes da abertura do turno.
- **Para quem é destinado:**
  Baristas, garçons, operadores de caixa e clientes da Cafeteria do Teatro.
- **História de usuário:**
  Como barista e operador de caixa, quero que a transferência de mesa mova todos os pedidos em aberto (inclusive os já entregues na mesa), que o pagamento via Conta do Cliente no fechamento de mesa seja atômico/idempotente e que o caixa contabilize pedidos pagos durante o turno mesmo que criados antes da abertura do caixa, para evitar erros de cobrança e furos no fechamento de caixa.
- **Como saberemos que deu certo:**
  1. Transferir uma mesa com pedidos em status `'novo'`, `'pronto'` e `'entregue'` (todos com `status_pagamento = 'pendente'`) move 100% dos pedidos em aberto para a mesa de destino, preservando intocados apenas pedidos já pagos (`status_pagamento = 'pago'`) de clientes anteriores.
  2. Retentar o fechamento de conta com pagamento `conta_cliente` após uma falha de `fechar_conta_mesa` não gera débito duplicado no extrato do cliente.
  3. Um pedido online/balcão criado antes de `aberto_em` e pago após `aberto_em` é contabilizado corretamente em `fn_calcular_totais_caixa_interno`.
  4. 100% dos testes passando em `npm test`, `npm run test:db` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Atualizar a RPC `transferir_mesa(p_origem, p_destino)` para mover todos os pedidos onde `mesa_codigo = TRIM(p_origem) AND status != 'cancelado' AND (status_pagamento IS NULL OR status_pagamento != 'pago')`, removendo o bloqueio indevido `AND status != 'entregue'` e registrando o evento no log de auditoria | P0 | CA01, CA02 |
| RF02 | Garantir idempotência e atomicidade no débito de `conta_cliente` durante o fechamento de mesa, impedindo débito duplicado caso `fechar_conta_mesa` falhe ou seja reexecutada com a mesma `idempotency_key` | P0 | CA03, CA04 |
| RF03 | Atualizar `fechar_conta_mesa` para verificar a existência de pedidos em aberto por `v_count_pedidos = 0` (ou `v_primeiro_pedido_id IS NULL`) em vez de apenas `v_subtotal = 0`, permitindo fechar mesas cujo consumo líquido seja R$ 0,00 (ex.: cortesia integral) | P1 | CA05 |
| RF04 | Atualizar a CTE `vendas_balcao` em `fn_calcular_totais_caixa_interno` (e gravar `pago_em = now()` quando `status_pagamento` muda para `'pago'`) para apurar vendas pelo instante do pagamento (`COALESCE(p.pago_em, p.updated_at, p.created_at)`) dentro da janela do caixa | P0 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Preservar compatibilidade total de assinatura das RPCs `transferir_mesa`, `fechar_conta_mesa` e `fn_calcular_totais_caixa_interno` | P0 | Todos |
| RNF02 | Manter `SECURITY DEFINER` e `SET search_path = public` em todas as funções alteradas | P0 | Todos |

### Dependências técnicas

- `supabase/migration_caf_000077_cupons_uso_unico.sql`
- `supabase/migration_caf_000081_seguranca_pin_rls.sql`
- `supabase/migration_caf_000083_pendencias_operacao.sql`
- `js/pedidos.js`

### Recursos necessários

- N/A (apenas código do repositório e SQL Editor para aplicação da migration).

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que a Mesa 02 possui o Pedido #10 (`status = 'entregue'`, `status_pagamento = 'pendente'`, R$ 25,00) e o Pedido #11 (`status = 'em_preparo'`, `status_pagamento = 'pendente'`, R$ 15,00), quando o atendente executar `transferir_mesa('02', '05')`, então ambos os pedidos (#10 e #11) são transferidos para a Mesa 05, totalizando R$ 40,00 na Mesa 05 e R$ 0,00 na Mesa 02.
- [x] **CA02:** Dado que a Mesa 02 possui um Pedido #08 antigo já encerrado e pago (`status = 'entregue'`, `status_pagamento = 'pago'`) e um Pedido #10 da rodada atual (`status = 'entregue'`, `status_pagamento = 'pendente'`), quando executar `transferir_mesa('02', '05')`, então apenas o Pedido #10 não pago é transferido, e o Pedido #08 histórico já pago permanece inalterado.
- [x] **CA03:** Dado um fechamento de conta da Mesa 03 com pagamento via `conta_cliente`, quando a chamada `fechar_conta_mesa` falhar na primeira tentativa e o operador clicar novamente em "Confirmar Fechamento", então o saldo do cliente é debitado apenas uma única vez pelo valor da conta.
- [x] **CA04:** Dado um fechamento de conta com pagamento `conta_cliente` em que o cliente não possui saldo/limite suficiente, quando o operador confirmar o fechamento, então a transação inteira é recusada e a mesa permanece aberta (`status_pagamento = 'pendente'`).
- [x] **CA05:** Dado um pedido online ou reserva de intervalo criado às 13:30 (`status_pagamento = 'pendente'`), um caixa aberto às 14:00 e o pagamento desse pedido confirmado no balcão às 15:00 (`status_pagamento = 'pago'`), quando consultada a conferência do caixa (`fn_calcular_totais_caixa_interno`), então o valor desse pedido está incluído no total esperado do caixa aberto às 14:00.
- [x] **CA06:** Dado um pedido de balcão criado e pago às 13:30 (antes da abertura do caixa das 14:00) e que não sofreu alteração de pagamento após as 14:00, quando consultada a conferência do caixa das 14:00, então esse pedido anterior não vaza para o caixa novo.

## O que a atividade não inclui

- Pagamento parcial de itens individuais da mesa: motivo: tratado em atividade específica de nova feature (CAF-000112).

### Considerado para o futuro (P2)

- Histórico visual de transferências de mesa diretamente no card da mesa no PDV.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Pedidos já pagos (`status_pagamento = 'pago'`) de clientes anteriores na mesma mesa devem ser transferidos? | dev | Não | Não. Apenas pedidos com pagamento pendente (`status_pagamento IS NULL OR status_pagamento != 'pago'`) pertencem à conta atual aberta naquela mesa. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Transferência de mesa com pedido já entregue e não pago | pgTAP / integração | CA01, CA02 | Criar pedido `status='entregue'`, `status_pagamento='pendente'` na mesa 01 e chamar `transferir_mesa('01', '02')` | Pedido movido para mesa 02; pedido pago anterior permanece na 01 |
| CT02 | Proteção contra duplo débito em `conta_cliente` no fechamento | integração (Happy DOM) | CA03, CA04 | Simular falha na 1ª chamada de `fechar_conta_mesa` e sucesso na 2ª tentativa em `pedidos.js` | Apenas 1 débito registrado para o cliente |
| CT03 | Apuração de caixa para pedido agendado pago no turno | pgTAP / unit | CA05, CA06 | Criar pedido antes de `v_aberto_em`, marcar como pago após `v_aberto_em` e calcular totais do caixa | Valor somado no caixa atual |

## URL Complementar

- Arquivos relacionados: `supabase/migration_caf_000081_seguranca_pin_rls.sql`, `supabase/migration_caf_000077_cupons_uso_unico.sql`, `supabase/migration_caf_000083_pendencias_operacao.sql`, `js/pedidos.js`
