# [FIX] Web: precache do SW por perfil, manifests separados, LCP e SEO do cardápio

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer o visitante do site baixar só o que o site público usa; separar o app instalável do cliente do app das telas de operação; carregar a home e o cardápio mais rápido; e publicar o cardápio de forma que o Google entenda produtos e preços.
- **Problema e evidência:**
  - Precache único: o build de 2026-11-20 gera 141 arquivos e 4.451.687 bytes (`dist/version.json`). `isPrecacheAsset` inclui todo `.html` e `.js` (`scripts/sw-precache-generator.js:49-50`), inclusive telas de operação. Entram `js/admin/*` (≈ 548 KB) e `js/pdv/*` (≈ 275 KB) crus, que nenhuma página publicada referencia, porque `dist/admin.html` e `dist/pedidos.html` carregam os bundles `assets/admin-*.js` (≈ 346 KB) e `assets/pedidos-*.js` (≈ 164 KB). Acima de 5 MB o gerador só avisa (`:148`). Resultado: cada visitante público baixa ≈ 4,25 MB em segundo plano a cada deploy.
  - Manifest único `manifest.json` em todas as páginas (`index.html:78`, `cardapio.html:28`, `totem.html:13`, `cozinha.html:14`, `pedidos.html:14`, `admin.html:23`) com `"orientation": "portrait-primary"` (`manifest.json:11`) e atalhos para PDV e Cozinha (`manifest.json:28-43`): o cliente que instala o site vê atalhos internos, e totem/KDS instalados num tablet deitado ficam presos em retrato.
  - Carga do cardápio: `pdf.min.js` (pdfjs 3.11.174) e `page-flip` são baixados em toda visita (`cardapio.html:386,388`), mesmo sem abrir o cardápio em PDF; o visualizador já tem modo alternativo quando eles faltam (`js/cardapio-pdf-viewer.js:331`).
  - Fontes: Cormorant Garamond com 10 variações + Jost com 5, em folha de estilo bloqueante (`index.html:71-72`, `cardapio.html:21-22`).
  - LCP da home: o 1º slide é `background-image` inline (`index.html:137`), descoberto só depois do CSS, sem preload nem `fetchpriority`.
  - SEO: o cardápio é montado 100% no navegador e o JSON-LD de `cardapio.html:34-41` só tem `hasMenu`, sem `Menu`/`MenuItem`/`Offer`. O JSON-LD da home publica `"telephone": ""` (`index.html:31`) e horários fixos (`index.html:46`) que podem divergir da tabela `business_hours`.
  - Não há Lighthouse nem orçamento de tamanho no CI (`.github/workflows/deploy.yml`).
- **Impacto de não fazer:** Consumo de dados do cliente no 4G sem benefício; app do cliente com atalhos que não são dele; totem/KDS em orientação errada; LCP e indexação do cardápio piores que o necessário.
- **Para quem é destinado:** Visitante do site e cliente que instala o app; operação (totem, KDS, PDV) que instala as telas no tablet.
- **História de usuário:** Como cliente no celular, quero abrir o cardápio rápido e sem gastar meu plano com telas que não uso.
- **Como saberemos que deu certo:** Precache público ≤ 1,5 MB; Lighthouse mobile da home e do cardápio com LCP < 2,5 s; 0 atalhos internos no manifest público; JSON-LD `Menu` válido com todos os produtos disponíveis.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Precache por perfil: o SW pré-carrega só páginas e arquivos públicos; o pacote de operação (admin, PDV, KDS, totem, retirada) é baixado só quando uma tela de operação é aberta, mantendo o offline da CAF-000118 | P0 | CA01, CA02 |
| RF02 | Fontes já empacotadas (`js/admin/*`, `js/pdv/*` e similares) não entram no precache nem em `dist/` se nenhuma página as referenciar | P0 | CA03 |
| RF03 | Precache total acima de 5 MB ou público acima de 1,5 MB vira erro de build, listando os 10 maiores arquivos | P0 | CA04 |
| RF04 | Manifest público sem atalhos internos; manifest de operação com `orientation: "any"`, `start_url` e `id` próprios, usado por admin, PDV, KDS, totem e retirada | P0 | CA05, CA06 |
| RF05 | pdf.js e page-flip carregados por `import()`/injeção sob demanda ao abrir o cardápio em PDF, com SRI mantido | P1 | CA07 |
| RF06 | Fontes reduzidas a no máximo 4 arquivos, `display=swap` e `preconnect` | P1 | CA08 |
| RF07 | 1º slide da home como `<img>` com `fetchpriority="high"` (ou `preload as=image`) e dimensões declaradas | P1 | CA09 |
| RF08 | JSON-LD `Menu`/`MenuSection`/`MenuItem`/`Offer` (BRL) gerado no build a partir do Supabase, com fallback para o último JSON gerado; texto escapado (`<` como `<`) | P1 | CA10, CA11 |
| RF09 | Horários do JSON-LD da home gerados da tabela `business_hours`; `telephone` publicado só se preenchido | P1 | CA12 |
| RF10 | Lighthouse CI no PR com orçamento: LCP < 2,5 s (mobile emulado), CLS < 0,1, JS público transferido < 200 KB por página (sem GA) | P1 | CA13 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Precache público ≤ 1,5 MB; total ≤ 5 MB | P0 | CA01, CA04 |
| RNF02 | Telas de operação continuam abrindo offline depois da primeira visita | P0 | CA02 |
| RNF03 | Build não depende do Supabase estar no ar | P0 | CA11 |
| RNF04 | CSP e SRI da CAF-000117 preservados (nenhum script sem `integrity`) | P0 | CA07 |

### Dependências técnicas

- `scripts/sw-precache-generator.js`, `sw.js`, `js/sw-register.js`, `vite.config.js`, `manifest.json`, `cardapio.html`, `index.html`, `js/cardapio-pdf-viewer.js`.
- Leitura anônima de `produtos`, `categorias`, `business_hours` no build (chave anon já é pública).
- `@lhci/cli` no CI.

### Recursos necessários

- Telefone público da cafeteria (ou decisão de não publicar).
- Tablet de totem/KDS para conferir a orientação.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um visitante abrindo `index.html` pela primeira vez, quando o SW instala, então nenhum arquivo de admin, PDV, KDS, totem ou retirada é baixado e o total pré-carregado é ≤ 1,5 MB.
- [ ] **CA02:** Dado um operador que já abriu `pedidos.html` uma vez, quando fica sem internet e recarrega, então a tela abre do cache.
- [ ] **CA03:** Dado o build, quando gero a lista de precache, então nenhum arquivo aparece como fonte crua e como bundle ao mesmo tempo.
- [ ] **CA04:** Dado um build cujo precache passe do limite, quando rodo `npm run build`, então o build falha com a lista dos maiores arquivos (caso negativo: não pode só avisar).
- [ ] **CA05:** Dado o manifest público, quando o cliente instala pelo cardápio, então não há atalhos para PDV ou Cozinha.
- [ ] **CA06:** Dado o totem instalado pelo manifest de operação num tablet deitado, quando abre, então a tela fica em paisagem.
- [ ] **CA07:** Dado o cardápio aberto sem clicar no PDF, então `pdf.min.js` e `page-flip` não são requisitados; quando abro o PDF, eles carregam com SRI e o PDF aparece; se o CDN falhar, o modo alternativo aparece.
- [ ] **CA08:** Dado a home, quando carrega, então são baixados no máximo 4 arquivos de fonte e o texto aparece antes da fonte terminar.
- [ ] **CA09:** Dado a home no Lighthouse mobile, quando carrega, então o 1º slide é requisitado com prioridade alta e o LCP é < 2,5 s.
- [ ] **CA10:** Dado o build com o Supabase acessível, então `cardapio.html` tem JSON-LD `Menu` com cada produto disponível (nome e preço em BRL), e produtos indisponíveis ou ocultos não aparecem.
- [ ] **CA11:** Dado o Supabase fora do ar no build, então o build usa o último JSON gerado e não falha; dado um nome de produto com `</script>`, então o JSON-LD continua válido e a página não quebra.
- [ ] **CA12:** Dado `business_hours` com sexta 14h–23h, quando gero o build, então `openingHoursSpecification` traz sexta 14:00–23:00; dado telefone vazio, então a chave `telephone` não é publicada.
- [ ] **CA13:** Dado um PR que leve o JS público acima do orçamento, quando o Lighthouse CI roda, então o job falha.

## O que a atividade não inclui

- Acessibilidade do cardápio e do totem: motivo: CAF-000125.
- Mapa com fachada e ajustes de UX da home: motivo: feitos na CAF-000070.
- Versionamento do SW e atualização sem recarga: motivo: feito na CAF-000118.
- Renderização do cardápio no servidor (SSR): motivo: complexo demais agora; o JSON-LD cobre a indexação.
- Escape de HTML do catálogo: motivo: CAF-000142.

### Considerado para o futuro (P2)

- Imagens AVIF com `srcset` nos cards de produto.
- Auto-hospedar as fontes e o supabase-js para tirar o jsDelivr do caminho crítico.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual telefone publicar no Google (ou nenhum)? | PO | Não | |
| D02 | Quais pesos de fonte o design realmente usa (sugestão: Cormorant 400/600 + itálico 400, Jost 400/500)? | design | Não | |
| D03 | Os orçamentos (1,5 MB, 200 KB, 2,5 s) são aceitáveis? Calibrar com a primeira medição | dev | Não | |
| D04 | Totem e KDS são usados instalados (PWA) ou só no navegador? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Precache público | unit (`tests/caf-000140-*.test.js`, importa `generatePrecache` sobre `dist/` de teste) | CA01, CA03 | Gerar listas | Público sem operação; sem duplicatas; ≤ 1,5 MB |
| CT02 | Offline da operação | e2e (Playwright, modo offline) | CA02 | Abrir PDV, desligar rede, recarregar | Tela abre |
| CT03 | Limite estoura | unit | CA04 | Diretório com 6 MB | Erro com lista |
| CT04 | Manifests | unit (lê JSON gerado) | CA05, CA06 | Conferir `shortcuts` e `orientation` | Público sem atalhos; operação `any` |
| CT05 | PDF sob demanda | e2e (Playwright, rede) | CA07 | Abrir cardápio; depois abrir PDF; bloquear CDN | Sem requisição antes; carrega depois; modo alternativo |
| CT06 | Fontes | e2e (contar requisições `fonts.gstatic.com`) | CA08 | Abrir home | ≤ 4 |
| CT07 | LCP | e2e (lhci) | CA09, CA13 | Rodar Lighthouse mobile | LCP < 2,5 s; orçamento respeitado |
| CT08 | JSON-LD do cardápio | unit (gerador com Supabase simulado) | CA10, CA11 | Produtos variados, `</script>`, Supabase fora | JSON válido; só disponíveis; fallback |
| CT09 | Horários e telefone | unit | CA12 | `business_hours` de teste | Especificação correta; sem `telephone` vazio |
| CT10 | Rich Results | manual (Teste de pesquisa aprimorada do Google) | CA10 | Validar URL publicada | Sem erros |

## URL Complementar

- Documentação técnica: `scripts/sw-precache-generator.js`, `manifest.json`, `cardapio.html`, `index.html`, `js/cardapio-pdf-viewer.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000070](CONCLUIDAS/CAF-000070-performance-maps-facade-e-ux-cardapio-home.md), [CAF-000117](CONCLUIDAS/CAF-000117-seguranca-front-csp-sri-versoes-cdn-dependabot.md), [CAF-000118](CONCLUIDAS/CAF-000118-pwa-service-worker-precache-e-versionamento.md), [CAF-000125](CAF-000125-acessibilidade-totem-e-cardapio-do-cliente.md); novas: CAF-000142
- Referências de design: https://schema.org/Menu, https://web.dev/articles/lcp, https://github.com/GoogleChrome/lighthouse-ci
- Requisitos originais: auditoria de 2026-11-20
- Issue / PR relacionado: —
