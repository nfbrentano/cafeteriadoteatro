# [UI] Carrossel Hero Desktop: Galeria de Artes com Cards Verticais Lado a Lado

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael Fernando Gatti Brentano · **Criada em:** 2026-10-09 · **Atualizada em:** 2026-10-09

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Reformular a exibição do carrossel do Hero no desktop (computador). As 8 imagens da "Galeria de Artes" foram criadas na proporção vertical 9:16 (900 × 1600 px, tamanho de tela de celular). No computador (telas widescreen 16:9), a imagem em tela cheia com `background-size: cover` sofre um zoom excessivo e corta mais de 65% do conteúdo (cortando pratos, cabeças e detalhes da arte).
  A proposta é exibir no desktop as obras inteiras na proporção original vertical (formato de celular / quadro de museu), dispostas lado a lado e deslizando lateralmente em um carrossel horizontal contínuo/suave, enquanto no celular a experiência individual vertical em tela cheia permanece perfeita.
- **Problema e evidência:**
  - Imagens 900 × 1600 px sofrem crop agressivo em monitores 1920 × 1080 px ou notebooks 1440 × 900 px quando renderizadas como background fullscreen cover.
  - O usuário relatou: *"no menu [meu] de computador pode deixar a imagem cabendo inteira na tela? ficou muito estranho... poderia por todas elas lado a lado, como do tamanho do celular, e elas ficarem andando, pro lado, tipo um carrosel, sabe"*.
- **Impacto de não fazer:** A visualização em computadores continuará cortando as obras e os pratos das fotos, parecendo desproporcional e pixelada.
- **Para quem é destinado:** Usuários que acessam o site da cafeteria pelo computador / notebook (telas ≥ 1024 px).
- **História de usuário:** Como visitante acessando pelo computador, quero ver as artes e os pratos completos em formato vertical deslizando lado a lado como em uma galeria de arte, para apreciar a obra inteira sem cortes na tela.
- **Como saberemos que deu certo:** No desktop (≥ 1024 px), as imagens aparecem 100% íntegras (da cabeça ao prato) em formato vertical (aspect-ratio 9:16), deslizando lateralmente com transição fluida a 60fps, sem quebrar o layout mobile.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | No desktop (≥ 1024 px), exibir os quadros em proporção vertical integral (9:16), cabendo inteiros na altura da tela (ex: altura de 65-75vh e largura ~360-400px), sem qualquer corte nos pratos ou personagens. | P0 | CA01 |
| RF02 | Posicionar as imagens lado a lado em um trilho horizontal com transição lateral deslizante automática e interativa (setas / teclado / drag). | P0 | CA02 |
| RF03 | Manter no mobile (< 768 px) o formato já otimizado de slide individual vertical ocupando a tela com a placa de museu translúcida no topo. | P0 | CA03 |
| RF04 | Apresentar o quadro ativo/central com foco e nitidez, e os quadros vizinhos com transição suave de escala/profundidade (estilo vitrine de galeria). | P1 | CA04 |
| RF05 | Sincronizar o título e a legenda da obra com o slide ativo no centro da galeria. | P0 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Transições fluidas usando `transform: translateX()` com aceleração de hardware (sem jank). | P0 | CA02 |
| RNF02 | Responsividade perfeita entre breakpoints: mobile (1 card tela cheia), tablet (transição adaptativa), desktop (vitrine multi-card lateral). | P0 | CA01, CA03 |
| RNF03 | Preservar acessibilidade (`aria-roledescription="carousel"`, pausa no hover, navegação por setas do teclado). | P1 | CA06 |

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o usuário abre o site em um computador (largura ≥ 1024 px), quando visualiza o Hero, então as fotos aparecem inteiras em formato vertical de celular/quadro (9:16), sem corte na cabeça e sem corte no prato inferior.
- [x] **CA02:** Dado que o carrossel está rodando no desktop, quando passa o intervalo ou o usuário clica nas setas, então os quadros deslizam lateralmente de forma contínua e suave.
- [x] **CA03:** Dado que o usuário abre o site pelo smartphone (largura ≤ 768 px), quando navega no Hero, então o layout continua no formato de tela cheia vertical com a legenda translúcida no topo, exatamente como aprovado anteriormente.
- [x] **CA04:** Dado o card central em foco no desktop, quando a transição ocorre, o card ativo é destacado com escala e nitidez ideais, e a legenda atualiza em perfeita sincronia.
- [x] **CA05:** Dado que o usuário passa o mouse sobre o carrossel no desktop, então o autoplay pausa para permitir contemplação da arte.

---

## O que a atividade não inclui

- Alteração nas páginas internas (`cardapio.html`, `pedidos.html`, `admin.html`).
- Modificação no upload ou resolução original dos arquivos de imagem (os 8 arquivos `.webp` 900x1600 são preservados).

---

## Dúvidas em aberto

| # | Dúvida | Responsável | Bloqueante? | Resposta |
|---|--------|-------------|-------------|----------|
| D01 | Preferência de estilo no desktop: vitrine com card central em destaque + vizinhos visíveis vs esteira contínua infinita? | Usuário | Não | Usuário selecionou Vitrine com Destaque Central |
