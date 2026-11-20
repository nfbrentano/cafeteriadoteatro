# [FIX] Saldo da mesa com fonte única e débitos/créditos do cliente (fiado e cashback) atômicos e idempotentes

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer o PDV mostrar exatamente o saldo que o banco vai cobrar numa mesa com pagamentos parciais, e garantir que o débito na conta do cliente (fiado) e o crédito de cashback aconteçam uma única vez, dentro da mesma transação do fechamento.
- **Problema e evidência:**
  1. **Duas contas diferentes para "já pago".** O PDV calcula o já pago como `quantidade_paga * preco_unitario` dos itens (`js/pdv/fechamento.js:628-641`; `js/pdv/mesas.js:300-307` no card da mesa e `:571-585` no detalhe). O servidor soma `fechamento_pagamentos.valor` de todos os fechamentos parciais da mesa (`supabase/migration_caf_000112_fechamento_parcial_mesa.sql:122-131` e `:392-401`), o que inclui taxa de serviço e valor pago a mais. A RPC `obter_resumo_conta_mesa` (`112:527`) existe, mas o front não a usa (só aparece em mocks de teste).
     - **Abatimento por valor:** mesa de R$ 100, cliente abate R$ 30 em valor livre (não muda `quantidade_paga`). O PDV continua mostrando R$ 100 + taxa a pagar; o servidor espera R$ 70 + taxa e grava a diferença como troco (`112:428`). O cliente paga duas vezes os R$ 30 ou o operador devolve um troco que não existe.
     - **Taxa no parcial:** itens de R$ 50 + R$ 5 de taxa pagos no parcial viram R$ 55 de amortização no servidor e R$ 50 no PDV. No fechamento sobra R$ 5 de "troco" que ninguém entrega, e o caixa cego fecha com sobra.
  2. **Fiado debitado fora da transação.** O PDV debita a conta do cliente via `lancarMovimento` **antes** de chamar `fechar_conta_mesa` (`fechamento.js:1117-1139`). O servidor também debita (`112:456-478`; no parcial `112:226-246`) e tenta evitar o débito duplo por heurística: existe consumo de mesmo valor no mesmo pedido **ou** nos últimos 10 minutos (`112:464`, `:234`). Os marcadores `_idempotencyKey` e `_contaClienteDebitada` são zerados a cada abertura do modal (`fechamento.js:625-626`). Consequências: se a RPC falhar, o cliente fica debitado e a mesa aberta; reabrir o modal debita de novo; dois consumos legítimos de mesmo valor em 10 minutos geram um só débito. O movimento é gravado com `p_fechamento_id := NULL` (`112:474`, `:244`), sem vínculo com o fechamento.
  3. **Cashback creditável em qualquer cliente e em duplicidade.** Em `processar_cashback_pedido` (`supabase/migration_caf_000076_correcao_cashback.sql`): o `p_cliente_id` enviado só é trocado pelo cliente do pedido quando vem NULL (`:63-65`), então credita em qualquer cliente; se o banco não acha pagamento, usa o valor informado pelo chamador (`:111-113`); só recusa pedido cancelado (não exige pedido pago); a idempotência é um `SELECT EXISTS` sem trava nem índice único (`:72-78`), e duas chamadas simultâneas creditam duas vezes. O PDV chama a RPC depois do fechamento, em outra requisição (`fechamento.js:1172-1190`).
  4. **Tipo divergente.** No repositório `cliente_conta_movimentos.fechamento_id` é `BIGINT REFERENCES public.fechamentos_caixa(id)` (`supabase/migration_caf_000034_conta_cliente.sql:21`) e `lancar_movimento_conta` recebe `p_fechamento_id BIGINT` (`034:54`), mas `fechamentos.id` é UUID e o snapshot de produção mostra `p_fechamento_id uuid`.
- **Impacto de não fazer:** Cliente cobrado em dobro ou troco entregue sem existir; conta fiado debitada sem a mesa fechar; consumo legítimo não debitado; cashback indevido. Diferenças no caixa cego que ninguém consegue explicar.
- **Para quem é destinado:** Operador de caixa, cliente com conta/fiado e cashback, e dono (conferência do caixa).
- **História de usuário:** Como operador de caixa, quero que o valor a pagar mostrado na tela seja o mesmo que o sistema cobra, para não cobrar duas vezes nem devolver troco errado.
- **Como saberemos que deu certo:** Em 100% dos cenários de teste (por item, por valor, com taxa, com excedente) o saldo exibido é igual ao esperado pelo servidor; 0 débitos de fiado sem fechamento correspondente; 0 cashbacks duplicados sob chamadas concorrentes.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Gravar em `fechamentos` quanto do pagamento abateu o principal (`valor_abatido`) separado de `taxa_servico` e `troco`; o saldo da mesa passa a ser `subtotal − SUM(valor_abatido)` dos parciais | P0 | CA01, CA02, CA03 |
| RF02 | `obter_resumo_conta_mesa` (ou view `saldo_mesa`) é a única fonte do saldo: usada por `fechar_conta_mesa`, `registrar_pagamento_parcial_mesa`, pelo modal de fechamento e pelos cards/detalhe da mesa no PDV | P0 | CA01, CA02, CA04 |
| RF03 | Só o servidor debita a conta do cliente: remover a chamada a `lancarMovimento` do fechamento no PDV (`fechamento.js:1117-1139`) | P0 | CA05, CA06 |
| RF04 | Débito de fiado vinculado ao fechamento (coluna nova `fechamento_mesa_id UUID REFERENCES fechamentos(id)` em `cliente_conta_movimentos`) com índice único parcial `(cliente_id, fechamento_mesa_id) WHERE tipo = 'consumo'`; a heurística de "mesmo valor/10 minutos" é removida | P0 | CA06, CA07 |
| RF05 | A chave de idempotência do fechamento é gerada uma vez por tentativa de fechamento da mesa e só é descartada após sucesso ou cancelamento explícito (não ao reabrir o modal) | P1 | CA08 |
| RF06 | Cashback: o cliente é sempre o do pedido (parâmetro ignorado/recusado se divergir), exige `status_pagamento = 'pago'`, remove o fallback por valor informado e usa índice único parcial `(pedido_id) WHERE tipo = 'deposito' AND forma_pagamento = 'cashback'` com `ON CONFLICT DO NOTHING` | P0 | CA09, CA10, CA11 |
| RF07 | O cashback é creditado dentro de `fechar_conta_mesa` (mesma transação) e o PDV só exibe o resultado | P1 | CA12 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Resumo da mesa responde em menos de 300 ms para mesa com até 30 itens | P1 | CA04 |
| RNF02 | Migration com backfill de `valor_abatido` nos parciais existentes e relatório das mesas abertas com divergência antes de aplicar | P0 | CA03 |
| RNF03 | Valores em `NUMERIC(10,2)` e centavos no front (`js/utils/`), sem soma em ponto flutuante | P1 | CA01 |

### Dependências técnicas

- `supabase/migration_caf_000112_fechamento_parcial_mesa.sql`, `supabase/migration_caf_000034_conta_cliente.sql`, `supabase/migration_caf_000076_correcao_cashback.sql`, `js/pdv/fechamento.js`, `js/pdv/mesas.js`, `js/utils/cashback.js`.
- CAF-000126 (guards e REVOKE nestas RPCs) e CAF-000128 (validação de sinais/formas nas mesmas funções): coordenar ordem das migrations. CAF-000137 (centavos) facilita o RNF03.

### Recursos necessários

- Consulta de leitura em produção: mesas abertas com parciais e movimentos de fiado com `pedido_id` de mesas fechadas, para medir o impacto antes do backfill.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado uma mesa de R$ 100 com abatimento de R$ 30 por valor, quando abro o fechamento no PDV, então o saldo exibido é R$ 70 (+ taxa) e o servidor cobra o mesmo valor, sem troco.
- [ ] **CA02:** Dado um parcial de R$ 50 em itens + R$ 5 de taxa, quando fecho a mesa de R$ 100, então o saldo é R$ 50 (+ taxa sobre R$ 50) e o troco é zero se o cliente pagar exatamente.
- [ ] **CA03:** Dado um parcial em que o cliente deu R$ 60 em dinheiro para R$ 55, quando o resumo é calculado, então o troco de R$ 5 não reduz o saldo da mesa.
- [ ] **CA04:** Dado uma mesa com parciais, quando comparo card, detalhe e modal de fechamento, então os três mostram o mesmo saldo devolvido pelo servidor.
- [ ] **CA05:** Dado um fechamento com fiado em que a RPC falha, quando consulto a conta do cliente, então não há débito novo e a mesa continua aberta.
- [ ] **CA06:** Dado um fechamento com fiado de R$ 40, quando a RPC é chamada duas vezes com a mesma chave, então existe exatamente um débito de R$ 40 ligado ao fechamento.
- [ ] **CA07:** Dado duas mesas do mesmo cliente fechadas em fiado com R$ 25 cada, em menos de 10 minutos, quando consulto o extrato, então existem dois débitos de R$ 25.
- [ ] **CA08:** Dado um fechamento que falhou por rede, quando o operador fecha e reabre o modal e confirma de novo, então a mesma chave é reenviada e não há fechamento duplicado.
- [ ] **CA09:** Dado o pedido do cliente A, quando o cashback é solicitado com `p_cliente_id` do cliente B, então nada é creditado a B.
- [ ] **CA10:** Dado um pedido ainda não pago, quando o cashback é solicitado, então nada é creditado.
- [ ] **CA11:** Dado duas chamadas simultâneas de cashback para o mesmo pedido, quando ambas terminam, então há um único crédito.
- [ ] **CA12:** Dado cashback ativo e cliente vinculado, quando a mesa é fechada, então o crédito existe ao fim da mesma transação e o PDV mostra o aviso sem fazer nova chamada.

## O que a atividade não inclui

- Validação de sinais, formas de pagamento e permissão de desconto: motivo: CAF-000128.
- Regras novas de fidelidade (níveis): motivo: CAF-000149.
- Gorjeta e rateio da taxa de serviço: motivo: CAF-000144.
- Corrigir débitos antigos duplicados ou faltantes: motivo: depende do relatório e de decisão do dono (D02).

### Considerado para o futuro (P2)

- Estorno automático de fiado ao reabrir uma mesa fechada.
- Extrato do cliente mostrando o fechamento de origem de cada débito.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Taxa de serviço no parcial: cobrar proporcional ao que foi pago (como hoje) ou só no fechamento final? | PO | Sim | |
| D02 | O que fazer com débitos de fiado e cashbacks antigos encontrados em duplicidade pelo relatório? | PO | Não | |
| D03 | Em produção, `cliente_conta_movimentos.fechamento_id` é UUID ou BIGINT? (repositório e snapshot divergem; ver CAF-000138) | dev | Sim | |
| D04 | Valor pago a mais num parcial (sem troco devolvido) vira crédito do cliente ou gorjeta? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Abatimento por valor | pgTAP + integração (harness do PDV) | CA01 | Parcial de R$ 30 por valor; abrir fechamento | R$ 70 na tela e no servidor |
| CT02 | Taxa no parcial | pgTAP | CA02 | Parcial por itens com taxa; fechar | Saldo e troco corretos |
| CT03 | Excedente em dinheiro | pgTAP | CA03 | Parcial com R$ 60 para R$ 55 | Saldo não reduzido pelo troco |
| CT04 | Telas coerentes | integração (harness `mesas.js`/`fechamento.js`) | CA04 | Mock do resumo do servidor | Mesmo saldo nas três telas |
| CT05 | Falha da RPC | integração (harness) | CA05 | RPC retorna erro | Nenhuma chamada a `lancarMovimento` |
| CT06 | Idempotência do fiado | pgTAP | CA06, CA07 | Repetir chave; duas mesas de R$ 25 | 1 débito; 2 débitos |
| CT07 | Chave estável | integração (harness) | CA08 | Falha, fechar/reabrir modal, confirmar | Mesma chave enviada |
| CT08 | Cashback blindado | pgTAP | CA09, CA10 | Cliente divergente; pedido pendente | Sem crédito |
| CT09 | Concorrência | pgTAP com `dblink` ou integração com duas conexões | CA11 | Duas chamadas simultâneas | 1 crédito |
| CT10 | Fechamento com cashback | e2e | CA12 | Fechar mesa com cliente | Aviso e crédito único |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000112_fechamento_parcial_mesa.sql`, `supabase/migration_caf_000076_correcao_cashback.sql`, `supabase/migration_caf_000034_conta_cliente.sql`, `js/pdv/fechamento.js`, `js/pdv/mesas.js`, `js/utils/cashback.js`, `supabase/snapshots/producao-2026-10-22-depois.csv`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000112](CONCLUIDAS/CAF-000112-fechamento-parcial-conta-mesa-pagamento-por-item-comanda-individual.md), [CAF-000108](CONCLUIDAS/CAF-000108-correcao-transferencia-mesa-atomica-fechamento-e-caixa.md), [CAF-000034](CONCLUIDAS/CAF-000034-conta-do-cliente-fiado-e-creditos.md), [CAF-000063](CONCLUIDAS/CAF-000063-cashback-fidelidade-automatico-carteira-cliente.md), [CAF-000076](CONCLUIDAS/CAF-000076-correcao-cashback-fidelidade.md), [CAF-000044](CONCLUIDAS/CAF-000044-fechamento-de-caixa-cego-e-correcoes.md); novas: CAF-000126, CAF-000128, CAF-000137, CAF-000138, CAF-000144, CAF-000149
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
