# [FEAT] Assinatura / clube do café com Pix Automático

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Vender planos de assinatura com cobrança recorrente por Pix Automático, como "Café diário" (1 café por dia útil durante o semestre, para universitários) e "Passe da temporada" (N bebidas nos dias de espetáculo). O assinante usa o benefício no PDV ou pelo QR, identificado pelo celular ou por um QR pessoal. Cancelar deve ser tão simples quanto assinar.
- **Problema e evidência:**
  - *Hoje no sistema:* não há cobrança recorrente nem plano. O Pix é estático: o BR Code é montado em `js/pix-brcode.js`, sem confirmação de pagamento (ver CAF-000123). O snapshot de produção não tem nenhuma tabela de planos, assinaturas ou cobranças (`tests/fixtures/schema-snapshot.json`).
  - O que existe de pré-pago é a carteira em reais do cliente (`cliente_conta_movimentos`, CAF-000034), que não limita "1 café por dia" nem renova sozinha. Os cupons (CAF-000061) dão desconto, mas não controlam direito de uso por período.
  - O Pix Automático, do Banco Central, está em vigor desde 16/06/2025: o cliente autoriza uma vez no app do banco e as cobranças seguintes são debitadas sem nova ação. Ele depende de um PSP com API, a mesma decisão bloqueante da CAF-000123.
  - *Mercado:* assinatura nativa é rara em sistemas de PDV. O Square oferece por meio do app Subport e o Shopify POS por meio de apps de terceiros. Clube de café com retirada na loja é um diferencial para o público universitário diurno e para quem assina a temporada do teatro.
  - *Regras:* o CDC exige informação clara sobre preço, periodicidade, renovação e cancelamento (arts. 6º, III, e 31) e garante arrependimento em 7 dias na contratação fora do estabelecimento (art. 49).
- **Impacto de não fazer:** Receita previsível que não é capturada (manhãs de semestre letivo); o estudante frequente compra avulso e pode trocar de café; nenhum vínculo com o público de temporada do teatro.
- **Para quem é destinado:** Estudante e servidor da Univates (café diário); espectador de temporada; operador do PDV (valida o benefício); dono (planos e receita).
- **História de usuário:** Como estudante, quero assinar o "Café diário" do semestre pagando por Pix Automático todo mês, para pegar meu café de manhã só mostrando o QR, sem pagar a cada vez.
- **Como saberemos que deu certo:** Benefício validado no PDV em até 2 toques; 0 usos acima do limite do plano (por dia/período), inclusive com leituras simultâneas; cancelamento concluído pelo próprio assinante em até 3 toques; inadimplência visível no admin no dia seguinte à falha da cobrança.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Tabela `planos_assinatura` (nome, preço, periodicidade mensal, itens elegíveis por produto/categoria, limite de usos por dia e por ciclo, dias válidos (úteis / espetáculo), vigência, termos) | P0 | CA01 |
| RF02 | Tabela `assinaturas` (cliente, plano, status: pendente/ativa/inadimplente/cancelada, início, próximo vencimento, id da recorrência no PSP) e `assinatura_cobrancas` (ciclo, valor, status, pago_em) | P0 | CA02, CA06 |
| RF03 | Adesão online (página do plano): cadastro com consentimento, aceite dos termos (texto exibido por completo) e autorização do Pix Automático pela Edge Function `pix-automatico-criar` (PSP da CAF-000123); assinatura só fica ativa após a confirmação do PSP por webhook | P0 | CA02, CA03 |
| RF04 | Renovação: webhook do PSP confirma cada cobrança (idempotente); falha muda o status para inadimplente e suspende o benefício até o pagamento | P0 | CA04, CA05 |
| RF05 | Uso do benefício: RPC `usar_beneficio_assinatura(assinatura, produto)` atômica, que lança o item com preço zero vinculado à assinatura, respeitando limite por dia/ciclo e dias válidos; no PDV pela leitura do QR pessoal ou busca do cliente; no QR da mesa pelo celular verificado | P0 | CA06, CA07, CA08 |
| RF06 | Cancelamento pelo assinante na página "Minha assinatura" (link enviado na adesão) com efeito no fim do ciclo pago; cancela a recorrência no PSP | P0 | CA09 |
| RF07 | Arrependimento em 7 dias: cancelamento com reembolso integral se não houve uso, ou proporcional conforme regra informada nos termos | P0 | CA10 |
| RF08 | Admin: planos, assinantes por status, receita recorrente mensal, usos por plano e inadimplentes | P1 | CA11 |
| RF09 | Adesão presencial no PDV (QR do Pix Automático no display, CAF-000145) | P1 | — |
| RF10 | Cobrança recorrente em cartão de crédito | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Credenciais do PSP só em secrets das Edge Functions; webhook autenticado (mesmo padrão da CAF-000123) | P0 | CA04 |
| RNF02 | QR pessoal com token rotativo (válido por 60 s) para impedir que um print seja usado por outra pessoa | P0 | CA08 |
| RNF03 | Uso simultâneo do mesmo benefício por dois caixas nunca passa do limite (lock na assinatura) | P0 | CA07 |
| RNF04 | Termos, preço e regra de cancelamento visíveis antes da autorização (CDC arts. 6º, III, e 31) | P0 | CA03 |

### Dependências técnicas

- **CAF-000123 (Pix dinâmico, PSP e Edge Functions)**: bloqueante; o PSP precisa oferecer Pix Automático.
- Cadastro e consentimento de clientes (CAF-000033, CAF-000132); fidelidade (CAF-000149, opcional: assinante em nível próprio).
- CAF-000124 (NFC-e): definir com o contador em que momento emitir.
- Telas: nova página `assinatura.html`, `js/pdv/clientes.js`, `js/pdv/carrinho.js`, `js/cardapio-cliente-pedido.js`, admin novo módulo `js/admin/assinaturas-admin.js`.

### Recursos necessários

- PSP com Pix Automático contratado; termos de uso revisados por advogado; definição dos planos e preços pelo dono.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o admin criando o plano "Café diário" (R$ 99,00/mês, 1 café da categoria "Cafés quentes" por dia útil), quando salva, então o plano aparece na página pública com preço, regras e termos.
- [ ] **CA02:** Dado um estudante que preenche a adesão e autoriza no banco, quando o PSP confirma, então a assinatura fica "ativa" com o próximo vencimento em 1 mês.
- [ ] **CA03:** Dado um estudante que não marca o aceite dos termos, quando tenta seguir, então a autorização não é gerada; dado que o PSP não confirma, então a assinatura continua "pendente" e não dá benefício.
- [ ] **CA04:** Dado a mesma notificação de cobrança paga recebida duas vezes, quando processada, então existe um único pagamento no ciclo; dado uma notificação sem autenticação válida, então é rejeitada.
- [ ] **CA05:** Dado uma cobrança recusada, quando o PSP notifica, então a assinatura fica "inadimplente" e o PDV mostra "benefício suspenso — pagamento pendente".
- [ ] **CA06:** Dado um assinante ativo numa terça, quando o operador lê o QR e escolhe um cappuccino, então o item entra com preço zero ligado à assinatura e o uso do dia é registrado.
- [ ] **CA07:** Dado o assinante que já usou o café do dia, quando tenta outro uso no mesmo dia (inclusive em dois caixas ao mesmo tempo), então só um uso é aceito e o outro recebe "limite diário atingido".
- [ ] **CA08:** Dado um print do QR pessoal com mais de 60 s, quando apresentado no PDV, então é recusado e pede o QR atualizado.
- [ ] **CA09:** Dado o assinante em "Minha assinatura", quando toca em cancelar e confirma, então a recorrência é cancelada no PSP e o benefício vale até o fim do ciclo pago.
- [ ] **CA10:** Dado uma adesão online feita há 4 dias e sem uso, quando o assinante cancela, então recebe reembolso integral e a assinatura fica "cancelada".
- [ ] **CA11:** Dado o painel do admin, quando abro o mês, então vejo assinantes por status, receita recorrente e usos por plano; um barista sem `admin.financeiro` não acessa (caso negativo).

## O que a atividade não inclui

- Cobrança recorrente em cartão: motivo: exige tokenização com adquirente; P2 e dependente da CAF-000157.
- Entrega de café em domicílio por assinatura: motivo: entrega própria está fora do escopo por decisão do dono.
- Assinatura de grãos para levar para casa: motivo: outro produto e logística; reavaliar depois.

### Considerado para o futuro (P2)

- Cartão recorrente (RF10); plano familiar ou corporativo (empresas da região).
- Assinante entra direto num nível de fidelidade (CAF-000149).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | PSP escolhido na CAF-000123 oferece Pix Automático? Custo por cobrança? | PO/dev | Sim | |
| D02 | Planos, preços e regras (dias úteis, semestre, temporada) | PO | Sim | |
| D03 | Regra de reembolso proporcional após uso dentro dos 7 dias | PO/jurídico | Sim | |
| D04 | Momento da emissão do documento fiscal (cobrança ou uso) | contador | Sim | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cadastro de plano | integração (`tests/caf-000156-assinaturas.test.js`, admin com Supabase simulado) | CA01 | Salvar plano | Página pública com termos |
| CT02 | Adesão e confirmação | integração (Edge Function com PSP simulado) + pgTAP (`supabase/tests/assinaturas.test.sql`) | CA02, CA03 | Aderir com e sem aceite; com e sem confirmação | Ativa/pendente |
| CT03 | Webhook idempotente e autenticado | integração | CA04 | Reenviar; adulterar | 1 pagamento; 401 |
| CT04 | Inadimplência | pgTAP | CA05 | Cobrança recusada | Benefício suspenso |
| CT05 | Uso e limite diário | pgTAP + integração (2 conexões) | CA06, CA07 | Usar duas vezes; em paralelo | Um uso |
| CT06 | QR rotativo | unit (`js/utils/qr-assinatura.js`, relógio controlado) | CA08 | Token com 61 s | Recusado |
| CT07 | Cancelamento e arrependimento | integração + pgTAP | CA09, CA10 | Cancelar no ciclo; cancelar em 4 dias | Fim do ciclo; reembolso |
| CT08 | Painel e permissão | pgTAP (claims de barista) + DOM | CA11 | Abrir painel | Totais; negado ao barista |
| CT09 | Homologação | manual (sandbox do PSP) | CA02, CA04 | Ciclo completo | Fluxo ok |

## URL Complementar

- Documentação técnica: `js/pix-brcode.js`, `js/pdv/clientes.js`, `js/cardapio-cliente-pedido.js`, `supabase/migration_caf_000034_conta_cliente.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000123](CAF-000123-pix-dinamico-com-confirmacao-automatica.md), [CAF-000124](CAF-000124-emissao-de-nfce-no-fechamento.md), [CAF-000033](CONCLUIDAS/CAF-000033-cadastro-de-clientes.md), [CAF-000034](CONCLUIDAS/CAF-000034-conta-do-cliente-fiado-e-creditos.md), [CAF-000061](CONCLUIDAS/CAF-000061-validacao-cupons-desconto-checkout-e-pdv.md); novas: CAF-000132, CAF-000145, CAF-000149, CAF-000157
- Referências de design: Shopify POS assinaturas (https://help.shopify.com/en/manual/sell-in-person/getting-started/pos-subscription-overview); Pix Automático (https://teletime.com.br/04/06/2025/pix-automatico-para-pagamentos-recorrentes-fica-disponivel-dia-16/)
- Requisitos originais: CDC arts. 6º, III, 31 e 49
- Issue / PR relacionado: —
