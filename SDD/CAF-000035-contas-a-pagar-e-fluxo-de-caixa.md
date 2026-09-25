# CAF-000035 — [Admin] [Financeiro] Contas a pagar, despesas e fluxo de caixa

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin + banco | 🟡 Média | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar o módulo financeiro de saída:
  1. Cadastro de **despesas / contas a pagar** (fornecedor, categoria, valor, vencimento, forma de pagamento, recorrência), com baixa de pagamento.
  2. Cadastro simples de **fornecedores**.
  3. Tela de **fluxo de caixa** (entradas das vendas × saídas das despesas, realizado e previsto) e um **resultado mensal** simplificado (faturamento − CMV − despesas).
- **Por que é necessário:** o sistema registra só as entradas (vendas, fechamentos e caixa do dia). Aluguel, fornecedores de café, energia e salários ficam em planilha ou caderno, e não há como saber se o mês fechou no azul. A sangria da [CAF-000015](CONCLUIDAS/CAF-000015-fechamento-de-caixa-do-dia.md) registra que o dinheiro saiu da gaveta, mas não para onde foi.
- **Qual valor será agregado:** nenhuma conta vence esquecida, e o dono passa a ver o lucro do mês no mesmo sistema das vendas.
- **Para quem é destinado:** administração.

### Referência de mercado

- **Kyte:** fluxo de caixa ("entra mais dinheiro do que sai?") e controle de gastos / contas a pagar.
- **Jarbas:** contas a pagar e relatório de despesas por categoria.
- **Simpliza:** contas a pagar e a receber, taxas de cartão, fluxo de caixa e DRE.
- **Garfo:** relatório de fluxo de caixa e lucro real.
- **Suitable:** entradas e saídas por categoria, DRE, DFC, CMV e contas bancárias de destino por forma de pagamento. Fonte: https://suitable.com.br/produto/financeiro/

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Tabela `fornecedores (id, nome, documento, telefone, email, observacoes, ativo)`.
- [ ] Tabela `despesa_categorias (id, nome, tipo ['fixa','variavel'])` com carga inicial: Aluguel, Energia, Água, Internet, Salários, Fornecedores/Insumos, Manutenção, Impostos, Taxas de cartão, Outros.
- [ ] Tabela `despesas (id, descricao, fornecedor_id, categoria_id, valor, vencimento DATE, pago_em DATE, valor_pago, forma_pagamento, origem ['manual','sangria','estoque'], caixa_movimento_id, estoque_movimento_id, recorrencia ['nenhuma','mensal'], observacoes, anexo_url, criado_por)`.
- [ ] Recorrência mensal: ao pagar/avançar o mês, gera a próxima parcela automaticamente.
- [ ] Integração:
  - Sangria do caixa pode ser marcada como despesa (categoria + descrição), gerando `origem = 'sangria'` já paga.
  - Entrada de estoque com custo ([CAF-000031](CAF-000031-controle-de-estoque.md)) oferece "Lançar conta a pagar" com o valor total.
- [ ] Nova aba **"Financeiro"** no admin:
  - "A pagar": vencidas (🔴), vencem em 7 dias (🟠), futuras; ação "Pagar" com data e forma.
  - "Fluxo de caixa": por dia/semana/mês, entradas (vendas pagas + recebimentos da [CAF-000034](CAF-000034-conta-do-cliente-fiado-e-creditos.md)) × saídas (despesas pagas), saldo acumulado e previsão com as contas em aberto.
  - "Resultado do mês": faturamento − descontos − CMV ([CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md), quando existir) − despesas por categoria = resultado.
- [ ] Anexo de comprovante/boleto (Supabase Storage, bucket privado).
- [ ] Aviso no painel inicial do admin: "3 contas vencem esta semana (R$ 1.240,00)".
- [ ] Exportação CSV ([CAF-000016](CONCLUIDAS/CAF-000016-exportar-csv.md)).

### Requisitos não funcionais
- [ ] **Permissão:** só `admin` lê e escreve (RLS). Baristas não veem despesas.
- [ ] **Auditoria:** edição e exclusão de despesa paga registradas com usuário e motivo.
- [ ] **Anexos:** URLs assinadas com validade curta; nada público.

### Dependências técnicas
- `caixa_movimentos` (`supabase/migration_caf_000025_caixa.sql`), `get_admin_reports` (`supabase/migration_caf_000024_relatorios.sql`).
- Opcional: [CAF-000031](CAF-000031-controle-de-estoque.md), [CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md), [CAF-000039](CAF-000039-pix-qr-code-e-taxas-de-pagamento.md) (taxas de cartão como despesa).

### Recursos necessários
- Lista de despesas fixas do negócio e categorias desejadas pelo cliente.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o aluguel de R$ 2.000 vence dia 10 e é recorrente, **quando** o admin marca como pago, **então** a conta do mês seguinte é criada automaticamente.
- [ ] **Dado que** há uma conta vencida, **quando** o admin abre o painel, **então** vê o aviso com a quantidade e o total.
- [ ] **Dado que** o barista faz uma sangria de R$ 50 para comprar gelo, **quando** marca como despesa "Insumos", **então** ela aparece paga no fluxo de caixa.
- [ ] **Dado que** o mês teve R$ 20 mil em vendas e R$ 14 mil em despesas, **quando** o admin abre "Resultado do mês", **então** vê R$ 6 mil de resultado (antes do CMV, se não houver ficha técnica).
- [ ] **Dado que** um usuário `barista` consulta `despesas`, **quando** faz a requisição, **então** recebe acesso negado.

---

## O que a atividade não inclui

- Conciliação bancária / integração com banco (OFX, Open Finance).
- Emissão de boletos e contas a receber de terceiros (além da [CAF-000034](CAF-000034-conta-do-cliente-fiado-e-creditos.md)).
- DRE contábil completo, impostos e folha de pagamento.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Nova conta | Cadastrar despesa com vencimento | Aparece em "A pagar" |
| 2 | Pagar | Pagar com data e forma | Sai de "A pagar", entra no fluxo |
| 3 | Recorrência | Pagar conta mensal | Próxima criada |
| 4 | Vencida | Vencimento ontem | Selo vermelho + aviso |
| 5 | Sangria → despesa | Marcar sangria | Despesa paga vinculada |
| 6 | Fluxo | Período com vendas e despesas | Saldos corretos |
| 7 | Anexo | Subir PDF | Acessível só por URL assinada |
| 8 | Permissão | Barista tenta ler | Negado |

---

## URL Complementar

- Código relacionado: `js/admin/caixa-admin.js`, `js/admin/relatorios-admin.js`, `supabase/migration_caf_000025_caixa.sql`
- Análise de mercado: [ANALISE_CONCORRENTES_GESTAO.md](ANALISE_CONCORRENTES_GESTAO.md)
- Simpliza — administrativo: https://simpliza.com.br/administrativo.php · Kyte: https://www.kyteapp.com/pt
