# Features pendentes — Pedidos e Cozinha

Levantamento feito a partir do código atual (`js/pedidos.js`, `js/cozinha.js`, `js/admin/pedidos-admin.js`, `js/pedido-print.js` e migrations em `supabase/`).
Complementa o [TAREFAS.md](TAREFAS.md) (adicionais, cortesia, meio a meio e promoções já estão no banco e no PDV) e o [MELHORIAS_UX.md](MELHORIAS_UX.md) (ajustes visuais no mobile).

---

## O que já existe (resumo)

- **PDV (barista):** montagem de item com adicionais, meio a meio e observação; carrinho com prévia de promoções; criação de pedido via RPC `criar_pedido`; aba Mesas com consumo por mesa, prévia da conta e lançamento de cortesia; chamada por voz e alerta de pedido pronto.
- **Cozinha (KDS):** colunas Na fila → Em preparo → Prontos; tempo decorrido com destaque após 15 min; impressão automática da comanda; som e voz; desfazer "pronto"; aviso de cancelamento.
- **Admin:** lista de pedidos com filtros (status, período, pagamento), KPIs do dia, detalhes, cancelamento e reimpressão.
- **Banco:** regras de cortesia, cancelamento em cascata, promoções por dia da semana, `v_cortesias_disponiveis`.

---

## Visão geral do que falta

| ID | Feature | Área | Prioridade | Esforço |
|---|---------|------|-----------|---------|
| [CAF-000001](CAF-000001-status-entregue-persistido-no-banco.md) | Status "entregue" persistido no banco | PDV + banco | 🔴 Alta | P |
| [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md) | Fechamento de conta da mesa (pagamento) | PDV + banco | 🔴 Alta | M |
| [CAF-000003](CAF-000003-limitar-pedidos-ativos-carregados-no-pdv.md) | Limitar pedidos ativos carregados no PDV | PDV | 🔴 Alta | P |
| [CAF-000004](CAF-000004-cancelar-item-individual.md) | Cancelar item individual | PDV + cozinha | 🔴 Alta | M |
| [CAF-000005](CAF-000005-adicionar-itens-a-um-pedido-ja-enviado.md) | Adicionar itens a um pedido já enviado | PDV | 🟡 Média | M |
| [CAF-000006](CAF-000006-produto-esgotado.md) | Produto esgotado (liga/desliga rápido) | PDV + admin + cardápio | 🟡 Média | P |
| [CAF-000007](CAF-000007-separacao-por-estacao-bar-cozinha.md) | Separação por estação (bar × cozinha) | Cozinha + banco | 🟡 Média | M |
| [CAF-000008](CAF-000008-marcar-item-a-item-como-pronto.md) | Marcar item a item como pronto | Cozinha | 🟡 Média | M |
| [CAF-000009](CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md) | Realtime da cozinha também em `pedido_itens` | Cozinha | 🟡 Média | P |
| [CAF-000010](CAF-000010-nome-do-cliente-pedido-para-viagem.md) | Nome do cliente / pedido para viagem | PDV + cozinha + impressão | 🟡 Média | P |
| [CAF-000011](CAF-000011-transferir-juntar-mesas.md) | Transferir / juntar mesas | PDV + banco | 🟢 Baixa | M |
| [CAF-000012](CAF-000012-dividir-conta.md) | Dividir conta | PDV | 🟢 Baixa | M |
| [CAF-000013](CAF-000013-taxa-de-servico-e-desconto-manual.md) | Taxa de serviço e desconto manual | PDV + banco | 🟢 Baixa | M |
| [CAF-000014](CAF-000014-relatorios-no-admin.md) | Relatórios (cortesias, produtos, pagamentos, tempo de preparo) | Admin | 🟡 Média | G |
| [CAF-000015](CAF-000015-fechamento-de-caixa-do-dia.md) | Fechamento de caixa do dia | Admin | 🟡 Média | M |
| [CAF-000016](CAF-000016-exportar-csv.md) | Exportar CSV | Admin | 🟢 Baixa | P |
| [CAF-000017](CAF-000017-aba-promos-no-cardapio-publico.md) | Aba "Promos" no cardápio público | Cardápio | 🟢 Baixa | M |
| [CAF-000018](CAF-000018-tolerancia-a-queda-de-internet.md) | Tolerância a queda de internet | PDV + cozinha | 🟢 Baixa | G |
| [CAF-000019](CAF-000019-log-de-auditoria.md) | Log de auditoria (quem cancelou / alterou) | Banco + admin | 🟢 Baixa | M |
| [CAF-000020](CAF-000020-vinculo-de-adicionais-por-produto.md) | Vínculo de adicionais por produto (mostrar no PDV só se permitido) | Admin + PDV + banco | 🔴 Alta | M |

---

## 🔴 Prioridade alta

### 1. Status "entregue" persistido no banco — [CAF-000001](CAF-000001-status-entregue-persistido-no-banco.md)
**Hoje:** o botão "✅ Entregue" só adiciona o id em um `Set` em memória (`js/pedidos.js:87`, `js/pedidos.js:1133`). Ao recarregar a página, ou em outro celular, o pedido volta a aparecer como "pronto p/ servir".

- [ ] Adicionar `'entregue'` ao `CHECK` de `pedidos.status` (ou coluna `entregue_em TIMESTAMPTZ`)
- [ ] `baristaMarcarEntregue` passa a fazer `update` no banco, com "Desfazer" via toast
- [ ] Cozinha trata `entregue` como concluído (some da coluna Prontos ou fica esmaecido)
- [ ] KPIs do admin consideram `entregue` como pedido válido

### 2. Fechamento de conta da mesa — [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md)
**Hoje:** a forma e o status de pagamento só são definidos na criação do pedido; nenhum lugar do sistema atualiza `status_pagamento` depois. A aba Mesas só imprime a prévia da conta.

- [ ] Botão **"Fechar conta"** no modal da mesa: soma os pedidos em aberto, escolhe a forma de pagamento e marca todos como `pago`
- [ ] Permitir mais de uma forma de pagamento na mesma conta (ex.: parte PIX, parte dinheiro) → tabela `pagamentos (pedido_id/mesa, forma, valor, created_at)`
- [ ] Troco no pagamento em dinheiro
- [ ] Imprimir o cupom final (não fiscal) com "PAGO"
- [ ] Mesa fica livre depois do fechamento

### 3. Limitar pedidos ativos carregados no PDV — [CAF-000003](CAF-000003-limitar-pedidos-ativos-carregados-no-pdv.md)
**Hoje:** `loadActivePedidos` (`js/pedidos.js:~925`) busca **todos** os pedidos `concluido` sem filtro de data. Com o tempo, a aba Mesas mostra consumo de dias anteriores e a consulta fica cada vez mais pesada.

- [ ] Filtrar por dia (mesmo critério da cozinha, `js/cozinha.js:264`) ou por "não pago / não entregue"
- [ ] Depois do item 2, considerar ativa só a mesa com pedidos não pagos

### 4. Cancelar item individual — [CAF-000004](CAF-000004-cancelar-item-individual.md)
**Hoje:** o banco já tem `pedido_itens.cancelado` e o trigger de cascata para cortesia, e a cozinha já mostra item riscado — mas não há botão para cancelar um item. Só o admin cancela o pedido inteiro.

- [ ] Botão "Cancelar item" no modal da mesa (barista) e nos detalhes do pedido (admin), com confirmação e motivo
- [ ] RPC `cancelar_item(p_item_id, p_motivo)` que marca o item, recalcula `pedidos.total` e dispara o realtime
- [ ] Cozinha recebe aviso sonoro/toast ("Item cancelado: 1x Baguete — Mesa 4")
- [ ] Definir se o barista pode cancelar o pedido inteiro ou só o admin

---

## 🟡 Prioridade média

### 5. Adicionar itens a um pedido já enviado — [CAF-000005](CAF-000005-adicionar-itens-a-um-pedido-ja-enviado.md)
A RPC `adicionar_itens_pedido` existe, mas no PDV só é usada para cortesia (`js/pedidos.js:179`).

- [ ] No modal da mesa: "+ Adicionar ao pedido" abrindo o carrinho vinculado ao pedido/mesa
- [ ] Decidir: itens novos entram no mesmo pedido (reimprime comanda com "ADICIONAL") ou geram um pedido novo da mesma mesa
- [ ] Cozinha destaca itens adicionados depois

### 6. Produto esgotado — [CAF-000006](CAF-000006-produto-esgotado.md)
- [ ] Coluna `produtos.disponivel BOOLEAN` separada de `ativo`
- [ ] Toggle rápido no PDV (pressionar e segurar o card) e no admin
- [ ] Card aparece como "Esgotado" e não entra no carrinho; `criar_pedido` recusa o item
- [ ] Cardápio público mostra "Indisponível hoje"
- [ ] (Opcional) Controle simples de estoque por quantidade para itens do dia (tortas, bolos)

### 7. Separação por estação (bar × cozinha) — [CAF-000007](CAF-000007-separacao-por-estacao-bar-cozinha.md)
Hoje todos os itens, incluindo cafés, vão para a mesma tela da cozinha.

- [ ] `categorias.estacao TEXT CHECK (estacao IN ('bar','cozinha'))`
- [ ] Filtro de estação no KDS (`cozinha.html?estacao=bar`) e comanda impressa só com os itens daquela estação
- [ ] Status do pedido "pronto" só quando todas as estações terminarem

### 8. Marcar item a item como pronto — [CAF-000008](CAF-000008-marcar-item-a-item-como-pronto.md)
- [ ] Toque no item do card marca como pronto (`pedido_itens.pronto_em`)
- [ ] Barra de progresso no card (2/4 itens)
- [ ] Pedido vai para "Prontos" automaticamente quando todos os itens estiverem prontos

### 9. Realtime da cozinha também em `pedido_itens` — [CAF-000009](CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md)
O canal da cozinha escuta só a tabela `pedidos` (`js/cozinha.js:490`). Cancelamento de item, cortesia lançada depois ou itens adicionados podem não aparecer até o próximo evento do pedido.

- [ ] Assinar `pedido_itens` (INSERT/UPDATE) e recarregar só o pedido afetado
- [ ] Reconexão automática do canal e recarga ao voltar para a aba (`visibilitychange`)

### 10. Nome do cliente / pedido para viagem — [CAF-000010](CAF-000010-nome-do-cliente-pedido-para-viagem.md)
- [ ] Campos opcionais `pedidos.cliente_nome` e `pedidos.para_viagem`
- [ ] Mesa opcional quando for balcão/viagem
- [ ] Chamada por voz usa o nome ("Pedido da Ana, pronto!")
- [ ] Destaque "🥡 VIAGEM" na cozinha e na comanda

### 14. Relatórios no admin — [CAF-000014](CAF-000014-relatorios-no-admin.md)
- [ ] **Cortesias concedidas** por período, total e por prato liberador (pendente do TAREFAS.md 5.11)
- [ ] Produtos mais vendidos (quantidade e faturamento), por dia/semana/mês
- [ ] Faturamento por forma de pagamento
- [ ] Desconto concedido por promoção
- [ ] Tempo médio de preparo (`created_at` → `em_preparo` → `concluido`) — exige gravar `iniciado_em` e `concluido_em` em `pedidos`
- [ ] Horários de pico (pedidos por hora)
- [ ] Ticket médio

### 15. Fechamento de caixa do dia — [CAF-000015](CAF-000015-fechamento-de-caixa-do-dia.md)
- [ ] Tela "Caixa" com abertura (fundo de troco) e fechamento
- [ ] Totais por forma de pagamento × valor contado, com diferença
- [ ] Alerta de mesas com pedidos não pagos antes de fechar
- [ ] Impressão do resumo do dia

---

## 🟢 Prioridade baixa

### 11. Transferir / juntar mesas — [CAF-000011](CAF-000011-transferir-juntar-mesas.md)
- [ ] Mover todos os pedidos de uma mesa para outra
- [ ] Juntar mesas em uma única conta
- [ ] Manter as cortesias válidas (o trigger exige pedido da **mesma mesa** — revisar a regra)

### 12. Dividir conta — [CAF-000012](CAF-000012-dividir-conta.md)
- [ ] Dividir igualmente entre N pessoas
- [ ] Dividir por item (cada pessoa marca o que consumiu)
- [ ] Depende do item 2 (tabela de pagamentos)

### 13. Taxa de serviço e desconto manual — [CAF-000013](CAF-000013-taxa-de-servico-e-desconto-manual.md)
- [ ] Taxa de serviço opcional (ex.: 10%) no fechamento da conta
- [ ] Desconto manual em R$ ou % com motivo, restrito ao admin (ou senha do admin)

### 16. Exportar CSV — [CAF-000016](CAF-000016-exportar-csv.md)
- [ ] Botão "Exportar" na lista de pedidos do admin respeitando os filtros atuais

### 17. Aba "Promos" no cardápio público — [CAF-000017](CAF-000017-aba-promos-no-cardapio-publico.md)
Pendente do TAREFAS.md 7.11: as promoções já são aplicadas no PDV, mas `js/cardapio-dynamic.js` não as exibe.

- [ ] Aba "Promos" com *Hoje* e *Na semana*, escondida quando não houver promoção ativa
- [ ] Selo "PROMO" nos produtos do dia

### 18. Tolerância a queda de internet — [CAF-000018](CAF-000018-tolerancia-a-queda-de-internet.md)
- [ ] Indicador online/offline no PDV e na cozinha
- [ ] Fila local de pedidos (IndexedDB) enviada quando a conexão voltar, com id idempotente para não duplicar
- [ ] Cozinha: aviso visível quando o realtime cair

### 19. Log de auditoria — [CAF-000019](CAF-000019-log-de-auditoria.md)
- [ ] Tabela `pedido_eventos (pedido_id, item_id, acao, usuario_id, motivo, created_at)` alimentada por trigger
- [ ] Histórico visível nos detalhes do pedido no admin (criado, em preparo, pronto, entregue, item cancelado, pago)

---

## Ideias para o futuro (fora do escopo atual)

- Autoatendimento por QR Code na mesa (cliente faz o pedido pelo celular, barista aprova)
- Integração com impressora térmica via ESC/POS direto (sem diálogo do navegador)
- Emissão de NFC-e
- Notificação push para o barista quando o pedido ficar pronto (PWA já tem `manifest.json` e `sw.js`)
- Programa de fidelidade (ex.: 10º café grátis)

---

## Ordem sugerida

**1 → 3 → 2 → 4 → 9 → 6 → 14 → 15**, depois o restante conforme demanda.
Os itens 1 e 3 são pequenos e corrigem comportamentos que já confundem no dia a dia; 2 e 4 fecham o ciclo do pedido (criar → preparar → entregar → pagar).
