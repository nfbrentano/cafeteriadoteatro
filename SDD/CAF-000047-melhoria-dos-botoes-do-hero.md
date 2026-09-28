# [UI] Melhoria dos botões do hero da home

> **Status:** Rascunho
> **Autor:** Natanael Fernando Gatti Brentano · **Revisor:** · **Criada em:** 2026-09-28 · **Atualizada em:** 2026-09-28

## Detalhes da Atividade

- **O que precisa ser feito:** Melhorar os dois CTAs do hero da página inicial, "Ver Cardápio" (`#hero-cta-cardapio`) e "Como Chegar" (`#hero-cta-chegar`), em quatro frentes:
  1. **Visibilidade:** os botões precisam ficar legíveis sobre qualquer uma das 8 artes do carrossel, inclusive as mais claras.
  2. **Estilo:** deixar os dois botões visualmente coerentes entre si e com a identidade da marca, com estados de hover, foco e toque bem definidos.
  3. **Mobilidade:** área de toque confortável, posição acessível ao polegar e respeito à área segura do iPhone (home indicator).
  4. **Desktop e mobile:** layout previsível em todas as larguras, sem quebras estranhas entre 481 e 768 px.
- **Problema e evidência:** Situação atual no código:
  - **Outline pouco visível:** `.btn--outline` (`css/components.css:311-316`) tem fundo transparente e borda `rgba(250, 246, 238, 0.6)`. O overlay do hero (`css/home.css:31-41`) é bem leve no meio da tela (8% a 25% de opacidade), então nas artes claras (ex.: `arte-vangogh.webp`, `arte-monalisa.webp`) a borda e o texto do "Como Chegar" perdem contraste.
  - **Foco invisível:** o anel de foco global (`css/base.css:127-131`) usa `var(--caramelo)` (#8B5E3C). Sobre o botão primário, que também é caramelo, e sobre o fundo escuro do hero, o foco praticamente desaparece para quem navega pelo teclado.
  - **Estilos que não conversam:** o primário tem sombra "dura" `0 4px 0 var(--cafe)` (efeito 3D) e o outline não tem sombra nenhuma. Os dois parecem de sistemas diferentes.
  - **Alinhamento:** a legenda do slide (`.hero-carousel__caption--fullscreen`, `css/home.css:1000-1013`) é alinhada à esquerda, com `max-width: 500px`, e os botões ficam centralizados logo abaixo. O bloco fica desalinhado.
  - **Faixa intermediária:** até 480 px os botões empilham com largura de até 320 px (`css/home.css:927-937`). Entre 481 e 768 px eles ficam lado a lado com `flex-wrap`, o que pode deixar larguras diferentes ou um botão sozinho numa segunda linha.
  - **Área segura do iPhone:** a página usa `viewport-fit=cover` (`index.html:13`), mas o `.hero__content` não soma `env(safe-area-inset-bottom)` ao padding. No iPhone os botões ficam colados no home indicator.
  - **Aparecem tarde:** `.hero__actions` começa com `opacity: 0` e só surge depois de `fadeUp 0.8s 0.9s` (`css/home.css:62`), ou seja, cerca de 1,7 s depois do carregamento.
  - **"Como Chegar" cai atrás da navbar:** não existe `scroll-margin-top` / `scroll-padding-top`. Como a navbar é fixa (72 px), o título da seção `#chegar` fica escondido atrás dela depois do scroll.
  - **Sem medição:** `js/analytics.js` rastreia "Ver Cardápio" (`click_ver_cardapio`), mas o clique em "Como Chegar" não gera nenhum evento.
- **Impacto de não fazer:** Os dois CTAs principais do site continuam com baixa leitura em parte dos slides, a experiência no teclado e no iPhone fica pior e não dá para saber se o "Como Chegar" é usado.
- **Para quem é destinado:** Visitante anônimo do site público, no desktop e principalmente no mobile.
- **História de usuário:** Como visitante do site, quero enxergar e tocar com facilidade nos botões "Ver Cardápio" e "Como Chegar", seja qual for a arte exibida e o aparelho que eu uso, para chegar rápido ao cardápio ou ao endereço da cafeteria.
- **Como saberemos que deu certo:** Texto dos dois botões com contraste ≥ 4,5:1 e contorno ≥ 3:1 sobre as 8 artes. Área de toque ≥ 48 × 48 px. Foco visível no teclado. Os botões aparecem em até 0,6 s. O evento de clique em "Como Chegar" chega ao GA4. O Lighthouse (Acessibilidade) não piora.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Garantir a leitura do botão secundário "Como Chegar" sobre qualquer arte, por exemplo com fundo translúcido escuro + `backdrop-filter`, ou com um reforço do overlay só na área dos botões | P0 | CA01 |
| RF02 | Definir um anel de foco próprio para os botões do hero, com cor clara (ex.: `--marfim` ou `#E5B874`) e contraste ≥ 3:1 contra o botão e contra o fundo | P0 | CA02 |
| RF03 | Unificar o estilo dos dois botões: mesma altura, raio, peso de fonte, sombra e animação de hover/toque. O primário continua mais forte que o secundário | P0 | CA03 |
| RF04 | Mobile (≤ 480 px): botões empilhados, largura total do container (máx. 360 px), "Ver Cardápio" em cima | P0 | CA04 |
| RF05 | Tablet (481 a 768 px): os dois botões lado a lado com a mesma largura (ex.: `flex: 1 1 0` com `max-width`), sem quebra de linha | P0 | CA05 |
| RF06 | Somar `env(safe-area-inset-bottom)` ao padding inferior do `.hero__content` | P0 | CA06 |
| RF07 | Alinhar a legenda do slide e os botões no mesmo eixo: os dois centralizados, ou os dois à esquerda no desktop (ver D01) | P1 | CA07 |
| RF08 | Adicionar `scroll-margin-top` na `#chegar` (ou `scroll-padding-top` no `html`) igual a `var(--nav-height)` + respiro, para o título não ficar atrás da navbar | P1 | CA08 |
| RF09 | Rastrear o clique em "Como Chegar" no GA4 (ex.: `click_como_chegar` com `button_id`) em `js/analytics.js` | P1 | CA09 |
| RF10 | Reduzir o atraso de entrada dos botões: começar a animação em até 0,3 s e terminar em até 0,6 s | P1 | CA10 |
| RF11 | Ícone pequeno opcional em cada botão (xícara/cardápio e pin de mapa), em SVG inline com `aria-hidden="true"` (ver D02) | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Contraste do texto dos botões ≥ 4,5:1 (WCAG 1.4.3) e do contorno/fundo do botão ≥ 3:1 (WCAG 1.4.11), medidos nas 8 artes | P0 | CA01 |
| RNF02 | Área de toque ≥ 48 × 48 px (hoje é 56 px de altura, manter) e espaço de ≥ 12 px entre os botões | P0 | CA04, CA05 |
| RNF03 | Com `prefers-reduced-motion: reduce`, sem `translateY` no hover e botões visíveis imediatamente | P0 | CA11 |
| RNF04 | Sem scroll horizontal entre 320 px e 1920 px de largura | P0 | CA04, CA05 |
| RNF05 | As mudanças em `.btn`, `.btn--primary` e `.btn--outline` não podem quebrar o visual dos outros usos (`cardapio.html`, `404.html`, seção CTA da home). Se for preciso mudar muito, criar modificadores específicos do hero (ex.: `.hero__actions .btn--outline` ou `.btn--glass`) | P0 | CA12 |
| RNF06 | Hover só em dispositivos com `hover: hover` (padrão atual). No toque, só o feedback de `:active` | P1 | CA03 |
| RNF07 | CLS do hero ≤ 0,1. A animação de entrada não pode mudar o layout, só `opacity`/`transform` | P1 | CA10 |

### Dependências técnicas

- `index.html:209-216`: markup de `.hero__actions`.
- `css/components.css:265-358`: `.btn`, `.btn--primary`, `.btn--outline`, `.btn--lg` (compartilhados com outras páginas).
- `css/home.css:43-67`: `.hero__content`, `.hero__actions`, `.hero__actions .btn`.
- `css/home.css:277-315` e `927-937`: media queries do hero e dos botões.
- `css/home.css:1000-1013`: legenda `--fullscreen` (alinhamento, RF07).
- `css/base.css:127-131`: foco global. `css/base.css:256-266`: reduced motion.
- `js/analytics.js`: eventos GA4 (RF09).
- Bundles gerados (`css/cardapio-bundle.css`, `css/404-bundle.css`, `dist/`): rodar o build de novo se `components.css` mudar.
- CAF-000046 (concluída): define o hero atual, só com arte, legenda e CTAs.

### Recursos necessários

- As 8 artes do carrossel em `assets/images/arte-*.webp`, para medir o contraste.
- Ferramenta de contraste (DevTools > Accessibility ou WebAIM Contrast Checker).
- iPhone real ou simulador com home indicator, para validar a área segura.
- Acesso ao GA4 (DebugView), para validar o evento novo.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado cada um dos 8 slides, quando o slide está ativo, então o texto dos dois botões tem contraste ≥ 4,5:1 e o contorno/fundo do "Como Chegar" tem contraste ≥ 3:1 contra a arte atrás dele.
- [ ] **CA02:** Dado que navego com Tab a partir da navbar, quando o foco chega em cada CTA, então aparece um anel de foco nítido, que não se confunde com a cor do botão nem com o fundo.
- [ ] **CA03:** Dado o desktop com mouse, quando passo o mouse e clico nos dois botões, então os dois têm a mesma altura, raio e tipografia, reagem com a mesma animação e o "Ver Cardápio" continua como ação principal.
- [ ] **CA04:** Dado uma tela de 375 px (e 320 px), quando o hero carrega, então os botões ficam empilhados, com a mesma largura, "Ver Cardápio" em cima, ≥ 48 px de altura, ≥ 12 px de espaço entre eles e sem scroll horizontal.
- [ ] **CA05:** Dado uma tela de 600 px e outra de 768 px, quando o hero carrega, então os dois botões ficam na mesma linha, com a mesma largura, sem quebra.
- [ ] **CA06:** Dado um iPhone com home indicator, quando o hero carrega, então os botões ficam acima da área segura inferior, sem sobrepor o indicador nem a barra de progresso.
- [ ] **CA07:** Dado o desktop, quando olho a legenda e os botões, então os dois estão no mesmo alinhamento (conforme D01).
- [ ] **CA08:** Dado que clico em "Como Chegar", quando o scroll termina, então o título da seção `#chegar` aparece inteiro abaixo da navbar fixa.
- [ ] **CA09:** Dado o GA4 DebugView aberto, quando clico em "Como Chegar", então chega um evento `click_como_chegar` com `button_id: "hero-cta-chegar"`. O clique em "Ver Cardápio" continua gerando `click_ver_cardapio`.
- [ ] **CA10:** Dado um carregamento normal da home, quando a página abre, então os botões ficam totalmente visíveis em até 0,6 s depois da primeira pintura, sem deslocar o layout.
- [ ] **CA11:** Dado `prefers-reduced-motion: reduce` ativo, quando a página carrega e passo o mouse nos botões, então eles já aparecem visíveis e não sobem com `translateY`.
- [ ] **CA12 (negativo):** Dado `cardapio.html`, `404.html` e a seção CTA da home, quando comparo antes e depois, então os botões dessas áreas **não** mudam de forma indesejada.

## O que a atividade não inclui

- Mudar os textos ou destinos dos CTAs. Motivo: conteúdo, que é outra decisão do PO.
- Adicionar um terceiro botão (ex.: WhatsApp, pedido online). Motivo: outra iniciativa (CAF-000038).
- Redesenhar o sistema inteiro de botões do site e do admin. Motivo: complexo demais agora, o foco é o hero.
- Mudar as artes, o overlay geral do hero ou o carrossel. Motivo: já tratado na CAF-000046.

### Considerado para o futuro (P2)

- Ícones nos botões (RF11).
- Barra fixa de CTA no rodapé do mobile depois que o hero sai da tela.
- Tokens de botão (`--btn-height`, `--btn-radius`) em `base.css` para padronizar o site todo.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Legenda e botões: centralizar os dois ou alinhar os dois à esquerda no desktop (estilo editorial)? No mobile a sugestão é centralizar. | Design/PO | Sim | |
| D02 | Os botões devem ganhar ícones (RF11), ou manter só texto? | Design/PO | Não | |
| D03 | O secundário fica em outline com fundo translúcido ("vidro") ou vira botão sólido claro (marfim com texto espresso)? | Design | Não | |
| D04 | Manter o texto em caixa alta com espaçamento de 0,08em, ou passar para capitalização normal, que lê melhor no mobile? | Design | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Contraste nas 8 artes | manual | CA01 | Pausar cada slide (DevTools) e medir o contraste do texto e da borda dos dois botões | Texto ≥ 4,5:1 e borda/fundo ≥ 3:1 em todos |
| CT02 | Foco pelo teclado | manual | CA02 | Tab da navbar até os CTAs | Anel de foco claro e visível nos dois |
| CT03 | Estados no desktop | manual | CA03 | Hover, clique e segurar o clique nos dois | Mesma altura/raio, animação coerente, primário em destaque |
| CT04 | Mobile 320/375 px | manual | CA04 | DevTools, presets iPhone SE e 320 px | Empilhados, largura igual, sem scroll horizontal |
| CT05 | Tablet 600/768 px | manual | CA05 | DevTools com largura custom | Lado a lado, largura igual, sem quebra |
| CT06 | Área segura | manual | CA06 | Simulador iOS (iPhone 15) no Safari | Botões acima do home indicator |
| CT07 | Alinhamento | manual | CA07 | Desktop 1440 px | Legenda e botões no mesmo eixo |
| CT08 | Âncora "Como Chegar" | manual | CA08 | Clicar no botão | Título de `#chegar` visível abaixo da navbar |
| CT09 | Evento GA4 | manual | CA09 | GA4 DebugView + clique nos dois CTAs | `click_como_chegar` e `click_ver_cardapio` registrados |
| CT10 | Tempo de entrada | manual | CA10 | DevTools > Performance, gravar o carregamento | Botões com opacidade 1 em ≤ 0,6 s, CLS ≤ 0,1 |
| CT11 | Reduced motion | manual | CA11 | DevTools > Rendering > `prefers-reduced-motion: reduce` | Botões visíveis de imediato, sem subir no hover |
| CT12 | Regressão em outras páginas | manual | CA12 | Abrir `cardapio.html`, `/pagina-inexistente` e a seção CTA da home | Botões iguais aos de antes |

## URL Complementar

- Documentação técnica: `index.html`, `css/components.css`, `css/home.css`, `css/base.css`, `js/analytics.js`
- Protótipo / mockup: N/A (a definir após D01/D03)
- Discussões relacionadas: CAF-000046 (limpeza do hero e logo na navbar)
- Referências de design: WCAG 2.2: 1.4.3 (contraste mínimo), 1.4.11 (contraste não textual), 2.4.7 (foco visível), 2.5.8 (tamanho do alvo)
- Requisitos originais: pedido do PO em 2026-09-28
- Issue / PR relacionado:
