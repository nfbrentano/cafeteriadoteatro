# [FEAT] Maquininha integrada ao PDV (TEF / Smart POS)

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Integrar o PDV à maquininha de cartão por API em nuvem do adquirente. Ao escolher "cartão" no fechamento, o valor é enviado à maquininha sem digitação. A aprovação (bandeira, NSU, código de autorização, parcelas, taxa) volta ao PDV e conclui o pagamento sozinha. Esses dados alimentam a conciliação de recebíveis (CAF-000113).
- **Problema e evidência:**
  - *Hoje no sistema:* a maquininha é independente. O operador digita o valor na máquina e depois registra no PDV a forma (`cartao_credito`/`cartao_debito`) e o valor (`js/pdv/fechamento.js`, soma de `pag.valor` em `:84`, `:294`, `:348`). Não há confirmação de que a transação foi aprovada nem com qual valor.
  - `fechamento_pagamentos` guarda forma, valor e taxas, mas não NSU, autorização, bandeira nem parcelas (`tests/fixtures/schema-snapshot.json`: `id, fechamento_id, forma, valor, taxa_percentual, taxa_fixa, taxa_valor, valor_liquido`). A previsão de recebíveis da CAF-000113 é calculada com taxas e prazos cadastrados à mão em `formas_pagamento_taxas` (`supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql:235`, `obter_previsao_recebiveis`), sem como bater com o extrato do adquirente transação a transação.
  - O plano de evolução adiou o tema: "TEF/maquininha integrada: exige hardware e homologação; reavaliar depois da 123" (`SDD/PLANO_EVOLUCAO.md:51`; também em `SDD/CONCLUIDAS/ANALISE_CONCORRENTES_GESTAO.md:115`).
  - O PDV é um web app (PWA) e não acessa USB/serial. TEF tradicional (SiTef/PayGo com cliente local) exigiria um agente instalado. A integração por API em nuvem do adquirente (o PDV pede pela Edge Function, a maquininha recebe e responde por webhook) é compatível com a arquitetura atual.
  - *Mercado:* o Consumer integra Stone e Cielo pelo TEF HUB; a Saipos usa SmartPOS com Stone; o Stone Connect é liberado só para parceiros homologados; o Mercado Pago Point integra com sistemas de comanda por API. No iPhone, o Tap to Pay funciona no Brasil desde setembro de 2023 (Stone, Ton, PagBank), e o Pix por aproximação foi regulamentado em fevereiro de 2025.
- **Impacto de não fazer:** Erros de digitação no pico (valor a mais ou a menos na máquina); pagamento registrado sem aprovação real; divergência no fechamento de caixa por cartão; conciliação com o adquirente feita à mão.
- **Para quem é destinado:** Operador de caixa/barista; dono (conciliação e taxas).
- **História de usuário:** Como barista no intervalo, quero tocar em "cartão" e a maquininha já mostrar o valor, para o cliente só aproximar e o PDV fechar a conta sozinho.
- **Como saberemos que deu certo:** 0 digitações de valor na maquininha nas vendas integradas; diferença de cartão no fechamento de caixa = R$ 0,00 nos dias de teste; 100% das transações aprovadas com NSU gravado; conciliação por NSU com o extrato do adquirente sem ajuste manual.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Cadastro de terminais no admin (`terminais_pagamento`: adquirente, id do dispositivo, nome, PDV associado, ativo) e associação do PDV a um terminal | P0 | CA01 |
| RF02 | Edge Function `tef-criar-intencao` cria a intenção de pagamento (valor, crédito/débito/Pix, parcelas, referência idempotente do fechamento) na API em nuvem do adquirente; credenciais só no servidor | P0 | CA02, CA03 |
| RF03 | Tabela `pagamentos_terminal` (intenção, fechamento/pedido, valor, status: enviado/aprovado/negado/cancelado/expirado, NSU, autorização, bandeira, parcelas, taxa informada) com RLS | P0 | CA04 |
| RF04 | Edge Function `tef-webhook` autentica a notificação do adquirente, confere valor e referência, grava a aprovação e registra o pagamento no fechamento de forma idempotente | P0 | CA04, CA05, CA06 |
| RF05 | PDV: no fechamento, "Cartão (maquininha)" mostra "Aguardando pagamento na maquininha…" com botão cancelar; aprovação conclui a parte sozinha (Realtime); negado mostra o motivo e permite tentar de novo ou trocar a forma | P0 | CA05, CA07 |
| RF06 | Pagamento parcial e divisão de conta (CAF-000012/112): cada parte é uma intenção separada | P0 | CA08 |
| RF07 | Modo manual atual continua disponível (contingência) com motivo obrigatório, e o admin vê a proporção de manuais | P0 | CA09 |
| RF08 | Conciliação por NSU: tela que importa o extrato do adquirente (CSV/API) e compara transação a transação com `pagamentos_terminal`, usando a taxa real na CAF-000113 | P1 | CA10 |
| RF09 | Estorno pela maquininha a partir do PDV (cancelamento no mesmo dia), com permissão | P1 | CA11 |
| RF10 | Tap to Pay no celular do atendente e cobrança na mesa; TEF local (SiTef/PayGo) com agente instalado | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhum dado de cartão (PAN, CVV) passa pelo sistema; só os dados de retorno (NSU, autorização, bandeira, 4 últimos dígitos) | P0 | CA04 |
| RNF02 | Do toque em "cartão" até o valor na maquininha em ≤ 3 s (P95); da aprovação até a conta fechada no PDV em ≤ 3 s | P1 | CA02, CA05 |
| RNF03 | Webhook rejeita chamada sem autenticação válida e é idempotente pelo id da transação | P0 | CA06 |
| RNF04 | Intenção sem resposta em 120 s expira e libera o PDV para tentar de novo, sem cobrança dupla (consulta de status antes de nova intenção) | P0 | CA12 |

### Dependências técnicas

- Infraestrutura de Edge Functions e webhooks da CAF-000123 (mesmo padrão de segredo, autenticação e idempotência).
- Fechamento e pagamentos (CAF-000112), caixa (CAF-000044/079/108), DRE e recebíveis (CAF-000113).
- CAF-000128 (valores e sinais no servidor), CAF-000129 (saldo da mesa com fonte única) e CAF-000133 (envio sem perda e fila offline no PDV).
- Contrato com um adquirente que ofereça API em nuvem para o terminal (ex.: Mercado Pago Point; Stone Connect exige parceria).

### Recursos necessários

- Decisão do adquirente, terminal compatível, credenciais de homologação e, se exigido, processo de homologação do parceiro.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o admin, quando cadastra o terminal "Balcão 1" e o associa ao PDV do caixa, então o fechamento desse PDV passa a oferecer "Cartão (maquininha)".
- [ ] **CA02:** Dado uma conta de R$ 37,40, quando o operador escolhe crédito à vista, então a maquininha mostra R$ 37,40 sem digitação em até 3 s.
- [ ] **CA03:** Dado o código publicado, quando procuro as credenciais do adquirente em `dist/`, então elas não aparecem.
- [ ] **CA04:** Dado a aprovação na maquininha, quando o webhook chega, então `pagamentos_terminal` grava NSU, autorização, bandeira, parcelas e 4 últimos dígitos, e nenhum outro dado do cartão.
- [ ] **CA05:** Dado o PDV aguardando, quando a transação é aprovada, então a conta é fechada e a mesa liberada sem novo toque, em até 3 s.
- [ ] **CA06:** Dado a mesma notificação recebida duas vezes ou uma notificação com valor diferente da intenção, quando processadas, então existe um único pagamento; a de valor divergente vai para conferência e não fecha a conta.
- [ ] **CA07:** Dado uma transação negada por saldo insuficiente, quando o PDV recebe, então mostra "Negada: saldo insuficiente" e oferece tentar de novo ou trocar a forma.
- [ ] **CA08:** Dado uma conta dividida em 3 partes, quando cada parte é paga na maquininha, então há 3 intenções e 3 aprovações, e a conta só fecha após a terceira.
- [ ] **CA09:** Dado a API do adquirente fora do ar, quando o operador usa o modo manual, então o sistema exige o motivo e registra o pagamento como manual (caso negativo: não grava NSU inventado).
- [ ] **CA10:** Dado o extrato do adquirente do dia importado, quando comparo, então cada transação é casada por NSU e as diferenças (taxa ou valor) aparecem listadas.
- [ ] **CA11:** Dado um pagamento aprovado hoje, quando o gerente pede estorno pelo PDV, então a maquininha cancela a transação e o pagamento fica estornado; um barista sem permissão não consegue.
- [ ] **CA12:** Dado uma intenção sem resposta em 120 s, quando o operador tenta de novo, então o sistema consulta o status antes; se a primeira foi aprovada, não cria nova cobrança.

## O que a atividade não inclui

- TEF local (SiTef/PayGo) com agente instalado no computador: motivo: o PDV é web app sem acesso a USB e o agente aumenta o suporte; P2.
- Antecipação de recebíveis e gestão de chargebacks: motivo: são feitas no painel do adquirente.
- Pagamento por cartão no totem e no QR: motivo: exige terminal no totem ou link de pagamento; avaliar depois do piloto no balcão.

### Considerado para o futuro (P2)

- Tap to Pay no celular do atendente e cobrança na mesa (RF10).
- Pix por aproximação na maquininha, quando o adquirente oferecer pela mesma API.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual é o adquirente/maquininha atual? Ele tem API em nuvem para o terminal ou exige parceria/homologação? | PO | Sim | |
| D02 | Trocar de adquirente é uma opção se o atual não tiver API (custo de taxa x benefício)? | PO | Sim | |
| D03 | Quantos terminais (balcão, salão)? | PO | Não | |
| D04 | O mesmo PSP poderia cobrir Pix dinâmico (CAF-000123) e cartão? | PO/dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cadastro de terminal | integração (`tests/caf-000157-maquininha.test.js`, admin com Supabase simulado) | CA01 | Cadastrar e associar | Opção no fechamento |
| CT02 | Criar intenção | integração (Edge Function com adquirente simulado) | CA02 | Conta de R$ 37,40 | Intenção com o valor |
| CT03 | Segredo fora do build | unit (varre `dist/`) | CA03 | Procurar padrões | Não encontrado |
| CT04 | Webhook, dados e idempotência | integração + pgTAP (`supabase/tests/pagamentos_terminal.test.sql`) | CA04, CA06 | Aprovar; reenviar; valor divergente | Um pagamento; conferência |
| CT05 | Fechamento automático e negado | integração (harness de `js/pdv/fechamento.js`, Realtime simulado) | CA05, CA07 | Aprovar; negar | Conta fechada; mensagem |
| CT06 | Conta dividida | pgTAP + integração | CA08 | 3 partes | Fecha após a 3ª |
| CT07 | Modo manual | integração | CA09 | API fora | Motivo exigido; sem NSU |
| CT08 | Conciliação | unit (casamento por NSU) + pgTAP | CA10 | Extrato com divergência | Lista de diferenças |
| CT09 | Estorno e permissão | integração + pgTAP (claims de barista) | CA11 | Estornar | Estornado; negado ao barista |
| CT10 | Expiração sem cobrança dupla | integração | CA12 | Sem resposta 120 s; aprovar a 1ª | Sem nova intenção |
| CT11 | Homologação | manual (terminal de teste do adquirente) | CA02, CA05 | Venda real de teste | Fluxo completo |

## URL Complementar

- Documentação técnica: `js/pdv/fechamento.js`, `supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql`, `supabase/migration_caf_000112_fechamento_parcial_mesa.sql`, `supabase/migration_caf_000079_pix_admin_taxas_caixa.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000039](CONCLUIDAS/CAF-000039-pix-qr-code-e-taxas-de-pagamento.md), [CAF-000079](CONCLUIDAS/CAF-000079-pix-no-admin-e-taxas-no-fechamento-de-caixa.md), [CAF-000112](CONCLUIDAS/CAF-000112-fechamento-parcial-conta-mesa-pagamento-por-item-comanda-individual.md), [CAF-000113](CONCLUIDAS/CAF-000113-painel-executivo-dre-metas-turno-conciliacao-taxas.md), [ANALISE_CONCORRENTES_GESTAO.md](CONCLUIDAS/ANALISE_CONCORRENTES_GESTAO.md), [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md); [CAF-000123](CAF-000123-pix-dinamico-com-confirmacao-automatica.md); novas: CAF-000128, CAF-000129, CAF-000133, CAF-000145
- Referências de design: Consumer TEF HUB (https://atualizacoes.consumer.com.br/pdv/anteriores/14.9.2/14.9.2.3/implementacao-do-tef-hub); Stone Connect (https://conteudo.stone.com.br/como-conectar-seu-software-na-stone/); Mercado Pago Point (https://www.mercadopago.com.br/blog/integrar-point-sistema-comandas-restaurante); Tap to Pay no iPhone (https://blog.pagbank.com.br/tap-to-pay-no-iphone); Pix por aproximação (https://finsidersbrasil.com.br/regulamentacao/bc-divulga-regras-que-viabilizam-pagamentos-com-pix-por-aproximacao)
- Requisitos originais: —
- Issue / PR relacionado: —
