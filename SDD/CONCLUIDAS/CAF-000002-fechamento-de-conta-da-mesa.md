# CAF-000002 — [PDV] [Banco] Fechamento de conta da mesa

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + banco | 🔴 Alta | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar o fluxo de "Fechar conta" na aba Mesas, que soma os pedidos em aberto da mesa, registra o pagamento (uma ou mais formas) e marca os pedidos como pagos.
- **Por que é necessário:** hoje a forma e o status de pagamento só são definidos na criação do pedido (`js/pedidos.js`, `criar_pedido`) e nenhum ponto do sistema atualiza `status_pagamento` depois. O modal da mesa só imprime a "Prévia da Conta" (`pedidos.html:256`). Na prática, a maioria dos pedidos fica como "A pagar" para sempre e o faturamento por forma de pagamento não é confiável.
- **Qual valor será agregado:** fecha o ciclo do pedido (criar → preparar → entregar → pagar), libera a mesa e dá números reais de recebimento para o caixa e os relatórios.
- **Para quem é destinado:** baristas no atendimento e admin/gestão no controle financeiro.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Botão **"💳 Fechar conta"** no modal da mesa, ao lado de "Imprimir Prévia da Conta".
- [ ] Tela de fechamento mostra: pedidos em aberto, itens, descontos de promoção, total e valor já pago.
- [ ] Registrar um ou mais pagamentos (PIX, dinheiro, crédito, débito, outros) até completar o total.
- [ ] Dinheiro: campo "valor recebido" e cálculo de troco.
- [ ] Nova tabela `pagamentos (id, mesa_codigo, forma, valor, troco, criado_por, created_at)` e tabela de vínculo `pagamento_pedidos (pagamento_id, pedido_id)`, ou coluna `fechamento_id` em `pedidos`.
- [ ] RPC `fechar_conta_mesa(p_mesa_codigo, p_pagamentos JSONB)` que, numa transação, valida a soma, grava os pagamentos e marca os pedidos como `pago`.
- [ ] Imprimir o cupom final (não fiscal) com "PAGO" e as formas de pagamento (`js/pedido-print.js`).
- [ ] Mesa aparece como livre depois do fechamento.
- [ ] Pedido pago na criação (checkbox atual) continua funcionando e já entra como pago no fechamento.

### Requisitos não funcionais
- [ ] O total é calculado no banco a partir de `pedidos.total`; o valor enviado pelo navegador só é conferido.
- [ ] Fechamento é idempotente: tocar duas vezes em "Confirmar" não duplica o pagamento.
- [ ] Só `barista` e `admin` podem fechar conta.

### Dependências técnicas
- [CAF-000001](CAF-000001-status-entregue-persistido-no-banco.md) (recomendado, para a mesa saber o que já foi entregue).
- `js/pedido-print.js` para o cupom final.

### Recursos necessários
- Acesso ao Supabase para migration e RPC.
- Definição com o cliente: pedidos ainda em preparo podem ser pagos antecipadamente? (sugestão: sim, com aviso).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a mesa 4 tem dois pedidos a pagar somando R$ 58,80, **quando** o barista fecha a conta com PIX, **então** os dois pedidos ficam `pago` e é gravado um pagamento de R$ 58,80.
- [ ] **Dado que** o total é R$ 50,00, **quando** o barista registra R$ 30,00 em dinheiro e R$ 20,00 no débito, **então** o fechamento é aceito com dois pagamentos.
- [ ] **Dado que** o cliente paga R$ 50,00 em dinheiro numa conta de R$ 42,50, **quando** o barista informa o valor recebido, **então** o sistema mostra troco de R$ 7,50.
- [ ] **Dado que** a soma dos pagamentos é menor que o total, **quando** o barista tenta confirmar, **então** o botão fica bloqueado e mostra quanto falta.
- [ ] **Dado que** a conta foi fechada, **quando** o barista volta para a aba Mesas, **então** a mesa aparece livre.

---

## O que a atividade não inclui

- Dividir a conta por pessoa ou por item ([CAF-000012](CAF-000012-dividir-conta.md)).
- Taxa de serviço e desconto manual ([CAF-000013](CAF-000013-taxa-de-servico-e-desconto-manual.md)).
- Fechamento de caixa do dia ([CAF-000015](CAF-000015-fechamento-de-caixa-do-dia.md)).
- Emissão de NFC-e e integração com maquininha.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Uma forma | Mesa com 1 pedido → Fechar conta → PIX | Pedido `pago`, 1 pagamento gravado |
| 2 | Várias formas | Total R$ 50 → R$ 30 dinheiro + R$ 20 débito | 2 pagamentos, soma = total |
| 3 | Troco | Conta R$ 42,50, recebido R$ 50 | Troco R$ 7,50 exibido e gravado |
| 4 | Valor insuficiente | Informar menos que o total | Confirmar bloqueado, mostra o restante |
| 5 | Duplo toque | Tocar "Confirmar" duas vezes rápido | Só um fechamento gravado |
| 6 | Pedido já pago | Mesa com 1 pedido pago e 1 a pagar | Cobra só o que está a pagar |
| 7 | Cortesia | Mesa com cortesia R$ 0,00 | Cortesia aparece no cupom, não altera o total |
| 8 | Cupom | Fechar e imprimir | Cupom mostra "PAGO" e as formas usadas |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 2
- Código: `pedidos.html:256`, `js/pedidos.js` (`abrirModalMesa`), `js/pedido-print.js`
- Schema: `supabase/migration_pedidos_v2.sql:7`
