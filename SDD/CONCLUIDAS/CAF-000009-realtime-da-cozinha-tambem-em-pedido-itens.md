# CAF-000009 — [Cozinha] Realtime da cozinha também em `pedido_itens`

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha | 🟡 Média | P | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** fazer a tela da cozinha reagir também a mudanças nos itens dos pedidos, e não só na tabela `pedidos`, e deixar a conexão em tempo real mais robusta.
- **Por que é necessário:** o canal `pedidos-cozinha-realtime` (`js/cozinha.js:489`) escuta só a tabela `pedidos`. Cancelamento de item, cortesia lançada depois (`adicionar_itens_pedido`) ou item acrescentado alteram `pedido_itens` e podem não aparecer na cozinha até o próximo evento do pedido ou uma recarga. Também não há tratamento quando a conexão cai (tablet em repouso, Wi‑Fi instável).
- **Qual valor será agregado:** a cozinha sempre vê o estado real do pedido, sem precisar recarregar a tela.
- **Para quem é destinado:** equipe da cozinha.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Assinar `postgres_changes` em `pedido_itens` (INSERT e UPDATE).
- [ ] Ao receber evento de item, recarregar **só o pedido afetado** (com itens, adicionais e sabores) e atualizar o card.
- [ ] Agrupar eventos em rajada (debounce ~300 ms) para não recarregar o mesmo pedido várias vezes.
- [ ] Recarregar a lista ao voltar para a aba (`visibilitychange`) e ao reconectar (`online`).
- [ ] Indicador discreto de conexão: 🟢 ao vivo / 🔴 reconectando.
- [ ] Aplicar a mesma melhoria no PDV (`js/pedidos.js:356`) e no admin (`js/admin/pedidos-admin.js:297`), se fizer sentido.

### Requisitos não funcionais
- [ ] Conferir se `pedido_itens` está na publicação `supabase_realtime`.
- [ ] Não duplicar a impressão automática da comanda por causa dos novos eventos.

### Dependências técnicas
- Configuração de Realtime no Supabase para `pedido_itens`.

### Recursos necessários
- Acesso ao painel do Supabase.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a cozinha está com um pedido na tela, **quando** um item é cancelado, **então** o item aparece riscado em até 2 s sem recarregar.
- [ ] **Dado que** uma cortesia é lançada depois num pedido existente, **quando** a RPC termina, **então** a cortesia aparece no card da cozinha.
- [ ] **Dado que** o tablet ficou em repouso por 10 min, **quando** volta a ser usado, **então** a lista é recarregada e mostra os pedidos novos.
- [ ] **Dado que** a conexão caiu, **quando** isso acontece, **então** o indicador fica vermelho, e volta a verde quando reconectar.
- [ ] **Dado que** um pedido novo chega, **quando** os eventos de `pedidos` e `pedido_itens` chegam juntos, **então** a comanda é impressa só uma vez.

---

## O que a atividade não inclui

- Fila offline de pedidos ([CAF-000018](CAF-000018-tolerancia-a-queda-de-internet.md)).
- Novas ações na cozinha (item pronto, estação).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Item cancelado | Cancelar item com KDS aberto | Atualiza em até 2 s |
| 2 | Cortesia depois | Lançar cortesia num pedido em preparo | Aparece no card |
| 3 | Aba em segundo plano | Trocar de aba 5 min, criar pedido, voltar | Pedido aparece |
| 4 | Queda de rede | Desligar Wi‑Fi e religar | Indicador muda; lista recarrega |
| 5 | Impressão única | Criar pedido novo | Uma comanda só |
| 6 | Rajada | Inserir 5 itens de uma vez | Um único recarregamento do pedido |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 9
- Código: `js/cozinha.js:488` (`setupRealtime`), `js/pedidos.js:356`, `js/admin/pedidos-admin.js:297`
- Docs: Supabase Realtime — Postgres Changes
