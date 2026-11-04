# [FEAT] Controle de Validade de Lotes (PEPS) e Sugestão Inteligente de Compras Baseada no Consumo dos Últimos 30 Dias

> **Status:** Rascunho
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-10-29

## Detalhes da Atividade

- **O que precisa ser feito:**
  Evoluir o módulo de Estoque e Lista de Compras (previsto nos itens "Considerado para o futuro — P2" da [CAF-000074](CONCLUIDAS/CAF-000074-correcao-estoque-ficha-tecnica-e-lista-de-compras.md) e [CAF-000068](CONCLUIDAS/CAF-000068-lista-compras-por-fornecedor-e-entrada-integrada.md)) com duas capacidades críticas para operação gastronômica:
  1. **Controle de Validade por Lote e Consumo PEPS (Primeiro que Entra, Primeiro que Sai):**
     - Ao registrar uma entrada de estoque (`estoque_movimentos` com `tipo = 'entrada'`), permitir informar opcionalmente a `data_validade` e `lote_codigo`, registrando o saldo do lote.
     - Nas baixas automáticas de venda ou saídas manuais, abater prioritariamente do lote ativo com data de validade mais próxima (PEPS/FIFO).
     - Exibir no painel de Estoque (`js/admin/estoque.js`) um alerta em destaque com os insumos **Vencidos** (vermelho) e **Vencendo em até 7 dias** (amarelo), com botão de 1 clique **"Registrar Baixa por Perda/Vencimento"** que zera o lote vencido e lança o movimento `tipo = 'perda'` com motivo padronizado.
  2. **Sugestão Inteligente de Compras Baseada no Giro Real (30 dias) e Dias de Espetáculo:**
     - Hoje a lista de compras calcula apenas `estoque_minimo - estoque_atual`.
     - Adicionar o cálculo de **Consumo Médio Diário (CMD)** dos últimos 30 dias (a partir das saídas de `estoque_movimentos`), estimativa de **Dias de Cobertura Restantes** (`saldo_atual / CMD`) e **Sugestão de Compra para N dias de cobertura** (ex.: cobrir 7 ou 15 dias + acréscimo configurável quando houver espetáculo agendado na semana).
- **Problema e evidência:**
  Cafeterias trabalham com insumos altamente perecíveis (leite integral/vegetal, chantilly, doces, tortas, salgados, frios). Hoje (`js/admin/estoque.js`), a entrada de estoque não registra data de validade e o gestor não recebe alerta quando um lote de leite ou doce está prestes a vencer. Além disso, a lista de compras (`js/utils/stock-purchase.js`) olha apenas o `estoque_minimo` estático, sem considerar se o consumo real subiu nas últimas semanas ou se o estoque atual acaba em menos de 2 dias.
- **Impacto de não fazer:**
  Desperdício financeiro com insumos vencidos na geladeira/estoque, risco sanitário de uso de insumo fora da validade e ruptura de estoque em semanas de maior movimento no teatro.
- **Para quem é destinado:**
  Gestores de estoque, compras e administração da Cafeteria do Teatro.
- **História de usuário:**
  Como gestor de estoque da cafeteria, quero visualizar alertas de insumos próximos do vencimento com baixa rápida por perda e gerar sugestões de compra baseadas no consumo real dos últimos 30 dias, para reduzir desperdícios de perecíveis e nunca ficar sem insumos em dias de espetáculo.
- **Como saberemos que deu certo:**
  1. Entradas de estoque permitem informar `data_validade`, exibindo badges de lotes vencidos / a vencer (≤ 7 dias) no topo da aba Estoque.
  2. As saídas consomem os lotes mais próximos do vencimento primeiro (PEPS).
  3. A Lista de Compras exibe o Consumo Médio Diário (30d), autonomia em dias e a quantidade sugerida para a cobertura escolhida.
  4. 100% dos testes passando em `npm test`, `npm run test:db` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar tabela/colunas de controle de lotes (`estoque_lotes` ou colunas `data_validade`, `lote_codigo`, `quantidade_restante_lote` em `estoque_movimentos`) com RLS restrito a staff de estoque/admin e atualizar a função de saída para abater em ordem PEPS (`ORDER BY data_validade ASC NULLS LAST, created_at ASC`) | P0 | CA01, CA02 |
| RF02 | Exibir painel de "Alertas de Validade" na aba Estoque (`js/admin/estoque.js`) listando lotes vencidos e lotes que vencem nos próximos 7 dias, com ação rápida de baixa por perda (`tipo = 'perda'`) | P0 | CA03 |
| RF03 | Implementar em `js/utils/stock-purchase.js` (e RPC/consulta de apoio) o cálculo de Consumo Médio Diário (CMD 30d), autonomia estimada em dias (`saldo_atual / CMD`) e quantidade sugerida de compra para atingir o horizonte de cobertura selecionado (ex.: 7, 14 ou 30 dias), respeitando o `estoque_minimo` como piso | P0 | CA04, CA05 |
| RF04 | Permitir aplicar um multiplicador de demanda de espetáculo (ex.: `+30%`) na geração da lista de compras quando houver dia de espetáculo previsto na semana | P1 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Retrocompatibilidade: entradas de estoque de itens não-perecíveis (ex.: copos descartáveis, guardanapos) podem ter `data_validade = NULL` sem qualquer bloqueio | P0 | CA01 |
| RNF02 | Uso do fuso horário `America/Sao_Paulo` para determinar a data de hoje na comparação de vencimento de lotes | P0 | CA03 |

### Dependências técnicas

- `supabase/migration_caf_000031_controle_estoque.sql`
- `supabase/migration_caf_000074_correcao_estoque_ficha_tecnica.sql`
- `js/admin/estoque.js`, `js/utils/stock-purchase.js`

### Recursos necessários

- N/A.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o modal de Entrada de Estoque no Admin, quando o operador registrar a entrada de 20 L de Leite informando `data_validade = '2026-11-03'`, então o lote é salvo com a validade informada e entradas sem validade (itens não-perecíveis) continuam funcionando normalmente.
- [ ] **CA02:** Dado que o insumo "Leite Integral" possui dois lotes ativos: Lote A (10 L, vence em 3 dias) e Lote B (15 L, vence em 12 dias), quando ocorrerem saídas totalizando 12 L, então o sistema consome integralmente os 10 L do Lote A (restando 0 L) e 2 L do Lote B (restando 13 L) seguindo a regra PEPS.
- [ ] **CA03:** Dado um lote com `data_validade` menor que hoje (vencido) ou dentro dos próximos 7 dias com saldo restante > 0, quando o gestor abrir a aba Estoque, então o item aparece no painel de alertas de validade e, ao clicar em "Dar baixa por vencimento", é gerado um movimento `tipo = 'perda'` zerando o saldo restante daquele lote.
- [ ] **CA04:** Dado que o insumo "Café em Grãos" teve 15 kg de saída nos últimos 30 dias (`CMD = 0,5 kg/dia`) e possui `saldo_atual = 2 kg`, quando o gestor abrir a Sugestão Inteligente de Compras para cobertura de 14 dias, então o sistema exibe `Autonomia: 4 dias` e sugere comprar `5 kg` (`14 * 0,5 - 2 = 5 kg`, ou o necessário para atingir o `estoque_minimo`, o que for maior).
- [ ] **CA05:** Dado que o gestor ativa a opção "Semana com Espetáculo (+30%)" na Lista de Compras, quando a sugestão for recalculada, então a demanda projetada aplica o fator de segurança sobre o consumo médio e inclui o valor estimado no texto exportado para WhatsApp/CSV do fornecedor.

## O que a atividade não inclui

- Leitura de código de barras GS1-128 por câmera para preenchimento automático de lote: motivo: pode ser adicionado futuramente se a operação adotar leitor óptico.

### Considerado para o futuro (P2)

- Importação de XML de NF-e de fornecedores para cadastro automático de itens, custos e lotes.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Se um item nunca teve saídas nos últimos 30 dias (`CMD = 0`), como fica a sugestão de compra? | dev | Não | Usa automaticamente a regra clássica `MAX(0, estoque_minimo - saldo_atual)` como fallback seguro. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Abatimento PEPS entre múltiplos lotes com datas de validade distintas | pgTAP / unit | CA01, CA02 | Criar 2 lotes com validades diferentes, lançar saída parcial e verificar saldos | Lote mais próximo do vencimento é consumido primeiro |
| CT02 | Alerta de lote vencido e baixa rápida por perda no DOM | integração (Happy DOM) | CA03 | Carregar `estoque.js` com lote vencido e acionar botão de baixa por perda | Movimento `perda` criado e lote zerado |
| CT03 | Cálculo de CMD 30d, autonomia e sugestão de cobertura com modo espetáculo | unit / integração | CA04, CA05 | Executar funções de `stock-purchase.js` com histórico de 30 dias e cobertura de 14 dias | Quantidade sugerida e autonomia calculadas com exatidão |

## URL Complementar

- Origem do requisito P2: [CAF-000074](CONCLUIDAS/CAF-000074-correcao-estoque-ficha-tecnica-e-lista-de-compras.md) (seção "Considerado para o futuro (P2)")
