# [FEAT] Fechamento Parcial de Conta da Mesa: Pagamento por Item Selecionado ou Abatimento Parcial no PDV

> **Status:** Rascunho
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-10-29

## Detalhes da Atividade

- **O que precisa ser feito:**
  Implementar no PDV (`pedidos.html` / `js/pedidos.js` / `js/utils/conta-mesa.js`) e no banco de dados o **Fechamento Parcial de Mesa (Pagamento por Item ou Valor Parcial)**, mantendo a mesa aberta para os demais clientes que continuam consumindo:
  1. **Pagamento por Itens Selecionados ("Pagar Meus Itens"):** No modal de Fechamento de Conta da Mesa, permitir selecionar quais itens (ou quantidades parciais de um item, ex.: 1 de 3 Cappuccinos) o cliente que está saindo deseja pagar agora, calculando proporcionalmente a taxa de serviço opcional sobre os itens selecionados.
  2. **Abatimento por Valor Livre ("Abater Valor na Conta"):** Permitir que um integrante da mesa pague um valor fixo (ex.: "Vou deixar R$ 50,00 pagos no Pix e o resto a mesa fecha depois"), registrando o pagamento parcial vinculado à mesa e deduzindo o valor já pago do saldo remanescente da mesa.
  3. **Integração com Fechamento Final e Caixa:** Quando os últimos clientes da mesa pedirem a conta final, o modal exibe claramente: `Subtotal Geral (-) Já Pago Parcialmente (=) Saldo Restante a Pagar`, encerrando a mesa (`status_pagamento = 'pago'`) quando o saldo restante zerar.
- **Problema e evidência:**
  Hoje, a RPC `fechar_conta_mesa` (`supabase/migration_caf_000077_cupons_uso_unico.sql`) exige que `v_total_pago >= v_total_a_pagar` da mesa inteira e marca **todos** os pedidos da mesa como `pago` de uma só vez. Na rotina real da Cafeteria do Teatro, grupos de amigos ou espectadores sentam juntos na mesma mesa e frequentemente uma pessoa precisa ir embora antes (ou cada pessoa quer passar no balcão e pagar apenas o que consumiu). Sem fechamento parcial, o barista é obrigado a anotar em papel ou fazer contas manuais fora do sistema.
- **Impacto de não fazer:**
  Fila no caixa na saída de grupos, controles paralelos em papel para saber quem já pagou parte da mesa e impossibilidade de registrar o recebimento no caixa no momento exato em que o primeiro cliente da mesa paga e vai embora.
- **Para quem é destinado:**
  Baristas, operadores de caixa, garçons e clientes em mesas compartilhadas.
- **História de usuário:**
  Como barista no caixa, quero selecionar os itens específicos que um cliente da mesa está pagando (ou lançar um abatimento parcial de valor) sem encerrar o restante da mesa, para que o cliente possa ir embora com seu comprovante enquanto os demais continuam na mesa vendo apenas o saldo que falta pagar.
- **Como saberemos que deu certo:**
  1. Em uma mesa com R$ 100,00 de consumo, um cliente consegue pagar seus itens (ex.: R$ 35,00 no Cartão de Débito), o valor entra imediatamente no caixa do turno e a mesa continua aberta exibindo `Saldo restante: R$ 65,00`.
  2. Os itens já pagos ficam sinalizados como `Pago ✓` no extrato da mesa.
  3. Quando o restante da mesa paga os R$ 65,00 finais, a conta da mesa é encerrada por completo.
  4. 100% dos testes passando em `npm test`, `npm run test:db` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Adicionar suporte a pagamentos parciais na estrutura de fechamento (`pedido_itens.quantidade_paga` / `fechamentos.parcial` ou tabela de abatimentos da mesa) e criar/atualizar RPC `registrar_pagamento_parcial_mesa` com idempotência e cálculo automático de taxas de pagamento | P0 | CA01, CA02, CA03 |
| RF02 | No modal de Fechamento de Conta (`pedidos.html` / `js/pedidos.js`), adicionar modo **"Por Item / Parcial"** onde o operador pode marcar checkboxes/quantidades dos itens que estão sendo pagos agora ou informar um valor de abatimento parcial | P0 | CA01, CA02 |
| RF03 | Exibir no resumo da mesa (`modal-mesa` e `modal-fechar-conta`) os itens já quitados com badge `Pago ✓`, o total já amortizado e o **Saldo Restante a Pagar** | P0 | CA03, CA04 |
| RF04 | Atualizar `fechar_conta_mesa` para deduzir automaticamente os pagamentos parciais já realizados na sessão atual da mesa, encerrando os pedidos como `'pago'` quando o saldo restante for integralmente quitado | P0 | CA04 |
| RF05 | Garantir que `fn_calcular_totais_caixa_interno` contabilize os pagamentos parciais no momento em que são recebidos, sem duplicá-los no fechamento final da mesa | P0 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Idempotência obrigatória via `p_idempotency_key` para evitar duplo registro de pagamento parcial em oscilações de rede | P0 | CA01, CA02 |
| RNF02 | Emissão de comprovante/recibo individual (impressão ou WhatsApp) contendo apenas os itens/valores pagos naquela transação parcial | P1 | CA01 |

### Dependências técnicas

- `supabase/migration_caf_000077_cupons_uso_unico.sql` (`fechar_conta_mesa`)
- `supabase/migration_caf_000083_pendencias_operacao.sql` (`fn_calcular_totais_caixa_interno`)
- `js/pedidos.js`, `js/utils/conta-mesa.js`

### Recursos necessários

- N/A.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado que a Mesa 04 possui 2 Cappuccinos (R$ 12,00 cada) e 1 Torta (R$ 18,00), totalizando R$ 42,00, quando um cliente selecionar para pagar apenas `1 Cappuccino (R$ 12,00)` no Pix, então o pagamento parcial de R$ 12,00 é registrado, 1 unidade de Cappuccino fica marcada como paga e a Mesa 04 permanece aberta com saldo restante de R$ 30,00.
- [ ] **CA02:** Dado que a Mesa 04 possui saldo de R$ 80,00, quando um cliente optar por "Abater Valor Livre" de R$ 30,00 em Dinheiro, então o sistema registra o recebimento de R$ 30,00 e atualiza o saldo devedor da mesa para R$ 50,00.
- [ ] **CA03:** Dado uma tentativa de pagamento parcial com valor maior que o saldo restante da mesa (sem ser pagamento em dinheiro com troco) ou valor zero/negativo, quando o operador tentar confirmar, então o sistema bloqueia a operação com mensagem clara.
- [ ] **CA04:** Dado que a Mesa 04 tinha R$ 42,00 de consumo e já recebeu R$ 12,00 de pagamento parcial, quando o último cliente fechar a conta pagando os R$ 30,00 restantes, então todos os pedidos da mesa passam para `status_pagamento = 'pago'` e a mesa é liberada.
- [ ] **CA05:** Dado que uma mesa teve R$ 12,00 pagos parcialmente no Pix e R$ 30,00 pagos no fechamento final no Cartão de Débito, quando consultada a conferência de caixa (`fn_calcular_totais_caixa_interno`), então o caixa registra exatamente R$ 12,00 em Pix e R$ 30,00 em Cartão de Débito (total R$ 42,00, sem duplicidade).

## O que a atividade não inclui

- Comanda individual por cartão RFID físico na entrada da cafeteria: motivo: a operação trabalha com mesas e balcão/totem.

### Considerado para o futuro (P2)

- Permitir que o próprio cliente pelo QR Code da mesa selecione seus itens para gerar o Pix parcial no celular.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Se um item tiver quantidade > 1 (ex.: 3 Águas na mesma linha), o operador pode pagar apenas 1 unidade desse item? | dev | Não | Sim, controlando `quantidade_paga` por item de `0` até `pedido_itens.quantidade`. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Pagamento parcial por seleção de item e quantidade parcial | pgTAP / integração | CA01 | Selecionar 1 de 2 unidades de um item e pagar no Pix | Item parcialmente quitado, saldo da mesa reduzido e mesa continua aberta |
| CT02 | Abatimento de valor livre e quitação final do saldo remanescente | integração (Happy DOM) | CA02, CA03, CA04 | Lançar abatimento de R$ 30 em conta de R$ 80 e depois fechar os R$ 50 restantes | Conta encerrada somente após quitar os R$ 50 restantes |
| CT03 | Soma exata no caixa sem duplicar valores parciais | pgTAP / unit | CA05 | Executar fechamento parcial + fechamento final e rodar `fn_calcular_totais_caixa_interno` | Soma do caixa bate centavo a centavo com o consumo real |

## URL Complementar

- Referências: [CAF-000012](CONCLUIDAS/CAF-000012-dividir-conta.md) e [CAF-000073](CONCLUIDAS/CAF-000073-correcao-fechamento-de-conta-da-mesa.md)
