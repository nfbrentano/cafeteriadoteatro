# [FEAT] CAF-000063 — Programa de Fidelidade e Cashback Automático na Carteira do Cliente

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Implementar um programa de **Cashback Automático** integrado ao Cadastro de Clientes (`CAF-000033`) e à Conta/Carteira do Cliente (`CAF-000034`). Sempre que um pedido vinculado a um cliente cadastrado for pago (exceto pagamentos feitos com o próprio saldo/crédito ou cortesia), o sistema credita automaticamente um percentual configurável (ex.: `5%`) como crédito na carteira do cliente (`clientes.saldo_conta` + registro em `movimentacoes_conta_cliente`) e exibe o saldo de cashback acumulado para uso nas próximas compras.
- **Problema e evidência:** Hoje o sistema já possui cadastro de clientes (`clientes`), carteira de créditos pré-pagos (`movimentacoes_conta_cliente` da `CAF-000034`) e CRM RFV (`CAF-000041`), mas ainda não há um benefício automático recorrente que incentive o cliente a sempre se identificar pelo telefone no balcão, QR da mesa ou totem.
- **Impacto de não fazer:** Muitos pedidos presenciais são fechados sem identificação do cliente, reduzindo a base acionável do CRM (`v_clientes_rfv`) e perdendo uma alavanca simples de retenção e recompra.
- **Para quem é destinado:** Clientes recorrentes (alunos, professores, funcionários da Univates e público do teatro), operadores de caixa (`pedidos.html`) e administrador (`admin.html`).
- **História de usuário:** Como cliente frequente da Cafeteria do Teatro, quero acumular automaticamente uma porcentagem do valor das minhas compras como crédito na minha conta, para usar esse saldo como desconto ou pagamento nos meus próximos cafés.
- **Como saberemos que deu certo:** Ao fechar um pedido pago de R$ 40,00 vinculado a um cliente (com cashback de 5% ativo), o sistema gera automaticamente um lançamento de crédito de R$ 2,00 em `movimentacoes_conta_cliente` e exibe o novo saldo no comprovante/tela de conclusão.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Permitir configurar no `admin.html` (Configurações / Fidelidade): toggle `cashback_ativo` (**obrigatoriamente `false` / desativado por padrão**), `cashback_percentual` (ex.: `5.00%`) e `cashback_valor_minimo` (ex.: `R$ 10,00`). O recurso nunca deve vir ligado automaticamente: precisa ser ativado manualmente pelo administrador para funcionar | P0 | CA01, CA06 |
| RF02 | No fechamento de conta em `pedidos.html`, **somente quando `cashback_ativo === true`** e houver `cliente_id` vinculado, calcular o cashback sobre o valor efetivamente pago em Dinheiro, Pix, Cartão de Crédito ou Cartão de Débito (excluindo parcela paga em `saldo_cliente`, `fiado` ou `cortesia`) | P0 | CA02, CA03, CA06 |
| RF03 | Creditar automaticamente o valor do cashback em `clientes.saldo_conta` e inserir registro em `movimentacoes_conta_cliente` com `tipo = 'credito'` e `observacao = 'Cashback automático (X%) — Pedido #N'`, garantindo idempotência por pedido | P0 | CA02, CA04 |
| RF04 | No modal de fechamento do PDV (`pedidos.html`) e no comprovante/tela pós-pedido (`avaliar.html` / comprovante WhatsApp), exibir o aviso *"🎁 Cliente ganhou R$ X,XX de cashback! Saldo atual: R$ Y,YY"* **apenas se `cashback_ativo === true`** | P1 | CA02, CA06 |
| RF05 | No `cardapio.html` e `totem.html`, **somente quando `cashback_ativo === true`**, exibir um lembrete junto ao campo de WhatsApp: *"Informe seu WhatsApp para ganhar X% de cashback na sua carteira!"* (quando desativado, nenhum texto de cashback deve aparecer ao cliente) | P1 | CA05, CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | **Desativado por padrão (Opt-in estrito):** na migration SQL e no fallback do front-end, `cashback_ativo` deve nascer sempre `false`. Enquanto não for explicitamente ativado no painel Admin, nenhuma regra, cálculo ou mensagem de fidelidade/cashback deve ser executada ou exibida | P0 | CA06 |
| RNF02 | Garantir idempotência no banco: o mesmo `pedido_id` nunca pode gerar dois créditos de cashback mesmo em caso de duplo clique ou reconexão | P0 | CA04 |
| RNF03 | Caso um pedido que gerou cashback seja posteriormente cancelado/estornado, o crédito de cashback correspondente deve ser estornado da carteira do cliente | P1 | CA07 |

### Dependências técnicas

- Tabelas `clientes` (`CAF-000033`), `movimentacoes_conta_cliente` (`CAF-000034`) e `configuracoes`.
- Fluxo de fechamento de conta em `js/pedidos.js`.

### Recursos necessários

- Migration SQL para chaves de configuração de cashback (`cashback_ativo = 'false'` por padrão) e constraint/índice de unicidade de cashback por `pedido_id` em `movimentacoes_conta_cliente`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que a migration foi aplicada em produção, quando o sistema iniciar pela primeira vez, então a configuração `cashback_ativo` deve estar **desativada (`false`) por padrão**, exigindo que o administrador entre no `admin.html` e ative manualmente caso deseje usar.
- [x] **CA02:** Dado que o administrador ativou manualmente o Cashback em `5%` (com mínimo `R$ 10,00`) e um cliente cadastrado paga `R$ 50,00` via Pix no fechamento da conta em `pedidos.html`, quando o pagamento for confirmado, então o cliente deve receber `R$ 2,50` de crédito em `saldo_conta` e o histórico da conta deve registrar a entrada de cashback vinculada ao pedido.
- [x] **CA03:** Dado que o cashback está ativo e o cliente paga um pedido de `R$ 30,00` usando `R$ 10,00` do próprio saldo da carteira e `R$ 20,00` no Cartão, quando o pagamento for confirmado com cashback de `5%`, então o cashback deve incidir apenas sobre os `R$ 20,00` pagos (`R$ 1,00`), nunca sobre o próprio saldo utilizado nem sobre fiado não quitado.
- [x] **CA04:** Dado que um pedido já gerou cashback, quando houver tentativa de reprocessar o fechamento do mesmo pedido, então nenhum crédito duplicado deve ser lançado.
- [x] **CA05:** Dado que o cashback foi ativado pelo administrador, quando o cliente abrir o checkout em `cardapio.html` ou `totem.html`, então deve visualizar a mensagem convidando a preencher o WhatsApp para acumular cashback.
- [x] **CA06:** Dado que o cashback está desativado (estado padrão inicial ou desligado pelo administrador), quando qualquer conta for fechada ou o cliente abrir o `cardapio.html` / `totem.html`, então **nenhum crédito automático deve ser gerado e nenhuma menção a cashback deve aparecer nas telas públicas ou no PDV**.
- [x] **CA07:** Dado que um pedido que gerou cashback é cancelado/estornado, quando o estorno ocorrer, então o valor de cashback creditado naquele pedido deve ser revertido da carteira do cliente.

## O que a atividade não inclui

- Expiração individual de cada centavo de cashback por data de validade: motivo: adiciona complexidade contábil desnecessária para a carteira unificada atual (`saldo_conta`).
- Resgate automático de saldo pelo próprio cliente no site público sem autenticação por senha/OTP: motivo: por segurança contra uso do saldo por terceiros que saibam apenas o telefone, o abatimento do saldo continua sendo validado no caixa/PDV (`CAF-000034`).

### Considerado para o futuro (P2)

- Regras de cashback em dobro em dias específicos da semana ou para clientes VIP do CRM.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Quando o cliente quita um débito de "Fiado" posteriormente na aba Conta do Cliente, deve gerar cashback ou o cashback vale apenas para pagamentos na hora? | PO | Não | Padrão recomendado: gerar cashback apenas para pagamentos à vista (Dinheiro, Pix, Cartão) no ato do fechamento, incentivando o pagamento imediato. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Configurar cashback de 5% no Admin | Manual | CA01 | Ativar cashback 5% e mínimo R$ 10 no Admin | Configuração salva com sucesso |
| CT02 | Fechar pedido à vista com cliente vinculado | Integração / Manual | CA02 | Vincular cliente a pedido de R$ 40, fechar no Pix e consultar Conta do Cliente | Crédito de R$ 2,00 lançado automaticamente na carteira |
| CT03 | Pagamento misto (Saldo + Cartão) | Unit / Integração | CA03 | Pedido de R$ 30 pago com R$ 10 de Saldo + R$ 20 no Cartão | Cashback calculado apenas sobre R$ 20 (R$ 1,00) |
| CT04 | Proteção contra duplicidade | Integração | CA04 | Executar a função de crédito duas vezes para o mesmo `pedido_id` | Apenas 1 registro criado em `movimentacoes_conta_cliente` |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/CAF-000034-conta-do-cliente-fiado-e-creditos.md` e `SDD/CONCLUIDAS/CAF-000041-crm-segmentacao-e-tags.md`
