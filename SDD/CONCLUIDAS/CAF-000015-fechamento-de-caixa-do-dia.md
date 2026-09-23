# CAF-000015 — [Admin] Fechamento de caixa do dia

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin | 🟡 Média | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** criar a abertura e o fechamento de caixa, comparando o que o sistema registrou com o que foi contado em dinheiro e nas maquininhas.
- **Por que é necessário:** hoje não existe controle de caixa: o faturamento do dia aparece só como KPI, sem separação por forma de pagamento nem conferência. Diferenças de caixa não são percebidas.
- **Qual valor será agregado:** conferência diária confiável, detecção de diferenças e histórico dos fechamentos.
- **Para quem é destinado:** admin e barista responsável pelo turno.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Abertura de caixa: data, responsável e fundo de troco.
- [ ] Durante o dia: sangrias e suprimentos (retirada/entrada de dinheiro) com motivo.
- [ ] Fechamento: totais do sistema por forma de pagamento × valor contado informado, com diferença destacada.
- [ ] Alerta de mesas com pedidos não pagos antes de fechar.
- [ ] Impressão do resumo do dia (reaproveitar `js/pedido-print.js`).
- [ ] Histórico de fechamentos com filtro por data.
- [ ] Tabelas `caixas (id, aberto_em, aberto_por, fundo_troco, fechado_em, fechado_por, observacoes)` e `caixa_movimentos (caixa_id, tipo, valor, motivo)`.

### Requisitos não funcionais
- [ ] Só um caixa aberto por vez.
- [ ] Caixa fechado não pode ser editado (só admin reabre, com registro).

### Dependências técnicas
- [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md) (pagamentos por forma).

### Recursos necessários
- Definição com o cliente: um caixa por dia ou por turno.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o caixa abriu com R$ 100,00 de troco e o sistema registrou R$ 350,00 em dinheiro, **quando** o responsável conta R$ 445,00, **então** o fechamento mostra diferença de −R$ 5,00.
- [ ] **Dado que** houve sangria de R$ 200,00, **quando** o caixa é fechado, **então** o esperado em dinheiro desconta a sangria.
- [ ] **Dado que** a mesa 3 tem pedido não pago, **quando** o responsável tenta fechar, **então** o sistema avisa e lista a mesa.
- [ ] **Dado que** já existe um caixa aberto, **quando** alguém tenta abrir outro, **então** o sistema recusa.

---

## O que a atividade não inclui

- Integração com maquininha ou banco para conciliação automática.
- Emissão fiscal.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Sem diferença | Contado = esperado | Diferença R$ 0,00 |
| 2 | Falta | Contado menor | Diferença negativa em destaque |
| 3 | Sangria | Sangria de R$ 200 | Esperado ajustado |
| 4 | Mesa em aberto | Fechar com mesa não paga | Alerta com a mesa |
| 5 | Dois caixas | Abrir com um já aberto | Recusado |
| 6 | Caixa fechado | Editar após fechar | Bloqueado |
| 7 | Impressão | Imprimir resumo | Totais por forma de pagamento |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 15
- Relacionadas: [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md), [CAF-000014](CAF-000014-relatorios-no-admin.md)
