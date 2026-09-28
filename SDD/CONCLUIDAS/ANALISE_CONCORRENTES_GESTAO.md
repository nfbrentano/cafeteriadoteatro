# Análise — Gestão do negócio × Kyte, Jarbas, Garfo, Simpliza e Suitable (Set/2026)

Comparação das funcionalidades divulgadas por cinco sistemas de gestão para food service e pequeno varejo com o que o Cafeteria do Teatro já tem.
Complementa a [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md) (CAF-000022 a 000030, focada no KDS e na produção), que continua válida. A Suitable também confirma os recursos de KDS e impressão daquela análise, e os specs 022, 026, 028 e 029 passaram a citá-la.

> **Escopo:** integrações com iFood, 99Food, Aiqfome, Goomer e outras plataformas de delivery foram **ignoradas** por decisão do cliente.
> **Fontes:** sites oficiais de cada produto (links no fim). Os recursos citados são os divulgados publicamente; não houve teste dos sistemas.

---

## O que já temos (resumo)

- **PDV:** pedido com adicionais vinculados, meio a meio, observação, promoções e cortesias; mesas (transferir, juntar, fechar e dividir conta); taxa de serviço e desconto; fila offline idempotente.
- **KDS:** estações bar × cozinha, item a item, impressão, voz e som.
- **Financeiro:** caixa do dia com fundo de troco, sangria, suprimento e conferência por forma de pagamento (⚠️ com defeitos, ver [CAF-000044](CAF-000044-fechamento-de-caixa-cego-e-correcoes.md)).
- **Admin:** cardápio, adicionais, promoções, mesas, usuários (barista/cozinha/admin + "pode dar desconto"), relatórios (produtos, pagamentos, tempo de preparo, pico, ticket médio), CSV e log de auditoria.
- **Cardápio público:** consulta com promos, esgotados e botão do WhatsApp (sem pedido).

---

## Funcionalidades em comum entre os concorrentes

| Funcionalidade | Kyte | Jarbas | Garfo | Simpliza | Suitable | Cafeteria do Teatro | Gap → CAF |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| PDV / frente de caixa | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Mesas e comandas | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | — |
| Múltiplas formas de pagamento | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Relatórios de vendas, produtos, ticket, horário | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Cadastro de produtos e categorias | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| KDS e impressão por setor | ❌ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | [CAF-000022–030](ANALISE_PEDIDOS_COZINHA.md) |
| **Caixa com sangria/suprimento e fechamento auditado (cego)** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Esperado visível, cálculo no navegador, RPCs incompatíveis | [CAF-000044](CAF-000044-fechamento-de-caixa-cego-e-correcoes.md) |
| **Controle de estoque integrado à venda** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ Só "esgotado" manual | [CAF-000031](CAF-000031-controle-de-estoque.md) |
| **Custo, ficha técnica e lucro por produto** | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ | [CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md) |
| **Cadastro de clientes com histórico** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ❌ Só nome em texto | [CAF-000033](CAF-000033-cadastro-de-clientes.md) |
| **Fiado / conta corrente / créditos pré-pagos** | ✅ | ✅ | ❌ | ✅ | ⚠️ | ❌ | [CAF-000034](CAF-000034-conta-do-cliente-fiado-e-creditos.md) |
| **Contas a pagar e fluxo de caixa** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | [CAF-000035](CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md) |
| **Permissões por cargo e desempenho por operador** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ 3 papéis fixos | [CAF-000036](CAF-000036-permissoes-por-cargo-e-desempenho.md) |
| **Cardápio digital com QR na mesa e pedido pelo cliente** | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ Só consulta | [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md) |
| **Link de pedidos próprio (WhatsApp/redes) para retirada** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ❌ Só abre o WhatsApp | [CAF-000038](CAF-000038-pedido-online-para-retirada.md) |
| **Pix com QR Code e taxas por forma de pagamento** | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ Pix é só rótulo | [CAF-000039](CAF-000039-pix-qr-code-e-taxas-de-pagamento.md) |
| **Totem / tablet de autoatendimento** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | [CAF-000040](CAF-000040-totem-de-autoatendimento-no-balcao.md) |
| **CRM: segmentação, tags e campanhas** | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ❌ | [CAF-000041](CAF-000041-crm-segmentacao-e-tags.md) |
| **Avaliação do pedido pelo cliente** | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ Só link do Google | [CAF-000042](CAF-000042-avaliacao-do-pedido-pelo-cliente.md) |
| **Etiqueta por item (copo/embalagem)** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | [CAF-000043](CAF-000043-etiqueta-de-copo-e-embalagem.md) |
| Gestão de entrega própria (entregadores, rotas) | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | Fora do escopo (ver abaixo) |
| NFC-e / NF-e / SAT | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | Fora do escopo (ver abaixo) |
| Integração com iFood e marketplaces | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ❌ | **Ignorado** |

Legenda: ✅ tem · ⚠️ parcial ou não confirmado no site · ❌ não tem

**Recursos de um único concorrente que não foram priorizados:**
- **Kyte:** descrições de produto e assistente com IA, importação de produtos em massa e produtos fracionados por peso (pouco útil numa cafeteria).
- **Jarbas:** orçamentos, em parte cobertos pelas encomendas da CAF-000038.
- **Suitable:**
  - robô de WhatsApp e gatilhos automáticos (exigem a API oficial do WhatsApp; a CAF-000041 cobre o envio assistido);
  - Menu Analytics, o funil do cardápio (o site já usa GA4 em `js/analytics.js`; basta adicionar os eventos do cardápio quando a CAF-000037 for implementada);
  - balança inteligente, B.I. e pagamento na mesa (exige gateway).
- **Leitor de código de barras (Kyte/Jarbas):** entrou como requisito da CAF-000031.

---

## Principais necessidades (sinalização)

### 🔴 Prioridade alta

| ID | Feature | Por que | Esforço |
|---|---|---|---|
| [CAF-000044](CAF-000044-fechamento-de-caixa-cego-e-correcoes.md) | Caixa: correções + fechamento cego | Defeito: a tela e as RPCs do repositório não batem, e a conferência vem pré-preenchida com o esperado. | P |
| [CAF-000031](CAF-000031-controle-de-estoque.md) | Estoque com baixa automática | Presente nos 5 concorrentes; base do custo e do lucro. | G |
| [CAF-000037](CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md) | QR na mesa + pedido do cliente | Maior ganho no pico do intervalo do espetáculo. | G |

### 🟡 Prioridade média

| ID | Feature | Por que | Esforço |
|---|---|---|---|
| [CAF-000039](CAF-000039-pix-qr-code-e-taxas-de-pagamento.md) | Pix QR + taxas | Pequena e com efeito imediato no balcão e no valor líquido real. | P |
| [CAF-000033](CAF-000033-cadastro-de-clientes.md) | Cadastro de clientes | Pré-requisito da 034, 038, 041 e 042. | M |
| [CAF-000040](CAF-000040-totem-de-autoatendimento-no-balcao.md) | Totem no balcão | A fila do intervalo é no balcão; reaproveita a 037. | M |
| [CAF-000032](CAF-000032-ficha-tecnica-custo-e-lucro.md) | Ficha técnica, custo e lucro | Mostra a margem real das promoções e cortesias. | M |
| [CAF-000035](CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md) | Contas a pagar e fluxo de caixa | Fecha o resultado do mês no sistema. | M |
| [CAF-000034](CAF-000034-conta-do-cliente-fiado-e-creditos.md) | Fiado e créditos pré-pagos | Público recorrente (Univates/teatro). | M |
| [CAF-000038](CAF-000038-pedido-online-para-retirada.md) | Pedido online para retirada / encomendas | Venda antecipada antes do espetáculo. | M |

### 🟢 Prioridade baixa

| ID | Feature | Por que | Esforço |
|---|---|---|---|
| [CAF-000043](CAF-000043-etiqueta-de-copo-e-embalagem.md) | Etiqueta por item | Evita troca de bebida; depende de impressora de etiquetas. | P |
| [CAF-000042](CAF-000042-avaliacao-do-pedido-pelo-cliente.md) | Avaliação do pedido | Feedback por produto e mais avaliações no Google. | P |
| [CAF-000041](CAF-000041-crm-segmentacao-e-tags.md) | CRM: segmentos, tags e campanhas | Só faz sentido com a base de clientes da 033 formada. | M |
| [CAF-000036](CAF-000036-permissoes-por-cargo-e-desempenho.md) | Permissões por cargo + desempenho | Mexe em todas as policies; fazer quando a equipe crescer. | M |

---

## Ordem sugerida

Primeiro os defeitos: **044** (caixa) e as correções do KDS já especificadas (**023 → 022 → 024**). Depois:

**039 → 031 → 033 → 037 → 040 → 032 → 035 → 034 → 038 → 043 → 042 → 041 → 036**

- **044** vem antes da **034** e da **039**, que usam o cálculo do caixa.
- **031** é a base da **032** (custo) e melhora o "esgotado" que já existe.
- **033** vem antes da **034**, **038**, **041** e **042**, que precisam do cliente cadastrado.
- **037** cria o módulo de pedido no cardápio e a RPC pública, reaproveitados pela **040** e pela **038**.
- **043** depende da **028** (configuração de impressão por tela).
- **036** fica por último porque troca `get_user_role()` em todas as migrations.

---

## Fora do escopo desta rodada

- **Integração com iFood e outras plataformas de delivery:** ignorada por decisão do cliente.
- **Gestão de entrega própria** (entregadores, mapa e rotas, app do motoboy): comum em Kyte, Garfo, Simpliza e Suitable, mas a operação da cafeteria é de salão e retirada dentro do teatro. A CAF-000038 cobre só retirada; reavaliar se houver demanda de entrega.
- **NFC-e / NF-e / SAT e entrada de estoque por XML:** exigem certificado digital e provedor fiscal.
- **TEF, pagamento na mesa e Pix dinâmico com confirmação automática:** exigem gateway/PSP; a CAF-000039 cobre o Pix estático com valor.
- **Automação de WhatsApp (robô, gatilhos, disparo em massa):** exige a API oficial do WhatsApp Business.

---

## Fontes

- Kyte: https://www.kyteapp.com/pt
- Jarbas — padarias: https://www.jarbas.app/segmentos/padarias · site: https://www.jarbas.app
- Garfo: https://garfo.app · https://garfo.app/llms.txt
- Simpliza: https://simpliza.com.br · https://simpliza.com.br/administrativo.php · https://simpliza.com.br/sistema-para-restaurantes.php
- Suitable: https://suitable.com.br
  - Módulos: [KDS](https://suitable.com.br/produto/kds/), [salão](https://suitable.com.br/produto/salao/), [impressões](https://suitable.com.br/produto/impressoes/), [estoque](https://suitable.com.br/produto/estoque/) e [financeiro](https://suitable.com.br/produto/financeiro/).
  - Aplicativos: [totem](https://suitable.com.br/aplicativos/totem/).
  - Marketing: [CRM](https://suitable.com.br/marketing/crm/), [gatilhos](https://suitable.com.br/marketing/gatilhos/), [Menu Analytics](https://suitable.com.br/marketing/menu-analytics/) e [Suit Ratings](https://suitable.com.br/marketing/suit-ratings/).
