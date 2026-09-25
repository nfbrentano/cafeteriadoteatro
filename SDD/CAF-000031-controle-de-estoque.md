# CAF-000031 — [Admin] [Estoque] Controle de estoque de produtos e insumos com baixa automática na venda

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin + PDV + banco | 🔴 Alta | G | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar o controle de estoque:
  1. Cadastro de **itens de estoque**: produtos de revenda (água, refrigerante, bombom) e insumos (leite, café em grão, pão de baguete).
  2. **Entradas** (compra/recebimento), **ajustes** (inventário) e **perdas** (vencido, quebra).
  3. **Baixa automática** a cada item vendido e **estorno** quando o item é cancelado.
  4. Alerta de estoque mínimo e de validade próxima.
- **Por que é necessário:** hoje o único controle é o liga/desliga de "esgotado" da [CAF-000006](CONCLUIDAS/CAF-000006-produto-esgotado.md) (`produtos.disponivel`), feito à mão e só depois que o produto acaba. Não há quantidade, histórico de compras nem registro de perdas. Todos os concorrentes analisados têm estoque integrado à venda.
- **Qual valor será agregado:** a compra é feita antes de faltar, as perdas ficam visíveis e o produto sai do cardápio sozinho quando zera. É a base da ficha técnica e do custo ([CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md)).
- **Para quem é destinado:** administração (compras) e baristas.

### Referência de mercado

- **Kyte:** estoque unificado entre PDV e catálogo online, atualizado a cada venda em todos os canais; leitor de código de barras pela câmera.
- **Jarbas:** estoque em tempo real integrado às vendas, histórico e relatório de perdas.
- **Garfo:** alerta de estoque mínimo, controle de validade e reserva automática.
- **Simpliza:** cadastro de insumos com baixa a cada pedido lançado e análise de saída.
- **Suitable:** saldos em tempo real, histórico completo de entradas e saídas e entrada automática por XML da NF-e (fora do escopo aqui). Fonte: https://suitable.com.br/produto/estoque/

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Tabela `estoque_itens (id, nome, unidade ['un','g','kg','ml','l'], quantidade NUMERIC(12,3), estoque_minimo, custo_medio NUMERIC(10,4), codigo_barras, controla_validade BOOLEAN, ativo)`.
- [ ] Tabela `estoque_movimentos (id, item_id, tipo ['entrada','saida_venda','estorno','ajuste','perda'], quantidade, custo_unitario, validade DATE, pedido_item_id, motivo, criado_por, created_at)`. O saldo é sempre a soma dos movimentos; `estoque_itens.quantidade` é um cache atualizado por trigger.
- [ ] Vínculo produto → estoque:
  - **Revenda:** o produto aponta para um item de estoque com proporção 1:1 (`produtos.estoque_item_id`).
  - **Produzido:** a baixa usa a ficha técnica da [CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md). Até ela existir, o produto não baixa estoque.
  - Adicionais (`adicionais`) também podem apontar para um item de estoque (ex.: "leite vegetal").
- [ ] Baixa automática no banco: trigger `AFTER INSERT ON pedido_itens` gera `saida_venda`; cancelamento de item ([CAF-000004](CONCLUIDAS/CAF-000004-cancelar-item-individual.md)) gera `estorno`. Nada é calculado no navegador.
- [ ] Quando o saldo de um item de revenda chega a 0, o produto fica `disponivel = false` automaticamente (com evento no log da [CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md)). Ao receber entrada, volta a `true` se tiver sido desligado pelo estoque (não pelo admin).
- [ ] Nova aba **"Estoque"** no admin:
  - Lista com saldo, mínimo, custo médio e selo 🔴 abaixo do mínimo / 🟠 vence em ≤ 3 dias.
  - Botões "Entrada", "Ajuste de inventário" e "Registrar perda" (com motivo obrigatório).
  - Histórico de movimentos por item, filtrável por período e tipo.
- [ ] Entrada com custo unitário atualiza o **custo médio ponderado** do item.
- [ ] Leitura de código de barras pela câmera no cadastro e na entrada (`BarcodeDetector` quando disponível, digitação manual como alternativa).
- [ ] Relatório "Perdas por período" e "Itens abaixo do mínimo" (exportável pelo CSV da [CAF-000016](CONCLUIDAS/CAF-000016-exportar-csv.md)).

### Requisitos não funcionais
- [ ] **Consistência:** a baixa acontece na mesma transação de `criar_pedido` / `adicionar_itens_pedido`. Pedido criado offline ([CAF-000018](CONCLUIDAS/CAF-000018-tolerancia-a-queda-de-internet.md)) baixa quando sincroniza, sem duplicar (idempotência já existente).
- [ ] **Venda nunca bloqueada:** estoque negativo é permitido (com alerta), para não travar o balcão por cadastro desatualizado.
- [ ] **Permissão:** entrada/ajuste/perda só `admin` (ou cargo com permissão, ver [CAF-000036](CAF-000036-permissoes-por-cargo-e-desempenho.md)).

### Dependências técnicas
- `pedido_itens`, `pedido_item_adicionais`, `produtos.disponivel` e o log de `pedido_eventos`.
- RPCs `criar_pedido` e `adicionar_itens_pedido` (`supabase/migration_caf_000026_idempotencia.sql`).

### Recursos necessários
- Lista inicial de itens de revenda e insumos com saldo de abertura (inventário feito pela equipe).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** "Água sem gás" tem saldo 10, **quando** o barista vende 2, **então** o saldo vai para 8 e há um movimento `saida_venda` ligado ao item do pedido.
- [ ] **Dado que** um item vendido é cancelado, **quando** o cancelamento é salvo, **então** é gerado `estorno` e o saldo volta.
- [ ] **Dado que** o saldo de um produto de revenda chega a 0, **quando** a venda é concluída, **então** o produto aparece como esgotado no PDV e no cardápio público.
- [ ] **Dado que** o admin registra entrada de 12 unidades a R$ 2,00 num item com 6 a R$ 1,50, **quando** salva, **então** o custo médio passa a R$ 1,83.
- [ ] **Dado que** um item está abaixo do mínimo, **quando** o admin abre a aba Estoque, **então** ele aparece no topo com selo vermelho.

---

## O que a atividade não inclui

- Ficha técnica e baixa de insumos por receita (fica na [CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md)).
- Pedido de compra a fornecedor, cotação e múltiplos depósitos.
- Contas a pagar da compra (fica na [CAF-000035](CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md)).
- Nota fiscal de entrada (XML).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Baixa na venda | Vender 2 águas | Saldo −2 |
| 2 | Estorno | Cancelar 1 água | Saldo +1 |
| 3 | Zerou | Vender a última unidade | Produto esgotado automaticamente |
| 4 | Reposição | Entrada de 12 | Produto volta a disponível |
| 5 | Esgotado manual | Admin desliga e depois dá entrada | Continua desligado |
| 6 | Estoque negativo | Vender sem saldo | Venda passa, alerta no admin |
| 7 | Offline | Vender offline e reconectar | Baixa uma única vez |
| 8 | Perda | Registrar perda sem motivo | Bloqueado |
| 9 | Validade | Entrada com validade amanhã | Selo laranja |

---

## URL Complementar

- Código relacionado: `supabase/migration_caf_000005.sql` (campo `disponivel`), `supabase/migration_caf_000026_idempotencia.sql`, `js/admin/products.js`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Kyte: https://www.kyteapp.com/pt · Jarbas: https://www.jarbas.app/segmentos/padarias · Garfo: https://garfo.app · Simpliza: https://simpliza.com.br/administrativo.php
