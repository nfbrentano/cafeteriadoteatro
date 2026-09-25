# CAF-000034 — [PDV] [Financeiro] Conta do cliente: fiado (pós-pago) e créditos pré-pagos

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + admin + banco | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir que um cliente cadastrado ([CAF-000033](CAF-000033-cadastro-de-clientes.md)) tenha uma **conta corrente**:
  - **Pós-pago (fiado / correntista):** consome agora e paga depois, com limite e vencimento (ex.: funcionários da Univates ou do teatro que acertam no fim do mês).
  - **Pré-pago (créditos):** deposita um valor e vai consumindo (ex.: "cartão de R$ 100 em cafés"), inclusive como vale-presente.
- **Por que é necessário:** as formas de pagamento hoje são fixas (`pix`, `dinheiro`, `cartao_credito`, `cartao_debito`, `outros` — `supabase/pedidos_schema.sql:102`). Um fiado hoje vira "outros" ou fica com pagamento pendente, sem saber quem deve, quanto e desde quando, e o fechamento de caixa ([CAF-000015](CONCLUIDAS/CAF-000015-fechamento-de-caixa-do-dia.md)) não distingue o que entrou em dinheiro do que ficou a receber.
- **Qual valor será agregado:** controle do que há a receber, fidelização do público recorrente e antecipação de receita com créditos pré-pagos.
- **Para quem é destinado:** baristas (lançamento) e administração (cobrança e limites).

### Referência de mercado

- **Kyte:** controle de fiado (débitos e créditos do cliente) e "sistema de créditos" com saldo pré-pago para incentivar o retorno.
- **Jarbas:** crediário/fiado com parcelas, vencimentos e cobrança; créditos pré-pagos.
- **Simpliza:** cadastro de **correntistas** com valores pré ou pós-pagos, para convênios com empresas.
- **Suitable:** controle de contas pendentes e saldo de clientes no financeiro. Fonte: https://suitable.com.br/produto/financeiro/

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Colunas em `clientes`: `conta_habilitada BOOLEAN`, `limite_credito NUMERIC(10,2)` (pós-pago), `dia_vencimento SMALLINT`.
- [ ] Tabela `cliente_conta_movimentos (id, cliente_id, tipo ['consumo','pagamento','deposito','estorno','ajuste'], valor NUMERIC(10,2) (sinal: + crédito, − débito), pedido_id, fechamento_id, forma_pagamento, motivo, criado_por, created_at)`. Saldo = soma dos movimentos (view `v_cliente_saldo`).
- [ ] Nova forma de pagamento `conta_cliente` no `CHECK` de `pedidos.forma_pagamento` e no fechamento de mesa ([CAF-000002](CONCLUIDAS/CAF-000002-fechamento-de-conta-da-mesa.md)), podendo ser combinada com outras formas.
- [ ] RPC `lancar_na_conta(p_cliente_id, p_valor, p_pedido_id | p_fechamento_id)` que valida no banco:
  - cliente com conta habilitada;
  - `saldo − valor ≥ −limite_credito` (pré-pago puro tem limite 0);
  - se ultrapassar, recusa com mensagem; só `admin` pode liberar acima do limite (com motivo no log).
- [ ] Recebimento: no PDV/admin, "Receber da conta" registra `pagamento` com forma real (pix/dinheiro/cartão) — é isso que entra no caixa do dia.
- [ ] Depósito de créditos: "Adicionar créditos" registra `deposito` com forma real e imprime comprovante.
- [ ] Cancelamento de pedido pago na conta gera `estorno` automático.
- [ ] Admin: aba "Contas de clientes" com saldo, limite, dias em atraso e extrato; filtro "em atraso"; extrato imprimível e botão para enviar resumo pelo WhatsApp (link manual).
- [ ] Caixa ([CAF-000015](CONCLUIDAS/CAF-000015-fechamento-de-caixa-do-dia.md)): `conta_cliente` aparece como "a receber" e **não** entra no dinheiro esperado; recebimentos e depósitos entram pela forma real.

### Requisitos não funcionais
- [ ] **Integridade:** saldo nunca é editado direto; todo ajuste é um movimento com motivo e usuário (log da [CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md)).
- [ ] **Concorrência:** a validação de limite usa `SELECT … FOR UPDATE` no cliente, para dois PDVs não estourarem o limite ao mesmo tempo.
- [ ] **Offline:** pagamento em `conta_cliente` exige conexão (a validação de limite é no banco).

### Dependências técnicas
- [CAF-000033](CAF-000033-cadastro-de-clientes.md) (clientes), `fechamento_pagamentos` (`supabase/migration_caf_000002.sql`), `caixa_conferencia` (`supabase/migration_caf_000025_caixa.sql`).

### Recursos necessários
- Regras do cliente: quem pode ter fiado, limite padrão e política de atraso.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o Pedro tem limite de R$ 200 e saldo −R$ 150, **quando** o barista lança R$ 30 na conta, **então** o saldo vai para −R$ 180.
- [ ] **Dado que** o mesmo Pedro tenta lançar mais R$ 40, **quando** confirma, **então** o sistema recusa por limite e oferece outra forma de pagamento.
- [ ] **Dado que** a Ana depositou R$ 100 em Pix, **quando** consome R$ 14, **então** o saldo fica R$ 86 e o caixa do dia registra R$ 100 em Pix (e não R$ 14).
- [ ] **Dado que** um pedido pago na conta é cancelado, **quando** o cancelamento é salvo, **então** o valor volta para a conta.
- [ ] **Dado que** o caixa é fechado, **quando** houve vendas em `conta_cliente`, **então** elas aparecem como "a receber" e não alteram o dinheiro esperado.

---

## O que a atividade não inclui

- Cobrança automática (boleto, lembrete automático por WhatsApp).
- Juros e multa por atraso.
- Programa de pontos/cashback.
- Portal do cliente para ver o próprio extrato.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Fiado dentro do limite | Lançar consumo | Saldo negativo atualizado |
| 2 | Limite estourado | Lançar acima | Recusa |
| 3 | Liberação admin | Admin libera acima do limite com motivo | Aceita + log |
| 4 | Pré-pago | Depositar e consumir | Saldo decresce |
| 5 | Pré-pago sem saldo | Consumir além do saldo | Recusa |
| 6 | Pagamento misto | Metade conta, metade Pix | Dois registros corretos |
| 7 | Estorno | Cancelar pedido | Valor devolvido |
| 8 | Concorrência | Dois PDVs lançam ao mesmo tempo no limite | Só um passa |
| 9 | Caixa | Fechar caixa com vendas na conta | Não entram no dinheiro esperado |

---

## URL Complementar

- Código relacionado: `supabase/pedidos_schema.sql:102`, `supabase/migration_caf_000002.sql`, `supabase/migration_caf_000025_caixa.sql`, `js/admin/caixa-admin.js`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Kyte: https://www.kyteapp.com/pt · Jarbas: https://www.jarbas.app · Simpliza: https://simpliza.com.br
