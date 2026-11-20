# [FEAT] Voucher "ingresso + consumo" com a bilheteria do teatro

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Permitir que a bilheteria do teatro venda, junto com o ingresso e como opção separada, um voucher de consumo na cafeteria (ex.: "café + doce no intervalo" ou crédito de R$ 20,00). O voucher é um código com QR, resgatado no PDV ou no totem no dia do espetáculo. Ao final, há um relatório de conciliação para o repasse entre bilheteria e cafeteria. O caminho mínimo não exige integração por API: lotes de códigos gerados no admin ou importados por CSV.
- **Problema e evidência:**
  - *Hoje no sistema:* não há vínculo entre venda de ingresso e consumo. A CAF-000062 registrou que "não há API pública disponível" da bilheteria da Univates e que o espetáculo é cadastrado à mão no admin (`SDD/CONCLUIDAS/CAF-000062-modo-dia-de-espetaculo-reserva-intervalo.md:54`; chaves `espetaculo_*` em `supabase/migration_caf_000062_dia_de_espetaculo.sql:6-12`).
  - Os cupons (CAF-000061/077) dão **desconto** e são validados por `validar_cupom`. Não representam dinheiro já pago a terceiros, não têm saldo nem conciliação de repasse.
  - O vale-presente (CAF-000148) cria a estrutura de código + saldo + resgate atômico. O voucher da bilheteria é um caso dela, com outra origem (lote emitido para a bilheteria) e regras próprias (validade no dia do espetáculo, itens permitidos).
  - *Mercado:* a Zig vende ingresso com pré-carga de consumo e diz que quem pré-carrega gasta cerca de 20% a mais (alegação do fornecedor).
  - *Regras:* o voucher deve ser opcional, já que a venda casada é proibida (CDC art. 39, I). Consumação mínima obrigatória é considerada abusiva. A meia-entrada (Lei 12.933/2013) incide só sobre o valor do ingresso, nunca sobre o consumo, por isso os preços devem aparecer separados.
- **Impacto de não fazer:** A cafeteria perde a venda antecipada no momento de maior intenção de compra (a compra do ingresso); a fila do intervalo continua concentrada em pagamento; não há produto conjunto teatro + cafeteria.
- **Para quem é destinado:** Espectador; bilheteria do teatro (parceira); operador do PDV/totem; dono (conciliação).
- **História de usuário:** Como espectador, quero comprar o café do intervalo junto com o ingresso, para só mostrar o QR no balcão e voltar rápido para a plateia.
- **Como saberemos que deu certo:** Resgate de voucher em até 2 toques (ler QR + confirmar); relatório de conciliação fecha com diferença de R$ 0,00 entre vendidos (informados pela bilheteria), resgatados e expirados; pelo menos um espetáculo piloto com vouchers vendidos.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Produto voucher configurável no admin: tipo (crédito em R$ ou kit de itens fixos), valor de face, valor de repasse acordado, espetáculo/data de validade, itens permitidos | P0 | CA01 |
| RF02 | Geração de lote de N códigos únicos no admin, com exportação CSV (código + URL do QR) para a bilheteria, sobre a estrutura de vales da CAF-000148 com `origem = 'bilheteria'` | P0 | CA02, CA03 |
| RF03 | Ativação: só códigos marcados como vendidos podem ser resgatados. A marcação é feita pela importação do CSV de vendidos devolvido pela bilheteria ou, no P1, por chamada de API | P0 | CA04 |
| RF04 | Resgate no PDV e no totem por leitura do QR: crédito vira forma de pagamento; kit lança os itens com preço zero e vínculo ao voucher. Atômico e idempotente | P0 | CA05, CA06 |
| RF05 | Validade: aceito só na data do espetáculo (ou período configurado); fora dela, recusado com a data correta | P0 | CA07 |
| RF06 | Relatório de conciliação por espetáculo: emitidos, vendidos, resgatados, expirados, valor a receber da bilheteria (repasse) e o que foi consumido | P0 | CA08 |
| RF07 | Integração por API (webhook da plataforma de ingressos marcando vendidos e cancelados) | P1 | CA09 |
| RF08 | Pré-pedido do intervalo pago com voucher, com retirada na janela (CAF-000062/146) | P1 | CA10 |
| RF09 | Vale-presente "café + espetáculo" vendido pela cafeteria e aceito pela bilheteria | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Códigos não sequenciais nem adivinháveis (≥ 10 caracteres aleatórios); CSV exportado sem injeção de fórmula (CAF-000132) | P0 | CA02 |
| RNF02 | Nenhum resgate duplo sob concorrência (dois caixas lendo o mesmo QR) | P0 | CA06 |
| RNF03 | Texto do voucher deixa claro que é opcional, o valor separado do ingresso e as regras de uso (CDC arts. 6º, 31 e 39) | P0 | CA01 |
| RNF04 | Lote de 2.000 códigos gerado em < 10 s | P1 | CA02 |

### Dependências técnicas

- **CAF-000148 (vale-presente)**: estrutura de código, saldo e resgate atômico.
- Modo dia de espetáculo (CAF-000062) e capacidade por janela (CAF-000146) para o pré-pedido.
- Plataforma de ingressos usada pelo teatro: formato do CSV ou API disponível (D01).
- Telas: `js/pdv/fechamento.js`, `js/totem.js`, `js/admin/promocoes.js` (ou nova aba "Vouchers"), `js/utils/csv-export.js`.

### Recursos necessários

- Acordo comercial com o teatro (valor de repasse, prazo, quem atende reclamações); contato técnico da plataforma de ingressos.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o admin criando o voucher "Café do intervalo" (kit: 1 café + 1 brownie; face R$ 20,00; repasse R$ 18,00; espetáculo de 05/12), quando salva, então o produto fica disponível para gerar lotes e o texto de regras é exibido.
- [ ] **CA02:** Dado o voucher, quando gero 500 códigos, então recebo um CSV com 500 códigos únicos e URLs de QR, e nenhuma célula começa com `=`, `+`, `-` ou `@`.
- [ ] **CA03:** Dado dois lotes gerados, quando comparo os códigos, então não há repetição entre eles.
- [ ] **CA04:** Dado um código gerado mas não marcado como vendido, quando tento resgatar, então é recusado com "voucher não ativado".
- [ ] **CA05:** Dado um voucher-kit vendido, quando o operador lê o QR no PDV, então os 2 itens entram no pedido com preço zero ligados ao voucher e o voucher fica "resgatado".
- [ ] **CA06:** Dado o mesmo QR lido em dois caixas ao mesmo tempo, quando ambos confirmam, então só um resgate é aceito e o outro recebe "já utilizado em [hora]".
- [ ] **CA07:** Dado um voucher do espetáculo de 05/12, quando apresentado em 06/12, então é recusado com a data válida (salvo se o admin tiver configurado um período maior).
- [ ] **CA08:** Dado 500 emitidos, 320 vendidos, 290 resgatados e 30 expirados, quando abro a conciliação, então vejo esses números e o valor a receber de 320 × R$ 18,00 = R$ 5.760,00.
- [ ] **CA09:** Dado a integração por API ativa, quando a plataforma notifica um cancelamento de ingresso com voucher, então o voucher é desativado se ainda não foi usado.
- [ ] **CA10:** Dado um espectador com voucher de crédito, quando faz o pré-pedido do intervalo no QR e informa o código, então o pedido é pago com o voucher e entra na janela escolhida.

## O que a atividade não inclui

- Venda de ingressos pela cafeteria: motivo: atividade da bilheteria; fora do negócio.
- Vender o voucher obrigatoriamente com o ingresso ou exigir consumação mínima: motivo: proibido (CDC art. 39, I) e abusivo.
- Meia-entrada sobre o voucher: motivo: a Lei 12.933/2013 alcança só o ingresso; o voucher tem preço próprio.
- Pulseira/cartão cashless para todo o teatro: motivo: hardware e escopo de outra iniciativa.

### Considerado para o futuro (P2)

- Vale "café + espetáculo" vendido pela cafeteria (RF09).
- Agenda de espetáculos importada da bilheteria para preencher o modo espetáculo e as faixas (CAF-000151).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual plataforma de ingressos o teatro usa? Aceita vender produto adicional com código nosso? Exporta CSV de vendidos ou tem API/webhook? | PO + teatro | Sim | |
| D02 | Acordo comercial: valor de repasse, prazo de pagamento, quem reembolsa cancelamentos | PO + teatro | Sim | |
| D03 | Voucher não usado no dia: expira, vira crédito ou é reembolsado? | PO + jurídico | Sim | |
| D04 | Tratamento fiscal (quem emite o documento na venda e no consumo) | contador | Sim | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cadastro do voucher | integração (`tests/caf-000153-voucher-bilheteria.test.js`, admin com Supabase simulado) | CA01 | Salvar kit | Produto e regras |
| CT02 | Lote e CSV | pgTAP (`supabase/tests/voucher_bilheteria.test.sql`) + unit (`js/utils/csv-export.js`) | CA02, CA03 | Gerar 2 lotes | Códigos únicos; CSV seguro |
| CT03 | Não ativado | pgTAP | CA04 | Resgatar código não vendido | Recusa |
| CT04 | Resgate de kit | pgTAP + integração (PDV) | CA05 | Ler QR | Itens a R$ 0; resgatado |
| CT05 | Concorrência | integração (2 conexões) | CA06 | Resgatar em paralelo | Um aceito |
| CT06 | Validade | pgTAP (data controlada) | CA07 | Resgatar no dia seguinte | Recusa |
| CT07 | Conciliação | pgTAP | CA08 | Cenário 500/320/290/30 | Números e R$ 5.760,00 |
| CT08 | Webhook de cancelamento | integração (Edge Function simulada) | CA09 | Notificar cancelamento | Voucher desativado |
| CT09 | Pré-pedido com voucher | integração (QR) | CA10 | Pagar com código | Pedido pago na janela |
| CT10 | Piloto | manual (um espetáculo) | CA05, CA08 | Vender e resgatar de verdade | Conciliação fecha |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000062_dia_de_espetaculo.sql`, `js/utils/theater-mode.js`, `js/pdv/fechamento.js`, `js/totem.js`, `js/utils/csv-export.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000062](CONCLUIDAS/CAF-000062-modo-dia-de-espetaculo-reserva-intervalo.md), [CAF-000061](CONCLUIDAS/CAF-000061-validacao-cupons-desconto-checkout-e-pdv.md), [CAF-000077](CONCLUIDAS/CAF-000077-cupons-uso-unico-por-pedido-e-rastreio-no-fechamento.md); novas: CAF-000132, CAF-000146, CAF-000148, CAF-000151
- Referências de design: Zig, antecipação de consumo (https://en.zig.fun/produtos/antecipacao-de-consumo/)
- Requisitos originais: CDC art. 39, I (venda casada); Lei 12.933/2013 (meia-entrada)
- Issue / PR relacionado: —
