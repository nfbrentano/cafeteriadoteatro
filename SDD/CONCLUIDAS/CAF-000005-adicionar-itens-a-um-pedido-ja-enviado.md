# CAF-000005 — [PDV] Adicionar itens a um pedido já enviado

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV | 🟡 Média | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir que o barista adicione novos itens para uma mesa que já tem pedido em andamento, a partir do modal da mesa.
- **Por que é necessário:** a RPC `adicionar_itens_pedido` já existe (`supabase/migration_fase3_final.sql:438`), mas no PDV só é usada para lançar cortesia (`js/pedidos.js:179`). Quando o cliente pede mais um café, o barista precisa ir para "Novo pedido", selecionar a mesa de novo e montar outro pedido, sem ligação visual com o que já está na mesa.
- **Qual valor será agregado:** atendimento mais rápido na mesa e a cozinha enxerga claramente o que é acréscimo.
- **Para quem é destinado:** baristas e cozinha.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Botão "+ Adicionar itens" no modal da mesa, que abre o PDV com a mesa já selecionada e um aviso "Adicionando à Mesa 4".
- [ ] Decisão de comportamento (a confirmar com o cliente):
  - **Opção A (sugerida):** gera um **novo pedido** da mesma mesa — mais simples para a cozinha, cada pedido tem sua comanda.
  - **Opção B:** adiciona ao pedido existente via `adicionar_itens_pedido` — só permitido se o pedido ainda estiver `pendente`.
- [ ] Itens acrescentados usam a mesma montagem (adicionais, meio a meio, observação) e as promoções do dia.
- [ ] Cozinha e comanda destacam "➕ ADICIONAL — Mesa 4".
- [ ] Botão para sair do modo "adicionando" sem enviar.

### Requisitos não funcionais
- [ ] O cálculo de preço continua no banco (RPC), como em `criar_pedido`.
- [ ] Promoções consideram as unidades já pedidas na mesa? Definir (sugestão: não, cada pedido é calculado sozinho).

### Dependências técnicas
- RPCs `criar_pedido` e `adicionar_itens_pedido`.
- [CAF-000009](CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md) se for escolhida a opção B.

### Recursos necessários
- Decisão do cliente entre as opções A e B.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a mesa 4 tem um pedido em preparo, **quando** o barista toca em "+ Adicionar itens" e envia 1 café, **então** a cozinha recebe o café identificado como adicional da mesa 4.
- [ ] **Dado que** o barista está no modo "adicionando", **quando** abre o carrinho, **então** a mesa já vem selecionada e não pode ser trocada sem sair do modo.
- [ ] **Dado que** o item foi acrescentado, **quando** o barista abre a prévia da conta, **então** o novo item entra no total da mesa.
- [ ] **Dado que** o barista desistiu, **quando** toca em "Cancelar adição", **então** volta ao PDV normal sem enviar nada.

---

## O que a atividade não inclui

- Editar ou trocar itens já enviados (usar [CAF-000004](CAF-000004-cancelar-item-individual.md) + novo item).
- Transferir itens entre mesas ([CAF-000011](CAF-000011-transferir-juntar-mesas.md)).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Acréscimo simples | Mesa com pedido → "+ Adicionar" → 1 café → enviar | Cozinha recebe como adicional |
| 2 | Com adicional | Acrescentar café + leite vegetal | Preço com adicional correto |
| 3 | Mesa travada | No modo adicionando, tentar trocar a mesa | Bloqueado ou pede para sair do modo |
| 4 | Cancelar modo | Entrar no modo e cancelar | Nada é enviado |
| 5 | Prévia da conta | Após acréscimo, imprimir prévia | Total inclui o novo item |
| 6 | Comanda | Imprimir comanda do acréscimo | Mostra "ADICIONAL" |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 5
- Código: `js/pedidos.js:179`, `js/pedidos.js` (`abrirModalMesa`)
- Schema: `supabase/migration_fase3_final.sql:311` (`criar_pedido`), `:438` (`adicionar_itens_pedido`)
