# [UI] Limpeza do hero da home e logo na navbar

> **Status:** Concluída
> **Autor:** Natanael Fernando Gatti Brentano · **Revisor:** Natanael Fernando Gatti Brentano · **Criada em:** 2026-09-28 · **Atualizada em:** 2026-09-28

## Detalhes da Atividade

- **O que precisa ser feito:** Deixar o hero da página inicial (`index.html`) mais limpo, com as artes do carrossel em destaque, e trocar o nome em texto da navbar pela logo oficial da cafeteria. Na prática, são três ajustes:
  1. Remover o bloco de texto do hero: a tag "Cafeteria do Teatro", o título "Onde o café encontra a cultura." e o subtítulo "No coração do Teatro da Univates, uma pausa que vale o ato. Café de qualidade, ambiente acolhedor e a energia única de um espaço cultural."
  2. Remover os controles de navegação do carrossel (setas anterior/próximo e os 8 indicadores/dots) que ficam sobre as artes.
  3. Trocar o texto "Cafeteria **do Teatro**" do link `.navbar__logo` pela imagem da logo. Usar a versão branca na navbar transparente e a versão escura na navbar sólida.
  4. Otimizar as logos para WebP. Hoje elas estão em PNG 4320×2110 com muita margem transparente.
- **Problema e evidência:** Hoje o hero junta muitos elementos sobre a arte: tag, título, subtítulo, legenda do slide, dois CTAs, setas, dots e barra de progresso. O texto e os controles cobrem boa parte das ilustrações, que são o maior diferencial visual da marca. A navbar mostra o nome em fonte serifada em vez da identidade visual oficial. Trechos atuais:
  - Texto do hero: `index.html:199-212` (`.hero__tag`, `h1.hero__title`, `.hero__subtitle`).
  - Controles: `index.html:230-250` (`.hero-carousel__nav.hero-carousel__nav--fullscreen`).
  - Logo em texto: `index.html:137-139`. O mesmo markup também aparece em `cardapio.html` e `404.html`.
- **Impacto de não fazer:** O hero continua poluído, as artes ficam parcialmente escondidas e a marca aparece sem o logotipo oficial.
- **Para quem é destinado:** Visitante anônimo do site público (desktop e mobile).
- **História de usuário:** Como visitante do site, quero ver as artes da cafeteria sem texto e controles por cima, e reconhecer a marca pela logo, para ter uma primeira impressão mais limpa e memorável.
- **Como saberemos que deu certo:** O hero mostra só a arte, a legenda do slide e os CTAs "Ver Cardápio" e "Como Chegar". A logo aparece na navbar em todas as páginas que a usam. Nenhum erro novo aparece no console. O Lighthouse (SEO e Acessibilidade) não piora em relação à versão atual.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Remover do hero os elementos `.hero__tag`, `.hero__title` (texto visível) e `.hero__subtitle` | P0 | CA01, CA06 |
| RF02 | Remover o bloco `.hero-carousel__nav--fullscreen` (setas `#carousel-prev` / `#carousel-next` e dots `.hero-carousel__dot`) | P0 | CA02 |
| RF03 | Manter o carrossel funcionando depois da remoção dos controles: autoplay, legenda dinâmica, barra de progresso, swipe no mobile e setas do teclado | P0 | CA03 |
| RF04 | Substituir o texto do `.navbar__logo` por um `<img>` da logo, mantendo o link para `index.html` e um nome acessível ("Cafeteria do Teatro") | P0 | CA04, CA05 |
| RF05 | Aplicar a mesma logo na navbar de `cardapio.html` e `404.html`, que usam o mesmo componente | P1 | CA07 |
| RF07 | Gerar a partir dos PNGs as versões WebP otimizadas das duas logos: cortar a margem transparente, redimensionar e converter (ver RNF03) | P0 | CA10 |
| RF08 | Na navbar, trocar entre a logo branca (`navbar--transparent`) e a escura (`navbar--solid`) sem piscar e sem novo layout shift | P0 | CA05 |
| RF06 | Remover o CSS que ficar sem uso (`.hero__tag`, `.hero__title`, `.hero__subtitle`, `.hero-carousel__nav*`, `.hero-carousel__arrow*`, `.hero-carousel__dot*`, `.navbar__logo span`) | P1 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | SEO: a home continua com exatamente um `<h1>` com o texto "Cafeteria do Teatro em Lajeado", visualmente oculto (classe `sr-only` ou equivalente) | P0 | CA06 |
| RNF02 | A logo continua legível nos dois estados da navbar: `navbar--transparent` (sobre o hero escuro) e `navbar--solid` (fundo claro após o scroll). Contraste mínimo de 3:1 (WCAG 1.4.11) | P0 | CA05 |
| RNF03 | Logos em WebP com alpha: sem margem transparente, altura de 144 px (48 px × 3 para telas de alta densidade), no máximo 15 KB cada, com `width`/`height` explícitos no `<img>` para não gerar CLS. Os PNGs originais ficam no repositório só como fonte e nunca são referenciados pelas páginas | P0 | CA04, CA10 |
| RNF04 | A logo não pode ser carregada com `loading="lazy"`, porque está acima da dobra | P1 | CA04 |
| RNF05 | Altura da logo entre 36 e 48 px no desktop e entre 32 e 40 px no mobile (≤ 768 px), sem empurrar o hambúrguer nem os links | P1 | CA08 |
| RNF06 | Zero erros de JavaScript no console depois da remoção dos controles | P0 | CA03 |

### Dependências técnicas

- `index.html`: hero (linhas 199-212 e 230-250) e navbar (linhas 137-139).
- `cardapio.html` e `404.html`: navbar com `.navbar__logo`.
- `css/home.css`: estilos do hero e do carrossel.
- `css/components.css:84-99`: estilos do `.navbar__logo`.
- `js/hero-carousel.js`: `prevBtn`/`nextBtn` já têm guarda `if (...)`. `dots` vira uma NodeList vazia e o `forEach` não quebra. Mesmo assim, conferir e remover o código morto ligado aos controles.
- `js/main.js` / `js/cardapio.js`: trocam `navbar--transparent` por `navbar--solid` no scroll, o que afeta a cor da logo (ver RNF02).
- Service worker (`sw.js`), se houver cache de assets: incluir as duas logos WebP e subir a versão do cache.
- `sharp` (já está nas `devDependencies`): usado para gerar os WebP. Sugestão de script (`scripts/otimizar-logo.mjs`, rodado uma vez e mantido no repositório para refazer se a logo mudar):

  ```js
  import sharp from 'sharp';

  for (const nome of ['logo-cafeteria-do-teatro', 'logo-cafeteria-do-teatro-escura']) {
    await sharp(`assets/images/${nome}.png`)
      .trim()                          // remove a margem transparente (conteúdo real: 2438×1069)
      .resize({ height: 144 })         // ≈ 328×144
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(`assets/images/${nome}.webp`);
  }
  ```

- Troca de logo no scroll: a sugestão é ter as duas `<img>` dentro do `.navbar__logo` e alternar a visibilidade por CSS (`.navbar--solid .navbar__logo-img--clara { display:none }` e o inverso). Assim não há troca de `src` nem requisição atrasada no scroll. A logo escura pode usar `fetchpriority="low"`.

### Recursos necessários

- Logos fonte já estão no repositório, em PNG 4320×2110 com fundo transparente (≈ 66 KB cada):
  - `assets/images/logo-cafeteria-do-teatro.png`: branca, para a navbar transparente sobre o hero.
  - `assets/images/logo-cafeteria-do-teatro-escura.png`: preta, para a navbar sólida (fundo claro).
- Os arquivos que as páginas vão usar serão gerados nesta tarefa (RF07): `assets/images/logo-cafeteria-do-teatro.webp` e `assets/images/logo-cafeteria-do-teatro-escura.webp`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que abro `index.html`, quando o hero carrega, então os textos "Cafeteria do Teatro" (tag), "Onde o café encontra a cultura." e "No coração do Teatro da Univates…" **não** aparecem na tela.
- [x] **CA02:** Dado que abro a home no desktop e no mobile, quando olho o hero, então não aparecem as setas de anterior/próximo nem os indicadores (dots) do carrossel.
- [x] **CA03:** Dado que os controles foram removidos, quando a página fica aberta por mais de 2 ciclos de slide, então as artes continuam trocando sozinhas, a legenda e a barra de progresso acompanham, o swipe funciona no mobile, as setas ← → do teclado funcionam e não há erros no console.
- [x] **CA04:** Dado que abro qualquer página com navbar, quando ela carrega, então a logo aparece no lugar do texto "Cafeteria do Teatro", sem distorção e sem deslocamento de layout (CLS ≤ 0,1).
- [x] **CA05:** Dado que a navbar está transparente sobre o hero, quando rolo a página e ela passa a `navbar--solid`, então a logo continua visível e legível nos dois estados. Com leitor de tela, o link é anunciado como "Cafeteria do Teatro - Início".
- [x] **CA06:** Dado que inspeciono o HTML da home, quando procuro por `<h1>`, então existe exatamente um, com "Cafeteria do Teatro em Lajeado", visualmente oculto. (Caso negativo: a página **não** pode ficar sem `<h1>`.)
- [x] **CA07:** Dado que abro `cardapio.html` e uma URL inexistente (404), quando a navbar carrega, então a mesma logo aparece.
- [x] **CA08:** Dado uma tela de 375 px de largura, quando a navbar carrega, então a logo e o botão hambúrguer cabem na mesma linha, sem sobreposição e sem scroll horizontal.
- [x] **CA10:** Dado os WebP gerados, quando confiro os arquivos, então cada um tem no máximo 15 KB, 144 px de altura, fundo transparente e nenhuma margem vazia em volta do texto. No DevTools > Network, a home carrega os `.webp` e **não** carrega os `.png` das logos.
- [x] **CA09:** Os CTAs "Ver Cardápio" e "Como Chegar" e a legenda do slide continuam visíveis e funcionando. (Caso negativo: esses elementos **não** podem ser removidos junto com o resto.)

## O que a atividade não inclui

- Trocar as artes do carrossel ou os textos das legendas. Motivo: conteúdo, que é outra iniciativa.
- Alterar favicon e ícones do PWA (`assets/icons/`). Motivo: outra iniciativa, porque exige gerar os ícones em vários tamanhos.
- Colocar a logo no rodapé, no painel admin, no PDV ou na cozinha. Motivo: baixo impacto agora, já que esta tarefa foca no site público.
- Redesenhar o hero (tipografia, overlay, posição dos CTAs). Motivo: fora do escopo, aqui só removemos elementos.

### Considerado para o futuro (P2)

- Botão discreto de pausar/retomar o autoplay (ver D02).
- Logo em SVG com `currentColor`, para trocar a cor da marca só por CSS.
- Usar a logo nas imagens de compartilhamento (`og:image`) e nos ícones do PWA.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | A logo enviada é branca. Na navbar sólida (fundo claro, após o scroll) ela some. Vamos usar uma variante escura da logo, aplicar `filter` via CSS no estado `navbar--solid` ou manter a navbar sempre escura? | Design/PO | ~~Sim~~ Resolvida | Usar a variante escura (`logo-cafeteria-do-teatro-escura`) na `navbar--solid`, fornecida pelo PO em 2026-09-28 |
| D02 | Sem as setas e os dots, o autoplay fica sem controle visível de pausa (WCAG 2.2.2 pede pausa para conteúdo que se move por mais de 5 s). Podemos pausar o autoplay no hover/foco, aceitar o risco agora ou adicionar um botão de pausa discreto? | PO/dev | Não | |
| D03 | A legenda dinâmica do slide (ex.: "Thriller na Cafeteria") fica? Pelo pedido, sim, porque só o texto fixo sai. | PO | Não | |
| D04 | A barra de progresso do carrossel (`.hero-carousel__progress`) fica? Pelo pedido, sim. | PO | Não | |
| D05 | A troca da logo vale para `cardapio.html` e `404.html` também, ou só para a home? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Texto do hero removido | manual | CA01 | Abrir a home no desktop e no mobile | Tag, título e subtítulo não aparecem |
| CT02 | Controles removidos | manual | CA02 | Abrir a home e inspecionar o hero | Não existem `.hero-carousel__nav`, `#carousel-prev`, `#carousel-next` nem `.hero-carousel__dot` no DOM |
| CT03 | Carrossel continua funcionando | manual | CA03 | Esperar 2 ciclos, dar swipe no mobile, apertar ← → no desktop e abrir o DevTools | Slides trocam, a legenda e o progresso acompanham, o console fica sem erros |
| CT04 | Logo na navbar transparente e sólida | manual | CA04, CA05 | Abrir a home no topo e rolar a página até a navbar ficar sólida | A logo fica legível nos dois estados |
| CT05 | Acessibilidade do link da logo | manual | CA05 | Navegar com VoiceOver até a logo | Anuncia "Cafeteria do Teatro - Início, link" |
| CT06 | H1 preservado | manual | CA06 | `document.querySelectorAll('h1')` no console | Retorna 1 elemento com "Cafeteria do Teatro em Lajeado" |
| CT07 | Outras páginas | manual | CA07 | Abrir `cardapio.html` e `/pagina-inexistente` | A logo aparece na navbar |
| CT08 | Mobile 375 px | manual | CA08 | DevTools no preset iPhone SE | A logo e o hambúrguer ficam alinhados, sem scroll horizontal |
| CT09 | CTAs preservados | manual | CA09 | Clicar em "Ver Cardápio" e em "Como Chegar" | Navegam para o cardápio e para a seção `#chegar` |
| CT11 | WebP otimizado | manual | CA10 | Rodar o script, conferir tamanho/dimensões (`sips -g pixelWidth -g pixelHeight`) e abrir a aba Network | Dois `.webp` ≤ 15 KB, 144 px de altura, sem PNG da logo na rede |
| CT10 | Performance e SEO | manual | RNF01, RNF03 | Rodar o Lighthouse antes e depois | SEO e Acessibilidade não pioram, CLS ≤ 0,1 |

## URL Complementar

- Documentação técnica: `index.html`, `css/home.css`, `css/components.css`, `js/hero-carousel.js`
- Protótipo / mockup: N/A. As logos (branca e escura) foram enviadas pelo PO e estão em `assets/images/logo-cafeteria-do-teatro*.png`.
- Discussões relacionadas: CAF-000021 (mapa da home via facade; mesma página)
- Referências de design: WCAG 2.2: 1.4.11 (contraste não textual) e 2.2.2 (pausar, parar, ocultar)
- Requisitos originais: pedido do PO em 2026-09-28
- Issue / PR relacionado:
