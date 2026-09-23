# CAF-000013 — [PDV] [Banco] Taxa de serviço e desconto manual

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| PDV + banco | 🟢 Baixa | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir aplicar taxa de serviço opcional e desconto manual no fechamento da conta.
- **Por que é necessário:** hoje o único desconto possível vem das promoções do dia, calculadas no banco. Não há como dar um desconto pontual (cliente frequente, reclamação, funcionário) nem cobrar os 10% de serviço, se o café adotar a prática.
- **Qual valor será agregado:** flexibilidade no atendimento com controle: todo desconto manual tem motivo e responsável.
- **Para quem é destinado:** baristas (taxa de serviço) e admin (desconto manual).

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Configuração no admin: taxa de serviço ativa/inativa e percentual padrão (ex.: 10%).
- [ ] No fechamento: taxa de serviço sugerida, com opção de remover (cliente pode recusar).
- [ ] Desconto manual em R$ ou % sobre a conta, com motivo obrigatório.
- [ ] Desconto manual só por `admin`, ou por barista mediante PIN/senha do admin (definir).
- [ ] Gravar em colunas próprias (`taxa_servico`, `desconto_manual`, `desconto_motivo`, `desconto_por`) no fechamento, sem alterar `pedidos.total` dos itens.
- [ ] Cupom final mostra subtotal, descontos, taxa de serviço e total.

### Requisitos não funcionais
- [ ] Taxa de serviço calculada sobre o valor após descontos (confirmar com o cliente).
- [ ] Desconto manual não pode deixar a conta negativa.

### Dependências técnicas
- [CAF-000002](CAF-000002-fechamento-de-conta-da-mesa.md) (tela e tabela de fechamento).
- `js/admin/settings.js` para a configuração.

### Recursos necessários
- Decisão do cliente sobre a taxa de serviço e quem pode dar desconto.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** a taxa de 10% está ativa e a conta é R$ 50,00, **quando** o barista abre o fechamento, **então** vê R$ 5,00 de serviço e total de R$ 55,00.
- [ ] **Dado que** o cliente recusou a taxa, **quando** o barista a remove, **então** o total volta a R$ 50,00.
- [ ] **Dado que** o admin aplica 10% de desconto com motivo "cliente frequente", **quando** confirma, **então** o desconto é gravado com motivo e usuário.
- [ ] **Dado que** um barista sem permissão tenta dar desconto, **quando** confirma, **então** o sistema pede autorização do admin.

---

## O que a atividade não inclui

- Distribuição da taxa de serviço entre funcionários.
- Cupons de desconto digitados pelo cliente.

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Taxa padrão | Conta R$ 50 com 10% | R$ 55 |
| 2 | Remover taxa | Remover no fechamento | R$ 50 |
| 3 | Desconto em R$ | Admin dá R$ 5 | Total com −R$ 5 |
| 4 | Desconto em % | Admin dá 10% | Total com −10% |
| 5 | Sem motivo | Desconto sem motivo | Bloqueado |
| 6 | Sem permissão | Barista tenta desconto | Pede PIN do admin |
| 7 | Negativo | Desconto maior que a conta | Recusado |
| 8 | Com promoção | Conta com promo + desconto manual | Ambos aparecem no cupom |

---

## URL Complementar

- Requisito original: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md) · item 13
- Regras de promoção: [TAREFAS.md](TAREFAS.md) · seção 7
- Código: `js/admin/settings.js`
