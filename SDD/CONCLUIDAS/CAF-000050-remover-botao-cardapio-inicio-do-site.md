# [UI] Remover botão de cardápio do início do site

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael Fernando Gatti Brentano · **Criada em:** 2026-10-15 · **Atualizada em:** 2026-10-15

## Detalhes da Atividade

- **O que precisa ser feito:** Remover o botão de acesso ao cardápio localizado no topo / cabeçalho (navbar) da página inicial (`index.html`), bem como do menu suspenso mobile (`#mobile-menu`).
- **Problema e evidência:** Antes da alteração, a barra de navegação superior (`navbar`) possuía um botão de destaque para o cardápio: `<a href="cardapio.html" class="navbar__btn-cardapio" id="nav-btn-cardapio">Cardápio</a>` (linha 150 de `index.html`), além do botão `<a href="cardapio.html" class="btn btn--primary">Ver Cardápio</a>` no menu mobile suspenso. O usuário solicitou a remoção do botão de cardápio do início do site para manter o topo limpo.
- **Impacto de não fazer:** O botão de cardápio permaneceria no topo da página inicial, divergindo da preferência visual e de navegação solicitada.
- **Para quem é destinado:** Visitantes da página inicial do site (`index.html`), tanto no computador quanto em dispositivos móveis.
- **História de usuário:** Como visitante do site, quero navegar pela página inicial sem a presença do botão de cardápio no topo, aproveitando uma experiência visual mais fluida e limpa no cabeçalho.
- **Como saberemos que deu certo:** O botão "Cardápio" não é mais renderizado no topo (`navbar`) de `index.html`. O espaçamento da barra de navegação e o posicionamento do menu hambúrguer no mobile permanecem harmônicos e funcionais.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Remover o elemento `#nav-btn-cardapio` (`.navbar__btn-cardapio`) da navbar em `index.html`. | P0 | CA01, CA02 |
| RF02 | Remover o botão "Ver Cardápio" no menu mobile (`#mobile-menu`). | P1 | CA03 |
| RF03 | Manter intactos os demais links para o cardápio existentes no restante do site (seção CTA `#cardapio-cta` e rodapé). | P0 | CA04 |
| RF04 | Assegurar que a remoção não gere erros de script em `js/analytics.js` ou qualquer outro ouvinte de eventos. | P0 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Não causar regressão de layout na navbar (alinhamento da logo e do botão hambúrguer no mobile). | P0 | CA02 |
| RNF02 | Zero erros no console JavaScript. | P0 | CA05 |

### Dependências técnicas

- `index.html`: navbar e menu mobile.
- `js/analytics.js`: sem dependência fixa de ID do botão (utiliza querySelectorAll resiliente).
- `css/components.css`: ajuste em `.navbar__links` para alinhamento natural à direita.

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o usuário acessa `index.html` em tela desktop (≥ 769 px), quando visualiza a navbar no topo, então o botão "Cardápio" não é exibido.
- [x] **CA02:** Dado que o usuário acessa `index.html` em dispositivo móvel (≤ 768 px), quando visualiza o topo da tela, então o botão "Cardápio" não aparece ao lado do botão hambúrguer, mantendo o hambúrguer devidamente alinhado à direita.
- [x] **CA03:** Dado que o usuário abre o menu móvel (hambúrguer), o menu exibe os links de navegação da página de forma consistente.
- [x] **CA04:** Dado que o usuário navega pela página inicial até a seção CTA `#cardapio-cta` ou até o rodapé, os botões e links de cardápio dessas seções permanecem funcionando normalmente.
- [x] **CA05:** Dado o carregamento da página inicial, nenhum erro é lançado no console do navegador.

---

## O que a atividade não inclui

- Remoção da página `cardapio.html` em si (o cardápio continua existindo).
- Remoção da seção de chamada do cardápio (`#cardapio-cta`) no meio/fim da página inicial.
- Remoção dos links do cardápio no rodapé (`footer`).

---

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O botão "Ver Cardápio" que fica dentro do menu mobile suspenso (`#mobile-menu`) também deve ser removido, ou apenas o botão visível na barra superior fixa? | PO | Não | Recomendação: remover também do menu mobile ou mantê-lo apenas como link textual simples, para refletir o mesmo objetivo de focar a home. |

---

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Visualização Desktop da Navbar | manual | CA01 | Abrir `index.html` em resolução desktop (ex: 1280px) | Navbar exibe apenas logo e links de âncoras (Sobre, Galeria, Horários, Como Chegar), sem botão de cardápio |
| CT02 | Visualização Mobile da Navbar | manual | CA02 | Abrir `index.html` em resolução mobile (ex: 375px) | Topo exibe logo à esquerda e hambúrguer à direita, sem botão de cardápio |
| CT03 | Funcionamento de seções posteriores | manual | CA04 | Rolar até o fim de `index.html` e clicar em "Ver Cardápio" no CTA ou no rodapé | Direciona com sucesso para `cardapio.html` |
