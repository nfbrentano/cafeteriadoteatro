# CAF-000012 — [PDV] Dividir conta

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV | 🟢 Baixa | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** no fechamento da conta, permitir dividir o valor igualmente entre pessoas ou por item consumido.
- **Por que é necessário:** grupos no teatro costumam pagar separado. Sem divisão, o barista faz a conta de cabeça ou na calculadora, o que atrasa o atendimento e gera erros.
- **Qual valor será agregado:** fechamento rápido e sem erro para grupos, com cada pagamento registrado separadamente.
- **Para quem é destinado:** baristas e clientes.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Na tela de fechamento: opção "Dividir igualmente" com número de pessoas; mostra o valor por pessoa (centavos de sobra vão para a primeira parte).
- [ ] Opção "Dividir por item": cada parte seleciona os itens que consumiu; itens podem ser divididos entre partes.
- [ ] Cada parte registra seu pagamento com forma própria, usando a tabela de pagamentos da [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md).
- [ ] Mostrar o que falta pagar enquanto as partes são registradas.
- [ ] Imprimir um cupom por parte (opcional).

### Requisitos não funcionais
- [ ] A soma das partes deve ser exatamente o total da conta (sem perder centavos).

### Dependências técnicas
- Depende da [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md) (tabela de pagamentos e fluxo de fechamento).

### Recursos necessários
- Nenhum além da CAF-000002.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a conta é R$ 100,00, **quando** o barista divide igualmente por 3, **então** as partes são R$ 33,34, R$ 33,33 e R$ 33,33.
- [ ] **Dado que** Ana consumiu um café e Beto um baguete, **quando** o barista divide por item, **então** cada um paga só o que consumiu.
- [ ] **Dado que** duas partes já pagaram, **quando** o barista olha a tela, **então** vê quanto falta e quem falta pagar.
- [ ] **Dado que** todas as partes pagaram, **quando** a última é registrada, **então** a conta fecha e a mesa fica livre.

---

## O que a atividade não inclui

- Taxa de serviço por pessoa ([CAF-000013](CAF-000013-taxa-de-servico-e-desconto-manual.md)).
- Pagamento parcial em dias diferentes ("pendura").

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Igual exato | R$ 90 por 3 | 3 × R$ 30,00 |
| 2 | Igual com centavos | R$ 100 por 3 | 33,34 + 33,33 + 33,33 |
| 3 | Por item | 2 pessoas, itens distintos | Cada uma paga o seu |
| 4 | Item compartilhado | 1 crepe dividido por 2 | Metade para cada |
| 5 | Formas diferentes | Parte 1 PIX, parte 2 dinheiro | 2 pagamentos gravados |
| 6 | Faltando | Registrar 2 de 3 partes | Mostra valor restante |
| 7 | Promoção | Conta com desconto | Divide o total já com desconto |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 12
- Relacionada: [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md)
