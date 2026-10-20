# [FEAT] CAF-000068 — Lista de Compras por Fornecedor e Entrada de Estoque Integrada ao Contas a Pagar

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Conectar os módulos de **Estoque** (`CAF-000031`), **Ficha Técnica / Custos** (`CAF-000032`) e **Fornecedores / Contas a Pagar** (`CAF-000035`) no painel administrativo (`admin.html`):
  1. Permitir vincular um `fornecedor_padrao_id` aos insumos e produtos estocáveis.
  2. Gerar automaticamente a **Lista de Compras / Reposição** agrupada por fornecedor para todos os itens com estoque atual `<= estoque_minimo`, com botão para copiar ou enviar o pedido de compra direto no WhatsApp do fornecedor.
  3. No modal de **Entrada de Estoque (Compra)**, permitir informar o valor pago / custo unitário da compra para atualizar automaticamente o `custo_unitario` do insumo/produto e oferecer um checkbox *"Lançar despesa automaticamente em Contas a Pagar"*.
- **Problema e evidência:** Hoje os módulos `estoque-admin.js` e `financeiro-admin.js` funcionam isoladamente: quando um insumo fica abaixo do estoque mínimo, o gestor precisa anotar manualmente o que falta para pedir ao fornecedor; e quando a mercadoria chega, precisa dar entrada na aba Estoque, depois atualizar o custo na Ficha Técnica e depois abrir a aba Financeiro para cadastrar o boleto/Pix em Contas a Pagar.
- **Impacto de não fazer:** Retrabalho triplo a cada compra de mercadoria, risco de esquecer de lançar notas/boletos de fornecedores no Contas a Pagar e custos de ficha técnica desatualizados em relação à última compra.
- **Para quem é destinado:** Gestor / comprador e responsável financeiro (`admin.html`).
- **História de usuário:** Como gestor da cafeteria, quero gerar a lista de compras por fornecedor com 1 clique e, ao dar entrada na mercadoria recebida, já atualizar o custo do insumo e lançar a despesa no Contas a Pagar em uma única tela, para economizar tempo e manter o CMV e o caixa sempre exatos.
- **Como saberemos que deu certo:** O gestor gera e envia a lista de reposição no WhatsApp do fornecedor em 2 cliques e registra uma entrada de compra atualizando estoque + custo unitário + conta a pagar em uma única operação.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Adicionar coluna opcional `fornecedor_padrao_id` (`UUID REFERENCES fornecedores(id)`) nas tabelas `insumos` e `produtos` e permitir selecionar o fornecedor padrão na aba Estoque (`admin.html`) | P0 | CA01 |
| RF02 | Na aba Estoque, adicionar botão **"📋 Gerar Lista de Compras"** que lista todos os insumos e produtos com `estoque_atual <= estoque_minimo`, calcula a quantidade sugerida de compra (`MAX(estoque_minimo * 2 - estoque_atual, estoque_minimo)`), agrupa por fornecedor e permite enviar via WhatsApp (`wa.me`) para o telefone do fornecedor ou copiar texto | P0 | CA02 |
| RF03 | No modal de **Entrada de Estoque** (`motivo = 'compra'`), exibir campos opcionais: **Custo Total da Compra (R$)** (ou Custo Unitário), **Fornecedor**, **Data de Vencimento / Pagamento** e checkbox **"Gerar lançamento em Contas a Pagar"** | P0 | CA03, CA04 |
| RF04 | Quando o custo for informado na entrada de compra, atualizar automaticamente o `custo_unitario` do insumo (ou `custo_manual` do produto) para que a Ficha Técnica (`CAF-000032`) reflita o preço atualizado | P0 | CA03 |
| RF05 | Quando o checkbox "Gerar lançamento em Contas a Pagar" estiver marcado na entrada de compra, inserir automaticamente o registro em `contas_pagar` na categoria `'Insumos e Mercadorias'` com vínculo ao fornecedor e observação da entrada de estoque | P0 | CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Caso o usuário desmarque o checkbox de Contas a Pagar (ex.: ajuste simples de estoque ou bonificação), a entrada de estoque deve funcionar exatamente como hoje, sem exigir dados financeiros | P0 | CA05 |

### Dependências técnicas

- Tabelas `insumos`, `produtos`, `movimentacoes_estoque` (`CAF-000031`), `ficha_tecnica_itens` (`CAF-000032`), `fornecedores` e `contas_pagar` (`CAF-000035`).
- Módulos `js/admin/estoque-admin.js` e `js/admin/financeiro-admin.js`.

### Recursos necessários

- Migration SQL para adicionar `fornecedor_padrao_id` em `insumos` e `produtos` e `custo_unitario_compra` em `movimentacoes_estoque`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o gestor edita um insumo ou produto estocável na aba Estoque, quando selecionar um Fornecedor Padrão cadastrado e salvar, então o vínculo `fornecedor_padrao_id` deve ser persistido.
- [x] **CA02:** Dado que existem insumos abaixo do estoque mínimo vinculados a um fornecedor, quando o gestor clicar em "📋 Gerar Lista de Compras", então o modal deve exibir os itens agrupados por fornecedor com botão direto para abrir o WhatsApp daquele fornecedor com a lista de pedido preenchida.
- [x] **CA03:** Dado que o gestor registra uma Entrada de Compra de `10 kg` de Café em Grãos informando Custo Total de `R$ 650,00`, quando salvar a entrada, então o estoque deve subir em `+10 kg` e o `custo_unitario` do insumo deve ser atualizado para `R$ 65,00/kg`.
- [x] **CA04:** Dado que no mesmo modal de Entrada de Compra o gestor marcou "Gerar lançamento em Contas a Pagar" com vencimento para daqui a 15 dias (ou pago hoje), quando salvar a entrada, então uma despesa de `R$ 650,00` na categoria `Insumos e Mercadorias` deve aparecer automaticamente na aba Financeiro → Contas a Pagar.
- [x] **CA05:** Dado que o gestor realiza uma entrada de ajuste ou desmarca o lançamento financeiro, quando salvar a entrada, então apenas o estoque deve ser movimentado, sem criar registro em `contas_pagar`.

## O que a atividade não inclui

- Importação de XML de NF-e SEFAZ: motivo: muitos fornecedores locais de cafeteria (padarias, hortifruti, laticínios artesanais) entregam com recibo/pedido simples ou boleto no WhatsApp.

### Considerado para o futuro (P2)

- Cálculo de custo médio ponderado opcional (em vez de custo da última compra).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Vincular fornecedor a insumo e gerar Lista de Compras | Manual | CA01, CA02 | Vincular fornecedor ao insumo com estoque baixo e clicar em "Gerar Lista de Compras" | Item listado sob o fornecedor com link WhatsApp formatado |
| CT02 | Entrada de compra atualizando custo e gerando Conta a Pagar | Integração / Manual | CA03, CA04 | Registrar entrada de 5 unidades por R$ 100,00 marcando "Gerar em Contas a Pagar" | Estoque +5, custo unitário R$ 20,00 e despesa de R$ 100,00 criada em `contas_pagar` |
| CT03 | Entrada simples sem lançamento financeiro | Manual | CA05 | Registrar entrada desmarcando o checkbox financeiro | Apenas estoque é atualizado |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/CAF-000031-controle-de-estoque.md`, `SDD/CONCLUIDAS/CAF-000032-ficha-tecnica-custo-e-lucro.md` e `SDD/CONCLUIDAS/CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md`
