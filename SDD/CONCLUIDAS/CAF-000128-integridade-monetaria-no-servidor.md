# [FIX] Integridade monetária no servidor: sinais e limites de valores, permissão de desconto por cargo e PIN de supervisor

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-24

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer o banco recusar valores impossíveis (taxa, pagamento ou quantidade negativos, forma de pagamento inventada) e decidir sobre desconto com as mesmas regras que o PDV mostra: permissão do cargo, PIN de supervisor e cupom validado.
- **Problema e evidência:**
  1. **Taxa de serviço negativa vira desconto sem permissão.** Em `fechar_conta_mesa` (`supabase/migration_caf_000112_fechamento_parcial_mesa.sql:409`) o total é `v_subtotal_restante + COALESCE(p_taxa_servico, 0) - COALESCE(p_desconto_manual, 0)`; a checagem de permissão só olha `p_desconto_manual > 0` (`:359`). `p_taxa_servico = -20` reduz a conta em R$ 20 sem motivo nem autorização. `fechamentos.taxa_servico` não tem CHECK (`migration_caf_000023_taxa_desconto.sql:7`).
  2. **Pagamentos sem validação.** Os pagamentos são somados e gravados como chegam (`112:420` e `112:447-448`): valor negativo e `forma` livre são aceitos. Ex.: `[{dinheiro, 200}, {pix, -100}]` fecha uma conta de R$ 100 e registra R$ 200 em dinheiro no caixa; uma forma escrita errado some dos totais do caixa. O mesmo vale para `registrar_pagamento_parcial_mesa` (`112:194`, `:217`), onde `p_valor_abatimento` negativo também passa (`112:172-177`).
  3. **Quantidade zero ou negativa.** `criar_pedido` (`supabase/migration_caf_000034_conta_cliente.sql:380`) e `adicionar_itens_pedido` (`supabase/migration_caf_000028_itens_lancados_depois.sql:185`) gravam `(v_item->>'quantidade')::int` sem limite; `pedido_itens.quantidade` é `INTEGER NOT NULL DEFAULT 1` sem CHECK (`supabase/pedidos_schema.sql:142`). Um item com quantidade −2 abate o total (`034:413`); no estoque, o saldo soma a saída negativa (`migration_caf_000031_controle_estoque.sql:76`, `WHEN tipo IN ('saida_venda', 'perda') THEN -quantidade`) enquanto o PEPS abate lotes com `ABS(NEW.quantidade)` (`migration_caf_000111_lotes_validade_peps_sugestao_compras.sql:132`): saldo e lotes divergem. As RPCs públicas já limitam a 1..10/20 (`037:286`, `038:393`, `040:418`).
  4. **Desconto: front e servidor com regras diferentes.** O PDV libera desconto por permissão do cargo (`js/pdv/sessao.js:359-371`, `pdv.desconto`) ou por PIN de supervisor (`js/pdv/fechamento.js:1094-1105`), mas o servidor só aceita `perfis.role = 'admin'` ou `perfis.pode_dar_desconto` do usuário logado (`112:352-361`). O resultado de `pedirAutorizacaoPin` não vai para a RPC (`fechamento.js:1145-1154`). Gerente com cargo que tem `pdv.desconto` e barista autorizado por PIN recebem "Usuário sem permissão" depois de tudo aprovado na tela.
  5. **Cupom no PDV é desconto manual.** Ao aplicar cupom, o PDV copia o valor para os campos de desconto manual (`fechamento.js:744-748`) e envia `p_desconto_manual`; o servidor só usa `p_campanha_id` para registrar o uso (`112:510-511`) e não confere se o valor bate com a campanha. Um cupom de 10% pode ser enviado como R$ 50.
- **Impacto de não fazer:** Diferença de caixa sem explicação, desconto concedido sem autorização e sem rastro, estoque que não bate com os lotes, e retrabalho no balcão quando o servidor recusa um desconto já autorizado.
- **Para quem é destinado:** Dono (controle financeiro), gerente e barista no caixa.
- **História de usuário:** Como dono, quero que o banco só aceite valores coerentes e descontos autorizados por quem pode, para confiar no fechamento do caixa sem conferir conta por conta.
- **Como saberemos que deu certo:** 0 registros novos com taxa, pagamento ou quantidade negativos; 0 recusas de desconto já autorizado na tela (gerente por cargo ou PIN) no e2e; todo desconto de cupom igual ao recalculado pelo servidor.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | `fechar_conta_mesa` e `registrar_pagamento_parcial_mesa` recusam `p_taxa_servico < 0`, `p_desconto_manual < 0`, `p_valor_abatimento < 0`, pagamento com `valor <= 0` e `forma` fora de `pix, dinheiro, cartao_credito, cartao_debito, outros, conta_cliente` | P0 | CA01, CA02, CA03 |
| RF02 | Taxa de serviço limitada a um teto configurável (sugestão: 20% do subtotal restante) | P1 | CA04 |
| RF03 | CHECKs: `fechamentos.taxa_servico >= 0`, `fechamentos.desconto_manual >= 0`, `fechamento_pagamentos.valor > 0` e `forma IN (...)`, `pedido_itens.quantidade > 0`; criados `NOT VALID`, com relatório dos registros antigos que violam, e validados depois da limpeza | P0 | CA05 |
| RF04 | `criar_pedido` e `adicionar_itens_pedido` recusam quantidade fora de 1..99 (teto a confirmar) com mensagem clara | P0 | CA06 |
| RF05 | Permissão de desconto no servidor por `public.tem_permissao('pdv.desconto')` (que já cobre cargo e o legado `pode_dar_desconto`) | P0 | CA07 |
| RF06 | `validar_pin_autorizacao` devolve `autorizacao_id` de uso único, ligado à permissão, ao valor e à mesa, válido por 5 min; `fechar_conta_mesa` aceita `p_autorizacao_id`, confere tudo e marca como usado; o PDV envia o id | P0 | CA08, CA09 |
| RF07 | Cupom no fechamento: o servidor recalcula o desconto a partir de `p_campanha_id`/`p_cupom_codigo` (mesma regra de `validar_cupom`) e ignora o valor enviado; desconto de cupom válido não exige `pdv.desconto` | P1 | CA10, CA11 |
| RF08 | `fechamentos` registra quem autorizou (`desconto_por` = supervisor do PIN quando houver) | P1 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Mensagens de recusa em português, exibidas pelo PDV como aviso (sem `alert` nativo) | P0 | CA01, CA06 |
| RNF02 | A migration não falha em produção por dado antigo inválido (CHECK `NOT VALID` + relatório) | P0 | CA05 |
| RNF03 | Valores em centavos/`NUMERIC(10,2)`, sem arredondamento diferente entre front e servidor | P1 | CA10 |

### Dependências técnicas

- `fechar_conta_mesa`/`registrar_pagamento_parcial_mesa` (112), `criar_pedido` (034), `adicionar_itens_pedido` (028), `validar_pin_autorizacao` (`migration_caf_000081_seguranca_pin_rls.sql:18`), `validar_cupom` (`migration_caf_000061_cupons_desconto.sql:30`), `js/pdv/fechamento.js`, `js/pdv/sessao.js`.
- CAF-000126 (guards NULL-safe nas mesmas funções), CAF-000127 (PIN com bcrypt), CAF-000129 (saldo e débito do cliente nas mesmas RPCs: coordenar a ordem das migrations), CAF-000131 (regras de cupom: vigência e limites).

### Recursos necessários

- Consulta de leitura em produção para medir registros antigos que violariam os CHECKs.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado uma mesa de R$ 100, quando o fechamento é enviado com `p_taxa_servico = -20`, então é recusado e a mesa continua aberta.
- [x] **CA02:** Dado uma mesa de R$ 100, quando os pagamentos são `[{dinheiro, 200}, {pix, -100}]`, então é recusado e nada é gravado em `fechamento_pagamentos`.
- [x] **CA03:** Dado um pagamento com `forma = 'vale'`, quando enviado ao fechamento ou ao parcial, então é recusado com a lista de formas aceitas.
- [x] **CA04:** Dado taxa configurada com teto de 20%, quando a taxa enviada passa do teto, então é recusada; quando é exatamente 20%, então é aceita.
- [x] **CA05:** Dado dados antigos com taxa negativa, quando a migration roda, então ela termina sem erro, gera o relatório e novos registros inválidos são recusados.
- [x] **CA06:** Dado o PDV, quando um item é enviado com quantidade 0 ou −1 a `criar_pedido` ou `adicionar_itens_pedido`, então é recusado e nenhum movimento de estoque é criado.
- [x] **CA07:** Dado um gerente cujo cargo tem `pdv.desconto` e `pode_dar_desconto = false`, quando fecha com desconto e motivo, então o fechamento é aceito.
- [x] **CA08:** Dado um barista sem permissão e um supervisor que digitou o PIN para R$ 10 na mesa 5, quando o fechamento é enviado com o `autorizacao_id`, então é aceito e o supervisor fica registrado como autorizador.
- [x] **CA09:** Dado um `autorizacao_id` já usado, vencido, de outra mesa ou de valor menor que o desconto, quando enviado, então o fechamento é recusado.
- [x] **CA10:** Dado um cupom de 10% numa conta de R$ 80, quando o PDV envia desconto de R$ 50 com a campanha, então o servidor aplica R$ 8.
- [x] **CA11:** Dado um barista sem `pdv.desconto`, quando aplica um cupom válido, então o fechamento é aceito sem pedir PIN (caso negativo: cupom inativo é recusado).

## O que a atividade não inclui

- Cálculo do saldo da mesa e débito na conta do cliente: motivo: CAF-000129.
- Cupom nos canais públicos (QR, online, totem): motivo: CAF-000131.
- Gorjeta/taxa conforme Lei 13.419/2017 e rateio: motivo: CAF-000144.
- Corrigir registros antigos inválidos: motivo: decisão do dono após o relatório (D02).

### Considerado para o futuro (P2)

- Teto de desconto por cargo (ex.: barista até 10%).
- Desconto por item, além do desconto na conta.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Teto da taxa de serviço (sugestão 20%) e da quantidade por item no PDV (sugestão 99)? | PO | Sim | Confirmado teto de 20% sobre o subtotal restante para taxa de serviço e limite de 1 a 99 itens em criar_pedido e adicionar_itens_pedido. |
| D02 | O que fazer com registros antigos inválidos que o relatório encontrar (corrigir, anotar ou manter)? | PO | Não | CHECK constraints criadas como NOT VALID para proteger novos registros sem quebrar banco histórico; relatório emitido via notice para auditoria do dono. |
| D03 | Cupom no PDV deve somar com desconto manual ou um exclui o outro? | PO | Não | O cupom define o desconto recalculado pelo servidor a partir das regras da campanha, não cumulando com desconto manual no mesmo fechamento. |
| D04 | `forma = 'outros'` continua aceita? Hoje aparece no PDV | PO | Não | Sim, 'outros' permanece na lista de formas aceitas ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outros', 'conta_cliente'). |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Taxa negativa | pgTAP | CA01 | `throws_ok` em `fechar_conta_mesa` com taxa −20 | Recusa; mesa aberta |
| CT02 | Pagamento negativo e forma inválida | pgTAP | CA02, CA03 | Fechamento e parcial com os payloads do CA | Recusa; 0 linhas |
| CT03 | Teto da taxa | pgTAP | CA04 | Taxa a 20% e 20,01% | Aceita / recusa |
| CT04 | CHECK com dado antigo | pgTAP | CA05 | Semear taxa negativa, aplicar migration, tentar novo insert | Migration ok; insert recusado |
| CT05 | Quantidade inválida | pgTAP | CA06 | `criar_pedido` e `adicionar_itens_pedido` com 0 e −1 | Recusa; 0 movimentos |
| CT06 | Gerente por cargo | pgTAP | CA07 | Claims de gerente com cargo `pdv.desconto` | Aceito |
| CT07 | Autorização por PIN | pgTAP + integração (harness do PDV) | CA08, CA09 | Validar PIN, fechar com o id; repetir; outra mesa | Aceito uma vez; demais recusados |
| CT08 | Cupom recalculado | pgTAP | CA10 | Campanha 10%, desconto enviado R$ 50 | `desconto_manual = 8,00` |
| CT09 | Cupom sem permissão | integração (harness) + pgTAP | CA11 | Barista sem permissão aplica cupom válido e inativo | Aceito / recusado |
| CT10 | Fluxo no navegador | e2e | CA07, CA08 | Fechar mesa com desconto por PIN | Mesa liberada |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000112_fechamento_parcial_mesa.sql`, `supabase/migration_caf_000034_conta_cliente.sql`, `supabase/migration_caf_000028_itens_lancados_depois.sql`, `supabase/migration_caf_000031_controle_estoque.sql`, `supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql`, `js/pdv/fechamento.js`, `js/pdv/sessao.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000073](CONCLUIDAS/CAF-000073-correcao-fechamento-de-conta-da-mesa.md), [CAF-000108](CONCLUIDAS/CAF-000108-correcao-transferencia-mesa-atomica-fechamento-e-caixa.md), [CAF-000112](CONCLUIDAS/CAF-000112-fechamento-parcial-conta-mesa-pagamento-por-item-comanda-individual.md), [CAF-000081](CONCLUIDAS/CAF-000081-seguranca-pin-permissoes-por-cargo-e-rls-operacional.md), [CAF-000061](CONCLUIDAS/CAF-000061-validacao-cupons-desconto-checkout-e-pdv.md), [CAF-000077](CONCLUIDAS/CAF-000077-cupons-uso-unico-por-pedido-e-rastreio-no-fechamento.md); novas: CAF-000126, CAF-000127, CAF-000129, CAF-000131, CAF-000136, CAF-000144
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
