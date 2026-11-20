# [FEAT] Display do cliente no caixa (tela voltada ao cliente)

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Criar uma tela voltada para o cliente no balcão (tablet ou segundo monitor) que mostra, em tempo real, os itens lançados pelo operador, o total, o QR do Pix para pagar, o cashback que o cliente vai ganhar e, opcionalmente, o convite para se cadastrar com consentimento LGPD. Em repouso, mostra a marca e os destaques do cardápio.
- **Problema e evidência:**
  - *Hoje no sistema:* o cliente só vê o que foi lançado se o operador virar a tela. O QR do Pix do fechamento é desenhado no próprio PDV (`js/pdv/fechamento.js:151-200`, `atualizarPixFechamentoBox`; botão "📱 QR Pix" em `:298`), então o operador precisa virar o tablet para o cliente escanear. O cashback existe (`js/utils/cashback.js:103`, `calculateCashback`), mas só aparece ao operador. Não há página de display nem canal de sincronização entre telas (nenhum uso de `BroadcastChannel` no repositório). O cadastro de cliente no PDV é digitado pelo operador (`js/pdv/estado.js:170-179`), e o consentimento de contato (`clientes.aceita_contato`) é marcado por ele.
  - *Mercado:* o Loyverse oferece display do cliente gratuito; a Toast permite cadastro e check-in na fidelidade direto no display; a Revel vende o Customer Display System XT. O CDC (art. 6º, III) garante informação clara sobre o que está sendo cobrado.
- **Impacto de não fazer:** Erros de lançamento só percebidos depois do pagamento (estornos no pico); fila maior porque o tablet passa de mão em mão para o Pix; cadastro e consentimento LGPD sem a ação do próprio titular; cashback e campanhas pouco visíveis.
- **Para quem é destinado:** Cliente no balcão; operador de caixa.
- **História de usuário:** Como cliente no balcão, quero ver o que está sendo lançado e pagar o Pix pela tela à minha frente, para conferir o pedido e não esperar o operador virar o tablet.
- **Como saberemos que deu certo:** Item lançado aparece no display em até 1 s (P95) na mesma rede; 0 vezes em que o operador precisa virar o tablet para o Pix nos dias de teste; pelo menos 20% dos clientes não identificados aceitam o cadastro pelo display no primeiro mês (meta a validar com o dono).

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Página `display.html` (somente leitura, sem login de operador), pareada a um PDV por código de 6 dígitos, no mesmo padrão do pareamento do totem (`parear_totem`, CAF-000040), com token de sessão revogável no admin | P0 | CA01, CA02 |
| RF02 | Sincronização PDV → display: `BroadcastChannel` quando as duas telas estão no mesmo navegador (segundo monitor) e canal *broadcast* do Supabase Realtime por par pareado quando são aparelhos diferentes. Mensagens com estado completo (itens, quantidades, opções, subtotal, descontos, taxa, total) e número de sequência | P0 | CA03, CA04 |
| RF03 | Fase de pagamento: o PDV envia o valor e o payload Pix já gerado; o display mostra o QR grande com o valor; troco e forma de pagamento escolhida aparecem ao final | P0 | CA05 |
| RF04 | Tela de repouso com logo e destaques (até 3 produtos configuráveis) após 30 s sem carrinho | P1 | CA06 |
| RF05 | Cliente identificado: mostra o primeiro nome, o saldo de cashback e quanto vai ganhar nesta compra | P1 | CA07 |
| RF06 | Cadastro pelo display: cliente digita o celular e marca, de forma separada e desmarcada por padrão, o aceite de contato; o PDV recebe o cliente vinculado | P1 | CA08, CA09 |
| RF07 | Gorjeta sugerida no display (0/5/10%/outro) quando a CAF-000144 estiver ativa | P2 | — |
| RF08 | Pix dinâmico com "Pago ✓" automático quando a CAF-000123 existir | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Latência PDV → display ≤ 1 s (P95) em Realtime e ≤ 100 ms em `BroadcastChannel` | P0 | CA03 |
| RNF02 | O display nunca recebe dados de outros clientes, telefone completo ou CPF; telefone aparece mascarado (`(51) 9****-1234`) | P0 | CA10 |
| RNF03 | Perda de conexão: display mostra "Reconectando…" e, ao voltar, pede o estado completo ao PDV (sem itens fantasmas) | P0 | CA04 |
| RNF04 | Legível a 1,5 m: total com fonte ≥ 48 px; contraste WCAG AA; funciona em tablet Android de entrada (Chrome) e em monitor HDMI | P1 | CA06 |
| RNF05 | O PDV funciona igual sem display pareado (zero dependência) | P0 | CA11 |

### Dependências técnicas

- Estado do carrinho e fechamento do PDV (`js/pdv/estado.js`, `js/pdv/carrinho.js`, `js/pdv/fechamento.js`); `js/pix-brcode.js`; `js/utils/cashback.js`.
- Pareamento e sessão no padrão de `totens` (CAF-000040); tabela nova `displays_cliente` (id, nome, pdv_dispositivo, token_hash, ativo, último acesso) com RLS.
- RPC nova `registrar_cliente_display(token_display, telefone, nome, aceita_contato)` SECURITY DEFINER, com limite de tentativas.
- CAF-000132 (consentimento LGPD e política de privacidade) antes do cadastro pelo display; CAF-000140 (manifests/SW por perfil) para o display ter seu próprio precache.

### Recursos necessários

- Hardware: tablet de 10" com suporte de balcão ou monitor com cabo HDMI no computador do caixa. Arte da tela de repouso.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o admin gerando um código de pareamento, quando o display digita o código válido, então fica ligado àquele PDV e mostra a tela de repouso.
- [ ] **CA02:** Dado um código expirado ou um display revogado no admin, quando tenta parear ou continuar, então vê "Display não autorizado" e não recebe nenhum carrinho.
- [ ] **CA03:** Dado o display pareado, quando o operador lança 2 cappuccinos e 1 pão de queijo, então o display mostra os itens e o total certo em até 1 s.
- [ ] **CA04:** Dado o display sem rede por 30 s enquanto o operador remove um item, quando a rede volta, então o display mostra o carrinho atual (sem o item removido).
- [ ] **CA05:** Dado o fechamento em Pix de R$ 23,50, quando o operador escolhe Pix, então o QR com R$ 23,50 aparece no display e o operador não precisa virar o tablet.
- [ ] **CA06:** Dado nenhum carrinho por 30 s, quando o tempo passa, então o display mostra logo e destaques legíveis a 1,5 m.
- [ ] **CA07:** Dado um cliente identificado com R$ 8,00 de saldo e cashback de 5%, quando o total é R$ 40,00, então o display mostra "Você ganha R$ 2,00 de cashback" e o saldo atual.
- [ ] **CA08:** Dado um cliente sem cadastro, quando ele digita o celular no display e confirma, então o cliente é criado ou encontrado e aparece vinculado no PDV.
- [ ] **CA09:** Dado o cadastro pelo display, quando o cliente não marca o aceite de contato, então `aceita_contato` fica falso (a caixa nunca vem marcada).
- [ ] **CA10:** Dado um pedido de cliente identificado, quando inspeciono as mensagens recebidas pelo display, então não há telefone completo, e-mail, CPF nem dados de outro pedido (caso negativo).
- [ ] **CA11:** Dado nenhum display pareado, quando o operador vende e fecha a conta, então o PDV funciona sem erro nem espera.

## O que a atividade não inclui

- Pagamento por cartão no display: motivo: depende da maquininha integrada (CAF-000157).
- Exibir publicidade de terceiros: motivo: fora do posicionamento da casa.
- Assinatura do cliente na tela: motivo: não há uso no Brasil para esse fluxo.
- Display no totem: motivo: o totem já é voltado ao cliente.

### Considerado para o futuro (P2)

- Gorjeta sugerida (RF07) e Pix com confirmação automática (RF08).
- Avaliação rápida do atendimento (1 toque) ao final, ligada à CAF-000042.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Hardware: tablet separado ou segundo monitor no computador do caixa? Muda o canal (Realtime x `BroadcastChannel`) | PO | Sim (para o piloto) | |
| D02 | Quantos pontos de venda terão display (só o balcão principal)? | PO | Não | |
| D03 | O cadastro pelo display pode pedir data de nascimento (para benefício de aniversário da CAF-000149)? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Pareamento e revogação | pgTAP (`supabase/tests/display_cliente.test.sql`) | CA01, CA02 | Parear, expirar, revogar | Token válido/negado |
| CT02 | Mensagem de estado | unit (`tests/caf-000145-display-cliente.test.js`, módulo `js/utils/display-sync.js`) | CA03, CA10 | Montar mensagem a partir do carrinho | Itens e total certos; sem PII |
| CT03 | Ressincronização | unit (sequência e pedido de estado) | CA04 | Perder mensagens e reconectar | Estado final igual ao PDV |
| CT04 | Pix no display | integração (DOM do display com `js/pix-brcode.js`) | CA05 | Enviar fase de pagamento | QR com o valor |
| CT05 | Repouso | unit (timer simulado) | CA06 | 30 s sem carrinho | Tela de repouso |
| CT06 | Cashback | unit (`js/utils/cashback.js`) | CA07 | R$ 40 com 5% | R$ 2,00 |
| CT07 | Cadastro e consentimento | pgTAP + DOM | CA08, CA09 | Cadastrar com e sem aceite | Cliente criado; `aceita_contato` correto |
| CT08 | PDV sem display | integração (suítes do PDV) | CA11 | Vender sem par | Sem erro |
| CT09 | Duas telas reais | e2e (Playwright, 2 páginas) | CA03, CA05 | PDV + display no mesmo contexto | Sincronizado |

## URL Complementar

- Documentação técnica: `js/pdv/fechamento.js`, `js/pdv/estado.js`, `js/pdv/carrinho.js`, `js/pix-brcode.js`, `js/utils/cashback.js`, `supabase/migration_caf_000040_totem.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000039](CONCLUIDAS/CAF-000039-pix-qr-code-e-taxas-de-pagamento.md), [CAF-000040](CONCLUIDAS/CAF-000040-totem-de-autoatendimento-no-balcao.md), [CAF-000063](CONCLUIDAS/CAF-000063-cashback-fidelidade-automatico-carteira-cliente.md), [CAF-000033](CONCLUIDAS/CAF-000033-cadastro-de-clientes.md); [CAF-000123](CAF-000123-pix-dinamico-com-confirmacao-automatica.md); novas: CAF-000132, CAF-000140, CAF-000144, CAF-000149, CAF-000157
- Referências de design: Loyverse (https://loyverse.com/features); Toast display com fidelidade (https://support.toasttab.com/en/article/Guest-Facing-Display-loyalty-sign-up-and-check-in); Revel CDS XT (https://revelsystems.com/products/customer-display-system-xt)
- Requisitos originais: CDC art. 6º, III (informação clara)
- Issue / PR relacionado: —
