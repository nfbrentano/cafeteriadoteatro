# CAF-000032 — [Admin] [Estoque] Ficha técnica, custo do produto e relatório de lucro (CMV)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin + banco + relatórios | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Cadastrar a **ficha técnica** de cada produto produzido (ex.: Cappuccino = 18 g de café + 150 ml de leite + 10 g de chocolate), inclusive de adicionais e de sabores do meio a meio.
  2. Calcular o **custo** de cada produto a partir do custo médio dos insumos ([CAF-000031](CAF-000031-controle-de-estoque.md)), ou aceitar um **preço de custo manual** para quem ainda não tem ficha.
  3. Baixar os insumos do estoque na venda conforme a ficha.
  4. Mostrar **margem por produto** e **CMV / lucro bruto** por período no relatório.
- **Por que é necessário:** os relatórios da [CAF-000014](CONCLUIDAS/CAF-000014-relatorios-no-admin.md) mostram faturamento, mas não quanto sobra. Sem custo, não dá para saber se uma promoção ou uma cortesia dá prejuízo, nem precificar item novo.
- **Qual valor será agregado:** decisão de preço e de promoção com base em margem real, e o estoque de insumos passa a baixar sozinho.
- **Para quem é destinado:** administração.

### Referência de mercado

- **Simpliza:** ficha técnica com cálculo automático do custo final, baixa de cada insumo e custo atualizado a cada compra; CMV (beta).
- **Garfo:** relatórios de "lucro real" e "lucro por produto" e estoque financeiro.
- **Kyte / Jarbas:** preço de custo no cadastro do produto e relatório de lucro.
- **Suitable:** análise de CMV, DRE e DFC no módulo financeiro. Fonte: https://suitable.com.br/produto/financeiro/

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Tabela `fichas_tecnicas (id, produto_id NULL, adicional_id NULL, estoque_item_id, quantidade NUMERIC(12,3))` com `CHECK` de exatamente um dono (produto ou adicional).
- [ ] Coluna `produtos.preco_custo_manual NUMERIC(10,2)` (usada quando não há ficha).
- [ ] Função `custo_produto(produto_id)` = soma de `quantidade × custo_medio` dos insumos, ou `preco_custo_manual`.
- [ ] Gravar o custo **no momento da venda** em `pedido_itens.custo_unitario` (e em `pedido_item_adicionais.custo`), para o relatório não mudar quando o custo do insumo mudar depois.
- [ ] Meio a meio: custo e baixa = metade da ficha de cada sabor.
- [ ] A baixa da [CAF-000031](CAF-000031-controle-de-estoque.md) passa a usar a ficha: 1 cappuccino gera `saida_venda` de 18 g de café, 150 ml de leite etc.
- [ ] No formulário do produto (`js/admin/products.js`), aba "Ficha técnica": adicionar insumo + quantidade, com custo total e **margem** (`(preço − custo) / preço`) calculados na hora. Selo 🔴 quando a margem é menor que o mínimo configurado (padrão 50%).
- [ ] Relatórios (`js/admin/relatorios-admin.js`):
  - "Margem por produto": quantidade vendida, faturamento, custo, lucro bruto e margem %.
  - "CMV do período": custo total das vendas ÷ faturamento, com cortesias contadas como custo sem receita.
  - Promoções: lucro com e sem o desconto ([CAF-000017](CONCLUIDAS/CAF-000017-aba-promos-no-cardapio-publico.md)).

### Requisitos não funcionais
- [ ] **Histórico imutável:** relatórios de períodos passados usam o custo gravado na venda.
- [ ] **Desempenho:** o relatório roda por RPC agregada no banco (mesmo padrão de `get_admin_reports`).

### Dependências técnicas
- [CAF-000031](CAF-000031-controle-de-estoque.md) (itens de estoque e custo médio).
- RPC `get_admin_reports` (`supabase/migration_caf_000024_relatorios.sql`).

### Recursos necessários
- Receitas padrão da casa (gramaturas) levantadas com a equipe do bar e da cozinha.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o Cappuccino tem ficha com custo de R$ 3,20 e preço R$ 12,00, **quando** o admin abre o produto, **então** vê custo R$ 3,20 e margem 73%.
- [ ] **Dado que** um cappuccino é vendido, **quando** o pedido é salvo, **então** o estoque de café e de leite baixa pelas quantidades da ficha.
- [ ] **Dado que** o custo do leite sobe depois da venda, **quando** o admin consulta o relatório do mês passado, **então** o lucro não muda.
- [ ] **Dado que** houve cortesias no período, **quando** o relatório de CMV é gerado, **então** o custo delas aparece separado.

---

## O que a atividade não inclui

- Rendimento de preparo em lote (ex.: 1 bolo = 12 fatias) e produção interna com ordem de produção.
- Sugestão automática de preço.
- DRE completo (fica na [CAF-000035](CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md)).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Custo por ficha | Ficha com 3 insumos | Soma correta |
| 2 | Custo manual | Produto sem ficha com custo manual | Usa o manual |
| 3 | Sem custo | Produto sem ficha nem custo | Relatório mostra "sem custo" |
| 4 | Adicional | Cappuccino + leite vegetal | Baixa e custo do adicional somados |
| 5 | Meio a meio | Crepe ½ Nutella ½ Morango | Metade de cada ficha |
| 6 | Histórico | Alterar custo depois da venda | Relatório antigo inalterado |
| 7 | Margem baixa | Preço menor que o custo | Selo vermelho |

---

## URL Complementar

- Código relacionado: `js/admin/products.js`, `js/admin/relatorios-admin.js`, `supabase/migration_caf_000024_relatorios.sql`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Simpliza — administrativo: https://simpliza.com.br/administrativo.php · Garfo: https://garfo.app/llms.txt
