# CAF-000001 — [PDV] [Banco] Status "entregue" persistido no banco

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + banco | 🔴 Alta | P | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** gravar no banco quando um pedido pronto é entregue na mesa, em vez de guardar essa informação só na memória da página.
- **Por que é necessário:** hoje o botão "✅ Entregue" (`js/pedidos.js:1133`) apenas adiciona o id do pedido em um `Set` local (`pedidosEntreguesLocais`, `js/pedidos.js:87`). Ao recarregar a página, trocar de celular ou abrir o PDV em outro aparelho, o pedido volta a aparecer como "🟢 Pronto p/ servir", e o barista não sabe se ele já foi entregue.
- **Qual valor será agregado:** a lista de prontos passa a refletir a realidade em todos os aparelhos, evitando entrega em dobro ou pedido esquecido, e o sistema passa a ter o horário da entrega para métricas de atendimento.
- **Para quem é destinado:** baristas (PDV) e, indiretamente, a cozinha e o admin.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Adicionar `'entregue'` ao `CHECK` de `pedidos.status` (`supabase/pedidos_schema.sql:97`) e a coluna `entregue_em TIMESTAMPTZ` / `entregue_por UUID`.
- [ ] O botão "✅ Entregue" faz `update` do pedido para `entregue`, gravando horário e usuário.
- [ ] Toast "Pedido entregue · Desfazer" que volta o status para `concluido`.
- [ ] Remover o `Set` `pedidosEntreguesLocais` e os filtros que dependem dele (`js/pedidos.js:326`, `:956`, `:969`, `:1064`).
- [ ] O realtime atualiza a lista de prontos nos outros aparelhos quando um pedido é entregue.
- [ ] Cozinha: pedidos `entregue` saem da coluna "Prontos" (ou ficam esmaecidos, conforme decisão).
- [ ] Admin: incluir "Entregue" no filtro e no `formatStatus` (`js/admin/pedidos-admin.js:38`); KPIs contam `entregue` como pedido válido.

### Requisitos não funcionais
- [ ] Só `barista` e `admin` podem marcar como entregue (RLS de `UPDATE` em `pedidos`).
- [ ] A marcação aparece nos outros aparelhos em até 2 segundos.

### Dependências técnicas
- Migration nova em `supabase/` alterando o `CHECK` de status.
- Revisar os triggers da `migration_fase3_final.sql` que comparam `status` (ex.: `cancelar_itens_por_pedido`), para não tratarem `entregue` de forma inesperada.

### Recursos necessários
- Acesso ao projeto Supabase para rodar a migration.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um pedido está "Pronto p/ servir", **quando** o barista toca em "Entregue", **então** o pedido some da lista de prontos e o status no banco fica `entregue`, com `entregue_em` preenchido.
- [ ] **Dado que** um pedido foi marcado como entregue, **quando** o barista recarrega a página, **então** o pedido continua fora da lista de prontos.
- [ ] **Dado que** dois celulares estão com o PDV aberto, **quando** um marca o pedido como entregue, **então** o outro remove o pedido da lista sem recarregar.
- [ ] **Dado que** o barista marcou por engano, **quando** toca em "Desfazer" no toast, **então** o pedido volta para "Pronto p/ servir".
- [ ] **Dado que** existem pedidos entregues hoje, **quando** o admin abre o painel, **então** eles aparecem com o status "Entregue" e entram no faturamento do dia.

---

## O que a atividade não inclui

- Fechamento de conta ou marcação de pagamento ([CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md)).
- Filtro por data dos pedidos carregados no PDV ([CAF-000003](CAF-000003-limitar-pedidos-ativos-carregados-no-pdv.md)).
- Entrega parcial por item.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Entrega simples | Criar pedido → cozinha conclui → barista toca "Entregue" | Status `entregue` no banco; some da lista de prontos |
| 2 | Persistência | Após o caso 1, recarregar o PDV | Pedido continua fora dos prontos |
| 3 | Dois aparelhos | Abrir o PDV em 2 abas; entregar em uma | A outra atualiza sozinha |
| 4 | Desfazer | Entregar e tocar "Desfazer" | Volta para `concluido` e reaparece nos prontos |
| 5 | Permissão | Usuário `cozinha` tenta `update` para `entregue` via API | Recusado pela RLS |
| 6 | Admin | Filtrar por "Entregue" | Lista só pedidos entregues |
| 7 | Badge | Entregar o último pedido pronto | Contador de prontos zera |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 1
- Código: `js/pedidos.js:87`, `js/pedidos.js:1133`, `js/cozinha.js:279`, `js/admin/pedidos-admin.js:38`
- Schema: `supabase/pedidos_schema.sql:93`
