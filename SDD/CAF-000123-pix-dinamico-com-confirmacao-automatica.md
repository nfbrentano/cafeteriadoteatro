# [FEAT] Pix dinâmico com confirmação automática de pagamento no Totem, pedido online e PDV

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Gerar uma cobrança Pix individual por pedido/conta e marcar o pagamento como recebido automaticamente quando o banco confirmar, sem o operador conferir extrato.
- **Problema e evidência:** O Pix atual é estático: `js/pix-brcode.js` monta o BR Code com chave, valor e um `txid` informativo, e o Totem apenas exibe o QR na tela de sucesso (`js/totem.js:1245`). Não há integração com provedor de pagamento nem recebimento de confirmação (nenhum webhook no projeto). Quem confirma que o dinheiro entrou é o barista, olhando o aplicativo do banco, no momento de maior fila (intervalo do espetáculo). A própria análise de concorrentes deixou "Pix dinâmico com confirmação automática" fora do escopo por exigir PSP, e a CAF-000113 já calcula recebíveis e conciliação a partir de valores lançados à mão.
- **Impacto de não fazer:** Pedido de totem/online liberado sem pagamento confirmado (ou fila parada esperando conferência); divergência no fechamento de caixa por Pix não conferido; autoatendimento não se sustenta sem um operador ao lado.
- **Para quem é destinado:** Cliente (totem, QR na mesa, pedido online) e barista.
- **História de usuário:** Como cliente no totem, quero pagar por Pix e ver meu pedido confirmado na hora, para não precisar mostrar o comprovante no balcão.
- **Como saberemos que deu certo:** Pedido pago por Pix muda para "pago" em até 10 s após o pagamento, sem ação do operador; 0 pedidos de totem enviados à cozinha sem pagamento quando a opção "exigir pagamento" estiver ligada; diferença de Pix no fechamento de caixa igual a zero nos dias de teste.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Edge Function `pix-criar-cobranca` cria a cobrança no PSP (valor, `txid` único, validade) e devolve o "copia e cola"/QR; credenciais do PSP só no servidor | P0 | CA01, CA02 |
| RF02 | Tabela `pix_cobrancas` (pedido/conta, `txid`, valor, status, expira_em, pago_em, id da transação no PSP) com RLS | P0 | CA02 |
| RF03 | Edge Function `pix-webhook` valida a autenticidade da notificação do PSP, confere valor e `txid`, e registra o pagamento de forma idempotente | P0 | CA03, CA04, CA05 |
| RF04 | Totem e pedido online: tela de pagamento com QR, contador de validade e atualização automática para "Pago" via Realtime | P0 | CA06 |
| RF05 | Configuração no Admin: "exigir Pix pago antes de enviar para a cozinha" (totem/online) ligado/desligado | P0 | CA07 |
| RF06 | PDV: no fechamento de conta, opção "Pix com confirmação" que conclui o fechamento sozinho quando o pagamento entra; o Pix estático atual permanece como alternativa manual | P1 | CA08 |
| RF07 | Cobrança expirada ou paga com valor diferente fica marcada para conferência no Admin | P1 | CA09 |
| RF08 | Pagamentos confirmados alimentam o caixa e os recebíveis da CAF-000113 com a taxa real do PSP | P1 | CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma credencial do PSP no front nem no repositório | P0 | CA01 |
| RNF02 | Webhook rejeita chamadas sem assinatura/certificado válido e é idempotente por id de transação | P0 | CA03, CA04 |
| RNF03 | Se o PSP estiver fora do ar, as telas voltam ao Pix estático com aviso ao operador em menos de 5 s | P0 | CA11 |
| RNF04 | Confirmação visível ao cliente em até 10 s após o pagamento | P1 | CA06 |

### Dependências técnicas

- Conta em um PSP com API Pix (cobrança imediata + webhook).
- Supabase Edge Functions (primeiro uso no projeto) e secrets.
- `fechar_conta_mesa`, `pagamentos`, caixa (CAF-000073/079/108) e recebíveis (CAF-000113).
- CAF-000115 (registro de erros) recomendada antes de colocar dinheiro em fluxo automático.

### Recursos necessários

- Decisão do dono sobre o PSP e abertura da conta; credenciais de homologação (sandbox).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o código publicado, quando procuro as credenciais do PSP, então elas não aparecem em nenhum arquivo servido ao navegador.
- [ ] **CA02:** Dado um pedido de R$ 25,00 no totem, quando escolho Pix, então é criada uma cobrança de R$ 25,00 com `txid` único ligada ao pedido.
- [ ] **CA03:** Dado uma notificação com assinatura inválida, quando chega ao webhook, então é rejeitada e nada é alterado.
- [ ] **CA04:** Dado a mesma notificação recebida duas vezes, quando processada, então existe um único pagamento registrado.
- [ ] **CA05:** Dado uma notificação com valor diferente da cobrança, quando processada, então o pedido não é marcado como pago e a cobrança vai para conferência.
- [ ] **CA06:** Dado o QR na tela do totem, quando o pagamento é confirmado, então a tela mostra "Pago" em até 10 s sem recarregar.
- [ ] **CA07:** Dado "exigir pagamento" ligado, quando o cliente não paga, então o pedido não aparece no KDS; dado desligado, o comportamento atual é mantido.
- [ ] **CA08:** Dado uma conta de mesa no PDV, quando escolho "Pix com confirmação" e o pagamento entra, então a conta é fechada e a mesa liberada sem novo toque.
- [ ] **CA09:** Dado uma cobrança expirada, quando o tempo acaba, então a tela oferece gerar nova cobrança e a antiga não pode mais quitar o pedido.
- [ ] **CA10:** Dado um Pix confirmado, quando abro o fechamento de caixa e os recebíveis, então o valor aparece em Pix com a taxa do PSP.
- [ ] **CA11:** Dado o PSP indisponível, quando o cliente escolhe Pix, então a tela mostra o Pix estático com aviso de confirmação no balcão.

## O que a atividade não inclui

- Cartão no totem (TEF/maquininha integrada): motivo: exige hardware e homologação; outra iniciativa.
- Estorno/devolução de Pix pelo sistema: motivo: baixo volume; fazer pelo painel do PSP.
- Split de pagamento e Pix parcelado: motivo: fora da operação.

### Considerado para o futuro (P2)

- Conciliação automática do extrato do PSP com o caixa.
- Pagamento na mesa pelo QR do cliente (conta da mesa inteira).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual PSP (banco atual da cafeteria com API Pix, Mercado Pago, Efí, Asaas...)? Define taxa, forma de autenticação do webhook e prazo | PO | Sim | |
| D02 | Totem deve exigir pagamento antes de produzir, ou só em dia de espetáculo? | PO | Sim | |
| D03 | Validade da cobrança (sugestão: 10 min no totem, 30 min no pedido online) | PO | Não | |
| D04 | O plano atual da Supabase comporta Edge Functions no volume esperado? | dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Sem credencial no front | unit (varre `dist/`) | CA01 | Procurar padrões de chave | Não encontrado |
| CT02 | Criação de cobrança | integração (PSP simulado) | CA02 | Chamar a função com pedido de R$ 25 | Cobrança com valor e `txid` |
| CT03 | Assinatura inválida | integração | CA03 | Enviar notificação adulterada | 401, sem alteração |
| CT04 | Idempotência | pgTAP + integração | CA04 | Reenviar a mesma notificação | 1 pagamento |
| CT05 | Valor divergente | pgTAP | CA05 | Notificação com valor menor | Pedido não pago; conferência |
| CT06 | Tela atualiza | integração (harness, Realtime simulado) | CA06 | Emitir evento de pago | Tela mostra "Pago" |
| CT07 | Exigir pagamento | pgTAP + harness | CA07 | Ligar/desligar a configuração | Entra/não entra no KDS |
| CT08 | Fechamento automático no PDV | integração | CA08 | Confirmar pagamento com modal aberto | Conta fechada |
| CT09 | Expiração | unit + harness | CA09 | Avançar o relógio | Oferece nova cobrança |
| CT10 | Caixa e recebíveis | pgTAP | CA10 | Pix confirmado e fechar caixa | Valor e taxa corretos |
| CT11 | PSP fora do ar | integração | CA11 | Função retorna erro/timeout | Pix estático + aviso |
| CT12 | Homologação real | manual (sandbox do PSP) | CA02–CA06 | Pagar cobrança de teste | Fluxo completo |

## URL Complementar

- Documentação técnica: `js/pix-brcode.js`, `js/totem.js`, `js/cardapio-cliente-pedido.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000039](CONCLUIDAS/CAF-000039-pix-qr-code-e-taxas-de-pagamento.md), [CAF-000079](CONCLUIDAS/CAF-000079-pix-no-admin-e-taxas-no-fechamento-de-caixa.md), [CAF-000113](CONCLUIDAS/CAF-000113-painel-executivo-dre-metas-turno-conciliacao-taxas.md), [ANALISE_CONCORRENTES_GESTAO.md](CONCLUIDAS/ANALISE_CONCORRENTES_GESTAO.md) (seção "Fora do escopo")
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
