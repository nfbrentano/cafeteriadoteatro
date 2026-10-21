# [CHORE] CAF-000090 — Cobertura de Testes dos Canais do Cliente (Cardápio, QR na Mesa, Pedido Online, Totem e Avaliação)

> **Status:** Concluída
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-21

## Detalhes da Atividade

- **O que precisa ser feito:** Criar suítes de testes funcionais automatizados para as SDDs entregues dos canais em que o próprio cliente faz o pedido: CAF-000017, 020a, 020b, 037, 038, 040, 042 e 069. Além disso, criar testes de **integração de tela** para CAF-000061, 062, 063 e 065. Essas quatro hoje só têm testes dos utilitários (`js/utils/*.js`), sem cobrir como `js/cardapio-cliente-pedido.js`, `js/totem.js`, `js/cardapio-dynamic.js` e `js/avaliar.js` usam esses utilitários.
- **Problema e evidência:** A auditoria de 2026-10-20 encontrou:
  - **Nenhuma das SDDs acima tem teste próprio** em `tests/`.
  - Os testes de 061–069 importam só `js/utils/*.js`. Por isso, o bug em `js/cardapio-cliente-pedido.js:1049` passou pela suíte: lá se chama `isCashbackActive(sb).then(...)` sobre uma função síncrona que retorna boolean, o que gera `TypeError` e impede o modal do carrinho de abrir. Com 80/80 testes verdes, o checkout por QR/mesa e o pedido online estão quebrados.
  - Em produção, a tabela `produto_adicionais_permitidos` existe, mas não está versionada (CAF-000072/075).
  - O totem não usa o `theater-mode.js` que carrega (062) e não tem campo de busca (065).
- **Impacto de não fazer:** Os canais que geram receita sem atendente (QR na mesa, pedido online e totem) continuam podendo quebrar a cada mudança sem que nenhum teste acuse. É o cenário de maior risco, porque o cliente desiste e ninguém da equipe vê o erro.
- **Para quem é destinado:** Desenvolvedor / agente de IA que mantém o projeto, e o PO, que precisa saber se o checkout do cliente está funcionando.
- **História de usuário:** Como responsável pelo produto, quero testes que abram as telas reais do cliente (cardápio, carrinho, checkout, totem e avaliação) com um Supabase simulado, para que nenhuma regressão no fluxo de compra do cliente chegue a produção.
- **Como saberemos que deu certo:**
  - Cada SDD-alvo tem pelo menos 1 arquivo `tests/caf-0000XX-*.test.js` cobrindo todos os seus CAs.
  - Reintroduzir o bug do `.then()` (ou qualquer erro que impeça o modal do carrinho de abrir) faz `npm test` falhar.
  - Cobertura de linhas ≥ 60% em `js/cardapio-cliente-pedido.js`, `js/totem.js` e `js/avaliar.js`, medida pelo `test:coverage` da CAF-000086.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Usar o harness happy-dom de páginas da CAF-000086 para carregar `cardapio.html`, `totem.html` e `avaliar.html` com seus scripts e o mock do Supabase (`tests/helpers/supabase-mock.js`), sem nenhuma chamada de rede real | P0 | CA01 |
| RF02 | Teste de integração do **carrinho do cardápio público** (037/038 + 063): adicionar item, abrir o modal do carrinho com cashback **ativo** e **inativo**, finalizar o pedido e verificar o payload enviado à RPC | P0 | CA02, CA03 |
| RF03 | Teste de integração de **cupons** (061) no checkout do cardápio e no totem: cupom válido, expirado, esgotado, abaixo do valor mínimo, uso duplo no mesmo pedido; o valor e o `cupom_codigo` chegam ao payload | P0 | CA04 |
| RF04 | Teste de integração do **modo espetáculo** (062): banner e opção "retirar no intervalo" visíveis quando ativo no cardápio **e no totem**; pedido marcado com `is_intervalo` e horário de retirada | P0 | CA05 |
| RF05 | Teste de integração da **busca tolerante** (065) no cardápio público e no totem: busca sem acento, com erro de digitação e por código curto | P1 | CA06 |
| RF06 | Testes da **aba Promos** (017): promo do dia aparece só no dia/horário configurado, inclusive na virada após 21h no fuso de São Paulo | P0 | CA07 |
| RF07 | Testes do **menu flutuante WhatsApp** (020a): botão presente em `index.html` e `cardapio.html`, link `wa.me` com número normalizado e mensagem codificada | P1 | CA08 |
| RF08 | Testes do **vínculo de adicionais** (020b): o modal de montagem lista só os adicionais permitidos ao produto; nome de adicional com HTML é escapado (XSS); o payload não leva adicional não permitido | P0 | CA09 |
| RF09 | Testes do **QR na mesa e chamado de garçom** (037): o código da mesa vem da URL, mesa inválida é recusada, fora do horário de funcionamento o pedido é bloqueado no front, o botão de chamar garçom tem limite de repetição | P0 | CA10 |
| RF10 | Testes do **pedido online para retirada** (038): escolha de horário respeita a antecedência mínima; nome e telefone são obrigatórios; status acompanhado por polling ou realtime simulado | P0 | CA11 |
| RF11 | Testes do **totem** (040): fluxo completo (categoria → item → carrinho → pagamento → senha); tela volta ao início por inatividade; Wake Lock solicitado; pedido expirado tratado | P0 | CA12 |
| RF12 | Testes da **avaliação** (042): o link com token abre a avaliação; nota de 1 a 5 é obrigatória; o comentário é escapado; segunda avaliação do mesmo pedido é recusada | P0 | CA13 |
| RF13 | Testes do **menu analytics** (069): eventos de visualização, adição ao carrinho e checkout disparam a RPC com os parâmetros certos e não bloqueiam o fluxo se a RPC falhar | P1 | CA14 |
| RF14 | Todo teste que falhar por bug já conhecido deve ser escrito como `it.fails(...)` (ou `it.todo`) com comentário apontando a SDD de correção. Quando a correção for entregue, o teste vira `it(...)` | P0 | CA15 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhum teste faz requisição a `nyretgvzbnbtiyeioeju.supabase.co` ou a qualquer outro host. `fetch` e `window.supabase.createClient` são substituídos pelo mock, e uma chamada não interceptada falha o teste | P0 | CA01 |
| RNF02 | A suíte desta SDD roda em menos de 10 s no CI e é determinística: relógio fixado com `vi.useFakeTimers()` / `vi.setSystemTime()` em `America/Sao_Paulo` | P0 | CA01, CA07 |
| RNF03 | Os testes falham com qualquer erro não tratado no console durante a renderização (`window.onerror` / `unhandledrejection` capturados pelo harness) | P0 | CA02 |
| RNF04 | Os payloads das RPCs (`criar_pedido_cliente`, `criar_pedido_online`, `criar_pedido_totem` ou equivalentes) são validados contra o snapshot de schema da CAF-000086 (`tests/fixtures/schema-snapshot.json`) | P0 | CA03 |

### Dependências técnicas

- **CAF-000086:** coverage, harness happy-dom para páginas, extração de lógica para `js/utils` e teste de contrato com `tests/fixtures/schema-snapshot.json`. É bloqueante para RF01 e RNF04.
- **CAF-000072:** baseline do schema de produção, para que o snapshot reflita o banco real (por exemplo, `produto_adicionais_permitidos`).
- SDDs de correção referenciadas pelos `it.fails`: **075** (adicionais), **076** (cashback), **077** (cupons), **080** (fuso/corte do dia), **082** (segurança de RPC/views), **083** (pendências de operação: banner do espetáculo no totem e `horario_retirada`), **084** (pendências de UX: busca no cardápio e no totem).
- Arquivos sob teste: `js/cardapio-cliente-pedido.js`, `js/cardapio-dynamic.js`, `js/cardapio.js`, `js/totem.js`, `js/avaliar.js`, `js/analytics.js`, `js/home-dynamic.js`, `js/utils/*.js`, `cardapio.html`, `totem.html`, `avaliar.html`, `index.html`.

### Recursos necessários

- Fixtures de dados (produtos, categorias, adicionais, vínculos, campanhas/cupons, configurações de cashback e espetáculo, `business_hours`) em `tests/fixtures/`, derivados do seed `supabase/cardapio_seed_completo.sql` e sem dados pessoais reais.
- Revisão do PO sobre quais comportamentos com bug conhecido entram como `it.fails`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o harness da CAF-000086, quando `npm test` executar as suítes desta SDD, então `cardapio.html`, `totem.html` e `avaliar.html` são carregadas com seus scripts no happy-dom, nenhuma requisição externa é feita e qualquer chamada de rede não simulada falha o teste.
- [x] **CA02:** Dado o cardápio com cashback **ativo** na configuração e um item no carrinho, quando o cliente abre o modal do carrinho, então o modal fica visível, a lista de itens é renderizada, o lembrete de cashback aparece e nenhum erro não tratado é registrado. Enquanto a CAF-000076 não for entregue, o teste fica como `it.fails` referenciando o bug de `cardapio-cliente-pedido.js:1049`.
- [x] **CA03:** Dado um carrinho válido (mesa via QR ou retirada online), quando o cliente finaliza o pedido, então a RPC é chamada uma vez, com parâmetros cujos nomes existem no snapshot de schema, e o total enviado é igual a itens + adicionais − cupom.
- [x] **CA04:** Dado um cupom válido, quando aplicado no checkout do cardápio e no do totem, então o desconto é exibido e enviado no payload. Cupons expirados, esgotados ou abaixo do mínimo mostram mensagem e não alteram o total. Tentar aplicar o mesmo cupom duas vezes não duplica o desconto. A gravação de `cupom_codigo` e `campanha_id` no pedido e o uso único por pedido ficam como `it.fails` → CAF-000077.
- [x] **CA05:** Dado o modo espetáculo ativo, quando cardápio e totem carregam, então ambos exibem o banner e a opção de retirada no intervalo, e o pedido sai com `is_intervalo = true`. A ausência do banner no totem e de `horario_retirada` ficam como `it.fails` → CAF-000083.
- [x] **CA06:** Dado o cardápio e o totem com o catálogo de fixture, quando o cliente busca "cafe com leit", "capuccino" ou um código curto, então os produtos esperados aparecem. Enquanto não houver campo de busca nessas telas, o teste fica como `it.fails` → CAF-000084.
- [x] **CA07:** Dado o relógio fixado em 2026-10-20 21:30 em São Paulo, quando a aba Promos carrega, então só aparecem as promoções de terça-feira (dia local), e não as do dia UTC seguinte. Se falhar hoje, `it.fails` → CAF-000080.
- [x] **CA08:** Dado `index.html` e `cardapio.html`, quando renderizados, então o botão flutuante do WhatsApp existe, tem rótulo acessível e aponta para `https://wa.me/55…` com o texto codificado.
- [x] **CA09:** Dado um produto com 2 adicionais permitidos e 1 adicional não vinculado, quando o modal de montagem abre, então só os 2 permitidos aparecem. Um adicional chamado `<img src=x onerror=alert(1)>` é mostrado como texto, sem criar elemento `img`. O escape fica como `it.fails` → CAF-000075 até a correção.
- [x] **CA10:** Dado o acesso a `cardapio.html?mesa=M05`, quando a página carrega, então o pedido é vinculado à mesa M05. Com `?mesa=XYZ` inexistente, aparece aviso e o envio fica bloqueado. Fora do `business_hours`, o envio é bloqueado com mensagem. Um segundo "chamar garçom" dentro do intervalo mínimo é recusado.
- [x] **CA11:** Dado o pedido online para retirada, quando o cliente escolhe um horário antes da antecedência mínima ou deixa nome ou telefone vazios, então o envio é bloqueado com mensagem. Com dados válidos, o pedido é enviado e a tela de acompanhamento mostra o status recebido pelo realtime simulado.
- [x] **CA12:** Dado o totem, quando o cliente percorre categoria → item → carrinho → pagamento, então o pedido é criado e a senha é exibida. Depois de N segundos de inatividade (fake timers), a tela volta ao início e o carrinho é limpo. O Wake Lock é solicitado ao iniciar.
- [x] **CA13:** Dado um link de avaliação com token válido, quando o cliente envia sem nota, então o envio é bloqueado. Com nota 4 e comentário com HTML, o comentário é enviado e exibido escapado. Com um token já usado, aparece "avaliação já registrada".
- [x] **CA14:** Dado o cardápio e o totem, quando o cliente vê um item, adiciona ao carrinho e finaliza, então a RPC de analytics é chamada com o evento e o produto corretos. Se a RPC rejeitar, o fluxo de compra continua sem erro visível.
- [x] **CA15:** Dado qualquer teste que exponha um bug já registrado, quando a suíte roda, então ele aparece como `it.fails` ou `it.todo` com comentário `// bug conhecido → CAF-0000NN` e não quebra o CI. Quando a SDD de correção for entregue, removido o `.fails`, o teste passa.

## O que a atividade não inclui

- Corrigir os bugs encontrados: motivo: cada correção tem SDD própria (075, 076, 077, 080, 082, 083, 084). Esta SDD apenas os torna visíveis e evita que voltem.
- Testes das RPCs no banco (validação de adicionais no servidor, idempotência de cupom e cashback, RLS): motivo: ficam na CAF-000092 (testes SQL).
- Testes de PDV, KDS e gestão: motivo: outras SDDs de cobertura (CAF-000087 a 089).
- Teste em navegador real (Playwright): motivo: o harness happy-dom cobre os CAs com custo menor. O smoke em navegador real fica na CAF-000091 como P1/P2.

### Considerado para o futuro (P2)

- Teste visual (screenshot diff) do checkout em mobile.
- Smoke e2e do checkout contra um ambiente de staging com Supabase de preview.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual é o intervalo mínimo entre dois "chamar garçom" da mesma mesa? A SDD 037 não fixa um valor. | PO | Não | Proposta: 60 s |
| D02 | Qual é o tempo de inatividade do totem antes de voltar ao início? | PO | Não | Usar o valor configurado em `js/totem.js` |
| D03 | Os scripts de página (`cardapio-cliente-pedido.js`, `totem.js`) carregados no happy-dom precisam de refatoração mínima (exportar `init`) para serem testáveis? | dev | Sim | Definido pela CAF-000086 |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Isolamento de rede | Integração | CA01, RNF01 | Carregar as 3 páginas com o `fetch` global configurado para lançar erro | Nenhuma chamada real; páginas renderizam com o mock |
| CT02 | Abrir carrinho com cashback ativo | Integração | CA02 | Config `cashback_ativo=true`, adicionar item, clicar no carrinho | Modal visível, lista renderizada, lembrete exibido, 0 erros (`it.fails` → 076) |
| CT03 | Abrir carrinho com cashback inativo | Integração | CA02 | Config vazia, adicionar item, abrir carrinho | Modal visível, sem menção a cashback |
| CT04 | Payload do pedido via QR | Integração / contrato | CA03, RNF04 | `?mesa=M05`, 2 itens com adicional, finalizar | 1 chamada RPC; nomes de parâmetros presentes no snapshot; total correto |
| CT05 | Cupom válido, expirado, esgotado, abaixo do mínimo | Integração | CA04 | Aplicar cada cupom de fixture no cardápio e no totem | Desconto só no válido, mensagens específicas nos demais |
| CT06 | Cupom aplicado duas vezes | Integração (negativo) | CA04 | Aplicar o mesmo código 2× | Desconto aplicado 1× |
| CT07 | Espetáculo no totem | Integração | CA05 | Config de espetáculo ativa, carregar o totem | Banner visível (`it.fails` → 083) |
| CT08 | Busca tolerante no totem | Integração | CA06 | Digitar "capuccino" | "Cappuccino" listado (`it.fails` → 084) |
| CT09 | Promo na virada do dia | Unit / integração | CA07 | `setSystemTime('2026-10-20T21:30:00-03:00')` | Só promos de terça |
| CT10 | WhatsApp flutuante | Unit (HTML estático + DOM) | CA08 | Ler `index.html` e `cardapio.html` | Botão com `aria-label` e link `wa.me` válido |
| CT11 | Adicional não permitido e XSS | Integração (negativo) | CA09 | Abrir montagem de produto com fixture maliciosa | Só permitidos listados; nenhum `img` injetado |
| CT12 | Mesa inexistente e fora do horário | Integração (negativo) | CA10 | `?mesa=XYZ`; relógio fora do `business_hours` | Envio bloqueado com mensagem |
| CT13 | Pedido online com dados inválidos | Integração (negativo) | CA11 | Horário dentro da antecedência; telefone vazio | Envio bloqueado |
| CT14 | Fluxo completo do totem e inatividade | Integração | CA12 | Percorrer o fluxo; avançar os timers | Senha exibida; reset após inatividade; `wakeLock.request` chamado |
| CT15 | Avaliação sem nota, com HTML e duplicada | Integração | CA13 | Enviar nos 3 cenários | Bloqueio / escape / mensagem de duplicidade |
| CT16 | Analytics com RPC falhando | Integração | CA14 | Mock da RPC de analytics rejeitando | Pedido concluído normalmente |
| CT17 | Convenção de bug conhecido | Manual / revisão | CA15 | Revisar os `it.fails` | Todos com comentário apontando a SDD de correção |

### Matriz SDD-alvo → CAs originais → tipo de teste → arquivo

| SDD-alvo | CAs originais cobertos | Tipo | Arquivo | Bug conhecido (SDD de correção) |
|---|---|---|---|---|
| CAF-000017 Aba Promos | Todos (exibição por dia/horário, vazio, expirado) | Unit + integração DOM | `tests/caf-000017-aba-promos.test.js` | Virada após 21h → 080 |
| CAF-000020a WhatsApp flutuante | Todos | Estático + DOM | `tests/caf-000020a-whatsapp-flutuante.test.js` | — |
| CAF-000020b Vínculo de adicionais | CAs de front (lista filtrada, payload, escape) | Integração DOM | `tests/caf-000020b-adicionais-produto.test.js` | XSS e validação → 075 (servidor → 092) |
| CAF-000037 QR na mesa | Mesa via URL, envio, chamado de garçom, horário | Integração DOM + contrato | `tests/caf-000037-qr-mesa-pedido-cliente.test.js` | Horário no servidor → 082 |
| CAF-000038 Pedido online | Antecedência, validação, acompanhamento | Integração DOM + contrato | `tests/caf-000038-pedido-online-retirada.test.js` | Carrinho quebrado → 076 |
| CAF-000040 Totem | Fluxo, inatividade, senha, expiração | Integração DOM | `tests/caf-000040-totem.test.js` | — |
| CAF-000042 Avaliação | Token, nota, duplicidade, escape | Integração DOM | `tests/caf-000042-avaliacao-pedido.test.js` | — |
| CAF-000061 Cupons (integração) | Checkout do cardápio e do totem | Integração DOM | `tests/caf-000061-cupons-integracao.test.js` | Gravação no pedido e uso único → 077 |
| CAF-000062 Espetáculo (integração) | Banner, intervalo, `is_intervalo` | Integração DOM | `tests/caf-000062-espetaculo-integracao.test.js` | Totem e `horario_retirada` → 083 |
| CAF-000063 Cashback (integração) | Lembrete no carrinho, não bloquear o checkout | Integração DOM | `tests/caf-000063-cashback-integracao.test.js` | `.then()` em boolean → 076 |
| CAF-000065 Busca (integração) | Cardápio e totem | Integração DOM | `tests/caf-000065-busca-integracao.test.js` | Sem campo de busca → 084 |
| CAF-000069 Menu analytics | Eventos e falha silenciosa | Integração DOM | `tests/caf-000069-analytics-integracao.test.js` | RPC aberta a anon → 082 |

## URL Complementar

- Documentação técnica: `GEMINI.md` (regra de testes obrigatórios), `vitest.config.js`, `tests/helpers/supabase-mock.js`, `tests/setup.js`
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs de 2026-10-20 (validação de CAF-000001 a 071 contra o código e o banco de produção)
- Referências de design: N/A
- Requisitos originais: SDDs CAF-000017, 020 (ambas), 037, 038, 040, 042, 061, 062, 063, 065, 069 em `SDD/CONCLUIDAS/`
- Issue / PR relacionado: depende de CAF-000072 e CAF-000086
