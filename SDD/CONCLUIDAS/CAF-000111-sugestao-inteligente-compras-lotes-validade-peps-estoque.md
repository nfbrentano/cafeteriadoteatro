# [FEAT] Controle de Validade de Lotes (PEPS) e Sugestão Inteligente de Compras Baseada no Consumo dos Últimos 30 Dias

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-11-05

## Detalhes da Atividade

- **O que precisa ser feito:**
  Evoluir o módulo de Estoque e Lista de Compras (previsto nos itens "Considerado para o futuro — P2" da [CAF-000074](CONCLUIDAS/CAF-000074-correcao-estoque-ficha-tecnica-e-lista-de-compras.md) e [CAF-000068](CONCLUIDAS/CAF-000068-lista-compras-por-fornecedor-e-entrada-integrada.md)) com duas capacidades críticas para operação gastronômica:
  1. **Controle de Validade por Lote e Consumo PEPS (Primeiro que Entra, Primeiro que Sai):**
     - Criar a tabela `estoque_lotes` com rastreamento de lote (`lote_codigo`), data de validade (`data_validade`), quantidade inicial e saldo restante do lote (`quantidade_restante`).
     - Ao registrar uma entrada de estoque (`estoque_movimentos` com `tipo = 'entrada'`), permitir informar opcionalmente a `data_validade` e `lote_codigo`, gerando o registro em `estoque_lotes`.
     - Nas baixas de estoque (automáticas de vendas ou saídas manuais/perdas), abater prioritariamente do lote ativo com data de validade mais próxima (`PEPS/FIFO`: `ORDER BY data_validade ASC NULLS LAST, created_at ASC`).
     - Exibir no painel de Estoque (`js/admin/estoque.js`) um card em destaque com os insumos **Vencidos** (vermelho/critico) e **Vencendo em até 7 dias** (amarelo/alerta), com ação rápida de 1 clique **"Dar baixa por perda/vencimento"** que consome o saldo restante daquele lote e lança movimento `tipo = 'perda'`.
  2. **Sugestão Inteligente de Compras Baseada no Giro Real (30 dias) e Dias de Espetáculo:**
     - Evoluir `js/utils/stock-purchase.js` e a interface de compras no Admin.
     - Calcular o **Consumo Médio Diário (CMD)** dos últimos 30 dias com base nas saídas reais (`saida_venda`, `perda`), estimar a **Autonomia em Dias** (`saldo_atual / CMD`) e calcular a **Sugestão de Compra para N dias de cobertura** (7, 14 ou 30 dias), garantindo o `estoque_minimo` como piso de segurança.
     - Permitir ativar o multiplicador de **Semana com Espetáculo (+30%)**, recalculando a quantidade sugerida e incluindo as estimativas na mensagem formatada do WhatsApp e exportação CSV.
- **Problema e evidência:**
  Cafeterias trabalham com insumos altamente perecíveis (leite integral/vegetal, chantilly, doces, tortas, salgados, frios). Hoje (`js/admin/estoque.js`), embora haja campo de validade na entrada, não há tabela estruturada de lotes individuais nem abatimento PEPS automático — as saídas abatem apenas do total global. Além disso, a lista de compras (`js/utils/stock-purchase.js`) olha apenas o `estoque_minimo` estático, sem considerar se o consumo real subiu nas últimas semanas ou se o estoque atual acaba em menos de 2 dias.
- **Impacto de não fazer:**
  Desperdício financeiro com insumos vencidos na geladeira/estoque, risco sanitário de uso de insumo fora da validade e ruptura de estoque em semanas de maior movimento no teatro.
- **Para quem é destinado:**
  Gestores de estoque, compras e administração da Cafeteria do Teatro.
- **História de usuário:**
  Como gestor de estoque da cafeteria, quero visualizar alertas de insumos próximos do vencimento com baixa rápida por perda e gerar sugestões de compra baseadas no consumo real dos últimos 30 dias, para reduzir desperdícios de perecíveis e nunca ficar sem insumos em dias de espetáculo.
- **Como saberemos que deu certo:**
  1. Entradas com validade geram lotes com saldo individual e são abatidas por PEPS nas saídas.
  2. Card de Alertas de Validade no topo do Estoque lista lotes vencidos e a vencer (≤ 7 dias) com baixa por perda em 1 clique.
  3. A Lista de Compras exibe CMD 30d, autonomia em dias e sugestão dinâmica para 7/14/30 dias (+30% espetáculo opcional).
  4. 100% dos testes passando em `npm test`, `npm run test:db` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar a tabela `estoque_lotes` com campos `item_id`, `lote_codigo`, `data_validade`, `quantidade_inicial`, `quantidade_restante`, `custo_unitario`, `movimento_entrada_id` e RLS restrito a staff/admin | P0 | CA01, CA02 |
| RF02 | Atualizar a lógica de baixa de estoque (`fn_baixa_estoque_*` ou trigger/função dedicada em `estoque_movimentos`) para abater lotes em ordem PEPS (`ORDER BY data_validade ASC NULLS LAST, created_at ASC`), mantendo compatibilidade quando não houver lotes cadastrados | P0 | CA02 |
| RF03 | Implementar card de "Alertas de Validade" na aba Estoque (`js/admin/estoque.js`) exibindo badges e botão de ação rápida "Dar baixa por vencimento", que executa RPC/função segura para zerar o lote e registrar `estoque_movimentos (tipo = 'perda')` | P0 | CA03, CA06 |
| RF04 | Implementar em `js/utils/stock-purchase.js` e UI de Compras o cálculo de Consumo Médio Diário (CMD 30d), autonomia estimada em dias (`saldo_atual / CMD`) e quantidade sugerida de compra para cobrir horizonte configurável (7, 14 ou 30 dias), usando `estoque_minimo` como piso | P0 | CA04, CA07 |
| RF05 | Permitir aplicar um multiplicador de demanda de espetáculo (+30%) na geração da lista de compras quando houver semana com apresentações no teatro | P1 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Retrocompatibilidade: entradas de estoque de itens não-perecíveis (ex.: copos descartáveis, guardanapos) com `data_validade = NULL` continuam funcionando sem obrigatoriedade de lote | P0 | CA01 |
| RNF02 | Fuso horário: uso consistente de `America/Sao_Paulo` para corte de datas de validade e janelas de 30 dias de consumo | P0 | CA03, CA04 |
| RNF03 | Idempotência e integridade: baixas de estoque não podem deixar `quantidade_restante < 0` em nenhum lote | P0 | CA02, CA06 |
| RNF04 | Performance: cálculo de consumo 30d com índice adequado em `estoque_movimentos (created_at)` e tempo de resposta < 100ms | P0 | CA04 |

### Dependências técnicas

- `supabase/migration_caf_000031_controle_estoque.sql`
- `supabase/migration_caf_000074_correcao_estoque_ficha_tecnica.sql`
- `js/admin/estoque.js`, `js/utils/stock-purchase.js`, `js/db.js`
- Nova migration: `supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql`

### Recursos necessários

- N/A (assets e bibliotecas já disponíveis).

## Critérios de Aceitação / Entregas

- [x] **CA01 (Caminho Feliz - Entrada com Lote):** Dado o formulário de Entrada de Estoque no Admin, quando o operador registrar a entrada de 20 L de Leite informando `data_validade = '2026-11-20'` e `lote_codigo = 'L-2026-A'`, então é criado um registro correspondente em `estoque_lotes` com `quantidade_restante = 20`. Se a validade for omitida (item não-perecível), a entrada é concluída normalmente sem criar lote.
- [x] **CA02 (Caminho Feliz - Baixa PEPS):** Dado que o insumo "Leite Integral" possui dois lotes ativos: Lote A (10 L, vence em 3 dias) e Lote B (15 L, vence em 12 dias), quando ocorrerem saídas totalizando 12 L (seja por venda via PDV ou saída manual), então o sistema consome integralmente os 10 L do Lote A (restando 0 L, marcado inativo) e 2 L do Lote B (restando 13 L) seguindo estritamente a ordem de validade (PEPS).
- [x] **CA03 (Caminho Feliz - Alerta de Validade e Baixa por Perda):** Dado um lote com `data_validade < hoje` (vencido) ou dentro dos próximos 7 dias com `quantidade_restante > 0`, quando o gestor abrir a aba Estoque, então o item é destacado no painel de alertas de validade e, ao clicar em "Dar baixa por vencimento", é lançado um movimento `tipo = 'perda'` com quantidade igual ao saldo restante do lote, zerando-o.
- [x] **CA04 (Caminho Feliz - Sugestão Inteligente de Compras):** Dado que o insumo "Café em Grãos" teve 15 kg de saída nos últimos 30 dias (`CMD = 0,5 kg/dia`) e possui `saldo_atual = 2 kg`, quando o gestor selecionar a cobertura de 14 dias na Lista de Compras, então o sistema exibe `Autonomia: 4 dias` e sugere comprar `5 kg` (`14 * 0,5 - 2 = 5 kg`, respeitando o `estoque_minimo` como piso se este for maior).
- [x] **CA05 (Caminho Feliz - Modo Espetáculo +30%):** Dado que o gestor ativa o checkbox "Semana com Espetáculo (+30%)" na Lista de Compras, quando a sugestão for recalculada, então a demanda projetada aplica o fator `1,30` sobre o consumo médio diário e reflete as quantidades atualizadas no texto formatado para WhatsApp e exportação CSV.
- [x] **CA06 (Caso Negativo / Validação):** Dado um lote já zerado (`quantidade_restante = 0`) ou ID inexistente, quando houver tentativa de acionar a baixa por vencimento, então a operação é rejeitada com erro amigável e nenhum movimento espúrio de perda é inserido.
- [x] **CA07 (Caso Limite / Estoque Zerado):** Dado um item com `saldo_atual = 0` e saídas nos últimos 30 dias (`CMD > 0`), quando a lista de compras for visualizada, então a autonomia é exibida como `0 dias` em badge crítico (vermelho) e a sugestão de compra cobre a totalidade dos dias de cobertura solicitados.

## O que a atividade não inclui

- Leitura de código de barras GS1-128 por câmera para preenchimento automático de lote: motivo: prematuro; pode ser adicionado futuramente se a operação adotar leitor óptico.
- Múltiplos depósitos / almoxarifados físicos separados: motivo: a Cafeteria do Teatro opera com estoque central único.

### Considerado para o futuro (P2)

- Importação de XML de NF-e de fornecedores para cadastro automático de itens, custos e lotes.
- Notificações automáticas por e-mail ou Telegram quando lotes atingirem 3 dias para o vencimento.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Se um item nunca teve saídas nos últimos 30 dias (`CMD = 0`), como fica a sugestão de compra? | dev | Não | Usa automaticamente a regra clássica `MAX(0, estoque_minimo - saldo_atual)` como fallback seguro. |
| D02 | Se as vendas ultrapassarem o saldo de todos os lotes cadastrados (ex.: estoque físico maior que o registrado nos lotes), a venda deve ser bloqueada? | dev | Não | Não bloqueia a venda no PDV/KDS. O saldo geral de `estoque_itens` continua sendo debitado normalmente, os lotes são zerados e um log de aviso é gerado para inventário. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Abatimento PEPS entre múltiplos lotes com datas de validade distintas | pgTAP / unit | CA01, CA02 | Criar 2 lotes com validades diferentes, lançar saída parcial e verificar saldos | Lote mais próximo do vencimento é consumido primeiro |
| CT02 | Alerta de lote vencido e baixa rápida por perda no DOM | integração (Happy DOM) | CA03 | Carregar `estoque.js` com lote vencido e acionar botão de baixa por perda | Movimento `perda` criado e lote zerado |
| CT03 | Cálculo de CMD 30d, autonomia e sugestão de cobertura com modo espetáculo | unit / integração | CA04, CA05 | Executar funções de `stock-purchase.js` com histórico de 30 dias e cobertura de 14 dias | Quantidade sugerida e autonomia calculadas com exatidão |
| CT04 | Validação contra baixa de lote já zerado ou inexistente | unit / pgTAP | CA06 | Tentar dar baixa de perda em lote com saldo 0 | Rejeitado com erro amigável, sem alterações no banco |
| CT05 | Comportamento com estoque zerado e autonomia crítica | unit / DOM | CA07 | Testar item com saldo 0 e CMD > 0 na lista de compras | Exibe badge de 0 dias de autonomia e sugere compra total da cobertura |

## URL Complementar

- Origem do requisito P2: [CAF-000074](CONCLUIDAS/CAF-000074-correcao-estoque-ficha-tecnica-e-lista-de-compras.md) (seção "Considerado para o futuro (P2)")
- Módulo de compras: [CAF-000068](CONCLUIDAS/CAF-000068-lista-compras-por-fornecedor-e-entrada-integrada.md)

