# [CHORE] CAF-000097 — Cobertura de Testes Unitários: Gestão de Clientes, Fiado e Produtos

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** PO (Natanael) · **Criada em:** 2026-10-22 · **Atualizada em:** 2026-10-22

---

## Detalhes da Atividade

- **O que precisa ser feito:**
  Implementar uma suíte de testes unitários e funcionais cobrindo o gerenciamento administrativo de clientes e CRM (`js/admin/clientes-admin.js`), controle de saldo pós-pago/fiado e créditos pré-pagos, além do catálogo e cadastro de produtos (`js/admin/products.js`). A suíte deve validar limites de crédito, quitação de dívidas de clientes, segmentação por perfil de consumo e integridade no cadastro/edição de produtos e preços.

- **Problema e evidência:**
  `js/admin/clientes-admin.js` (1.812 linhas) e `js/admin/products.js` (909 linhas) representam uma parcela crucial da gestão da cafeteria, mas atualmente possuem **0% de cobertura de código**. Erros no cálculo do saldo devedor do fiado podem gerar perdas financeiras irrecuperáveis, enquanto falhas no cadastro de produtos podem disponibilizar itens com preços zerados ou grupos de adicionais corrompidos.

- **Impacto de não fazer:**
  Risco de clientes ultrapassarem o limite autorizado de fiado, divergências entre o extrato do cliente e o saldo do banco, e inconsistências na precificação ou disponibilidade de produtos no cardápio público e PDV.

- **Para quem é destinado:**
  Gerência da cafeteria, administradores e operadores responsáveis pelo fechamento de contas de clientes fidelizados.

- **História de usuário:**
  Como gerente, quero ter certeza de que o saldo em conta dos clientes, os limites de fiado e a precificação dos produtos são validados com testes automatizados, para evitar prejuízos na cobrança e manter o cardápio sempre consistente.

- **Como saberemos que deu certo:**
  1. Suíte `tests/caf-000097-clientes-produtos.test.js` criada e testando os fluxos reais de clientes, saldo em conta e catálogo de produtos.
  2. 100% dos testes aprovados em `npm test`.
  3. `npm run build` executando com 100% de sucesso.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RF01 | Testar o cadastro e atualização de dados de clientes (nome, telefone com máscara brasileira, CPF e limites de crédito). | P0 | CA01, CA02 |
| RF02 | Testar o controle de conta fiado: lançamento de débito na compra, validação do teto de limite e bloqueio quando o limite for excedido. | P0 | CA03, CA04 |
| RF03 | Testar a quitação (pagamento de fatura de fiado) parcial ou total em dinheiro/pix/cartão, recalculando o saldo devedor e emitindo recibo. | P0 | CA05 |
| RF04 | Testar a segmentação automática de clientes por frequência e valor (tags CRM: Novo, Frequente, VIP, Em Risco). | P1 | CA06 |
| RF05 | Testar o cadastro e edição de produtos, validando campos obrigatórios (nome, categoria, preço > 0) e sanitização anti-XSS. | P0 | CA07, CA08 |
| RF06 | Testar a alteração rápida de disponibilidade de produtos (marcar como esgotado / pausado), refletindo no PDV e cardápio. | P0 | CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|:---:|---|
| RNF01 | Cálculos de saldo devedor e pagamentos em centavos inteiros com precisão absoluta. | P0 | CA03, CA05 |
| RNF02 | Sanitização rigorosa de entradas de texto nos formulários de cadastro. | P0 | CA08 |

### Dependências técnicas

- `js/admin/clientes-admin.js`
- `js/admin/products.js`
- `js/utils/crm-segmentos.js`

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um formulário de cliente com nome "Maria Silva" e telefone "(51) 98765-4321", quando submetido com dados válidos, então o cliente é cadastrado com saldo inicial devedor de R$ 0,00 e limite padrão.
- [x] **CA02:** Dado que o operador tenta cadastrar um cliente sem telefone ou sem nome, então a validação impede o envio e destaca os campos obrigatórios.
- [x] **CA03:** Dado um cliente com limite de fiado de R$ 100,00 e saldo devedor atual de R$ 60,00, quando é lançado um consumo de R$ 30,00, então o débito é autorizado e o novo saldo devedor passa para R$ 90,00.
- [x] **CA04:** Dado o mesmo cliente com saldo devedor de R$ 90,00, quando tenta-se lançar um pedido de R$ 25,00 (totalizando R$ 115,00), então o sistema bloqueia a venda a prazo por exceder o limite de R$ 100,00.
- [x] **CA05:** Dado um cliente com dívida de R$ 90,00, quando é feito um pagamento parcial de R$ 50,00 via Pix, então o saldo devedor restante é reduzido para R$ 40,00 e o registro de entrada financeira é criado.
- [x] **CA06:** Dado o histórico de compras de clientes, quando o algoritmo de segmentação CRM classifica a carteira, então clientes com compras frequentes e ticket elevado recebem a tag "VIP" de acordo com as regras de `crm-segmentos.js`.
- [x] **CA07:** Dado o formulário de cadastro de produto, quando o preço de venda é informado como R$ 0,00 ou negativo, então a validação rejeita o produto e impede a gravação.
- [x] **CA08:** Dado um produto com descrição contendo tags HTML (`<b>`, `<script>`), quando salvo e renderizado no catálogo, então o conteúdo é sanitizado prevenindo injeções de script.
- [x] **CA09:** Dado um produto com estoque ativo, quando o operador aciona a chave "Pausar Produto / Esgotado", então o status `ativo` passa para `false` e o item é sinalizado como indisponível para pedidos no PDV.
- [x] **CA10:** Suíte `tests/caf-000097-clientes-produtos.test.js` implementada e passando com 100% de sucesso junto aos comandos `npm test` e `npm run build`.

---

## O que a atividade não inclui

- Consulta automatizada a birôs de crédito (Serasa/SPC) para consulta de CPF de clientes.
- Sistema de controle de fidelidade por pontos com parceiros externos.
