# [FIX] Pedidos públicos: cupom aplicado no servidor, horário de funcionamento e proteção contra abuso

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-24

## Detalhes da Atividade

- **O que precisa ser feito:** Nos canais sem login (QR da mesa, pedido online para retirada e totem), fazer o desconto de cupom que o cliente vê ser o mesmo gravado no pedido, aceitar pedido online só dentro do horário de funcionamento cadastrado no admin e limitar abusos (spam de pedidos, sobrescrita de cadastro de cliente, textos enormes).
- **Problema e evidência:**
  1. **Cupom só na tela.** O cliente vê o total com desconto (`js/cardapio-cliente-pedido.js:1100-1105`; `js/totem.js:1019-1021`) e o front envia `cupom_codigo`, `campanha_id` e `desconto_cupom` (`cardapio-cliente-pedido.js:1280-1282` e `:1340-1342`; `totem.js:1122-1124`). Nenhuma das RPCs `criar_pedido_cliente` (`supabase/migration_caf_000037_qr_pedidos_cliente.sql:102`), `criar_pedido_online` (`supabase/migration_caf_000038_pedido_online.sql:99`) ou `criar_pedido_totem` (`supabase/migration_caf_000040_totem.sql:223`) lê esses campos; o total é sempre a soma dos itens (`037:336`, `038:439`, `040:464`), e a coluna `pedidos.desconto_cupom` (`migration_caf_000061_cupons_desconto.sql:23`) fica zerada. Depois, o front tenta `registrar_uso_cupom`, que exige usuário autenticado (`supabase/migration_caf_000082_seguranca.sql:498`), e a falha só vira `console.warn` (`cardapio-cliente-pedido.js:1303` e `:1363`). Resultado: o cliente vê R$ 27, o pedido grava R$ 30 e o barista cobra R$ 30.
  2. **Validação de cupom fraca.** `validar_cupom` (`migration_caf_000061_cupons_desconto.sql:30-95`) só confere se a campanha está ativa e o valor mínimo; não há vigência, limite total nem limite por cliente, e a função tem `GRANT ... TO anon` (`061:98`) sem limite de tentativas.
  3. **Horário de funcionamento de duas fontes.** O cardápio lê `site_settings` com a chave `business_hours` (`cardapio-cliente-pedido.js:122-129`), registro que nenhuma tela grava; o admin e a home usam a tabela `business_hours` (`js/db.js:375-395`, `js/home-dynamic.js:14`). Sem o registro, vale o padrão fixo 08:00–20:00 com sábado aberto e domingo fechado (`cardapio-cliente-pedido.js:333-336`), mesmo que o dono tenha cadastrado outro horário. A função `loja_esta_aberta()` (`migration_caf_000082_seguranca.sql:350`) foi criada e não é chamada por nenhuma RPC nem pelo front; ela ainda trata domingo como sempre fechado, enquanto a tabela tem um único `sab_dom_ativo`. Pedido online fora do horário é aceito pelo servidor.
  4. **Hora no fuso do navegador.** A checagem "loja aberta agora" usa `new Date().getHours()` (`cardapio-cliente-pedido.js:353-360`), as janelas usam a hora local (`:740-749`) e a retirada agendada vira ``new Date(`${dataVal}T${horaVal}:00`).toISOString()`` (`:1262`): um celular com outro fuso agenda no horário errado. Os helpers `js/utils/datas-sp.js` já existem e são carregados no `cardapio.html`.
  5. **Abuso.** O limite de frequência do pedido online é por telefone informado pelo próprio cliente (`038:205-212`); trocar o número burla o limite. A capacidade da janela de 15 min conta pedidos não cancelados, inclusive os ainda não aprovados, sem trava (`038:296-305`): spam ocupa janelas e dois pedidos simultâneos passam do limite. Quem digita o telefone de outra pessoa sobrescreve o `nome` e liga `aceita_contato` do cadastro existente (`038:220-234`). `observacoes` do pedido e dos itens não tem limite de tamanho (`038:308`, `037:202`, `040:326`). O totem não tem limite de frequência.
- **Impacto de não fazer:** Cliente cobrado acima do que viu (reclamação e risco de questionamento com base no Código de Defesa do Consumidor); pedido aceito com a loja fechada; janelas do intervalo lotadas por spam; cadastro de clientes adulterado.
- **Para quem é destinado:** Cliente anônimo (QR, online, totem), barista que aprova pedidos, dono.
- **História de usuário:** Como cliente, quero pagar exatamente o total com desconto que vi na tela, para confiar no pedido pelo celular ou pelo totem.
- **Como saberemos que deu certo:** 0 pedidos com cupom em que `total` difere do total exibido; 0 pedidos online criados fora do horário cadastrado; 0 alterações de `nome`/`aceita_contato` de clientes existentes por pedido anônimo.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | As 3 RPCs públicas recebem `cupom_codigo`, validam pela mesma regra de `validar_cupom` (subtotal calculado no servidor), gravam `campanha_id`, `cupom_codigo`, `desconto_cupom` e o total com desconto, e registram o uso na mesma transação; o valor de desconto enviado pelo front é ignorado | P0 | CA01, CA02 |
| RF02 | Até o RF01 estar em produção, o campo de cupom fica oculto no QR, no pedido online e no totem | P0 | CA03 |
| RF03 | Campanhas ganham `valido_de`, `valido_ate`, `max_usos` e `max_usos_por_cliente`; `validar_cupom` e o RF01 respeitam esses limites | P1 | CA04 |
| RF04 | Fonte única de horário: a tabela `business_hours`; `loja_esta_aberta(p_quando timestamptz)` lê só a tabela, respeita `sab_dom_ativo` e é usada por `criar_pedido_online` (agora e `retirada_em`) e pelo cardápio | P0 | CA05, CA06, CA07 |
| RF05 | `criar_pedido_cliente` e `criar_pedido_totem` também recusam pedido fora do horário, com opção de desligar por canal | P1 | CA08 |
| RF06 | Cardápio monta datas, janelas e `retirada_em` no fuso de São Paulo usando `js/utils/datas-sp.js` | P0 | CA09 |
| RF07 | Pedido anônimo nunca altera `nome` nem `aceita_contato` de cliente existente; só cria cliente novo ou vincula o existente | P0 | CA10 |
| RF08 | Limite global de pedidos `aguardando_aprovacao` por canal e limite por mesa/totem (ex.: 3 pendentes por mesa e 30 no canal online), além do limite por telefone | P1 | CA11 |
| RF09 | `pg_advisory_xact_lock` por janela de 15 min antes de contar a ocupação | P1 | CA12 |
| RF10 | `observacoes` do pedido e de cada item cortadas em 500 caracteres no servidor (`LEFT(..., 500)`) | P1 | CA13 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | As RPCs continuam funcionando sem login (`anon`), conforme a allowlist da CAF-000126 | P0 | CA01 |
| RNF02 | Mensagens de recusa em português e exibidas como aviso na tela, sem `alert` nativo | P0 | CA05 |
| RNF03 | Criação de pedido online responde em menos de 1 s com a trava de janela | P1 | CA12 |

### Dependências técnicas

- RPCs 037, 038 e 040; `validar_cupom` (061); `registrar_uso_cupom` (082); `loja_esta_aberta` (082); tabela `business_hours`; `js/cardapio-cliente-pedido.js`, `js/totem.js`, `js/utils/coupon-validator.js`, `js/utils/datas-sp.js`.
- CAF-000126 (allowlist de anon), CAF-000128 (cupom no PDV, mesma regra), CAF-000130 (anti-spam do QR com `now()`), CAF-000132 (consentimento LGPD: o default `aceita_lgpd = true` em `038:203` e o texto de consentimento ficam lá), CAF-000135 (`retirada_em` do totem descartado pela RPC), CAF-000146 (capacidade por janela e tempo estimado).

### Recursos necessários

- Dono confirmar o horário real cadastrado na tabela `business_hours` de produção.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o cupom `TEATRO10` (10%) e um carrinho de R$ 30 no pedido online, quando o cliente envia, então o pedido grava total R$ 27, `desconto_cupom` R$ 3 e um uso da campanha, sem login.
- [x] **CA02:** Dado um front adulterado que envia `desconto_cupom = 30`, quando o pedido é criado, então o servidor aplica só o desconto calculado da campanha.
- [x] **CA03:** Dado o RF01 ainda não publicado, quando o cliente abre QR, pedido online ou totem, então não existe campo de cupom.
- [x] **CA04:** Dado um cupom com `valido_ate` ontem ou com `max_usos` atingido, quando aplicado, então é recusado com mensagem clara e o pedido não recebe desconto.
- [x] **CA05:** Dado a loja fechada segundo `business_hours`, quando alguém chama `criar_pedido_online` para retirada imediata, então é recusado.
- [x] **CA06:** Dado um agendamento com `retirada_em` fora do horário do dia escolhido, quando enviado, então é recusado; dentro do horário, então é aceito.
- [x] **CA07:** Dado o admin alterou o horário de sábado, quando o cliente abre o cardápio, então as janelas exibidas seguem o novo horário (sem usar o padrão 08:00–20:00).
- [x] **CA08:** Dado o QR com o bloqueio por horário ligado e a loja fechada, quando o cliente pede, então é recusado; com o bloqueio desligado, então é aceito.
- [x] **CA09:** Dado um celular configurado em outro fuso, quando agenda retirada às 19:30, então `retirada_em` corresponde a 19:30 de São Paulo.
- [x] **CA10:** Dado o cliente "Ana" com `aceita_contato = false`, quando um pedido anônimo usa o telefone dela com nome "Teste", então o cadastro continua "Ana" com `aceita_contato = false`.
- [x] **CA11:** Dado 3 pedidos aguardando aprovação na mesa 4, quando chega o 4º, então é recusado até a equipe aprovar ou recusar algum.
- [x] **CA12:** Dado uma janela com limite 5 e 4 pedidos, quando 2 pedidos chegam ao mesmo tempo, então só 1 é aceito.
- [x] **CA13:** Dado uma observação de 5.000 caracteres, quando o pedido é criado, então são gravados no máximo 500.

## O que a atividade não inclui

- Texto e registro de consentimento LGPD: motivo: CAF-000132.
- Captcha ou verificação por SMS do telefone: motivo: custo e atrito altos para o volume atual; limites do RF08 primeiro.
- Capacidade dinâmica e tempo estimado de retirada: motivo: CAF-000146.
- Horário de retirada do pedido do intervalo no totem: motivo: CAF-000135.

### Considerado para o futuro (P2)

- Limite de tentativas de `validar_cupom` por IP via Edge Function.
- Cupom restrito a canal (só online, só totem).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Domingo: a tabela tem um só `sab_dom_ativo`. A cafeteria abre aos domingos com espetáculo? Precisa de horário separado para domingo? | PO | Sim | Mantém a estrutura atual de `business_hours` (`sab_dom_ativo`, `sab_dom_abre`, `sab_dom_fecha`) respeitada de forma consistente em todas as pontas (RF04). |
| D02 | QR da mesa e totem devem bloquear pedido fora do horário (ex.: ensaio, evento fechado)? | PO | Não | Sim, bloqueio opcional configurável por canal (`pedido_cliente_exigir_horario`, `pedido_totem_exigir_horario`), desligado por padrão (RF05). |
| D03 | Limites de pendentes (sugestão: 3 por mesa, 30 no online) e tamanho de observação (500) estão adequados? | PO | Não | Limites de pendentes (3 por mesa, 30 online) e truncamento de observações em 500 caracteres adequados e implementados (RF08, RF10). |
| D04 | Cupons já divulgados que hoje "não funcionam" devem ser honrados retroativamente? | PO | Não | Cupons vigentes a partir da publicação da migration 131 (sem efeito retroativo). |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cupom aplicado no servidor | pgTAP (`SET ROLE anon`) | CA01, CA02 | Criar pedido online/QR/totem com cupom e desconto adulterado | Total com desconto calculado; 1 uso |
| CT02 | Campo oculto | integração (harness cardápio e totem) | CA03 | Flag desligada | Sem campo de cupom |
| CT03 | Vigência e limites | pgTAP | CA04 | Cupom vencido e esgotado | Recusa |
| CT04 | Loja fechada | pgTAP | CA05, CA06 | `business_hours` fechado; `retirada_em` fora/dentro | Recusa / aceita |
| CT05 | Fonte única no cardápio | integração (harness) | CA07 | Mock da tabela com sábado alterado | Janelas seguem a tabela |
| CT06 | Bloqueio no QR | pgTAP | CA08 | Flag ligada/desligada | Recusa / aceita |
| CT07 | Fuso do navegador | unit (vitest com `TZ=Europe/Lisbon`) | CA09 | Montar `retirada_em` para 19:30 | ISO de 19:30 em SP |
| CT08 | Cadastro preservado | pgTAP | CA10 | Pedido anônimo com telefone existente | Nome e consentimento intactos |
| CT09 | Pendentes por mesa | pgTAP | CA11 | 4 pedidos pendentes na mesa | 4º recusado |
| CT10 | Concorrência na janela | integração (duas conexões) | CA12 | 2 pedidos simultâneos | 1 aceito |
| CT11 | Observação longa | pgTAP | CA13 | 5.000 caracteres | 500 gravados |
| CT12 | Fluxo completo | e2e | CA01, CA07 | Pedido online com cupom no navegador | Total igual ao exibido |

## URL Complementar

- Documentação técnica: `js/cardapio-cliente-pedido.js`, `js/totem.js`, `js/utils/coupon-validator.js`, `js/utils/datas-sp.js`, `js/db.js`, `js/home-dynamic.js`, `supabase/migration_caf_000037_qr_pedidos_cliente.sql`, `supabase/migration_caf_000038_pedido_online.sql`, `supabase/migration_caf_000040_totem.sql`, `supabase/migration_caf_000061_cupons_desconto.sql`, `supabase/migration_caf_000082_seguranca.sql`, `supabase/migration_business_hours_fix.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000061](CONCLUIDAS/CAF-000061-validacao-cupons-desconto-checkout-e-pdv.md), [CAF-000077](CONCLUIDAS/CAF-000077-cupons-uso-unico-por-pedido-e-rastreio-no-fechamento.md), [CAF-000082](CONCLUIDAS/CAF-000082-seguranca-rpcs-policies-e-views-expostas.md), [CAF-000038](CONCLUIDAS/CAF-000038-pedido-online-para-retirada.md), [CAF-000037](CONCLUIDAS/CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md), [CAF-000040](CONCLUIDAS/CAF-000040-totem-de-autoatendimento-no-balcao.md), [CAF-000062](CONCLUIDAS/CAF-000062-modo-dia-de-espetaculo-reserva-intervalo.md); novas: CAF-000126, CAF-000128, CAF-000130, CAF-000132, CAF-000135, CAF-000146
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
