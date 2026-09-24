# CAF-000026 — [Cozinha] Visão consolidada de produção (totais por produto)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) | 🟡 Média | P | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** adicionar ao KDS um painel ou aba **"Produção"** que soma os itens em aberto por produto e variação, como "6× Cappuccino (2 c/ leite vegetal) · 3× Baguete · 2× Crepe ½ Nutella ½ Morango", com os pedidos de origem de cada um.
- **Por que é necessário:** em horário de pico, principalmente em dias de espetáculo no teatro, com fila no intervalo, o barista precisa ler card por card para saber quantos cappuccinos fazer. Os itens iguais ficam espalhados em vários cards (`js/cozinha.js:317-336`).
- **Qual valor será agregado:** produção em lote (tirar 6 cafés de uma vez), menos esquecimentos e uma leitura mais rápida da demanda.
- **Para quem é destinado:** bar e cozinha, principalmente nos picos.

### Referência de mercado

- **Padrão de mercado em KDS (Food Sistemas, Teknisa, Consumer):** a tela consolidada ou "resumo de produção", que agrupa os itens iguais de todos os pedidos abertos por praça.
- **SAIPOS:** produção organizada por etapas, com os produtos selecionáveis individualmente para avançar em lote.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Botão ou aba "📊 Produção" no topo do KDS (e uma quarta aba no mobile), respeitando o filtro de estação.
- [ ] Agrupar os itens **não cancelados e sem `pronto_em`** de pedidos `pendente` e `em_preparo` pela chave `produto_id + adicionais ordenados + sabores + observação`.
  - Itens com observação ficam em linha separada, com a obs visível.
- [ ] Cada linha mostra a quantidade total e os chips dos pedidos de origem ("M3 #41", "Ana #44"). Tocar num chip rola até o card.
- [ ] Ação "✓ Marcar N como prontos" por linha, que marca `pronto_em` em todos os itens do grupo (reusa a RPC da [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md), ou `update` em lote).
- [ ] Ordenar as linhas pelo pedido mais antigo do grupo.
- [ ] A visão atualiza com o mesmo realtime do board.

### Requisitos não funcionais
- [ ] **Desempenho:** agrupamento em memória sobre o array `pedidos` já carregado, sem consulta extra.
- [ ] **Legibilidade:** fonte grande (≥ 20 px para a quantidade), legível a 1,5 m num tablet.

### Dependências técnicas
- Estado `pedidos` e `produtosCache` de `js/cozinha.js`.
- Melhor depois da [CAF-000022](CAF-000022-conclusao-independente-por-estacao.md) (a conclusão em lote dispara a regra de conclusão no banco).

### Recursos necessários
- Nenhum além do ambiente de desenvolvimento.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** há 3 pedidos abertos com 2, 1 e 3 cappuccinos simples, **quando** o bar abre "Produção", **então** vê "6× Cappuccino" com 3 chips de pedido.
- [ ] **Dado que** um dos cappuccinos tem leite vegetal, **quando** a visão é montada, **então** ele aparece numa linha própria.
- [ ] **Dado que** o bar toca em "Marcar 6 como prontos", **quando** a ação termina, **então** os pedidos que ficaram completos vão para "Prontos".
- [ ] **Dado que** o filtro está em "Cozinha", **quando** a visão é aberta, **então** não aparecem bebidas do bar.

---

## O que a atividade não inclui

- Previsão de demanda ou pré-produção com base no histórico.
- Baixa de estoque ou ficha técnica.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Soma simples | 3 pedidos com o mesmo produto | Total correto |
| 2 | Variação | Mesmo produto com adicional diferente | Linhas separadas |
| 3 | Observação | Item com obs "sem açúcar" | Linha própria com a obs |
| 4 | Meio a meio | Crepes com sabores diferentes | Agrupados por par de sabores |
| 5 | Cancelado | Item cancelado | Não entra na soma |
| 6 | Lote | Marcar grupo como pronto | Itens prontos; pedidos completos concluem |
| 7 | Filtro | Estação Bar | Só itens do bar |
| 8 | Realtime | Novo pedido chega com a visão aberta | Total atualiza |

---

## URL Complementar

- Código: `js/cozinha.js:317-526` (render do board), `cozinha.html` (abas mobile `.kds-mobile-tabs`)
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
- Food Sistemas — Painel de produção: https://foodsistemas.com.br/funcionalidades/painel-de-producao-para-restaurantes/
