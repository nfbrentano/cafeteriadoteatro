# CAF-000011 — [PDV] [Banco] Transferir e juntar mesas

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + banco | 🟢 Baixa | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir mover os pedidos de uma mesa para outra e juntar duas mesas numa única conta.
- **Por que é necessário:** clientes trocam de mesa ou juntam grupos com frequência. Hoje o `mesa_codigo` do pedido não pode ser alterado pelo PDV, e a regra de cortesia exige que o prato e a cortesia estejam na **mesma mesa** (trigger `validar_cortesia`, `supabase/migration_fase3_final.sql:134`), o que quebra se só parte dos pedidos mudar.
- **Qual valor será agregado:** conta correta mesmo quando o cliente muda de lugar, sem cancelar e relançar pedidos.
- **Para quem é destinado:** baristas.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Modal da mesa: botão "↔ Transferir mesa" com seleção da mesa de destino.
- [ ] Modal da mesa: botão "⊕ Juntar com…" que traz os pedidos de outra mesa para esta.
- [ ] RPC `transferir_mesa(p_origem, p_destino)` que move **todos** os pedidos não pagos da mesa, numa transação.
- [ ] Cortesias continuam válidas porque prato e cortesia mudam juntos.
- [ ] Cozinha e comanda passam a mostrar a nova mesa (realtime).
- [ ] Registrar a transferência (ao menos em `pedidos.updated_at` e, com a [CAF-000019](CAF-000019-log-de-auditoria.md), no log).

### Requisitos não funcionais
- [ ] Não permitir transferir pedidos já pagos.
- [ ] Só mesas ativas como destino.

### Dependências técnicas
- Trigger `validar_cortesia` (revisar se roda em `UPDATE` de `pedidos.mesa_codigo`).
- [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md) para a regra de "não pago".

### Recursos necessários
- Acesso ao Supabase para a RPC.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a mesa 2 tem 2 pedidos a pagar, **quando** o barista transfere para a mesa 5, **então** os 2 pedidos passam a ser da mesa 5 e a mesa 2 fica livre.
- [ ] **Dado que** a mesa 3 tem baguete com cortesia, **quando** é transferida, **então** a cortesia continua válida e o saldo de cortesia vai junto.
- [ ] **Dado que** as mesas 1 e 4 querem conta única, **quando** o barista junta a 4 na 1, **então** a prévia da conta da mesa 1 mostra os pedidos das duas.
- [ ] **Dado que** o pedido está na cozinha, **quando** a mesa é transferida, **então** o card da cozinha mostra a nova mesa.

---

## O que a atividade não inclui

- Transferir itens avulsos entre mesas (só pedidos inteiros).
- Separar uma mesa que foi juntada (desfazer junção).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Transferir | Mesa 2 → Mesa 5 | Pedidos na 5; 2 livre |
| 2 | Com cortesia | Transferir mesa com cortesia | Cortesia e saldo preservados |
| 3 | Juntar | Juntar 4 na 1 | Conta única na 1 |
| 4 | Destino inativo | Transferir para mesa inativa | Recusado |
| 5 | Pedido pago | Mesa com pedido pago | Pago não é movido |
| 6 | Cozinha | Transferir com KDS aberto | Mesa atualizada no card |
| 7 | Mesma mesa | Origem = destino | Recusado |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 11
- Schema: `supabase/migration_fase3_final.sql:82` (`validar_cortesia`), `:209` (`v_cortesias_disponiveis`)
