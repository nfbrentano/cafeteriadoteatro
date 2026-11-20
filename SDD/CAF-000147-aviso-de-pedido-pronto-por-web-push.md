# [FEAT] Aviso de "pedido pronto" por Web Push (PWA) no aparelho do cliente

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Avisar o **cliente** no próprio celular quando o pedido dele (QR da mesa, pedido online, totem ou pré-pedido do intervalo) ficar pronto, mesmo com a aba fechada ou o celular bloqueado, por Web Push. O cliente autoriza explicitamente e pode cancelar a qualquer momento.
- **Problema e evidência:**
  - *Hoje no sistema:* o acompanhamento do cliente é feito consultando o servidor a cada 8 s enquanto a página está aberta (`js/cardapio-cliente-pedido.js:1393`, `setInterval(() => consultarStatusAtual(token), 8000)`). Fechou a aba ou bloqueou a tela, o aviso não chega. O service worker não trata `push` nem `notificationclick` (`sw.js` só registra `install`, `activate`, `message` e `fetch`, linhas 66, 77, 92 e 99).
  - A CAF-000053 entregou aviso de pedido pronto para o **operador** do PDV: som, vibração e `new Notification(...)` local enquanto a página do PDV está aberta (`js/pdv/realtime.js:205-226`). Não há envio pelo servidor nem nada para o aparelho do cliente. Esta SDD não mexe nesse fluxo.
  - O pedido é marcado como pronto quando todas as estações concluem: `fn_checar_conclusao_pedido` faz `SET status = 'concluido'` (`supabase/migration_caf_000028_itens_lancados_depois.sql:54`). Esse é o gatilho natural.
  - Não existe nenhuma Edge Function no projeto (não há pasta `supabase/functions`). A CAF-000123 (Pix dinâmico) também introduz Edge Functions, e a infraestrutura deve ser compartilhada.
  - *Mercado:* a Toast envia SMS automático quando o KDS marca o pedido como pronto; o Joe Coffee notifica pedidos antecipados. O WhatsApp Business API cobra por mensagem desde 1/7/2025, por isso fica como P2.
  - *Plataforma:* no iOS, o Web Push só funciona com o site adicionado à Tela de Início (PWA instalada, iOS 16.4+). No Android/Chrome funciona direto no navegador.
- **Impacto de não fazer:** No intervalo, o espectador fica de pé no balcão olhando o painel ou perde o pedido; bebida esfria; pedidos "não retirados" (CAF-000038) continuam acontecendo.
- **Para quem é destinado:** Cliente que pediu pelo QR, online, totem (com celular informado) ou pré-pedido do intervalo.
- **História de usuário:** Como espectador que fez o pré-pedido do intervalo, quero receber um aviso no celular quando minha bebida estiver pronta, para não ficar na fila esperando.
- **Como saberemos que deu certo:** Notificação entregue em até 10 s após o pedido virar `concluido` em 95% dos casos (com assinatura válida); queda de pelo menos 30% nos pedidos marcados como não retirados no primeiro mês; 0 notificações enviadas sem opt-in.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Na tela de acompanhamento do pedido, botão "Avisar quando ficar pronto" que pede permissão de notificação (nunca pede ao abrir a página) e registra a assinatura | P0 | CA01, CA02 |
| RF02 | Tabela `push_assinaturas` (pedido_token, endpoint, chaves p256dh/auth, criada_em, expira_em, revogada_em) gravada só pela RPC `registrar_push_pedido(pedido_token, assinatura)`; sem leitura por `anon` | P0 | CA03, CA09 |
| RF03 | Gatilho: quando o pedido muda para `concluido`, um *Database Webhook* (ou `pg_net`) chama a Edge Function `push-pedido-pronto`, que envia a notificação com VAPID e marca o envio (idempotente por pedido) | P0 | CA04, CA05 |
| RF04 | Service worker trata `push` (título "Seu pedido #123 está pronto", corpo com local de retirada) e `notificationclick` (abre a página do pedido) | P0 | CA04, CA06 |
| RF05 | Assinatura vence em 24 h ou na entrega (`entregue`) e é apagada; endpoint que responde 404/410 é removido | P0 | CA07 |
| RF06 | iOS sem PWA instalada: em vez do botão, mostrar instrução curta "Adicione à Tela de Início para receber o aviso" e manter o acompanhamento por consulta | P1 | CA08 |
| RF07 | Aviso também quando o pedido do QR é recusado (`recusar_pedido_cliente`) | P1 | CA10 |
| RF08 | Canal alternativo por WhatsApp Business API para quem não aceita push | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Chave privada VAPID só em *secret* da Edge Function; nunca no front nem no repositório | P0 | CA11 |
| RNF02 | Opt-in explícito (LGPD): finalidade única ("avisar este pedido"), sem uso para marketing; texto de consentimento ao lado do botão | P0 | CA02 |
| RNF03 | Entrega em ≤ 10 s após `concluido` (P95) | P1 | CA04 |
| RNF04 | Falha no envio não afeta a conclusão do pedido no KDS (gatilho assíncrono) | P0 | CA05 |
| RNF05 | `registrar_push_pedido` aceita no máximo 3 assinaturas por pedido e valida o formato do endpoint (https, até 1.000 caracteres) | P0 | CA09 |

### Dependências técnicas

- Primeira Edge Function do projeto: alinhar a estrutura (`supabase/functions/`, secrets, deploy no CI) com a CAF-000123.
- `sw.js` e registro (`js/sw-register.js`); CAF-000118 (precache) e CAF-000140 (SW por perfil e manifests separados, necessário para o cardápio ser instalável como PWA do cliente).
- `consultar_status_pedido_cliente` e acompanhamento em `js/cardapio-cliente-pedido.js`; totem (`js/totem.js`) para pedidos com celular.
- CAF-000132 (consentimento e política de privacidade) e CAF-000141 (expurgo agendado).

### Recursos necessários

- Par de chaves VAPID gerado pelo dev e guardado nos secrets da Supabase; iPhone com iOS 16.4+ e Android para teste manual.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o cliente na tela do pedido em um Android, quando toca em "Avisar quando ficar pronto" e permite, então a assinatura fica registrada para aquele pedido e o botão mostra "Aviso ativado".
- [ ] **CA02:** Dado o cliente que abre a tela do pedido, quando a página carrega, então o navegador não pede permissão de notificação até ele tocar no botão (caso negativo).
- [ ] **CA03:** Dado um usuário anônimo, quando tenta ler `push_assinaturas` direto, então não recebe nenhuma linha.
- [ ] **CA04:** Dado um pedido com assinatura e a aba fechada, quando o barista conclui a última estação, então o celular recebe "Seu pedido #123 está pronto" em até 10 s.
- [ ] **CA05:** Dado a Edge Function fora do ar, quando o pedido é concluído, então o KDS conclui normalmente e o erro fica registrado; dado o mesmo evento reenviado, então só uma notificação chega.
- [ ] **CA06:** Dado a notificação recebida, quando o cliente toca nela, então abre a página de acompanhamento daquele pedido.
- [ ] **CA07:** Dado um pedido entregue ou uma assinatura com mais de 24 h, quando a rotina de limpeza roda, então a assinatura é apagada; dado um endpoint que responde 410, então é removido no envio.
- [ ] **CA08:** Dado um iPhone no Safari sem a PWA instalada, quando abre a tela do pedido, então vê a instrução para adicionar à Tela de Início e não vê o botão de ativar.
- [ ] **CA09:** Dado um pedido com 3 assinaturas, quando chega uma quarta ou um endpoint `http://`, então a RPC recusa.
- [ ] **CA10:** Dado um pedido do QR com assinatura, quando o atendente o recusa, então o cliente recebe "Seu pedido não pôde ser aceito" com o motivo.
- [ ] **CA11:** Dado o build publicado, quando procuro a chave privada VAPID em `dist/`, então ela não aparece.

## O que a atividade não inclui

- Notificações de marketing ou campanhas por push: motivo: outra finalidade e outra base legal; ver CRM (CAF-000041).
- SMS: motivo: custo por mensagem e necessidade de fornecedor; WhatsApp fica como P2.
- Aviso para o operador: motivo: já coberto pela CAF-000053.

### Considerado para o futuro (P2)

- WhatsApp Business API como canal alternativo (RF08), com custo por mensagem.
- Aviso "seu pedido entrou em preparo" e lembrete de janela do intervalo.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Gatilho por *Database Webhook* da Supabase ou `pg_net` dentro do trigger? (custo e limites do plano atual) | dev | Não | |
| D02 | O totem deve oferecer o aviso (QR na tela de sucesso para abrir o acompanhamento no celular)? | PO | Não | |
| D03 | Texto e local de retirada exibidos na notificação (balcão, painel de senhas) | design | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Botão e permissão | unit + DOM (`tests/caf-000147-web-push.test.js`, `Notification`/`PushManager` simulados) | CA01, CA02, CA08 | Carregar tela; tocar; simular iOS sem standalone | Permissão só no toque; instrução no iOS |
| CT02 | RLS e limites da RPC | pgTAP (`supabase/tests/push_assinaturas.test.sql`, `SET ROLE anon`) | CA03, CA09 | Ler tabela; 4ª assinatura; `http://` | Negado/recusado |
| CT03 | Envio e idempotência | integração (Edge Function com `web-push` simulado) | CA04, CA05 | Evento de `concluido` duas vezes | 1 envio |
| CT04 | Falha não bloqueia KDS | pgTAP (`concluir_estacao` com webhook falhando) | CA05 | Concluir estação | Pedido `concluido` |
| CT05 | Service worker | unit (handlers de `push` e `notificationclick` do `sw.js` com eventos simulados) | CA04, CA06 | Disparar eventos | Notificação exibida; URL aberta |
| CT06 | Limpeza e 410 | pgTAP + integração | CA07 | Rodar limpeza; endpoint 410 | Assinaturas removidas |
| CT07 | Recusa do QR | integração | CA10 | `recusar_pedido_cliente` | Notificação de recusa |
| CT08 | Segredo fora do build | unit (varre `dist/`) | CA11 | Procurar padrão da chave | Não encontrado |
| CT09 | Aparelhos reais | manual (Android Chrome; iPhone com PWA) | CA04, CA06, CA08 | Pedido real com tela bloqueada | Aviso recebido |

## URL Complementar

- Documentação técnica: `sw.js`, `js/sw-register.js`, `js/cardapio-cliente-pedido.js`, `js/pdv/realtime.js`, `supabase/migration_caf_000028_itens_lancados_depois.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000053](CONCLUIDAS/CAF-000053-aviso-de-pedido-pronto-no-celular.md), [CAF-000027](CONCLUIDAS/CAF-000027-painel-de-senhas-retirada.md), [CAF-000037](CONCLUIDAS/CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md), [CAF-000038](CONCLUIDAS/CAF-000038-pedido-online-para-retirada.md), [CAF-000118](CONCLUIDAS/CAF-000118-pwa-service-worker-precache-e-versionamento.md); [CAF-000123](CAF-000123-pix-dinamico-com-confirmacao-automatica.md); novas: CAF-000132, CAF-000140, CAF-000141
- Referências de design: Toast SMS de pedido pronto (https://support.toasttab.com/en/article/Text-messages-guests-can-receive-from-Toast); Joe Coffee (https://support.joe.coffee/article/264-how-to-order-ahead); preços do WhatsApp Business (https://developers.facebook.com/docs/whatsapp/pricing)
- Requisitos originais: LGPD (Lei 13.709/2018), consentimento com finalidade específica
- Issue / PR relacionado: —
