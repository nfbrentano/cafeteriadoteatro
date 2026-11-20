# Análise — Softwares de cafeteria × Cafeteria do Teatro (Nov/2026)

Comparação do que os principais sistemas de PDV e gestão para cafeterias oferecem com o que o Cafeteria do Teatro já tem. Complementa a [ANALISE_CONCORRENTES_GESTAO.md](CONCLUIDAS/ANALISE_CONCORRENTES_GESTAO.md) (Set/2026). Daquela análise, quase tudo já virou SDD e foi entregue (031 a 044). Esta análise procura o que **ainda** falta.

> **Escopo:** integrações com iFood e outros marketplaces, e entrega própria, continuam **fora** por decisão do cliente.
> **Método:** os recursos vieram de sites oficiais, centrais de ajuda e notícias de 2024 a 2026 (links no fim). Nenhum sistema foi testado.
> **Cobertura:** Revel, Shopify POS, Bematech, Colibri, Linx/Degust e TOTVS Chef foram vistos só de passagem.
> **Números:** todo número citado é **alegação do próprio fornecedor**, salvo indicação.
> **Já especificado antes:** Pix dinâmico (CAF-000123), NFC-e (CAF-000124) e acessibilidade (CAF-000125) já têm rascunho e não se repetem aqui.

---

## O que já temos (resumo)

| Área | O que existe |
|---|---|
| **Atendimento** | PDV com mesas e comandas; dividir conta e pagamento parcial; QR na mesa; pedido online e encomendas; totem; modo "dia de espetáculo" com pré-pedido do intervalo |
| **Produção** | KDS por estação com semáforo de tempo; painel de retirada; impressão por estação e etiqueta de copo |
| **Estoque** | Ficha técnica, lotes com controle de validade (PEPS) e sugestão de compras |
| **Clientes** | Cadastro de clientes, fiado e créditos pré-pagos, cashback, cupons, CRM com segmentos e avaliação |
| **Gestão** | Financeiro, DRE, conciliação de recebíveis, metas por turno, caixa cego e cargos/permissões |

**Lacuna estrutural vista no schema de produção:** o produto não tem **variações com preço**. Hoje só existem adicionais opcionais e meio a meio. Para uma cafeteria, isso é a lacuna mais básica: tamanho, tipo de leite, shots extras e temperatura.

---

## Matriz (só o que falta no sistema)

Legenda: ✅ tem · ⚠️ parcial, por app de terceiro ou não confirmado · ❌ não encontrado · – não se aplica

Colunas:
- **Sq** = Square
- **Tst** = Toast
- **LS** = Lightspeed
- **Clv** = Clover
- **Loy** = Loyverse
- **SBX** = Starbucks
- **OA** = redes de pedido antecipado (Joe, Ritual, Bbot, me&u)
- **Sai** = Saipos
- **Cons** = Consumer
- **Goo** = Goomer
- **Anota** = Anota AI
- **BR+** = outros brasileiros (Zig, Stone/Ton, PagBank, Sischef)

| Funcionalidade | Sq | Tst | LS | Clv | Loy | SBX | OA | Sai | Cons | Goo | Anota | BR+ | Cafeteria do Teatro | SDD |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|---|
| Variações e opções guiadas (tamanho, leite, shots, temperatura com preço) | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ❌ Só adicionais planos | [CAF-000143](CAF-000143-variacoes-de-bebida-e-grupos-de-opcoes-obrigatorios.md) |
| "Minha bebida favorita" / repetir pedido do cliente | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ Só "repetir rodada" no PDV | CAF-000143 |
| Gorjeta sugerida e rateio entre a equipe | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | – | ⚠️ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ Taxa de serviço sem rateio | [CAF-000144](CAF-000144-gorjeta-rateio-da-taxa-de-servico-e-relatorio-para-folha.md) |
| Display voltado ao cliente no caixa | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | – | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | [CAF-000145](CAF-000145-display-do-cliente-no-caixa.md) |
| Capacidade por janela e tempo estimado dinâmico | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ Janela fixa no pedido online | [CAF-000146](CAF-000146-capacidade-por-janela-do-intervalo-e-tempo-estimado-dinamico.md) |
| Aviso de "pronto" no aparelho do cliente (SMS, push, WhatsApp) | ⚠️ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ Só com a página aberta | [CAF-000147](CAF-000147-aviso-de-pedido-pronto-por-web-push.md) |
| Vale-presente digital | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | [CAF-000148](CAF-000148-vale-presente-digital.md) |
| Fidelidade com níveis | ✅ | ❌ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ Cashback de nível único | [CAF-000149](CAF-000149-fidelidade-com-niveis-sobre-o-cashback.md) |
| Sugestão de itens (upsell) em todos os canais | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ Só no totem | [CAF-000150](CAF-000150-sugestao-de-itens-upsell-no-qr-online-e-pdv.md) |
| Cardápio e preço por horário | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ Promoção por dia da semana | [CAF-000151](CAF-000151-cardapio-e-preco-por-horario-e-cardapio-expresso-do-intervalo.md) |
| Alergênicos e dietas no cardápio e no KDS | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | [CAF-000152](CAF-000152-alergenicos-e-restricoes-alimentares.md) |
| Ingresso + consumo / pré-carga de saldo | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Zig | ❌ | [CAF-000153](CAF-000153-voucher-ingresso-mais-consumo-com-a-bilheteria.md) |
| Escala de turnos | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | – | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | [CAF-000154](CAF-000154-escala-da-equipe-por-turno-e-espetaculo.md) |
| Entrada de estoque pelo XML da NF-e de compra | – | – | – | – | – | – | – | ⚠️ | ⚠️ | – | – | ✅ ERPs | ❌ | [CAF-000155](CAF-000155-entrada-de-estoque-por-xml-da-nfe-de-compra.md) |
| Assinatura / clube do café | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | [CAF-000156](CAF-000156-assinatura-clube-do-cafe-com-pix-automatico.md) |
| Maquininha integrada (TEF / Smart POS) | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | – | – | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ Valor digitado na maquininha | [CAF-000157](CAF-000157-maquininha-integrada-ao-pdv-tef-smart-pos.md) |
| Pedido em grupo no QR | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Futuro (ver abaixo) |
| Robô de pedidos no WhatsApp (API oficial) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ Envio assistido | Futuro (ver abaixo) |
| Assistente de IA conversacional sobre os dados | ✅ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | Futuro (ver abaixo) |

---

## Por que estas e nesta ordem

### 🔴 Prioridade alta

| ID | Feature | Por que | Esforço |
|---|---|---|---|
| CAF-000143 | Variações de bebida | É a base de um cardápio de café. Sem ela, "latte grande com leite de aveia" vira observação em texto: sem preço, sem baixa de estoque e sem relatório. | G |
| CAF-000144 | Taxa de serviço como gorjeta | **Obrigação legal**, não só uma funcionalidade a mais. Pela Lei 13.419/2017, a taxa de serviço que o sistema já cobra é gorjeta: precisa ser distribuída e anotada na folha. | M |
| CAF-000146 | Capacidade por janela no intervalo | O gargalo do negócio é o intervalo. A Toast e a Starbucks resolvem o mesmo problema limitando quantos pedidos entram por janela de tempo. | M |

### 🟡 Prioridade média

| ID | Feature | Por que | Esforço |
|---|---|---|---|
| CAF-000152 | Alergênicos | É barato e pode ser exigido por lei estadual. Reaproveita a ficha técnica. | P |
| CAF-000151 | Cardápio por horário | Permite um cardápio expresso no intervalo e outro diurno para o público universitário. | P |
| CAF-000150 | Upsell em todos os canais | O totem já tem a regra de sugestão; falta levá-la ao QR, ao pedido online e ao PDV. | P |
| CAF-000147 | Push de pedido pronto | O cliente pode sair da fila e voltar quando o pedido estiver pronto. | P/M |
| CAF-000145 | Display do cliente | O cliente confere o pedido e já vê o QR do Pix, o que deixa o caixa mais rápido. | P/M |
| CAF-000149 | Fidelidade com níveis | Fica por cima do cashback que já existe. | P/M |
| CAF-000148 | Vale-presente | Nenhum concorrente brasileiro pesquisado oferece, o que pode virar diferencial. Presente "café + espetáculo". | M |
| CAF-000155 | XML da NF-e de compra | Reduz a digitação e completa os lotes e a validade (PEPS). | M |

### 🟢 Depende de decisão externa

| ID | Feature | Bloqueio | Esforço |
|---|---|---|---|
| CAF-000153 | Voucher ingresso + consumo | Plataforma de bilheteria do teatro | M |
| CAF-000154 | Escala da equipe | Tamanho da equipe; o ponto eletrônico fica com um fornecedor certificado | M |
| CAF-000156 | Assinatura do café | PSP com Pix Automático (depende da CAF-000123) | M/G |
| CAF-000157 | Maquininha integrada | Adquirente atual e programa de parceiros | M/G |

---

## Notas regulatórias (Brasil)

- **Gorjeta (Lei 13.419/2017, CLT art. 457 §3º):**
  - A taxa de serviço não é receita da empresa.
  - O critério de rateio é definido em convenção ou acordo coletivo, ou em assembleia.
  - A empresa só retém até 20% (Simples) ou 33% (demais regimes), e só se a norma coletiva prever.
  - A gorjeta vai para a CTPS e o contracheque.
- **Preço:**
  - O preço de cada opção precisa estar visível antes da escolha (Lei 10.962/2004, Decreto 5.903/2006).
  - O preço exibido tem de ser o preço cobrado. Isso vale para o cardápio por horário e para as variações.
- **Alergênicos:**
  - A RDC Anvisa 727/2022 vale para alimentos embalados.
  - Leis estaduais (CE, MA, PA, RN) exigem informar glúten e lactose em cardápios.
  - **A regra no RS e em Lajeado não foi verificada.**
- **Vale-presente e assinatura:**
  - Regras claras (CDC arts. 6º e 31).
  - Direito de arrependimento de 7 dias na venda online (CDC art. 49).
  - Na assinatura, cancelamento simples.
  - Tratamento fiscal do vale como adiantamento, com nota no resgate: a confirmar com o contador.
- **Ingresso + consumo:**
  - Vender um só junto com o outro é venda casada (CDC art. 39, I).
  - Consumação mínima é considerada abusiva.
  - A meia-entrada incide só sobre o ingresso.
- **Ponto eletrônico:**
  - Obrigatório acima de 20 empregados (CLT art. 74 §2º).
  - Deve seguir a Portaria MTP 671/2021, por isso a recomendação é integrar com um fornecedor certificado em vez de construir.
- **LGPD:** o opt-in é obrigatório para push, WhatsApp e fidelidade. A correção do consentimento atual está na [CAF-000132](CAF-000132-lgpd-consentimento-privacidade-e-exportacoes-seguras.md).

---

## Considerado e deixado para depois

- **Pedido em grupo no QR** (me&u Group Tabs, Ritual Piggyback): o QR por mesa com comanda compartilhada já cobre boa parte. Reavaliar quando houver demanda.
- **Robô de pedidos no WhatsApp:** exige a API oficial, com custo por mensagem desde 1º de julho de 2025, e o pedido online já cobre o fluxo. A CAF-000147 deixa o WhatsApp como P2.
- **Assistente de IA sobre os dados** (Square AI, Toast IQ): os relatórios e o DRE já existem. Faz mais sentido depois que os dados estiverem consistentes (CAF-000126 a 138).
- **Atendimento telefônico por IA e balança:** não se aplicam a uma cafeteria de salão dentro de um teatro.
- **Convite para avaliar no Google só para quem está satisfeito:** a política do Google proíbe filtrar quem é convidado a avaliar ("review gating"). A avaliação própria (CAF-000042) continua sendo o caminho certo.

---

## Fontes

- Square:
  - [Square Releases 2025](https://community.squareup.com/t5/Product-Updates/Square-Releases-Vol-2-2025-New-tools-for-restaurants/ba-p/820230)
  - [níveis de fidelidade](https://squareup.com/help/us/en/article/8077-create-square-loyalty-tiers) · [fidelidade](https://square.com/ca/en/software/loyalty)
  - [gift cards](https://squareup.com/help/us/en/article/8402-sell-and-send-gift-cards)
  - [categorias por horário](https://squareup.com/help/article/7075-set-up-time-based-categories-in-your-square-online-store)
  - [tip pooling](https://squareup.com/help/us/en/article/7654-get-started-with-tip-pooling-for-team-management)
- Toast:
  - [Kaldi's Coffee](https://d22ee908voahmo.cloudfront.net/blog/kaldis-coffee) · [Broad Street Baking](https://pos.toasttab.com/blog/broad-street-baking-company)
  - [SMS ao cliente](https://support.toasttab.com/en/article/Text-messages-guests-can-receive-from-Toast) · [quote time](https://support.toasttab.com/en/article/Managing-Your-Quote-Time-Strategy)
  - [alergênicos](https://support.toasttab.com/en/article/Manage-Allergens-on-POS-and-KDS) · [display do cliente](https://support.toasttab.com/en/article/Guest-Facing-Display-loyalty-sign-up-and-check-in)
  - [Toast IQ](https://www.businesswire.com/news/home/20250501039656/en)
- Lightspeed: [features](https://www.lightspeedhq.com/pos/restaurant/features/) · Clover: [coffee shops](https://clover.com/pos-systems/customer-engagement/coffee-shops) · Loyverse: [features](https://loyverse.com/features)
- TouchBistro: [guia 2026](https://www.touchbistro.com/wp-content/uploads/2024/09/US-TouchBistro-Product-Guide-2026.pdf) · SumUp: [cafés](https://sumup.com/en-gb/business-types/restaurants-coffee-shops) · Odoo: [POS restaurante](https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/restaurant.html)
- Revel: [display](https://revelsystems.com/products/customer-display-system-xt) · Shopify: [POS](https://help.shopify.com/en/manual/sell-in-person/getting-started/pos-subscription-overview)
- Starbucks:
  - [níveis 2026](https://www.restaurantdive.com/news/starbucks-rewards-points-tiers-green-gold-reserve/810753)
  - [Smart Queue](https://www.customerexperiencedive.com/news/starbucks-ceo-niccol-bringing-order-to-mobile-ordering/738894/) · [agendamento](https://www.nrn.com/top-500-restaurants/starbucks-is-testing-out-an-ability-to-schedule-orders-ahead-of-time)
  - [favoritos](https://www.androidpolice.com/2017/01/30/mercifully-starbucks-app-now-lets-you-save-your-favorite-drinks/)
- Pedido antecipado: [Joe](https://support.joe.coffee/article/264-how-to-order-ahead) · [Ritual Piggyback](https://help.ritual.co/hc/en-ca/articles/360021581894-What-is-Piggyback-and-its-benefits) · [me&u Group Tabs](https://help.meandu.com/hc/en-us/articles/14308746839055-Boost-revenue-with-me-u-Group-Tabs)
- Brasil:
  - [Saipos](https://saipos.com/sistema) · [Consumer](https://consumer.com.br/) · [Consumer TEF HUB](https://atualizacoes.consumer.com.br/pdv/anteriores/14.9.2/14.9.2.3/implementacao-do-tef-hub)
  - [Goomer](https://www.goomer.com.br) · [Anota AI](https://anota.ai)
  - [Zig](https://en.zig.fun/produtos/antecipacao-de-consumo/) · [Stone Connect](https://conteudo.stone.com.br/como-conectar-seu-software-na-stone/) · [Mercado Pago Point](https://www.mercadopago.com.br/blog/integrar-point-sistema-comandas-restaurante)
  - [PagBank Tap to Pay](https://blog.pagbank.com.br/tap-to-pay-no-iphone)
- Regulatório:
  - [Lei 13.419/2017](https://planalto.gov.br/ccivil_03/_Ato2015-2018/2017/Lei/L13419.htm) · [rateio de gorjetas](https://www.guiatrabalhista.com.br/tematicas/Gorjetas-incorporacao-rateio.htm)
  - [Pix Automático](https://teletime.com.br/04/06/2025/pix-automatico-para-pagamentos-recorrentes-fica-disponivel-dia-16/) · [Pix por aproximação](https://finsidersbrasil.com.br/regulamentacao/bc-divulga-regras-que-viabilizam-pagamentos-com-pix-por-aproximacao)
  - [RDC Anvisa 727/2022](https://www.demarest.com.br/anvisa-altera-a-regulamentacao-de-alimentos/) · [Lei PA 10.654/2024](https://bancodeleis.alepa.pa.gov.br/arquivos/lei10654_2024_13854.pdf)
  - [WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing) · [review gating](https://www.podium.com/article/review-gating)
  - [Alterdata XML](https://ajuda.alterdata.com.br/bimerbase/estoque/importacao-em-massa-de-xmls-de-nf-es-de-compra) · [Tablet Cloud XML](https://ajuda.tabletcloud.com.br/retaguarda/modulo-estoque/como-registrar-uma-entrada-de-estoque)
