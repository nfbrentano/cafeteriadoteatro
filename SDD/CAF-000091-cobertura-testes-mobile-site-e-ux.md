# [CHORE] CAF-000091 — Cobertura de Testes de Mobile, Site Institucional e UX do PDV

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Criar testes automatizados para as SDDs de site institucional, mobile e UX do PDV que foram entregues sem teste. Cobrir CAF-000021, 046, 047, 048, 049, 050 a 060, além de 064, 066, 067 e 070, que hoje só têm testes de utilitário ou de leitura de texto. Usar testes DOM com happy-dom em viewport mobile, asserções estáticas de HTML/CSS onde o comportamento é declarativo e, opcionalmente, um smoke em navegador real com Playwright.
- **Problema e evidência:** A auditoria de 2026-10-20 encontrou:
  - **Nenhum teste automatizado** para as SDDs 046 a 060.
  - Os testes de 064–067 cobrem os utilitários, mas não a integração com `js/pedidos.js`.
  - O teste da 070 só lê o texto dos arquivos.
  - Regressões que já existem sem que nada acuse:
    - `alert`/`confirm` nativos ainda em `js/pedidos.js:3180, 3193, 3222, 3573, 5629` (056 pede que todos sejam removidos).
    - O swipe de "entregar" só existe para pedidos prontos.
    - O toast de desfazer dura 4 s, mas a 067 pede 5 s.
    - O desfazer sempre volta o pedido para `concluido`.
    - `mapa-estatico.webp` tem 574 KB, para uma meta abaixo de 80 KB (021).
    - Falta `safe-area-inset-bottom` no hero (047).
- **Impacto de não fazer:** O PDV mobile é a ferramenta diária do garçom e do barista. Regressões de toque, zoom no iOS, bottom sheets ou do carrinho persistente atrasam o atendimento no intervalo do espetáculo, o pico de movimento, e só são descobertas em produção.
- **Para quem é destinado:** Desenvolvedor / agente de IA; PO, que valida a experiência mobile.
- **História de usuário:** Como responsável pelo produto, quero que os comportamentos de mobile e UX entregues (áreas de toque, anti-zoom, bottom nav, rascunho do carrinho, offline, swipe, ditado, comprovante, wake lock e performance da home) tenham testes automatizados, para que uma mudança de CSS ou JS não volte a degradar a operação no celular sem aviso.
- **Como saberemos que deu certo:**
  - Cada SDD-alvo tem um arquivo `tests/caf-0000XX-*.test.js` cobrindo seus CAs.
  - Remover `font-size: 16px` de um input ou recolocar um `alert(` em `js/pedidos.js` faz `npm test` falhar.
  - A suíte desta SDD roda em menos de 15 s.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Usar o harness happy-dom da CAF-000086 para carregar `pedidos.html` e `index.html` em viewport mobile (375×812, `matchMedia('(max-width: 767px)')` = true) e desktop (1280×800), com o mock do Supabase | P0 | CA01 |
| RF02 | Asserções estáticas de HTML/CSS para comportamentos declarativos: inputs com `font-size ≥ 16px` e `inputmode` correto (051); `viewport-fit=cover` nas 3 páginas (070); alvos de toque ≥ 44px na bottom nav e nos botões principais (055); ausência do botão Cardápio na navbar (050); logo `.webp` e `h1` sr-only (046) | P0 | CA02 |
| RF03 | Testes DOM do **PDV mobile**: grade de mesas no mobile (052), fechamento de conta em 3 etapas (054), bottom nav (055), bottom sheets e toasts no lugar de `alert`/`confirm` (056), rascunho do carrinho persistido e faixa offline (057), favoritos, contador e repetir rodada (058), filtro "Meus pedidos", chips de troco e envio otimista (059), para viagem sem mesa (060) | P0 | CA03 a CA07 |
| RF04 | Testes de integração com `js/pedidos.js` para **064, 066 e 067**: wake lock ativado e reativado ao voltar o foco; compartilhar comprovante por Web Share com fallback para WhatsApp; swipe para entregar com desfazer; ditado por voz preenchendo a observação | P0 | CA08, CA09, CA10 |
| RF05 | Testes do **aviso de pedido pronto** (053): ao receber o evento realtime de pronto, chama `navigator.vibrate`, toca o áudio e cria `Notification` quando a permissão foi concedida | P0 | CA11 |
| RF06 | Testes do **site institucional**: fachada do mapa carrega o iframe só no clique e o asset estático fica abaixo de 80 KB (021/070); botões do hero com evento de analytics (047); carrossel em galeria no desktop e swipe no mobile (048) | P0 | CA12, CA13 |
| RF07 | Teste de **versões de dependências** (049): `package.json` e `package-lock.json` sem versões abaixo do mínimo acordado para `vite` e `sharp`; `npm audit --omit=dev --audit-level=high` sem achados (job de CI, não teste unitário) | P1 | CA14 |
| RF08 | **Smoke opcional em navegador real** com Playwright: abrir `pedidos.html` e `index.html` em perfil iPhone, lançar um pedido com o Supabase interceptado via `page.route` e verificar que não há zoom ao focar um input nem erros no console | P2 | CA15 |
| RF09 | Bugs conhecidos entram como `it.fails`/`it.todo` com comentário apontando a SDD de correção (084 para as pendências de UX/KDS) | P0 | CA16 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhum acesso de rede real; `Notification`, `vibrate`, `Audio`, `wakeLock`, `share`, `SpeechRecognition` e `IndexedDB` são todos simulados (estender `tests/setup.js`; `fake-indexeddb` se necessário) | P0 | CA01 |
| RNF02 | Asserções estáticas leem o CSS compilado de `css/*.css` com um parser simples (regex ou `postcss` como devDependency), sem depender de layout real, que o happy-dom não calcula | P0 | CA02 |
| RNF03 | A suíte unitária desta SDD roda em menos de 15 s. O smoke com Playwright (RF08), se adotado, roda em job separado e não bloqueia o deploy na primeira versão | P0 | CA15 |
| RNF04 | Os testes usam seletores estáveis (`id`, `data-testid`, `aria-label`), não classes de estilo. Onde faltar, adicionar `data-testid` como parte desta SDD | P1 | CA03 |

### Dependências técnicas

- **CAF-000086:** harness de páginas, coverage e extração de lógica de `js/pedidos.js` para `js/utils` (carrinho, troco, rascunho, filtro). É bloqueante para RF01, RF03 e RF04.
- **CAF-000084** (pendências UX/KDS): referenciada pelos `it.fails` de 056, 067, 021 e 047.
- Arquivos sob teste: `pedidos.html`, `index.html`, `cardapio.html`, `css/pedidos.css`, `css/home.css`, `css/base.css`, `js/pedidos.js`, `js/hero-carousel.js`, `js/home-dynamic.js`, `js/analytics.js`, `js/utils/wake-lock.js`, `js/utils/receipt-formatter.js`, `js/utils/voice-dictation.js`, `assets/images/mapa-estatico.webp`, `package.json`.
- Possíveis devDependencies: `fake-indexeddb`, `postcss` (opcional), `@playwright/test` (só se o RF08 for aprovado).

### Recursos necessários

- Definição do PO do mínimo de versões aceitável (RF07).
- Aprovação para incluir o Playwright no projeto (RF08).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o harness da CAF-000086, quando `pedidos.html` e `index.html` são carregados em viewport mobile e desktop, então os scripts inicializam sem erro não tratado e sem requisição de rede real.
- [ ] **CA02:** Dado o HTML e o CSS do projeto, quando as asserções estáticas rodam, então:
  - todo `input`, `select` e `textarea` de `pedidos.html` tem `font-size` resolvido ≥ 16px no mobile, e os campos numéricos têm `inputmode` adequado (051);
  - as 3 páginas têm `viewport-fit=cover` (070);
  - a bottom nav e os botões principais têm altura mínima ≥ 44px (055);
  - a navbar não tem `nav-btn-cardapio` (050);
  - o logo é `.webp` e existe um `h1` sr-only (046).
- [ ] **CA03:** Dado o PDV em viewport mobile, quando o usuário abre o lançamento, então as mesas aparecem em grade tocável (052). O fechamento de conta passa pelas 3 etapas na ordem, e voltar uma etapa preserva os dados (054).
- [ ] **CA04:** Dado `js/pedidos.js`, quando a suíte procura `alert(`, `confirm(` e `prompt(` nativos, então não encontra nenhum. As confirmações usam bottom sheet e as mensagens usam toast (056). Enquanto houver ocorrências (linhas 3180, 3193, 3222, 3573 e 5629), o teste fica como `it.fails` → CAF-000084.
- [ ] **CA05:** Dado um carrinho com itens, quando a página é recarregada, então o rascunho é restaurado. Quando o evento `offline` é disparado, a faixa offline aparece, e some no evento `online` (057).
- [ ] **CA06:** Dado o PDV, quando o usuário toca em um favorito, o contador aumenta. "Repetir rodada" recria os itens da última rodada da mesa (058). O filtro "Meus pedidos" mostra só os pedidos do usuário logado, os chips de troco calculam o troco certo e o envio otimista mostra o pedido antes da resposta do servidor (059).
- [ ] **CA07:** Dado o PDV com "para viagem" marcado, quando o pedido é enviado sem mesa, então é aceito com nome do cliente. Sem "para viagem" e sem mesa, o envio é bloqueado (060).
- [ ] **CA08:** Dado o PDV ou o KDS aberto, quando a página inicia e quando volta a ficar visível (`visibilitychange`), então `navigator.wakeLock.request('screen')` é chamado. Sem suporte à API, a tela funciona sem erro (064).
- [ ] **CA09:** Dado um pedido fechado, quando o usuário toca em "Compartilhar comprovante", então `navigator.share` recebe o texto formatado. Sem Web Share, abre o link `wa.me` com o texto codificado (066).
- [ ] **CA10:** Dado um pedido em status entregável, quando o usuário faz swipe sobre o card, então o pedido é marcado como entregue e um toast de desfazer aparece por 5 s. Desfazer devolve o pedido ao status **anterior**. O ditado por voz preenche a observação com o texto reconhecido (067). Toast de 4 s, swipe só em "pronto" e desfazer sempre para `concluido` ficam como `it.fails` → CAF-000084.
- [ ] **CA11:** Dado o garçom com permissão de notificação concedida, quando chega pelo realtime simulado o evento de pedido pronto de sua mesa, então `navigator.vibrate`, o áudio e `new Notification(...)` são chamados uma única vez. Sem permissão, só vibração e som (053).
- [ ] **CA12:** Dado `index.html`, quando a página carrega, então não existe `iframe` do Google Maps. Ao clicar no botão do mapa, o iframe é inserido. O arquivo `assets/images/mapa-estatico.webp` tem menos de 80 KB (021/070); hoje tem 574 KB, então esse teste fica como `it.fails` → CAF-000084.
- [ ] **CA13:** Dado o hero, quando os botões são clicados, então o evento de analytics correspondente é disparado (047). No desktop, o carrossel mostra a galeria lado a lado; no mobile, um swipe horizontal troca o slide (048). A ausência de `safe-area-inset-bottom` no hero fica como `it.fails` → CAF-000084.
- [ ] **CA14:** Dado o `package.json`, quando o teste de versões roda, então `vite` e `sharp` estão em versões ≥ ao mínimo acordado, e o job de CI de `npm audit` não aponta vulnerabilidades altas ou críticas em dependências de produção (049).
- [ ] **CA15 (P2):** Dado o Playwright aprovado, quando o smoke roda em perfil iPhone, então focar um input não altera a escala da página, um pedido é lançado com o Supabase interceptado e o console não tem erros.
- [ ] **CA16:** Dado um teste que exponha um bug já registrado, quando a suíte roda, então ele está como `it.fails`/`it.todo` com `// bug conhecido → CAF-0000NN` e não quebra o CI.

## O que a atividade não inclui

- Corrigir as pendências de UX encontradas (alerts restantes, tempo do desfazer, tamanho do mapa, safe-area): motivo: escopo da CAF-000084.
- Testes de PDV relacionados a fechamento, cancelamento, transferência e caixa: motivo: CAF-000087 (cobertura do PDV e salão) e CAF-000092 (SQL).
- Teste de regressão visual por screenshot: motivo: custo de manutenção alto agora; considerado para o futuro.
- Medição de Lighthouse/Core Web Vitals: motivo: exige navegador real e rede; considerado para o futuro.

### Considerado para o futuro (P2)

- Lighthouse CI na home e no cardápio com orçamento de performance (LCP < 2,5 s em 4G simulado).
- Screenshot diff do PDV mobile nos 3 passos do fechamento.
- Promover o smoke Playwright (RF08) a gate obrigatório do deploy.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O Playwright entra agora (P1) ou só depois (P2)? | PO | Não | Proposta: P2 |
| D02 | Qual o mínimo de versão de `vite`/`sharp` a fixar no teste de 049? | dev | Não | Proposta: o maior entre a versão atual do lock e o último patch de segurança |
| D03 | O swipe de entregar deve valer para pedidos não prontos? A SDD 067 é ambígua. | PO | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Carga das páginas em mobile e desktop | Integração | CA01 | Carregar `pedidos.html` e `index.html` nos 2 viewports | 0 erros, 0 requisições reais |
| CT02 | Anti-zoom e inputmode | Estático | CA02 | Parsear o CSS e os inputs de `pedidos.html` | Todos ≥ 16px; `inputmode` numérico onde há valores |
| CT03 | Alvos de toque | Estático | CA02 | Ler `min-height` da bottom nav e dos botões principais | ≥ 44px |
| CT04 | Fechamento em 3 etapas | Integração | CA03 | Navegar entre as etapas e voltar | Dados preservados |
| CT05 | Sem diálogos nativos | Estático (negativo) | CA04 | Procurar `alert(`, `confirm(`, `prompt(` em `js/pedidos.js` | 0 ocorrências (`it.fails` → 084) |
| CT06 | Rascunho do carrinho e offline | Integração | CA05 | Adicionar itens, recarregar; disparar `offline`/`online` | Rascunho restaurado; faixa alterna |
| CT07 | Favoritos e repetir rodada | Integração | CA06 | Tocar no favorito; repetir rodada | Contador e itens corretos |
| CT08 | Chips de troco | Unit | CA06 | Total 37,50; chips 40/50/100 | Troco 2,50/12,50/62,50 |
| CT09 | Para viagem sem mesa | Integração (negativo) | CA07 | Enviar sem mesa com e sem "para viagem" | Aceito / bloqueado |
| CT10 | Wake lock com visibilidade | Integração | CA08 | Disparar `visibilitychange` | `request('screen')` chamado de novo |
| CT11 | Comprovante sem Web Share | Integração | CA09 | Remover `navigator.share` | `window.open` com `wa.me` |
| CT12 | Swipe e desfazer | Integração | CA10 | Simular `touchstart/move/end`; avançar 5 s | Entregue; desfazer volta ao status anterior (`it.fails` → 084) |
| CT13 | Aviso de pronto | Integração | CA11 | Emitir evento realtime simulado | `vibrate` + áudio + `Notification` 1× |
| CT14 | Mapa sob demanda e peso do asset | Integração + estático | CA12 | Clicar no botão; `fs.statSync` no `.webp` | Iframe só após o clique; arquivo < 80 KB (`it.fails` → 084) |
| CT15 | Carrossel desktop/mobile | Integração | CA13 | Viewport desktop; swipe no mobile | Galeria / troca de slide |
| CT16 | Versões de dependências | Unit + CI | CA14 | Ler `package.json`; `npm audit` no CI | Versões ≥ mínimo; audit limpo |
| CT17 | Smoke iPhone | e2e (Playwright) | CA15 | Focar input, lançar pedido | Sem zoom, sem erro no console |

### Matriz SDD-alvo → CAs originais → tipo de teste → arquivo

| SDD-alvo | CAs originais cobertos | Tipo | Arquivo | Bug conhecido (SDD de correção) |
|---|---|---|---|---|
| CAF-000021 Mapa na home | Fachada, carga sob demanda, peso do asset | Integração + estático | `tests/caf-000021-mapa-home.test.js` | 574 KB → 084 |
| CAF-000046 Hero limpo/logo | Logo webp, h1 sr-only | Estático | `tests/caf-000046-048-hero-site.test.js` | — |
| CAF-000047 Botões do hero | Analytics, safe-area | Integração + estático | `tests/caf-000046-048-hero-site.test.js` | safe-area → 084 |
| CAF-000048 Carrossel galeria | Desktop galeria, mobile swipe | Integração | `tests/caf-000046-048-hero-site.test.js` | — |
| CAF-000049 Dependências | Versões mínimas, audit | Unit + CI | `tests/caf-000049-dependencias.test.js` | — |
| CAF-000050 Botão Cardápio | Ausência na navbar, CTA mantido | Estático | `tests/caf-000050-navbar.test.js` | — |
| CAF-000051 Anti-zoom/inputmode | Todos | Estático | `tests/caf-000051-055-mobile-estatico.test.js` | — |
| CAF-000052 Grade de mesas | Todos | Integração | `tests/caf-000052-grade-mesas.test.js` | — |
| CAF-000053 Aviso de pronto | Vibração, som, notificação | Integração | `tests/caf-000053-aviso-pronto.test.js` | — |
| CAF-000054 Fechamento em etapas | Todos | Integração | `tests/caf-000054-fechamento-etapas.test.js` | Fechamento no servidor → 073 |
| CAF-000055 Bottom nav/toque | Todos | Estático + integração | `tests/caf-000051-055-mobile-estatico.test.js` | — |
| CAF-000056 Bottom sheets/toasts | Sem diálogos nativos | Estático + integração | `tests/caf-000056-dialogos.test.js` | alerts restantes → 084 |
| CAF-000057 Carrinho persistente/offline | Todos | Integração | `tests/caf-000057-carrinho-offline.test.js` | — |
| CAF-000058 Favoritos/repetir rodada | Todos | Integração | `tests/caf-000058-lancamento-rapido.test.js` | — |
| CAF-000059 Meus pedidos/troco | Todos | Unit + integração | `tests/caf-000059-filtro-troco.test.js` | — |
| CAF-000060 Para viagem sem mesa | Todos | Integração | `tests/caf-000060-viagem-sem-mesa.test.js` | — |
| CAF-000064 Wake lock (integração) | PDV, KDS, totem, retirada | Integração | `tests/caf-000064-wake-lock-integracao.test.js` | — |
| CAF-000066 Comprovante (integração) | Share e fallback | Integração | `tests/caf-000066-comprovante-integracao.test.js` | — |
| CAF-000067 Swipe/ditado (integração) | Swipe, desfazer 5 s, ditado | Integração | `tests/caf-000067-swipe-voz-integracao.test.js` | 4 s / status anterior → 084 |
| CAF-000070 Performance/UX | Fachada, swipe, viewport-fit (reescrever para DOM) | Integração | `tests/caf-000070-performance-ux.test.js` (ampliar) | — |

## URL Complementar

- Documentação técnica: `GEMINI.md`, `vitest.config.js`, `tests/setup.js`, `tests/helpers/supabase-mock.js`
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs de 2026-10-20
- Referências de design: `SDD/CONCLUIDAS/MELHORIAS_UX.md`, `SDD/CONCLUIDAS/ANALISE_PEDIDOS_MOBILE.md`
- Requisitos originais: SDDs CAF-000021, 046 a 060, 064, 066, 067, 070 em `SDD/CONCLUIDAS/`
- Issue / PR relacionado: depende de CAF-000086
