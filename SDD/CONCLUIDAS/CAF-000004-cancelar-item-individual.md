# CAF-000004 — [PDV] [Cozinha] Cancelar item individual

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + cozinha | 🔴 Alta | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir cancelar um item de um pedido já enviado, sem cancelar o pedido inteiro.
- **Por que é necessário:** o banco já tem `pedido_itens.cancelado` / `cancelado_em` e o trigger que cancela a cortesia em cascata (`supabase/migration_fase3_final.sql:184`), e a cozinha já mostra o item riscado. Mas não existe botão para cancelar um item: hoje só o admin cancela o pedido inteiro (`js/admin/pedidos-admin.js:271`). Quando o cliente desiste de um item, o barista precisa cancelar tudo e lançar de novo.
- **Qual valor será agregado:** correções rápidas no atendimento, menos pedidos refeitos, total da conta correto e histórico do que foi cancelado e por quê.
- **Para quem é destinado:** baristas, cozinha e admin.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Botão "Cancelar item" em cada item do modal da mesa (PDV) e dos detalhes do pedido (admin).
- [ ] Confirmação com campo de motivo obrigatório (chips rápidos: "Cliente desistiu", "Lançado errado", "Em falta").
- [ ] RPC `cancelar_item(p_item_id, p_motivo)` que marca `cancelado = true`, grava `cancelado_em`, `cancelado_por`, `motivo_cancelamento` e recalcula `pedidos.total`.
- [ ] A cortesia vinculada ao item é cancelada junto (trigger existente).
- [ ] Recalcular promoções do pedido após o cancelamento (`aplicar_promocoes_pedido`), já que "2ª unidade" ou "compre X leve Y" podem deixar de valer.
- [ ] Cozinha: aviso sonoro + toast "Item cancelado: 1x Baguete — Mesa 4" e item riscado com etiqueta "CANCELADO".
- [ ] Se todos os itens forem cancelados, sugerir cancelar o pedido.
- [ ] Definir e aplicar a regra de permissão para cancelar o pedido inteiro (sugestão: barista cancela enquanto `pendente`; depois disso só admin).

### Requisitos não funcionais
- [ ] Item nunca é apagado fisicamente (histórico e FK `ON DELETE RESTRICT` da cortesia).
- [ ] Não permitir cancelar item de pedido já pago sem permissão de admin.

### Dependências técnicas
- [CAF-000009](CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md): a cozinha precisa escutar `pedido_itens` para receber o cancelamento na hora.
- Trigger `cancelar_cortesia_em_cascata` e função `aplicar_promocoes_pedido` (`supabase/migration_fase3_final.sql`).

### Recursos necessários
- Acesso ao Supabase para migration e RPC.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o pedido tem 2 itens somando R$ 40,00, **quando** o barista cancela um item de R$ 15,00, **então** o total do pedido passa a R$ 25,00 e o item fica marcado como cancelado.
- [ ] **Dado que** um baguete liberou uma cortesia, **quando** o baguete é cancelado, **então** a cortesia vinculada também fica cancelada.
- [ ] **Dado que** a cozinha está com o pedido na tela, **quando** um item é cancelado, **então** o item aparece riscado com "CANCELADO" e toca um aviso em até 2 s.
- [ ] **Dado que** o item tinha promoção de 2ª unidade, **quando** uma das unidades é cancelada, **então** o desconto é recalculado.
- [ ] **Dado que** o barista não informou o motivo, **quando** tenta confirmar, **então** o cancelamento é bloqueado.

---

## O que a atividade não inclui

- Cancelar só parte da quantidade de uma linha (ex.: 1 de 3 cafés) — pode virar evolução futura.
- Estorno de pagamento já feito.
- Log de auditoria completo ([CAF-000019](CAF-000019-log-de-auditoria.md)).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Cancelar item | Pedido com 2 itens → cancelar 1 | Total recalculado; item cancelado |
| 2 | Cortesia em cascata | Baguete + cortesia → cancelar baguete | Cortesia cancelada |
| 3 | Promo recalculada | 2 cappuccinos com 2ª unidade 50% → cancelar 1 | Desconto zerado |
| 4 | Cozinha | Cancelar com KDS aberto | Item riscado + som |
| 5 | Sem motivo | Confirmar sem motivo | Bloqueado |
| 6 | Todos cancelados | Cancelar todos os itens | Sugere cancelar o pedido |
| 7 | Pedido pago | Barista cancela item de pedido pago | Recusado sem admin |
| 8 | Impressão | Reimprimir comanda | Item cancelado aparece riscado |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 4
- Decisão sobre cancelamento de cortesia: [TAREFAS.md](TAREFAS.md) · seção 5.5
- Código: `js/admin/pedidos-admin.js:271`, `js/cozinha.js:329`
- Schema: `supabase/migration_fase3_final.sql:17`, `:184`, `:245`
