# [FEAT] Vale-presente digital sobre a carteira de créditos

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Vender vales-presente com valor livre ou pré-definido, entregues como código + QR (impresso ou por link/WhatsApp), que qualquer pessoa resgata no PDV ou no totem, com uso parcial e saldo restante. A venda é feita no PDV e, depois do Pix dinâmico, também online.
- **Problema e evidência:**
  - *Hoje no sistema:* existe a carteira do cliente (CAF-000034): `cliente_conta_movimentos` com tipos `consumo`, `pagamento`, `deposito`, `estorno` e `ajuste` (`supabase/migration_caf_000034_conta_cliente.sql:18`) e `clientes.saldo_conta`. Ela é **nominal**: o saldo pertence a um cliente cadastrado, mistura fiado (`limite_credito`) e cashback (`supabase/migration_caf_000076_correcao_cashback.sql:11`, depósitos com `forma_pagamento = 'cashback'`). Não há instrumento ao portador, transferível, com código e validade.
  - O caixa soma depósitos na conta do cliente como entrada por forma de pagamento (`supabase/migration_caf_000108_integridade_transferencia_fechamento_caixa.sql:352-357`). A venda de um vale precisa do mesmo tratamento de caixa, mas não pode virar receita no DRE (CAF-000113), que considera `pedidos.total` pagos (`supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql:76-87`).
  - A forma de pagamento do pedido aceita `pix`, `dinheiro`, `cartao_credito`, `cartao_debito`, `outros` e `conta_cliente` (`supabase/migration_caf_000034_conta_cliente.sql:12`). Ainda não existe `vale_presente`.
  - *Mercado:* Square, Toast, Clover, Lightspeed, TouchBistro, SumUp e Odoo vendem e enviam vales-presente. Não encontramos esse recurso nativo nos sistemas brasileiros de food service pesquisados, o que o torna um diferencial. Para o teatro, permite o presente "café + espetáculo".
  - *Regras:* não há norma federal específica para vale-presente; o Procon-SP orienta informar prazo e regras de uso. O CDC (arts. 6º e 31) exige informação clara, e a venda online tem direito de arrependimento em 7 dias (art. 49). Fiscalmente, a venda tende a ser tratada como adiantamento, com o documento fiscal no resgate (confirmar com o contador; ver CAF-000124).
- **Impacto de não fazer:** Perda de vendas de fim de ano e datas comemorativas; clientes improvisam com "crédito na conta" de um terceiro, o que mistura saldos e fiado; nenhum controle de saldo em aberto (passivo) nem de vencimento.
- **Para quem é destinado:** Cliente comprador (presenteia), presenteado (resgata), operador do PDV, dono (controle do passivo).
- **História de usuário:** Como frequentador do teatro, quero dar de presente R$ 50,00 em consumo na cafeteria, enviado por WhatsApp, para que a pessoa use aos poucos nas próximas sessões.
- **Como saberemos que deu certo:** Soma dos saldos em aberto = vendido − resgatado − expirado, com diferença de R$ 0,00 em qualquer data; resgate concluído em até 3 toques no PDV; 0 resgates acima do saldo, inclusive com duas tentativas simultâneas.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Tabelas `vales_presente` (código curto legível + hash de verificação, valor inicial, saldo, validade, comprador/destinatário opcionais, mensagem, status) e `vale_presente_movimentos` (venda, resgate, estorno, expiração, ajuste), no mesmo modelo de `cliente_conta_movimentos` | P0 | CA01 |
| RF02 | Venda no PDV via RPC `vender_vale_presente(valor, forma, ...)`: gera código, registra o recebimento no caixa como "venda de vale" (separada das vendas) e fora da receita do DRE | P0 | CA01, CA02 |
| RF03 | Entrega: comprovante impresso com QR e link `.../vale.html?c=CODIGO` para compartilhar (Web Share/WhatsApp, reaproveitando a CAF-000066) | P0 | CA03 |
| RF04 | Resgate no PDV e no totem como forma de pagamento `vale_presente` (leitura do QR ou digitação), com uso parcial e combinação com outras formas | P0 | CA04, CA05 |
| RF05 | RPC `resgatar_vale_presente` atômica: bloqueia a linha (`FOR UPDATE`), recusa vencido, cancelado ou saldo insuficiente, e é idempotente por chave do fechamento | P0 | CA06, CA07 |
| RF06 | Consulta pública de saldo pela página do vale, informando só saldo e validade | P0 | CA08 |
| RF07 | Estorno de pedido pago com vale devolve o valor ao mesmo vale | P0 | CA09 |
| RF08 | Admin: lista de vales, saldo em aberto total (passivo), vencendo em 30 dias, cancelamento com motivo e permissão `admin.vales` | P1 | CA10 |
| RF09 | Regras exibidas na venda e no vale (validade, uso parcial, não trocável por dinheiro, onde usar), com validade padrão longa configurável (sugestão: 12 meses) | P0 | CA03 |
| RF10 | Venda online com Pix dinâmico e arrependimento em 7 dias para vale não usado | P1 | CA11 |
| RF11 | Vale "café + espetáculo" vendido junto com o ingresso (ver CAF-000153) | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Código com pelo menos 10 caracteres de alfabeto sem ambiguidade (sem 0/O, 1/I); consulta pública com limite de 10 tentativas por minuto por IP/dispositivo | P0 | CA08 |
| RNF02 | Nenhum resgate deixa saldo negativo sob concorrência | P0 | CA07 |
| RNF03 | Vale não expõe dados do comprador ao portador | P0 | CA08 |
| RNF04 | Valores em centavos; vale entre R$ 10,00 e R$ 1.000,00 (configurável) | P1 | CA02 |

### Dependências técnicas

- Fechamento e pagamentos (`fechar_conta_mesa`, `registrar_pagamento_parcial_mesa`, CAF-000112), caixa (CAF-000044/079/108), DRE (CAF-000113), estorno de pedido (CAF-000004).
- CAF-000129 (débitos/créditos atômicos e idempotentes): mesmo padrão de lock e idempotência.
- CAF-000123 (Pix dinâmico) para a venda online; CAF-000124 (NFC-e) para o documento no resgate; CAF-000142 (escape de HTML) na página pública do vale.
- Totem (`js/totem.js`) e PDV (`js/pdv/fechamento.js`).

### Recursos necessários

- Orientação do contador sobre tratamento fiscal; arte do vale impresso e digital.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o operador vendendo um vale de R$ 50,00 em dinheiro, quando confirma, então é criado um vale com saldo de R$ 50,00, um movimento de venda e um código único.
- [ ] **CA02:** Dado essa venda, quando abro o caixa e o DRE do dia, então o caixa mostra R$ 50,00 em "venda de vale" e o DRE não soma esse valor à receita bruta.
- [ ] **CA03:** Dado o vale vendido, quando imprimo ou compartilho, então o comprovante tem QR, código, valor, validade e as regras de uso.
- [ ] **CA04:** Dado um vale com R$ 50,00 e uma conta de R$ 18,00, quando resgato, então a conta é quitada e o vale fica com R$ 32,00.
- [ ] **CA05:** Dado um vale com R$ 10,00 e uma conta de R$ 25,00, quando resgato, então R$ 10,00 são abatidos e o PDV pede os R$ 15,00 restantes em outra forma.
- [ ] **CA06:** Dado um vale vencido ou cancelado, quando tento resgatar, então a operação é recusada com o motivo e o saldo não muda.
- [ ] **CA07:** Dado um vale com R$ 20,00, quando dois caixas tentam resgatar R$ 15,00 ao mesmo tempo, então só um resgate é aceito.
- [ ] **CA08:** Dado o link público do vale, quando consulto, então vejo apenas saldo e validade; com 11 consultas de códigos errados em 1 minuto, as próximas são bloqueadas.
- [ ] **CA09:** Dado um pedido de R$ 18,00 pago com vale, quando é cancelado, então R$ 18,00 voltam ao mesmo vale com movimento de estorno.
- [ ] **CA10:** Dado o admin, quando abre a tela de vales, então vê o total em aberto igual a vendido − resgatado − expirado; um barista sem `admin.vales` não consegue cancelar (caso negativo).
- [ ] **CA11:** Dado um vale comprado online e não usado há 5 dias, quando o comprador pede arrependimento, então o vale é cancelado e o reembolso fica registrado; dado um vale já usado, então o pedido segue a regra informada na compra.

## O que a atividade não inclui

- Cartão-presente físico com tarja ou chip: motivo: custo de produção; o QR impresso atende.
- Troca de vale por dinheiro: motivo: regra comercial comum; será informada na venda.
- Vale aceito em outros estabelecimentos do teatro: motivo: depende de acordo com a bilheteria (ver CAF-000153).

### Considerado para o futuro (P2)

- Venda combinada com ingresso (RF11).
- Vales corporativos em lote (empresas da região para funcionários), com importação CSV.
- Converter o saldo do vale em crédito na conta do cliente identificado, sem contar de novo no caixa.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Tratamento fiscal: documento na venda ou no resgate? | contador | Sim | |
| D02 | Validade padrão (sugestão 12 meses) e o que acontece com o saldo vencido | PO | Sim | |
| D03 | Valores fixos (R$ 25/50/100) ou valor livre? | PO | Não | |
| D04 | Cashback (CAF-000063) incide sobre compras pagas com vale? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Venda, caixa e DRE | pgTAP (`supabase/tests/vale_presente.test.sql`) | CA01, CA02 | Vender R$ 50; calcular caixa e DRE | Vale criado; caixa separado; DRE sem o valor |
| CT02 | Comprovante | unit (`tests/caf-000148-vale-presente.test.js`, formatador de comprovante) | CA03 | Gerar comprovante | QR, código, validade e regras |
| CT03 | Resgate total e parcial | pgTAP + integração (`js/pdv/fechamento.js`) | CA04, CA05 | Contas de R$ 18 e R$ 25 | Saldos corretos; restante pedido |
| CT04 | Vencido e cancelado | pgTAP | CA06 | Resgatar | Recusa |
| CT05 | Concorrência | integração (2 conexões paralelas) | CA07 | Dois resgates de R$ 15 | Um aceito |
| CT06 | Consulta pública e limite | pgTAP (`SET ROLE anon`) + integração | CA08 | Consultar e errar 11 vezes | Só saldo/validade; bloqueio |
| CT07 | Estorno | pgTAP | CA09 | Cancelar pedido pago com vale | Saldo devolvido |
| CT08 | Admin e permissão | pgTAP (claims de barista) + DOM | CA10 | Abrir tela; cancelar sem permissão | Totais certos; negado |
| CT09 | Arrependimento online | pgTAP | CA11 | Cancelar dentro de 7 dias | Vale cancelado |
| CT10 | Fluxo real | e2e (Playwright) | CA01, CA04 | Vender e resgatar no PDV | Saldo final correto |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000034_conta_cliente.sql`, `supabase/migration_caf_000076_correcao_cashback.sql`, `supabase/migration_caf_000108_integridade_transferencia_fechamento_caixa.sql`, `js/pdv/fechamento.js`, `js/totem.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000034](CONCLUIDAS/CAF-000034-conta-do-cliente-fiado-e-creditos.md), [CAF-000063](CONCLUIDAS/CAF-000063-cashback-fidelidade-automatico-carteira-cliente.md), [CAF-000066](CONCLUIDAS/CAF-000066-comprovante-digital-whatsapp-e-web-share.md), [CAF-000113](CONCLUIDAS/CAF-000113-painel-executivo-dre-metas-turno-conciliacao-taxas.md); [CAF-000123](CAF-000123-pix-dinamico-com-confirmacao-automatica.md), [CAF-000124](CAF-000124-emissao-de-nfce-no-fechamento.md); novas: CAF-000129, CAF-000142, CAF-000153
- Referências de design: Square gift cards (https://squareup.com/help/us/en/article/8402-sell-and-send-gift-cards)
- Requisitos originais: CDC arts. 6º, 31 e 49
- Issue / PR relacionado: —
