# [FEAT] DRE Gerencial Automático, Conciliação de Recebíveis de Cartão/Pix e Meta de Vendas por Turno/Espetáculo

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-11-06

## Detalhes da Atividade

- **O que precisa ser feito:**
  Implementar no painel Admin (`js/admin/financeiro-admin.js` e `js/admin/relatorios-admin.js`) o **DRE Gerencial Automático (Demonstrativo de Resultado do Exercício)**, o **Calendário de Recebíveis / Conciliação de Taxas** (previsto como P2 na [CAF-000079](CONCLUIDAS/CAF-000079-pix-no-admin-e-taxas-no-fechamento-de-caixa.md)) e o **Indicador de Meta Diária / Dia de Espetáculo**:
  1. **DRE Gerencial Mensal e por Período:** Consolidar automaticamente a partir dos dados reais do sistema:
     - `(+) Receita Operacional Bruta` (Vendas pagas de balcão, mesas, totem e online)
     - `(-) Descontos, Cupons e Cortesias Concedidas`
     - `(-) Taxas de Meios de Pagamento (Maquininha / Cartão / Pix)`
     - `(=) Receita Operacional Líquida`
     - `(-) CMV Real (Custo da Mercadoria Vendida das Fichas Técnicas + Perdas de Estoque)`
     - `(=) Lucro Bruto / Margem de Contribuição (R$ e %)`
     - `(-) Despesas Operacionais (Fixas e Variáveis por Categoria de despesas)`
     - `(=) Resultado Operacional Líquido (EBITDA / Lucro ou Prejuízo do Período em R$ e %)`
  2. **Previsão de Recebíveis e Conciliação de Taxas (`formas_pagamento_taxas.prazo_recebimento_dias`):** Como vendas no débito (`D+1`) e crédito (`D+30`) possuem prazo de liquidação configurado em `formas_pagamento_taxas`, exibir quanto a cafeteria tem a receber em conta bancária hoje, nos próximos 7 dias e nos próximos 30 dias já líquido de taxas, permitindo conciliar divergências com a adquirente.
  3. **Meta Diária e Meta de Dia de Espetáculo:** Permitir configurar a meta de faturamento de dia normal e de dia de espetáculo, exibindo a barra de atingimento (%) em tempo real no topo do Financeiro/Relatórios.
- **Problema e evidência:**
  Hoje o sistema possui todas as peças isoladas: vendas (`pedidos` / `fechamentos`), taxas congeladas (`taxa_valor` e `prazo_recebimento_dias` na CAF-000039/079), CMV congelado no item (`custo_unitario` na CAF-000032/074), perdas de estoque (`estoque_movimentos`) e contas a pagar (`despesas` na CAF-000035/078). Contudo, o administrador ainda não tem uma tela de **DRE Gerencial unificado** que cruze Receita Líquida − CMV − Despesas para responder instantaneamente: *"Qual foi o lucro líquido real da cafeteria neste mês?"* nem um painel de quando o dinheiro do cartão de crédito cairá efetivamente na conta (`prazo_recebimento_dias`).
- **Impacto de não fazer:**
  Necessidade de exportar múltiplas planilhas (vendas, CMV e despesas) para montar o DRE manualmente no Excel e falta de visibilidade do fluxo de recebimento líquido das vendas em cartão (`D+1` e `D+30`).
- **Para quem é destinado:**
  Proprietários, gerência financeira e administração da Cafeteria do Teatro.
- **História de usuário:**
  Como administrador da cafeteria, quero visualizar o DRE Gerencial automático do mês (Receita Bruta, Taxas, CMV, Despesas e Lucro Líquido), o calendário de recebíveis líquidos de cartão e o progresso da meta do dia, para tomar decisões financeiras rápidas sem depender de planilhas externas.
- **Como saberemos que deu certo:**
  1. Aba/seção "DRE & Metas" no Financeiro/Relatórios exibindo a cascata completa de Receita Bruta até Resultado Líquido com percentuais verticais (`AV%`) e exportação CSV/impressão.
  2. Painel de Recebíveis projetando os valores líquidos por data estimada de depósito (`created_at + prazo_recebimento_dias`).
  3. Barra de progresso da Meta do Dia (normal vs. espetáculo) calculada com fuso `America/Sao_Paulo`.
  4. 100% dos testes passando em `npm test`, `npm run test:db` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar utilitário e/ou RPC `obter_dre_gerencial(p_inicio, p_fim, p_regime)` que consolide Receita Bruta, Descontos/Cupons, Taxas de Pagamento, Receita Líquida, CMV (itens vendidos + perdas de estoque), Margem de Contribuição, Despesas por categoria (regime de competência por `vencimento` ou caixa por `pago_em`) e Resultado Líquido | P0 | CA01, CA02 |
| RF02 | Renderizar a tabela estruturada do DRE Gerencial no Admin (`financeiro-admin.js`) com análise vertical (`% sobre Receita Bruta`), alternância entre Regime de Caixa e Regime de Competência e botão de exportação CSV | P0 | CA01, CA02, CA05 |
| RF03 | Calcular e exibir o painel de **Recebíveis Futuros e Conciliação de Taxas** projetando a data de liquidação (`data_venda + prazo_recebimento_dias` de `formas_pagamento_taxas`) para vendas em Pix/Dinheiro (`D+0`), Débito (`D+1`) e Crédito (`D+30`) | P0 | CA03 |
| RF04 | Permitir configurar `meta_faturamento_dia_normal` e `meta_faturamento_dia_espetaculo` em `configuracoes_sistema` e exibir barra de progresso do dia operacional atual (`America/Sao_Paulo`) | P1 | CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Acesso estritamente protegido por RLS/permissão (`get_user_role() = 'admin' OR tem_permissao('admin.financeiro')`) | P0 | CA01 a CA05 |
| RNF02 | Cálculos monetários com arredondamento de 2 casas decimais sem erro de ponto flutuante e fuso horário `America/Sao_Paulo` | P0 | Todos |

### Dependências técnicas

- `supabase/migration_caf_000032_ficha_tecnica.sql` (CMV congelado em `pedido_itens.custo_unitario`)
- `supabase/migration_caf_000035_financeiro_despesas.sql` (`despesas` e `despesa_categorias`)
- `supabase/migration_caf_000039_pix_taxas.sql` (`formas_pagamento_taxas` e `taxa_valor`)
- `js/admin/financeiro-admin.js`, `js/admin/relatorios-admin.js`

### Recursos necessários

- N/A.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um período com R$ 10.000,00 de vendas brutas pagas, R$ 200,00 de descontos, R$ 180,00 de taxas de cartão, R$ 3.120,00 de CMV (fichas técnicas + perdas) e R$ 4.000,00 de despesas operacionais, quando o administrador consultar o DRE Gerencial, então o sistema exibe `Receita Líquida = R$ 9.620,00`, `Margem de Contribuição = R$ 6.500,00 (65,0%)` e `Resultado Líquido = R$ 2.500,00 (25,0%)`.
- [x] **CA02:** Dado o filtro de regime no DRE Gerencial, quando o administrador alternar entre **Regime de Caixa** (`despesas.pago_em`) e **Regime de Competência** (`despesas.vencimento`), então as linhas de despesas e o Resultado Líquido são recalculados imediatamente conforme o regime escolhido.
- [x] **CA03:** Dado uma venda de R$ 100,00 no Cartão de Crédito com taxa de `3,10%` e `prazo_recebimento_dias = 30`, quando consultado o painel de Recebíveis e Conciliação, então o sistema projeta um recebimento líquido de `R$ 96,90` para `data_venda + 30 dias`.
- [x] **CA04:** Dado que hoje está com o Modo Dia de Espetáculo ativo e a meta de espetáculo é R$ 3.000,00, quando as vendas do dia atingirem R$ 1.500,00, então o indicador de meta exibe `50%` da meta de espetáculo atingida.
- [x] **CA05:** Dado o DRE Gerencial carregado na tela, quando o administrador clicar em "Exportar DRE (CSV)", então é gerado um arquivo CSV com UTF-8 BOM contendo todas as linhas do demonstrativo e seus respectivos valores e percentuais.

## O que a atividade não inclui

- Emissão de balanço patrimonial contábil fiscal (SPED/ECD): motivo: o módulo tem finalidade gerencial interna para tomada de decisão.

### Considerado para o futuro (P2)

- Importação de arquivo OFX/CSV do extrato bancário para conciliação automática linha a linha.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O lançamento automático de taxas em `despesas` (`lancar_taxas_pagamento_despesa`) deve ser excluído da linha de "Despesas Operacionais" do DRE para não descontar a taxa duas vezes? | dev | Não | Sim! Como as taxas de meios de pagamento já são deduzidas na linha `(-) Taxas de Pagamento` para formar a Receita Líquida, o DRE ignora despesas geradas automaticamente de taxas na linha de Despesas Operacionais para evitar dupla contagem. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cálculo completo do DRE Gerencial (Caixa vs. Competência) sem dupla contagem de taxas | unit / integração | CA01, CA02 | Executar cálculo de DRE com fixture de vendas, taxas, CMV, perdas e despesas | Valores de Receita Líquida, Margem e Lucro Líquido exatos |
| CT02 | Projeção de recebíveis por prazo (`D+0`, `D+1`, `D+30`) | unit / integração | CA03 | Informar pagamentos em dinheiro, débito e crédito e projetar calendário | Datas e valores líquidos (`valor - taxa`) corretos |
| CT03 | Renderização da barra de meta (Dia Normal × Dia de Espetáculo) e exportação CSV | integração (Happy DOM) | CA04, CA05 | Carregar tela financeira no Happy DOM, alternar modo espetáculo e exportar CSV | Barra atualizada e CSV válido com BOM |

## URL Complementar

- Origem do requisito P2: [CAF-000079](CONCLUIDAS/CAF-000079-pix-no-admin-e-taxas-no-fechamento-de-caixa.md) e [CAF-000032](CONCLUIDAS/CAF-000032-ficha-tecnica-custo-e-cmv.md)
