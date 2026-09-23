# CAF-000019 — [Banco] [Admin] Log de auditoria dos pedidos

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Banco + admin | 🟢 Baixa | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** registrar automaticamente cada evento relevante de um pedido (criação, mudança de status, cancelamento, pagamento, transferência) com usuário e horário, e mostrar esse histórico no admin.
- **Por que é necessário:** hoje só existem campos soltos (`criado_por`, `concluido_por`, `concluido_em`, `cancelado_em`). Não dá para saber quem cancelou um pedido, quem voltou um pedido de "pronto" para "em preparo" ou quando a mesa foi transferida.
- **Qual valor será agregado:** transparência, resolução de dúvidas e divergências de caixa, e segurança contra cancelamentos indevidos.
- **Para quem é destinado:** administração.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Tabela `pedido_eventos (id, pedido_id, item_id, acao, de, para, motivo, usuario_id, usuario_nome, created_at)`.
- [ ] Triggers em `pedidos` e `pedido_itens` registrando: criado, mudança de status, item adicionado, item cancelado, pagamento, mudança de mesa.
- [ ] Motivo gravado quando a ação tiver (cancelamento, desconto).
- [ ] Linha do tempo nos detalhes do pedido no admin (`js/admin/pedidos-admin.js:179`).
- [ ] Filtro no admin: "cancelamentos por usuário" no período.

### Requisitos não funcionais
- [ ] Log só pode ser inserido por trigger (sem `INSERT`/`UPDATE`/`DELETE` direto pela API).
- [ ] Leitura só para `admin`.
- [ ] Não impactar o tempo de criação do pedido de forma perceptível.

### Dependências técnicas
- Enriquecido por [CAF-000001](CAF-000001-status-entregue-persistido-no-banco.md), [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md), [CAF-000004](CAF-000004-cancelar-item-individual.md) e [CAF-000011](CAF-000011-transferir-juntar-mesas.md), mas pode ser feito antes.

### Recursos necessários
- Acesso ao Supabase para migration.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um pedido foi criado, preparado e concluído, **quando** o admin abre os detalhes, **então** vê os três eventos com usuário e horário.
- [ ] **Dado que** a cozinha voltou um pedido de "pronto" para "em preparo", **quando** o admin consulta o histórico, **então** o evento aparece com quem fez.
- [ ] **Dado que** o admin cancelou um pedido com motivo, **quando** filtra "cancelamentos" no período, **então** o cancelamento aparece com o motivo.
- [ ] **Dado que** um barista tenta apagar um evento pela API, **quando** a requisição chega, **então** o banco recusa.

---

## O que a atividade não inclui

- Auditoria de alterações de cadastro (produtos, preços, usuários).
- Retenção/expurgo automático de logs antigos.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Ciclo completo | Criar → preparar → concluir | 3 eventos |
| 2 | Desfazer | Concluir e desfazer | Evento de volta de status |
| 3 | Cancelamento | Cancelar com motivo | Evento com motivo e usuário |
| 4 | Item | Cancelar item | Evento com `item_id` |
| 5 | Imutável | `DELETE` via API | Recusado |
| 6 | Leitura | Barista lê eventos | Recusado |
| 7 | Filtro | Cancelamentos da semana | Lista correta |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 19
- Código: `js/admin/pedidos-admin.js:179` (`showDetalhes`)
- Schema: `supabase/pedidos_schema.sql:93`, `supabase/migration_fase3_final.sql:17`
