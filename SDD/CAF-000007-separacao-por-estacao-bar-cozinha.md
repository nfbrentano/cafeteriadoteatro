# CAF-000007 — [Cozinha] [Banco] Separação por estação (bar × cozinha)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha + banco | 🟡 Média | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** separar os itens do pedido pela estação que os prepara (bar para bebidas, cozinha para comidas), com telas e comandas próprias para cada uma.
- **Por que é necessário:** hoje todos os itens, incluindo os cafés, vão para a mesma tela (`cozinha.html`) e a mesma comanda. A cozinha vê cafés que não prepara, e o bar não tem uma fila própria.
- **Qual valor será agregado:** cada equipe vê só o que precisa preparar, a comanda impressa fica mais curta e o pedido só é "pronto" quando todas as partes estão prontas.
- **Para quem é destinado:** equipe do bar, equipe da cozinha e baristas.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Coluna `categorias.estacao TEXT NOT NULL DEFAULT 'cozinha' CHECK (estacao IN ('bar','cozinha'))`.
- [ ] Admin: campo "Estação" no cadastro de categoria.
- [ ] KDS com filtro por estação: `cozinha.html?estacao=bar` e `cozinha.html?estacao=cozinha` (sem parâmetro = todas).
- [ ] Card do pedido mostra só os itens da estação e um indicador "outra estação: 2 itens".
- [ ] Comanda impressa por estação (cada KDS imprime só os seus itens).
- [ ] Status por estação: coluna `pedido_itens.pronto_em` ou tabela `pedido_estacoes (pedido_id, estacao, status)`.
- [ ] Pedido vai para `concluido` só quando todas as estações terminarem.

### Requisitos não funcionais
- [ ] Sem parâmetro de estação, a tela funciona exatamente como hoje (compatibilidade).
- [ ] A estação escolhida fica salva no aparelho (`localStorage`).

### Dependências técnicas
- Pode compartilhar a mesma estrutura de [CAF-000008](CAF-000008-marcar-item-a-item-como-pronto.md) (pronto por item).
- [CAF-000009](CAF-000009-realtime-da-cozinha-tambem-em-pedido-itens.md) para sincronizar o status dos itens.

### Recursos necessários
- Definição com o cliente de quais categorias são do bar.
- Um segundo aparelho/impressora no bar, se for usar comanda separada.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um pedido tem 1 cappuccino e 1 baguete, **quando** ele é enviado, **então** o KDS do bar mostra só o cappuccino e o da cozinha só o baguete.
- [ ] **Dado que** o bar terminou o cappuccino, **quando** a cozinha ainda não terminou o baguete, **então** o pedido continua em preparo para o barista.
- [ ] **Dado que** as duas estações terminaram, **quando** a última marca pronto, **então** o pedido vai para "Prontos" e o barista é avisado.
- [ ] **Dado que** o KDS foi aberto sem parâmetro, **quando** chega um pedido, **então** mostra todos os itens, como hoje.

---

## O que a atividade não inclui

- Mais de duas estações (a estrutura deve permitir, mas só bar e cozinha serão configurados).
- Roteamento para impressoras de rede específicas.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Pedido misto | Café + baguete | Cada KDS mostra o seu item |
| 2 | Só bebida | Pedido só com cafés | Não aparece no KDS da cozinha |
| 3 | Conclusão parcial | Bar conclui, cozinha não | Pedido segue em preparo |
| 4 | Conclusão total | As duas concluem | Pedido pronto + aviso ao barista |
| 5 | Sem filtro | Abrir `cozinha.html` | Comportamento atual |
| 6 | Comanda | Imprimir no KDS do bar | Só itens do bar |
| 7 | Categoria nova | Criar categoria sem estação | Padrão `cozinha` |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 7
- Código: `js/cozinha.js:279` (`renderPedidos`), `js/pedido-print.js`, `js/admin/categories.js`
