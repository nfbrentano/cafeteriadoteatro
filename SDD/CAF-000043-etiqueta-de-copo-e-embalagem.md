# CAF-000043 — [Cozinha] [Impressão] Etiqueta por item para copo e embalagem (nome do cliente e personalização)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + impressão | 🟢 Baixa | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** imprimir uma **etiqueta adesiva por item** (uma por unidade) com senha, primeiro nome do cliente, produto, adicionais/sabores e observação, para colar no copo ou na embalagem. Impressão automática quando o bar/cozinha **inicia** o item, ou manual pelo card.
- **Por que é necessário:** no pico, vários cappuccinos com variações diferentes (leite vegetal, sem açúcar, extra shot) ficam lado a lado no balcão, e o nome é escrito à caneta no copo ou nem é escrito. A comanda da [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md) identifica o pedido, mas não cada copo. Troca de bebida é uma reclamação comum em cafeteria.
- **Qual valor será agregado:** menos troca de bebida, entrega mais rápida ("Ana!" com o nome no copo) e embalagem para viagem com cara profissional.
- **Para quem é destinado:** bar e cozinha, e clientes de balcão e viagem.

### Referência de mercado

- **Suitable (Suit Label):** impressora de etiquetas sincronizada com o KDS, com impressão automática disparada pelas etapas do pedido.
- **Suitable (impressões):** QR Code nas vias para ler e mudar o status do pedido.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Configuração "⚙ Esta tela" do KDS ([CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md)): "Imprimir etiquetas" sim/não, estações e tamanho da etiqueta (padrões 40×25 mm, 50×30 mm e 60×40 mm).
- [ ] Layout de etiqueta com `@page { size: <largura> <altura>; margin: 0 }` (impressão pelo navegador, como a comanda): senha `#45`, primeiro nome, produto, adicionais/sabores (abreviados), observação e "🥡" se for para viagem. Textos longos cortados com reticências, nunca em duas etiquetas.
- [ ] Uma etiqueta por **unidade** (quantidade 3 = 3 etiquetas, "1/3, 2/3, 3/3").
- [ ] Gatilho configurável: ao **iniciar** o item/estação (padrão) ou quando o pedido chega.
- [ ] Botão "🏷 Etiquetas" no card para reimprimir tudo ou um item.
- [ ] Trava de duplicidade reaproveitando `pedido_impressoes` da [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md) com `tipo = 'etiqueta'`.
- [ ] Opcional: QR Code pequeno na etiqueta que, lido pela câmera do KDS/PDV, marca o item como pronto ou entregue.
- [ ] Filtro por categoria: imprimir etiqueta só para as categorias marcadas (ex.: bebidas e itens para viagem), para não gastar etiqueta com prato servido na mesa.

### Requisitos não funcionais
- [ ] **Compatibilidade:** testado com pelo menos uma impressora térmica de etiquetas comum (ex.: Elgin L42, Zebra/Argox) instalada como impressora do sistema.
- [ ] **Privacidade:** só o primeiro nome.

### Dependências técnicas
- [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md) (configuração por tela e `pedido_impressoes`) e [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md) (início por estação).
- `js/pedido-print.js` (novo `printEtiquetas`).

### Recursos necessários
- Impressora térmica de etiquetas e rolo de etiquetas adesivas.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o pedido #45 da Ana tem 2 cappuccinos (1 com leite vegetal), **quando** o bar inicia o preparo, **então** saem 2 etiquetas: "#45 Ana · Cappuccino · 1/2" e "#45 Ana · Cappuccino + leite vegetal · 2/2".
- [ ] **Dado que** duas telas estão configuradas para etiquetas do bar, **quando** o item é iniciado, **então** sai um único jogo de etiquetas.
- [ ] **Dado que** a categoria "Pratos" não está marcada, **quando** um prato é iniciado, **então** não sai etiqueta.
- [ ] **Dado que** uma etiqueta rasgou, **quando** o barista toca em "🏷" no item, **então** ela é reimpressa.

---

## O que a atividade não inclui

- Etiqueta nutricional/de validade para produtos embalados de vitrine.
- Impressão ESC/POS/ZPL direta sem o diálogo do navegador (exige ponte local).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Quantidade | Item com quantidade 3 | 3 etiquetas numeradas |
| 2 | Variações | Adicionais e obs | Aparecem abreviados |
| 3 | Texto longo | Obs de 200 caracteres | Cortada com reticências |
| 4 | Duplicidade | Duas telas | Um jogo só |
| 5 | Categoria | Categoria desmarcada | Sem etiqueta |
| 6 | Reimpressão | Botão no item | Reimprime |
| 7 | Tamanhos | 40×25 e 60×40 | Layout legível nos dois |

---

## URL Complementar

- Código relacionado: `js/pedido-print.js`, `js/cozinha.js`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Suitable — Suit Label: https://suitable.com.br/aplicativos/suit-label/ · impressões: https://suitable.com.br/produto/impressoes/
