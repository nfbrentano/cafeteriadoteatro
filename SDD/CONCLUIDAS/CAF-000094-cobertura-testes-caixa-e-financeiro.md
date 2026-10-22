# [CHORE] CAF-000094 — Cobertura de Testes Unitários: Fechamento de Caixa e Financeiro

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** PO (Natanael) · **Criada em:** 2026-10-22 · **Atualizada em:** 2026-10-22

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  Implementar uma suíte de testes unitários e funcionais abrangente para os módulos administrativos de Caixa (`js/admin/caixa-admin.js`) e Financeiro/Contas a Pagar (`js/admin/financeiro-admin.js`). Os testes devem validar a lógica de abertura de caixa, cálculo de quebra/sobra na conferência cega por cédulas/moedas, registro de sangrias e suprimentos, além de classificação de despesas e geração de indicadores do fluxo de caixa e DRE gerencial.

- **Problema e evidência:**
  Ambos os arquivos totalizam mais de 2.050 linhas de código e registram **0% de cobertura** nos relatórios de testes. Os cálculos de quebra de caixa, estorno de sangria e soma de contas a pagar dependem de regras estritas de centavos e estados de formulários do painel que atualmente só são testados manualmente em produção.

- **Impacto de não fazer:**
  Erros silenciosos na contagem cega de caixa podem ocultar desvios ou diferenças financeiras no turno; falhas no módulo financeiro podem distorcer o fluxo de caixa, relatórios de contas vencidas e compromissos com fornecedores.

- **Para quem é destinado:**
  Gerente da cafeteria, operadores de caixa e setor administrativo/financeiro.

- **História de usuário:**
  Como gerente da cafeteria, quero testes automatizados cobrindo a abertura, sangria, fechamento cego de caixa e lançamentos de despesas a pagar, para garantir que os valores informados pelos caixas batam com precisão matemática ao centavo e os relatórios financeiros permaneçam confiáveis.

- **Como saberemos que deu certo:**
  1. Suíte `tests/caf-000094-caixa-financeiro.test.js` criada cobrindo todos os cenários funcionais com dados simulados em `happy-dom`.
  2. 100% dos testes aprovados em `npm test`.
  3. `npm run build` executando sem erros.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RF01 | Testar o fluxo de abertura de turno de caixa, validando valor inicial de troco (suprimento de gaveta) e bloqueio de reabertura quando já houver caixa aberto. | P0 | CA01, CA02 |
| RF02 | Testar a movimentação de caixa (suprimento adicional e sangria de dinheiro), garantindo validação de justificativa, limites e dedução correta do saldo físico. | P0 | CA03, CA04 |
| RF03 | Testar o fechamento de caixa cego com contagem por cédulas e moedas, apurando diferenças de caixa (falta/sobra) contra o valor apurado pelo sistema. | P0 | CA05, CA06 |
| RF04 | Testar a conciliação de pagamentos por forma (dinheiro, pix, cartões de crédito/débito e fiado/conta cliente), aplicando as respectivas taxas de desconto. | P0 | CA07 |
| RF05 | Testar a inclusão, edição e liquidação de despesas a pagar no módulo financeiro, validando datas de vencimento, status (pago vs pendente) e categorias de custo. | P0 | CA08, CA09 |
| RF06 | Testar a consolidação do fluxo de caixa (entradas de vendas vs saídas de despesas) e cálculo de resultado operacional no período. | P1 | CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RNF01 | Precisão decimal estrita em moeda BRL (valores em centavos inteiros nos cálculos internos para evitar dízimas periódicas de ponto flutuante). | P0 | CA05, CA07 |
| RNF02 | Execução isolada com mocks de DOM e de chamadas do cliente Supabase. | P0 | CA11 |

### Dependências técnicas

- `js/admin/caixa-admin.js`
- `js/admin/financeiro-admin.js`
- `js/utils/caixa-calculos.js`
- `js/utils/despesa-mapper.js`

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o caixa está fechado, quando o operador inicia um novo turno com suprimento de R$ 150,00, então o estado transita para "Aberto" e o saldo inicial de gaveta é gravado com precisão.
- [x] **CA02:** Dado que já existe um caixa aberto para o operador, quando tenta-se abrir um segundo caixa simultâneo, então o sistema rejeita a operação com mensagem de bloqueio.
- [x] **CA03:** Dado que o caixa está aberto, quando é lançada uma sangria de R$ 200,00 com motivo obrigatório, então o registro de movimentação é computado e reduz o saldo em dinheiro da gaveta.
- [x] **CA04:** Dado que uma sangria é informada sem justificativa ou com valor negativo/zero, então o formulário barra o envio e exibe alerta de validação.
- [x] **CA05:** Dado o fechamento cego de caixa, quando o operador preenche as quantidades de cada cédula (ex: 2x R$ 100, 3x R$ 50, 10x R$ 1,00 = R$ 360,00), então o total físico apurado soma R$ 360,00.
- [x] **CA06:** Dado que o valor esperado pelo sistema em dinheiro era R$ 350,00 e o operador contou R$ 360,00, quando o fechamento é concluído, então registra sobra de caixa de R$ +10,00; se contou R$ 340,00, registra quebra de R$ -10,00.
- [x] **CA07:** Dado um fechamento com vendas em dinheiro, pix e cartões, quando as taxas configuradas são aplicadas, então os valores líquidos repassados batem com os cálculos oficiais de `caixa-calculos.js`.
- [x] **CA08:** Dado o cadastro de uma nova despesa a pagar no financeiro, quando são preenchidos valor, vencimento, categoria e fornecedor, então a conta é listada como "Pendente" e soma no KPI de contas do mês.
- [x] **CA09:** Dado que uma despesa pendente é marcada como paga, quando a data e forma de pagamento são informadas, então o status muda para "Pago" e o valor é abatido do resultado operacional do DRE.
- [x] **CA10:** Dado o filtro de período financeiro, quando há receitas e despesas lançadas, então a diferença (Receitas - Despesas Pagas) reflete o resultado financeiro líquido exato.
- [x] **CA11:** Todos os cenários são validados na suíte `tests/caf-000094-caixa-financeiro.test.js`, com `npm test` e `npm run build` passando com 100% de sucesso.

---

## O que a atividade não inclui

- Integração direta com maquininhas de cartão físicas / TEF ou Open Finance bancário (mantido escopo de conciliação gerencial da cafeteria).
- Emissão de notas fiscais de despesa (NFS-e de compras).
