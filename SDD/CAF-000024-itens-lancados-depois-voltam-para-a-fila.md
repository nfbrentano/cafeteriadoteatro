# CAF-000024 — [Cozinha] [PDV] Itens lançados depois do envio voltam para a fila, com destaque e comanda complementar

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + banco + impressão | 🔴 Alta | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** quando um item é adicionado a um pedido que já está na cozinha (cortesia, "+ Adicionar ao pedido"), ele deve:
  1. Reabrir o pedido na fila da estação certa.
  2. Aparecer destacado como **NOVO** no card.
  3. Gerar uma **comanda complementar** só com os itens novos.
- **Por que é necessário:**
  - `adicionar_itens_pedido` não valida nem altera o status do pedido (`supabase/migration_caf_000020_vinculo_adicionais.sql:197`). Uma cortesia lançada pelo barista (`js/pedidos.js:664-686`) num pedido já `concluido` cai na coluna "Prontos" da cozinha, onde os itens **não são clicáveis** (`js/cozinha.js:414`), e ninguém percebe que há algo para preparar.
  - O realtime de `pedido_itens` só toca o alerta para cortesia (`js/cozinha.js:730-735`) e **não imprime nada**. Itens adicionados a um pedido `pendente` ou `em_preparo` entram no meio do card, sem destaque, depois que a comanda já foi impressa.
- **Qual valor será agregado:** nenhum item adicionado é esquecido, a cozinha sabe exatamente o que mudou e o cliente não espera por uma cortesia que nunca foi feita.
- **Para quem é destinado:** cozinha, bar e baristas.

### Referência de mercado

- **SAIPOS:** no KDS, o "produto em amarelo" indica item **registrado após o lançamento da venda**. É um destaque visual específico para acréscimos.
- **Padrão de mercado:** a impressora de produção imprime **apenas os itens acrescentados**, com o cabeçalho "ADICIONAL" ou "ACRÉSCIMO", para não duplicar a produção do que já foi feito.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Coluna `pedido_itens.lancado_depois BOOLEAN NOT NULL DEFAULT false`, gravada como `true` por `adicionar_itens_pedido`, e `pedido_itens.impresso_em TIMESTAMPTZ`.
- [ ] Em `adicionar_itens_pedido`: se o pedido estiver `concluido` ou `entregue`, voltar o status para `em_preparo` (ou `pendente`), limpar `concluido_em` e registrar o evento "reaberto por item adicionado" no log ([CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md)).
- [ ] Recusar a adição em pedidos `cancelado`, com mensagem clara.
- [ ] No KDS:
  - Itens com `lancado_depois = true` e sem `pronto_em` aparecem em destaque (fundo amarelo e selo **NOVO**, com horário do acréscimo).
  - O card mostra no cabeçalho "+2 itens novos".
- [ ] Impressão complementar: no realtime de `INSERT` em `pedido_itens` com `lancado_depois = true`, a tela responsável pela impressão imprime uma comanda **"ADICIONAL — Pedido #X"** só com os itens novos daquela estação e grava `impresso_em`.
  - Agrupar com um *debounce* de ~1,5 s, para que vários itens do mesmo acréscimo saiam numa comanda só.
- [ ] No PDV, o card do pedido reaberto volta para "🔵 Em Preparo" e o selo "pronto" some até concluir de novo.

### Requisitos não funcionais
- [ ] **Sem duplicidade:** a comanda complementar é impressa uma única vez por item, mesmo com várias telas abertas (checagem por `impresso_em IS NULL` na atualização).
- [ ] **Consistência:** a reabertura do pedido e a inserção dos itens acontecem na mesma transação da RPC.

### Dependências técnicas
- [CAF-000005](CONCLUIDAS/CAF-000005-adicionar-itens-a-um-pedido-ja-enviado.md) (fluxo de adicionar itens) e [CAF-000009](CONCLUIDAS/CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md) (realtime em `pedido_itens`).
- Funciona melhor junto com [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md) (a reabertura deve considerar só a estação do item novo) e [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md) (qual tela imprime).

### Recursos necessários
- Acesso ao Supabase para migration.
- Impressora ou PDF para validar a comanda complementar.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um pedido já está em "Prontos", **quando** o barista lança uma cortesia nele, **então** o pedido volta para "Em preparo" na estação da cortesia, com o item destacado como NOVO.
- [ ] **Dado que** um pedido está em preparo, **quando** o barista adiciona 2 itens pelo modal da mesa, **então** sai **uma** comanda "ADICIONAL" com os 2 itens, e os itens antigos não são reimpressos.
- [ ] **Dado que** duas telas da cozinha estão abertas, **quando** um item é adicionado, **então** a comanda complementar sai uma única vez.
- [ ] **Dado que** um pedido foi cancelado, **quando** alguém tenta adicionar itens, **então** a RPC recusa com mensagem clara.
- [ ] **Dado que** o item novo foi marcado como pronto, **quando** o card é renderizado, **então** o destaque amarelo some e fica só o ✓.

---

## O que a atividade não inclui

- Edição de itens já enviados (trocar sabor ou adicional). Continua sendo cancelar e lançar de novo.
- Mudanças no fluxo do PDV para escolher entre "mesmo pedido" e "pedido novo" (decidido na CAF-000005).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Cortesia em pedido pronto | Concluir pedido → lançar cortesia | Pedido reaberto; item NOVO |
| 2 | Cortesia em pedido entregue | Entregar → lançar cortesia | Pedido reaberto na cozinha |
| 3 | Adição em preparo | Adicionar 2 itens | 1 comanda ADICIONAL com 2 itens |
| 4 | Estação | Adicionar café num pedido só de cozinha | Comanda ADICIONAL só na tela do bar |
| 5 | Duas telas | Adicionar item com 2 KDS abertos | 1 impressão |
| 6 | Cancelado | Adicionar item em pedido cancelado | Erro amigável |
| 7 | Destaque some | Marcar o item NOVO como pronto | Sem fundo amarelo |
| 8 | Log | Reabertura por item | Evento em `pedido_eventos` |

---

## URL Complementar

- Código: `js/pedidos.js:664-686` (`baristaLancarCortesia`), `js/cozinha.js:724-737` (realtime `pedido_itens`), `js/cozinha.js:414` (itens não clicáveis em Prontos), `js/pedido-print.js:74` (`printPedido`)
- RPC: `supabase/migration_caf_000020_vinculo_adicionais.sql:197` (`adicionar_itens_pedido`)
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
- SAIPOS — Tela KDS (produto em amarelo = registrado após o lançamento): https://meajuda.saipos.com/hc/pt-br/articles/20211492079252-Tela-KDS-Sistema-de-Display-para-Cozinha
