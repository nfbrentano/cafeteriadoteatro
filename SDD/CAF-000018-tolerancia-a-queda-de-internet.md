# CAF-000018 — [PDV] [Cozinha] Tolerância a queda de internet

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + cozinha | 🟢 Baixa | G | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** manter o PDV utilizável quando a internet cair, guardando os pedidos localmente e enviando quando a conexão voltar, e avisar claramente a equipe sobre o estado da conexão.
- **Por que é necessário:** o café fica dentro do teatro, onde o sinal pode oscilar. Hoje, se a rede cair no momento do envio, o pedido simplesmente falha (erro da RPC) e o barista precisa refazer. A cozinha não sabe que parou de receber pedidos.
- **Qual valor será agregado:** atendimento não para em quedas curtas e nenhum pedido se perde.
- **Para quem é destinado:** baristas e cozinha.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Indicador online/offline no PDV e na cozinha (eventos `online` / `offline` + estado do canal realtime).
- [ ] PDV offline: o pedido vai para uma fila local (IndexedDB) com status "Aguardando envio".
- [ ] Envio automático da fila quando a conexão voltar, em ordem.
- [ ] Cada pedido tem um id gerado no aparelho (`client_id UUID`), e `criar_pedido` ignora duplicados (idempotência).
- [ ] Lista "Pedidos pendentes de envio" com opção de reenviar ou descartar.
- [ ] Cozinha: faixa vermelha "Sem conexão — pedidos novos podem não aparecer" quando offline.
- [ ] Cardápio do PDV (produtos, adicionais, promoções) disponível em cache para montar pedidos offline.

### Requisitos não funcionais
- [ ] Nenhum pedido enviado duas vezes, mesmo com várias tentativas.
- [ ] Preço final continua calculado no banco no momento do envio; o carrinho offline mostra "valor estimado".
- [ ] Fila local sobrevive a fechar e reabrir o app.

### Dependências técnicas
- Coluna `pedidos.client_id UUID UNIQUE` e ajuste em `criar_pedido`.
- Service worker (`sw.js`) para cache dos dados do PDV.
- [CAF-000009](CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md) (reconexão do realtime).

### Recursos necessários
- Testes em aparelho real com modo avião.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o PDV está offline, **quando** o barista envia um pedido, **então** ele fica na fila local com status "Aguardando envio".
- [ ] **Dado que** há 2 pedidos na fila, **quando** a conexão volta, **então** eles são enviados em ordem e aparecem na cozinha.
- [ ] **Dado que** o envio falhou depois de o banco já ter gravado, **quando** o PDV tenta de novo, **então** o pedido não é duplicado.
- [ ] **Dado que** a cozinha perdeu a conexão, **quando** isso acontece, **então** a faixa vermelha aparece em até 5 s.
- [ ] **Dado que** o app foi fechado com pedidos na fila, **quando** é reaberto online, **então** a fila é enviada.

---

## O que a atividade não inclui

- Funcionamento offline completo da cozinha (receber pedidos sem internet via rede local).
- Sincronização offline de alterações de status.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Envio offline | Modo avião → enviar pedido | Vai para a fila |
| 2 | Reconexão | Desligar modo avião | Pedido enviado e na cozinha |
| 3 | Duplicidade | Simular timeout após gravação | Só 1 pedido no banco |
| 4 | Ordem | 3 pedidos na fila | Enviados na ordem |
| 5 | Persistência | Fechar app com fila e reabrir | Fila enviada |
| 6 | Indicador | Derrubar rede na cozinha | Faixa vermelha |
| 7 | Descartar | Descartar pedido da fila | Não é enviado |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 18
- Código: `js/pedidos.js` (envio via `criar_pedido`), `sw.js`
- Docs: MDN — IndexedDB API; MDN — `navigator.onLine`
