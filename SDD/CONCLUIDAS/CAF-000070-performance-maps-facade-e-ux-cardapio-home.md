# [UI] CAF-000070 — Performance e UX Mobile da Home e Cardápio Público (Maps Facade, Auto-scroll de Categorias e Swipe no Hero)

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Concluir o pacote de melhorias de UX e performance mobile das páginas públicas (`index.html` e `cardapio.html`) levantadas em `MELHORIAS_UX.md`:
  1. **Google Maps sob demanda (*Click-to-load Facade*) na Home (`index.html`):** substituir o carregamento imediato do `iframe` pesado do Google Maps por um card leve com prévia visual, endereço e botões **"🗺️ Abrir no Google Maps / Como Chegar"** e **"Interagir com o Mapa aqui"**, economizando ~1,5 MB de JavaScript de terceiros no 4G.
  2. **Auto-scroll horizontal da barra de categorias e alvos de toque de `44px` no Cardápio (`cardapio.html`):** garantir altura mínima de `44px` nos botões de categoria e manter o botão da categoria ativa sempre visível/centralizado na barra horizontal conforme o cliente rola a página.
  3. **Gesto de arrastar (`Swipe` touch) no carrossel do Hero (`index.html`):** permitir trocar os slides do carrossel arrastando com o dedo no celular e ampliar a área de toque das setas/dots para `44x44px` sem alterar o tamanho visual dos ícones.
  4. **Ajustes gerais de PWA e toque (`viewport-fit=cover` e `:active`):** garantir `viewport-fit=cover` e `-webkit-tap-highlight-color: transparent` com feedback `:active` consistente em `index.html`, `cardapio.html` e `admin.html`.
- **Problema e evidência:** Os itens da seção *"🟢 Site público — Home e cardápio"* e *"⚪ Geral"* de `MELHORIAS_UX.md` (`linhas 74–98`) foram mapeados para melhorar o tempo de carregamento no 4G e a ergonomia mobile do cliente final, enquanto as tarefas `CAF-000051` a `CAF-000059` focaram primeiro na tela interna do barista (`pedidos.html`).
- **Impacto de não fazer:** Carregamento inicial mais pesado no 4G devido ao `iframe` do Google Maps na Home, barra de categorias no `cardapio.html` cortando a categoria ativa fora da área visível durante o scroll e carrossel do hero sem resposta ao gesto natural de arrastar o dedo.
- **Para quem é destinado:** Clientes acessando a Home (`index.html`) e o Cardápio Digital (`cardapio.html`) pelo celular.
- **História de usuário:** Como cliente acessando o site da Cafeteria do Teatro pelo celular no 4G, quero que a página carregue rapidamente, que eu possa deslizar o carrossel com o dedo, navegar pelas categorias com conforto e abrir a rota no Google Maps com 1 toque.
- **Como saberemos que deu certo:** Zero requisições para `google.com/maps/embed` no carregamento inicial da Home (carrega apenas se solicitado), botões de categoria com `>= 44px` de altura e auto-scroll suave na barra horizontal, e carrossel respondendo a swipe horizontal no mobile.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Na seção de localização da Home (`index.html`), implementar fachada leve (*facade*) para o mapa com botão primário **"📍 Como chegar (Abrir no Maps)"** e botão secundário **"Ver mapa interativo"**, injetando o `iframe` apenas quando o usuário clicar em "Ver mapa interativo" | P0 | CA01 |
| RF02 | No carrossel do Hero da Home (`js/main.js` / `css/home.css`), adicionar suporte a gesto `touchstart` / `touchend` (swipe horizontal `> 40px`) para avançar/voltar slides no celular e área de toque mínima de `44x44px` nos controles | P0 | CA02 |
| RF03 | No Cardápio (`css/cardapio.css` / `js/cardapio.js`), ajustar a altura mínima dos botões `.cat-btn` para `44px` e fazer a barra `.categories-bar` rolar horizontalmente (`scrollIntoView({ inline: 'center', behavior: 'smooth' })`) sempre que a categoria ativa mudar | P0 | CA03 |
| RF04 | Adicionar `viewport-fit=cover` na meta tag `viewport` de `index.html`, `cardapio.html` e `admin.html`, além de `-webkit-tap-highlight-color: transparent` e feedback `:active` (`transform: scale(0.97)`) nos botões interativos | P1 | CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Reduzir em pelo menos `500 KB` o peso total transferido no carregamento inicial (`DOMContentLoaded` / `load`) de `index.html` ao adiar o `iframe` do Google Maps | P0 | CA01 |
| RNF02 | Todos os botões de navegação pública avaliados devem respeitar o tamanho mínimo de alvo de toque de `44x44px` (WCAG 2.5.5 / diretrizes mobile) | P0 | CA02, CA03 |

### Dependências técnicas

- Arquivos `index.html`, `cardapio.html`, `admin.html`, `css/home.css`, `css/cardapio.css`, `js/main.js` e `js/cardapio.js`.

### Recursos necessários

- Nenhum recurso externo ou alteração de banco de dados.

## Critérios de Aceitação / Entregas

- [x] **CA01:**** Dado que o usuário abre `index.html`, quando a página carregar inicialmente, então o `iframe` do Google Maps não deve ser baixado automaticamente; ao clicar em "Ver mapa interativo", o `iframe` deve ser carregado, e ao clicar em "Como chegar", deve abrir o link direto do Google Maps.
- [x] **CA02:**** Dado que o usuário está em `index.html` no celular, quando deslizar o dedo horizontalmente sobre o carrossel do Hero, então o carrossel deve avançar ou retroceder para o slide correspondente.
- [x] **CA03:**** Dado que o usuário está em `cardapio.html` no celular, quando selecionar ou rolar até uma categoria que está nas extremidades da barra horizontal, então o botão da categoria ativa (com altura mínima de `44px`) deve rolar automaticamente para ficar visível na barra.
- [x] **CA04:**** Dado que o usuário instala ou abre `index.html`, `cardapio.html` ou `admin.html` no celular, quando tocar nos botões interativos, então não deve haver flash azul padrão do navegador e deve haver feedback tátil visual (`:active`), com `viewport-fit=cover` configurado.

## O que a atividade não inclui

- Alteração de identidade visual, cores ou fontes da marca na Home: motivo: preservar integralmente o design aprovado nas tarefas `CAF-000046` a `CAF-000050`.

### Considerado para o futuro (P2)

- Service Worker com cache offline da vitrine pública do cardápio.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Verificar fachada do Google Maps na Home | Manual / Network | CA01 | Abrir `index.html` com aba Network aberta e depois clicar em "Ver mapa interativo" | Nenhuma requisição do Maps no load inicial; `iframe` carrega após o clique |
| CT02 | Swipe no carrossel mobile | Manual | CA02 | Em viewport mobile (`375px`), arrastar o slide do Hero para a esquerda e para a direita | Slide muda conforme a direção do gesto |
| CT03 | Altura `44px` e auto-scroll das categorias no cardápio | Manual | CA03 | Abrir `cardapio.html` em `375px` e selecionar a última categoria da direita | Botão tem `>= 44px` de altura e centraliza suavemente na barra |
| CT04 | Meta tag `viewport-fit=cover` e `:active` | Manual | CA04 | Inspecionar `<meta name="viewport">` em `index.html`, `cardapio.html` e `admin.html` | Todas contêm `viewport-fit=cover` |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/MELHORIAS_UX.md` (seções *🟢 Site público — Home e cardápio* e *⚪ Geral*)
