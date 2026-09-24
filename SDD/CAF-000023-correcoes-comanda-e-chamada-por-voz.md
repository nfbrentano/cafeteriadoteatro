# CAF-000023 — [Bug] [Cozinha] Comanda automática sem meio a meio, voz sem nome do cliente e botão "Chamar" quebrando com apóstrofo

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + PDV + impressão | 🔴 Alta | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** corrigir três defeitos pequenos no fluxo "pedido chega → comanda → pronto → chamada":
  1. A comanda impressa automaticamente sai sem os sabores do meio a meio.
  2. A chamada por voz feita pela cozinha ignora o nome do cliente.
  3. O botão "📢 Chamar" deixa de funcionar quando o nome do cliente tem apóstrofo.
- **Por que é necessário:** a comanda é a principal referência da cozinha. Um "Crepe meio a meio" sem os sabores obriga alguém a ir até a tela ou até o barista para perguntar. A chamada pelo nome ([CAF-000010](CONCLUIDAS/CAF-000010-nome-do-cliente-pedido-para-viagem.md)) só funciona no PDV.
- **Qual valor será agregado:** menos erro de preparo, menos idas e vindas entre salão e cozinha, e uma chamada consistente em todas as telas.
- **Para quem é destinado:** cozinha, bar e clientes do balcão ou para viagem.

### Análise da causa

**1. Comanda automática sem sabores.** No realtime de `INSERT` (`js/cozinha.js:700-704`), o pedido é buscado com:

```js
.select('*, pedido_itens(*, pedido_item_adicionais(*))')
```

Falta `pedido_item_sabores(*)`. O `printPedido` (`js/pedido-print.js:122-128`) só imprime os "½ sabor" quando `item.pedido_item_sabores` existe, então a comanda automática sai só com "Crepe meio a meio". A reimpressão manual funciona porque usa a consulta completa de `fetchPedidosIniciais` (`js/cozinha.js:294-301`).

**2. Voz da cozinha sem nome.** Ao concluir, `updateStatus` chama `chamarPedidoVoz(p.numero_pedido || p.id, p.mesa_codigo)` (`js/cozinha.js:627`) sem o terceiro parâmetro `clienteNome`. Pedidos para viagem são anunciados como "Pedido número 12, da mesa BALCÃO", e não como "Pedido da Ana". O botão "Chamar" do card passa o nome corretamente (`js/cozinha.js:486`).

**3. Apóstrofo quebra o `onclick`.** Os botões "Chamar" montam JavaScript dentro de um atributo HTML:

```js
onclick="window.cozinhaChamarPedido('12', 'Mesa 3', '${window.escapeHtml(pedido.cliente_nome || '')}')"
```

`escapeHtml` converte `'` em `&#039;`, mas o navegador **decodifica a entidade antes de executar o atributo**. Um nome como `D'Ávila` vira `'D'Ávila'`, o que é erro de sintaxe, e o botão não faz nada. O mesmo padrão existe no PDV (`js/pedidos.js:1892`) e também é um vetor de injeção de script pelo campo de nome.

### Referência de mercado

- **SAIPOS:** a comanda e o KDS exibem produto, **opcionais** e observações (em destaque rosa). Sabores e complementos nunca são omitidos da via de produção.
- **Painel de senha (SAIPOS):** a chamada para retirada usa a identificação do pedido (senha ou nome), e não a mesa.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Extrair a consulta de pedido completo para uma constante única, `PEDIDO_SELECT_COMPLETO` (itens, adicionais e sabores), usada em `fetchPedidosIniciais` e no realtime de `INSERT`.
- [ ] `updateStatus` passa `p.cliente_nome` para `chamarPedidoVoz`.
- [ ] Trocar os `onclick` com dados interpolados dos botões "Chamar" (KDS e PDV) por `data-pedido-id` com listener (`addEventListener` ou delegação no container), buscando os dados do pedido no estado em memória.
- [ ] Revisar os outros `onclick` com interpolação de **texto** em `js/cozinha.js` e `js/pedidos.js`. Os que passam só IDs numéricos podem ficar.
- [ ] Unificar o texto da chamada entre KDS e PDV ("pronto para retirada" × "pronto para ser servido") numa função compartilhada que respeita `para_viagem`.

### Requisitos não funcionais
- [ ] **Segurança:** nenhum dado digitado pelo usuário (nome do cliente, observações) é interpolado em atributo de evento.
- [ ] **Regressão:** a impressão de teste (`btnTesteImpressao`) e a reimpressão manual continuam idênticas.

### Dependências técnicas
- [CAF-000010](CONCLUIDAS/CAF-000010-nome-do-cliente-pedido-para-viagem.md) (`cliente_nome`, `para_viagem`) e a tabela `pedido_item_sabores` (meio a meio, TAREFAS.md seção 6).

### Recursos necessários
- Impressora térmica ou "Salvar como PDF" para conferir a comanda.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o barista lança um crepe meio a meio, **quando** a cozinha recebe o pedido, **então** a comanda impressa automaticamente mostra os dois "½ sabor".
- [ ] **Dado que** um pedido para viagem tem o nome "Ana", **quando** a cozinha toca em "Pronto!", **então** a voz diz "Pedido da Ana…".
- [ ] **Dado que** o cliente se chama "D'Ávila", **quando** alguém toca em "📢 Chamar" no KDS ou no PDV, **então** a chamada acontece e o console não mostra erro.
- [ ] **Dado que** o nome do cliente é `');alert(1);//`, **quando** o card é renderizado e o botão tocado, **então** nenhum script é executado.

---

## O que a atividade não inclui

- Impressão direta via ESC/POS, sem o diálogo do navegador.
- Mudanças no layout da comanda além dos sabores.
- Roteamento de impressão por estação (ver [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md)).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Meio a meio automático | Lançar crepe ½ + ½ com a cozinha aberta | Comanda com os 2 sabores |
| 2 | Reimpressão | "🖨 Comanda" no mesmo pedido | Igual à automática |
| 3 | Voz com nome | Pedido viagem "Ana" → "Pronto!" na cozinha | "Pedido da Ana…" |
| 4 | Voz sem nome | Pedido de mesa → "Pronto!" | "Pedido número X, da mesa Y…" |
| 5 | Apóstrofo KDS | Cliente "D'Ávila" → Chamar | Funciona |
| 6 | Apóstrofo PDV | Idem na aba Pedidos do PDV | Funciona |
| 7 | Injeção | Nome `');alert(1);//` | Nenhum alert |
| 8 | Teste de impressão | Botão "Testar Impressão" | Sem regressão |

---

## URL Complementar

- Código: `js/cozinha.js:700-704` (select do INSERT), `js/cozinha.js:627` (voz ao concluir), `js/cozinha.js:486` e `js/pedidos.js:1892` (onclick com nome), `js/pedido-print.js:122-128` (sabores)
- Função de escape: `js/supabase-client.js:21`, `js/pedidos.js:9`
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
