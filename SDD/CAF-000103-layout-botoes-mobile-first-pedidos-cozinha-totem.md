# [UI] Disposição dos Botões Mobile First nas Telas de Pedidos (PDV), Cozinha (KDS) e Totem

> **Status:** Aprovada
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-10-26 · **Atualizada em:** 2026-10-26

## Detalhes da Atividade

- **O que precisa ser feito:** Reorganizar a posição, a hierarquia visual e o tamanho dos botões de `pedidos.html`, `cozinha.html` e `totem.html` (e dos botões gerados por `js/pedidos.js`, `js/cozinha.js` e `js/totem.js`), partindo do layout de celular e expandindo para tablet e desktop. O trabalho cria um conjunto único de variantes de botão, define onde ficam as ações principais (zona do polegar), agrupa ações secundárias em menus e remove os estilos inline dos botões. A regra de negócio e o comportamento dos botões não mudam: só a disposição e a aparência.
- **Problema e evidência:**
  - **Estilos inline espalhados:** `pedidos.html` tem 172 atributos `style="…"`, `totem.html` tem 74 e `cozinha.html` tem 19, muitos em botões com cores fixas em hexadecimal (ex.: `#btn-pedidos-cliente-nav`, `#btn-chamados-mesa-nav`, `#btn-offline-queue`, `#btn-mesa-whatsapp`, `#btn-add-pagamento`, `#btn-totem-reservar-intervalo`). O mesmo papel (ex.: "ação principal") aparece com cores, alturas e raios diferentes em cada tela.
  - **CSS desktop first:** os breakpoints de `css/pedidos.css` (`max-width: 900px`, `480px`, `340px`) e `css/cozinha.css` (`max-width: 860px`, `480px`) partem do desktop e corrigem para baixo. `css/totem.css` não tem nenhum `@media`, embora o totem possa rodar em tablet em retrato ou paisagem.
  - **Excesso de botões no mesmo nível:**
    - Modal da mesa no PDV: 9 botões lado a lado no rodapé (Imprimir Prévia, WhatsApp, Compartilhar, Transferir, Juntar, Repetir Rodada, Adicionar Itens, Fechar, Fechar Conta), com o mesmo peso visual, exceto "Fechar Conta".
    - Rodapé do fechamento de conta: até 6 botões (WhatsApp, Compartilhar, Cancelar, Ajustes ➔, Pagamento ➔, Confirmar Fechamento), alternados por `hidden`.
    - Topbar da cozinha: seletor de estação, 3 abas de visão, indicador de conexão, 5 botões de ferramenta (Atalhos, Esta Tela, Som, Voz, Teste de impressão) e Sair, tudo numa linha só.
    - Card do KDS: até 5 botões (prioridade, 2 de impressão, ação de estado e desfazer), com a ação principal (Iniciar / Concluir / Chamar) no mesmo nível dos ícones de impressão.
  - **Ação destrutiva colada na ação principal:** "Recomeçar" (limpa o carrinho) fica ao lado de "Finalizar Pedido" na barra inferior do totem; "Cancelar" e "Confirmar Fechamento" ficam lado a lado no fechamento de conta, sem espaço de segurança.
  - **Alvos de toque irregulares:** só alguns botões têm `min-height` de 44 px ou 48 px (`css/components.css`, `css/cozinha.css`); botões como `#btn-desvincular-cliente`, `#btn-alerta-pronto-fechar`, `#modal-offline-close` e os chips de observação rápida não têm tamanho mínimo garantido.
- **Impacto de não fazer:** toques errados em horário de pico (enviar, cancelar ou limpar sem querer), lentidão do atendente para achar a ação certa no celular, telas que quebram em larguras intermediárias (tablet do totem, celular pequeno do garçom) e manutenção mais cara, porque cada ajuste visual exige caçar estilos inline.
- **Para quem é destinado:**
  - Atendente / garçom que usa o PDV no celular, com uma mão, circulando no salão.
  - Barista e cozinheiro que operam o KDS **principalmente em celular Android** (D01), muitas vezes com uma mão só, ocupada ou molhada.
  - Cliente que faz o pedido sozinho no totem (tablet), sem treinamento.
- **História de usuário:** Como atendente, barista ou cliente do totem, quero que a ação principal de cada tela esteja sempre no mesmo lugar, grande e ao alcance do polegar, e que as ações secundárias não disputem atenção com ela, para concluir cada etapa com menos toques e sem tocar no botão errado.
- **Como saberemos que deu certo:**
  - Nenhum atributo `style` em `<button>` nas três páginas e nos templates de botão dos três scripts.
  - 100% dos botões interativos com área de toque ≥ 44 × 44 px no PDV e na cozinha e ≥ 56 × 56 px no totem, medido nas larguras de 360, 768 e 1280 px.
  - No máximo **1 botão primário visível por contexto** (tela, modal, card ou etapa).
  - Nenhuma rolagem horizontal da página em 320, 360, 390, 768, 1024 e 1280 px.
  - Rodapé do modal da mesa com no máximo 3 botões visíveis no celular (as demais ações no menu "Mais ações").
  - KDS operável em celular Android de 360 × 800 px com uma mão: trocar de coluna e mudar o estado de um pedido sem sair da metade inferior da tela.
  - Tela do totem em que "Recomeçar" é a única ação mostra o botão centralizado sobre a animação de fundo escolhida no admin, rodando a ≥ 50 fps no tablet do totem.
  - Lighthouse Acessibilidade ≥ 95 nas três páginas (hoje: medir e registrar na SDD antes de começar).
  - `npm test` e `npm run build` passando 100%, com os testes existentes de mobile (CAF-000051, 052, 054, 055, 056, 091), do totem (CAF-000040) e da suíte da CAF-000102 sem alteração de expectativa funcional.

## Requisitos da Atividade

### Diretrizes de layout (valem para as três telas)

**Variantes de botão** (classes novas em `css/components.css`, com tokens em `css/base.css`):

| Variante | Uso | Regras |
|---|---|---|
| `btn--primary` | Ação que conclui a etapa (Enviar Pedido, Fechar Conta, Concluir, Finalizar Pedido) | 1 por contexto; cor de marca; largura total no celular; fica no rodapé fixo |
| `btn--secondary` | Ação alternativa relevante (Adicionar Itens, Imprimir) | Contorno; nunca ao lado de outra `secondary` em mais de 2 |
| `btn--ghost` | Cancelar, Voltar, Fechar | Só texto; sempre à esquerda ou acima da primária |
| `btn--danger` | Ação destrutiva (Recomeçar, Cancelar item, Descartar fila) | Vermelho em contorno; separado da primária por pelo menos 16 px ou em outra linha; pede confirmação (já existente) |
| `btn--icon` | Ferramentas (som, impressão, etiqueta, prioridade) | Quadrado de 44 px (56 px no totem); `aria-label` obrigatório; tooltip no desktop |
| `chip` | Filtros e seleções (filtros de status, escopo, observações rápidas, formas de pagamento) | Rolagem horizontal no celular, sem quebrar linha; estado ativo com `aria-pressed` |

Os nomes antigos (`btn-primary`, `btn-ghost`, `btn-primary-small`, `btn-card`, `totem-btn--primary` etc.) passam a ser **aliases** das variantes novas nesta atividade, para não quebrar o JS nem os testes; a remoção dos nomes antigos fica para depois.

**Tamanhos (tokens):** `--btn-h-sm: 36px` (só desktop, com área de toque expandida a 44 px), `--btn-h-md: 44px`, `--btn-h-lg: 52px`, `--btn-h-xl: 64px` (totem), `--btn-gap: 8px` (mínimo entre alvos de toque).

**Breakpoints mobile first** (sempre `min-width`): base 0–599 px (celular) · `600px` (celular grande / tablet pequeno) · `900px` (tablet paisagem) · `1280px` (desktop / TV do KDS).

**Zona do polegar:** no celular, a ação primária fica num **rodapé fixo** (`position: sticky; bottom: 0`) com `padding-bottom: env(safe-area-inset-bottom)`, em largura total. Ações secundárias ficam acima dela ou no menu "Mais ações" (bottom sheet já existente da CAF-000056). Do `600px` em diante, o rodapé vira linha com Cancelar/Voltar à esquerda e a primária à direita.

**Ordem fixa nos rodapés:** `[ghost: Cancelar/Voltar] … [secondary] [primary]`. No celular empilhado: primária embaixo (mais perto do polegar), ghost em cima.

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar as variantes e os tokens de botão (tabela acima) em `css/base.css` e `css/components.css`, e mapear as classes antigas como aliases | P0 | CA01, CA02 |
| RF02 | Remover todo `style="…"` de `<button>` em `pedidos.html`, `cozinha.html` e `totem.html` e nos templates de botão de `js/pedidos.js`, `js/cozinha.js` e `js/totem.js`, trocando por classes | P0 | CA01 |
| RF03 | Reescrever os breakpoints de botões e barras de ação de `css/pedidos.css`, `css/cozinha.css` e `css/totem.css` em `min-width` (mobile first) | P0 | CA03, CA04 |
| RF04 | **PDV — carrinho:** "Enviar Pedido" (`#btn-enviar-pedido`) em rodapé fixo de largura total no celular, dentro do drawer do carrinho; o resumo (itens e total) fica imediatamente acima dele | P0 | CA05 |
| RF05 | **PDV — modal da mesa:** rodapé mostra só "Fechar Conta" (primária) e "Adicionar Itens" (secundária) no celular; Imprimir Prévia, WhatsApp, Compartilhar, Transferir, Juntar e Repetir Rodada vão para um botão "Mais ações" que abre bottom sheet com as opções em lista (ícone + texto, 52 px de altura). Do `900px` em diante, as ações de mesa (Transferir, Juntar, Repetir) aparecem como linha de secundárias e as de compartilhamento continuam no menu. Os atendentes aceitam o toque a mais para WhatsApp, Compartilhar e Imprimir (D04) | P0 | CA06, CA07 |
| RF06 | **PDV — fechamento de conta:** rodapé com no máximo Voltar (ghost) + Avançar/Confirmar (primária) em cada etapa; WhatsApp e Compartilhar só aparecem na tela de sucesso, não durante a cobrança; "Cancelar" vira o `✕` do cabeçalho e o "Voltar" da etapa 1 | P0 | CA08 |
| RF07 | **PDV — topbar e navegação:** som, tela sempre ligada e fila offline vão para uma área de status com `btn--icon` (a fila offline vira badge com contador); "Pedidos de cliente" e "Chamados de mesa" deixam de ser abas e viram badges de alerta com cor por classe, não por estilo inline; a bottom nav da CAF-000055 é mantida | P1 | CA09 |
| RF08 | **PDV — chips:** filtros de status, escopo (Todos/Meus) e observações rápidas do modal de montagem em linha única com rolagem horizontal no celular | P1 | CA10 |
| RF09 | **Cozinha — topbar:** como o KDS roda principalmente em celular Android (D01), o layout base é o de celular: topbar só com logo, indicador de conexão e um botão "Ferramentas" (`btn--icon`) que abre bottom sheet com Atalhos, Esta Tela, Som, Testar Voz, Testar Impressão e Sair. Logo abaixo da topbar, um controle segmentado de estação (Todas / Cozinha / Bar) e o chip "🎭 Intervalo" com contador. As ferramentas só voltam à topbar como ícones do `1280px` em diante | P0 | CA11 |
| RF10 | **Cozinha — card do pedido:** a ação de estado (Iniciar Preparo / Concluir / Chamar) ocupa a largura total no rodapé do card com 56 px de altura no celular (uso com mão molhada ou com luva); prioridade, imprimir comanda e imprimir etiquetas viram uma barra de `btn--icon` no cabeçalho do card; "Desfazer" fica como `btn--ghost` separado da ação principal | P0 | CA12, CA13 |
| RF11 | **Cozinha — atalhos de teclado e bump bar** (CAF-000029) continuam funcionando sem mudança, inclusive com o menu de ferramentas fechado. É uso secundário (o principal é toque no celular), mas não pode regredir | P0 | CA14 |
| RF12 | **Totem — "Recomeçar" junto de outros botões (D06):** "Recomeçar" (`#btn-totem-limpar`, mesmo id) sai da barra inferior e vai para o **canto superior direito**, como último item de `.totem-header__actions`, depois dos botões de acessibilidade. É um `btn--danger` em contorno, com ícone **e** texto ("↺ Recomeçar", não só um "✕", que em app significa "fechar"), 56 px de altura e ≥ 16 px de distância dos botões de acessibilidade. Fica escondido por CSS enquanto estiver `disabled` (sacola vazia), sem mudar `js/totem.js`, e continua pedindo confirmação. A barra inferior fica só com o resumo da sacola e "Finalizar Pedido" (`--btn-h-xl`, a maior parte da largura) | P0 | CA15 |
| RF13 | **Totem — modais (item, sugestões, checkout, sucesso):** rodapé fixo com Voltar (ghost) + ação primária; escolhas (comer aqui/viagem, forma de pagamento, adicionais) em grade de `btn--choice` de 2 colunas no retrato e 3 no paisagem; contador de quantidade com botões de 64 px | P0 | CA16 |
| RF14 | **Totem — responsividade e rotação:** o tablet do totem pode girar (D03), então `css/totem.css` ganha breakpoints `600px` e `900px` e regras por `orientation` (retrato × paisagem), e funciona em celular para testes. Girar o tablet no meio do pedido não pode perder a sacola, fechar o modal aberto nem reiniciar o contador de inatividade. A página não trava a orientação | P0 | CA04, CA23 |
| RF15 | Manter todos os `id`, `data-*` e `aria-*` atuais dos botões; botões movidos para menus continuam sendo os mesmos elementos (sem duplicar IDs), para não quebrar `js/*.js` nem os testes | P0 | CA17 |
| RF16 | **Cozinha — navegação inferior no celular:** as abas de coluna que já existem (`#kds-mobile-tabs`: Na Fila / Em Preparo / Prontos / Produção) viram barra de navegação fixa no rodapé, com contador em cada aba e área segura do Android, no mesmo padrão da bottom nav do PDV (CAF-000055). Do `900px` em diante, as colunas aparecem lado a lado e a barra some | P0 | CA20 |
| RF17 | **Totem — "Recomeçar" sozinho na tela:** quando "Recomeçar" (ou a ação equivalente de reinício) é a única ação da tela, o botão fica centralizado, em `--btn-h-xl`, sobre uma animação de fundo. Vale só para duas telas (D07): tela de descanso (`#totem-idle-screen`, após 60 s sem toque) e tela final de senha (`#totem-success-screen`) quando "Imprimir Senha" não estiver disponível | P1 | CA21 |
| RF18 | **Totem — animação de fundo configurável:** a cafeteria (não o cliente final, D07) escolhe a animação no admin em Configurações → Totem (`js/admin/settings.js`, mesma tela dos avisos do teatro), entre o catálogo aprovado (D08) de animações só em CSS — **Nenhuma**, **Cortina do teatro** (reaproveitando `css/curtain.css`), **Vapor de café** e **Grãos caindo** — e uma mídia própria enviada pela cafeteria (RF19). A escolha é salva em `configuracoes` (chave nova `totem_animacao_fundo`, em JSON: `{"tipo":"catalogo","id":"cortina"}` ou `{"tipo":"midia","url":"…","mime":"video/mp4"}`) e chega ao totem pela RPC `validar_sessao_totem`, junto de `aviso_titulo` | P1 | CA22 |
| RF19 | **Totem — publicar GIF ou MP4 próprio (D08):** em Configurações → Totem, botão "Publicar animação (GIF ou MP4)". O admin escolhe o arquivo, vê a prévia em retrato e em paisagem, e publica. O arquivo vai para o bucket `site-assets` com `cafeteriaDB.assets.upload` (`js/db.js`), no caminho `totem/fundo-<timestamp>.<ext>`, e a URL é gravada em `totem_animacao_fundo`. Regras: só `video/mp4` e `image/gif` (tipo e extensão conferidos); limites de 15 MB para MP4 e 8 MB para GIF (aprovados em D09); botão "Remover mídia" volta para a animação do catálogo. No totem, MP4 toca em `<video autoplay muted loop playsinline>` e GIF em `<img>`, ambos com `object-fit: cover` (preenchem a tela em qualquer orientação) e uma camada escura por cima para garantir o contraste do botão. Se a mídia não carregar, o totem usa "Nenhuma" sem mostrar erro ao cliente | P1 | CA24, CA25, CA26 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Área de toque ≥ 44 × 44 px (PDV e cozinha) e ≥ 56 × 56 px (totem), com ≥ 8 px entre alvos (WCAG 2.2 — 2.5.8, com folga) | P0 | CA02 |
| RNF02 | Contraste ≥ 4,5:1 para texto de botão e ≥ 3:1 para bordas de `secondary`/`ghost` e ícones (WCAG 2.2 AA) | P0 | CA18 |
| RNF03 | Sem rolagem horizontal da página de 320 a 1920 px | P0 | CA03 |
| RNF04 | Todo `btn--icon` com `aria-label`; todo botão de alternância com `aria-pressed`; menus com `aria-expanded` e foco preso enquanto abertos; `Esc` fecha | P0 | CA19 |
| RNF05 | Transições respeitam `prefers-reduced-motion` (regra já existe em `css/base.css`) | P1 | — |
| RNF06 | Nenhuma mudança de regra de negócio, chamada de RPC, payload ou ordem de eventos; a suíte da CAF-000102 deve passar sem alterar expectativas | P0 | CA17 |
| RNF07 | Os CSS das três telas somados não crescem mais que 10% em bytes (a remoção de inline e de regras duplicadas deve compensar o que entra) | P1 | — |
| RNF08 | Funciona em Chrome Android 110+ (alvo principal do KDS e do PDV), Safari iOS 16+ e no navegador do tablet do totem | P0 | CA03 |
| RNF09 | Animações do catálogo só em CSS (`transform`/`opacity`, sem biblioteca nova), ≥ 50 fps no tablet do totem. Mídia própria (GIF/MP4) sem travar a interface: toques respondem em < 100 ms com o vídeo rodando. A animação ou mídia só existe nas duas telas de RF17 (o `<video>` é removido ao sair delas, para não gastar memória), é pausada enquanto há modal aberto e fica estática com `prefers-reduced-motion` (MP4 parado no primeiro quadro; GIF trocado pelo fundo liso) | P1 | CA22, CA24 |
| RNF10 | Contraste do botão "Recomeçar" sobre qualquer animação do catálogo ou mídia própria ≥ 4,5:1 (fundo do botão opaco) | P1 | CA21 |
| RNF11 | Segurança da mídia própria: upload só por usuário com acesso às configurações do admin; o totem só aceita URL do Storage do próprio projeto Supabase; a URL é aplicada por propriedade do DOM (`src`), nunca por `innerHTML`, seguindo as correções de XSS das CAF-000100 e CAF-000101 | P0 | CA26 |

### Dependências técnicas

- Bottom sheet e toasts da **CAF-000056** (reutilizar para o menu "Mais ações" e o menu "Ferramentas").
- Bottom nav e touch targets da **CAF-000055**, mesas em grade da **CAF-000052** e fechamento em 3 etapas da **CAF-000054**: o layout novo não pode regredir esses comportamentos.
- Atalhos de teclado e bump bar da **CAF-000029** (`js/cozinha.js`).
- Harness Happy DOM e helper `tests/helpers/pedidos-page.js` da **CAF-000102**, que deve estar concluída antes, para servir de rede de segurança.
- Tokens de cor e tipografia de `css/base.css` (`--espresso`, `--cafe`, `--caramelo`, `--verde-cultural` etc.).
- Tela de descanso e contadores de inatividade do totem (`js/totem.js`: `IDLE_TIMEOUT_MS`, `CLEAR_CART_TIMEOUT_MS`) e tela final de senha.
- Configurações do totem no admin (`js/admin/settings.js`, chaves `totem_aviso_teatro_*` em `configuracoes`) e RPC `validar_sessao_totem` (`supabase/migration_caf_000040_totem.sql`): RF18 exige **migration nova** que semeia `totem_animacao_fundo` e recria a versão mais recente da RPC devolvendo também `animacao_fundo`, mais o teste pgTAP correspondente.
- `css/curtain.css` (animação da cortina do teatro), base da animação "Cortina do teatro".
- Bucket público `site-assets` e helper `cafeteriaDB.assets.upload` (`js/db.js`, já usado para a imagem do "Sobre" em `js/admin/settings.js`). O bucket não é criado por migration: conferir no painel do Supabase o limite de tamanho, os tipos aceitos (incluir `video/mp4` e `image/gif`) e a política de escrita só para admin.

### Recursos necessários

- Celular Android real do mesmo porte dos usados no KDS (prioridade), um iPhone para o PDV e o tablet usado no totem, para validação manual (incluindo girar o tablet).
- Um MP4 e um GIF de exemplo da cafeteria, nos dois formatos de tela (retrato e paisagem), para testar RF19.
- Medição de base do Lighthouse (Acessibilidade e Boas práticas) das três telas antes da mudança.
- Mockups de baixa fidelidade das 3 telas em 360 px e 1280 px (podem ser gerados na própria implementação e anexados à SDD para aprovação antes de codificar o restante).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o HTML das três páginas e os templates de botão dos três scripts, quando procuro `<button` com atributo `style`, então não encontro nenhuma ocorrência.
- [ ] **CA02:** Dado qualquer botão visível nas três telas em 360 px, quando meço sua área de toque, então ela é ≥ 44 × 44 px (≥ 56 × 56 px no totem) e a distância até o alvo vizinho é ≥ 8 px.
- [ ] **CA03:** Dado o viewport em 320, 360, 390, 768, 1024 e 1280 px, quando abro cada uma das três telas e seus modais, então não há rolagem horizontal e nenhum botão fica cortado ou sobreposto.
- [ ] **CA04:** Dado o CSS de botões e barras de ação das três telas, quando leio os `@media`, então todos usam `min-width` (exceto `prefers-*` e `hover`).
- [ ] **CA05:** Dado o PDV em 360 px com itens no carrinho, quando abro o carrinho e rolo a lista, então "Enviar Pedido" permanece visível, fixo no rodapé, em largura total e acima da área segura do iPhone.
- [ ] **CA06:** Dado o modal de uma mesa ocupada em 360 px, quando ele abre, então o rodapé mostra só "Adicionar Itens", "Fechar Conta" e "Mais ações".
- [ ] **CA07:** Dado o modal da mesa, quando toco em "Mais ações" e escolho "Transferir Mesa", então o mesmo fluxo de transferência de hoje é aberto (mesmo `#btn-mesa-transferir`, mesmo modal, mesma RPC).
- [ ] **CA08:** Dado o fechamento de conta em qualquer etapa antes da confirmação, quando olho o rodapé, então vejo no máximo 2 botões e nenhum botão de WhatsApp ou Compartilhar; depois de confirmar, esses botões aparecem na tela de sucesso.
- [ ] **CA09:** Dado o PDV com pedidos de cliente pendentes e fila offline com 2 pedidos, quando olho a topbar em 360 px, então vejo os indicadores como badges com contador e consigo abrir a triagem e a fila com um toque cada.
- [ ] **CA10:** Dado o painel de pedidos em 360 px, quando a lista de filtros não cabe na largura, então ela rola na horizontal sem quebrar linha e o filtro ativo fica marcado com `aria-pressed="true"`.
- [ ] **CA11:** Dado o KDS em 360 px, quando a tela carrega, então a topbar tem só logo, indicador de conexão e "Ferramentas", e todas as ferramentas atuais (Atalhos, Esta Tela, Som, Testar Voz, Testar Impressão, Sair) estão no menu.
- [ ] **CA12:** Dado um card em "Na Fila" ou "Em Preparo", quando olho o card, então a ação de estado ocupa a largura do rodapé do card e é o único botão primário dele.
- [ ] **CA13:** Dado um card em "Em Preparo", quando toco no ícone de imprimir etiquetas, então a mesma função de hoje (`cozinhaImprimirEtiquetas`) é chamada, e o ícone tem `aria-label` descritivo.
- [ ] **CA14:** Dado o KDS com teclado ou bump bar, quando uso os atalhos documentados no modal de atalhos, então todos funcionam como antes, com o menu de ferramentas aberto ou fechado.
- [ ] **CA15:** Dado o totem com itens na sacola, quando olho a tela, então a barra inferior tem só o resumo da sacola e "Finalizar Pedido" (≥ 64 px de altura), e "Recomeçar" aparece no canto superior direito, com ícone e texto e estilo de perigo; com a sacola vazia, "Recomeçar" não aparece.
- [ ] **CA16:** Dado o checkout do totem em tablet retrato e paisagem, quando abro a escolha de forma de pagamento, então as opções aparecem em grade (2 colunas no retrato, 3 no paisagem) e o botão de enviar fica fixo no rodapé.
- [ ] **CA17 (negativo):** Dado o código depois da mudança, quando rodo `npm test`, então nenhum teste existente precisa mudar de expectativa funcional, nenhum `id` de botão some ou fica duplicado, e nenhuma chamada RPC ou payload é alterado.
- [ ] **CA18:** Dado cada variante de botão em cada estado (normal, hover, foco, desabilitado), quando meço o contraste, então o texto atinge ≥ 4,5:1 e bordas/ícones ≥ 3:1.
- [ ] **CA19:** Dado o menu "Mais ações" ou "Ferramentas" aberto, quando navego por teclado, então o foco fica preso no menu, `Esc` fecha o menu e o foco volta ao botão que o abriu.
- [ ] **CA20:** Dado o KDS em um celular Android de 360 × 800 px, quando toco nas abas do rodapé, então troco entre Na Fila, Em Preparo, Prontos e Produção sem rolar a página, cada aba mostra seu contador e a barra não fica atrás da barra de navegação do Android.
- [ ] **CA21:** Dado o totem numa tela em que "Recomeçar" é a única ação (tela de descanso, ou senha sem impressão), quando a tela aparece, então o botão está centralizado na horizontal e na vertical, com ≥ 64 px de altura, sobre a animação configurada e com contraste ≥ 4,5:1.
- [ ] **CA22:** Dado que o admin escolhe outra animação em Configurações → Totem e salva, quando o totem revalida a sessão, então a nova animação passa a aparecer; com "Nenhuma" ou com `prefers-reduced-motion`, o fundo fica estático e nada se move.
- [ ] **CA23:** Dado o totem com itens na sacola e o modal de checkout aberto, quando giro o tablet de retrato para paisagem e de volta, então a sacola, o modal e as escolhas feitas continuam iguais, o layout se ajusta à nova orientação e nenhum botão fica cortado.
- [ ] **CA24:** Dado que o admin publica um MP4 de 10 MB em Configurações → Totem, quando o totem entra na tela de descanso, então o vídeo toca sem som, em loop, preenchendo a tela em retrato e em paisagem, e o botão continua legível sobre ele.
- [ ] **CA25 (negativo):** Dado que o admin tenta publicar um arquivo `.mov`, um PNG renomeado para `.mp4` ou um MP4 acima do limite, quando clica em publicar, então o envio é recusado com mensagem clara e a configuração atual do totem não muda.
- [ ] **CA26 (negativo):** Dado um valor de `totem_animacao_fundo` com URL fora do Storage do projeto ou com HTML/JS no lugar da URL, quando o totem carrega, então nada é executado nem carregado dessa URL e o fundo cai para "Nenhuma".

## O que a atividade não inclui

- Redesenho de cores, tipografia ou marca: motivo: a atividade trata de disposição e hierarquia; a paleta atual de `css/base.css` é mantida.
- Mudança de fluxos, regras de negócio, RPCs ou textos de negócio: motivo: outra iniciativa; esta é só de interface.
- Telas de admin, cardápio público, retirada e avaliação: motivo: fora do pedido; podem reutilizar as variantes depois.
- Modo escuro: motivo: baixo impacto agora; os tokens criados não devem impedir.
- Remover os nomes de classe antigos: motivo: complexo demais junto com a mudança visual; fica como aliases.
- Testes de regressão visual automatizados (screenshot diff): motivo: o projeto não tem Playwright/Puppeteer; adicionar a ferramenta é outra atividade.
- Outros formatos de mídia no fundo do totem (Lottie, WebM, MOV, YouTube), som no vídeo e edição/corte de vídeo no admin: motivo: GIF e MP4 cobrem o pedido (D08); o resto aumenta o peso e o risco no tablet.
- Otimizar o KDS para TV ou monitor grande: motivo: o dispositivo principal é celular Android (D01); a tela larga continua funcionando, mas não é o foco.

### Considerado para o futuro (P2)

- Regressão visual automatizada com Playwright nas larguras de 360, 768 e 1280 px.
- Modo canhoto (rodapé espelhado) para o PDV.
- Modo escuro para o KDS, usando os mesmos tokens.
- Extrair as variantes para uma página de catálogo de componentes (style guide) interna.
- Animações de fundo do totem por período ou espetáculo (ex.: uma por peça em cartaz), usando a mesma chave de configuração.
- Tela sempre ligada (Wake Lock) no KDS do celular, como já existe no PDV.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Em quais dispositivos o KDS roda hoje (TV, tablet, celular)? Isso define se a topbar completa aparece a partir de 900 px ou só de 1280 px. | PO | Sim | **Respondida (2026-10-26):** vai rodar principalmente em celulares Android. Refletido em RF09, RF10, RF16, RNF08 e CA20 |
| D02 | No totem, "Recomeçar" deve continuar na barra inferior (compacto, estilo de perigo) ou ir para o cabeçalho, longe do "Finalizar Pedido"? | PO / design | Sim | **Respondida em parte (2026-10-26):** se estiver sozinho na tela, fica no meio, com uma animação de fundo que o cliente pode alterar (RF17, RF18). Se houver outros botões, a posição ainda será pensada (ver D06) |
| D03 | O tablet do totem fica fixo em retrato, em paisagem, ou pode girar? | PO | Não | **Respondida (2026-10-26):** pode girar. RF14 passa a P0, com CA23 |
| D04 | A equipe aceita que WhatsApp, Compartilhar e Imprimir Prévia da mesa fiquem a um toque a mais (menu "Mais ações")? Algum deles é usado o tempo todo e deveria ficar visível? | PO / atendentes | Sim | **Respondida (2026-10-26):** sim. RF05 confirmado |
| D05 | Vale dividir a entrega em 3 PRs (PDV, Cozinha, Totem), com a base de variantes (RF01) no primeiro? | dev | Não | Sugestão: sim, na ordem RF01 → Totem → Cozinha → PDV (do menor para o maior risco) |
| D06 | Quando "Recomeçar" divide a tela com outros botões (barra inferior com "Finalizar Pedido"), onde ele fica? | PO / design | Não | **Respondida (2026-10-26):** canto superior direito, padrão comum em apps. Detalhado em RF12: ícone + texto (não só "✕"), escondido com a sacola vazia, longe do "Finalizar". Fica mais longe da mão em retrato, o que é aceitável para uma ação rara e destrutiva (e o carrinho já é limpo sozinho após 90 s sem toque) |
| D07 | "Alterada pelo cliente" quer dizer que **a cafeteria escolhe a animação no admin** (interpretação usada em RF18) ou que **o cliente final escolhe no próprio totem**? E as telas em que "Recomeçar" fica sozinho são a de descanso e a de senha final (interpretação usada em RF17), ou há outra? | PO | Sim, só para RF17 e RF18 | **Respondida (2026-10-26):** a cafeteria escolhe a animação no admin; as telas são só a de descanso e a de senha final. RF17 e RF18 confirmados |
| D08 | Quais animações entram no catálogo inicial? Sugestão: Nenhuma, Cortina do teatro (`css/curtain.css`), Vapor de café e Grãos caindo | PO / design | Não | **Respondida (2026-10-26):** catálogo aprovado, mais um botão para publicar GIF ou MP4 próprio (RF19) |
| D09 | Os limites de 15 MB para MP4 e 8 MB para GIF estão bons? Vídeos maiores demoram a carregar no totem e pesam no plano do Supabase Storage | PO | Não | **Respondida (2026-10-26):** limites aprovados (15 MB para MP4, 8 MB para GIF) |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Sem estilo inline em botões | unit (Vitest, leitura de HTML e JS) | CA01 | Fazer parse de `pedidos.html`, `cozinha.html`, `totem.html` e dos templates de botão dos três JS; procurar `<button` com `style=` | 0 ocorrências |
| CT02 | Breakpoints mobile first | unit (Vitest, parse de CSS) | CA04 | Ler `@media` de `css/pedidos.css`, `css/cozinha.css`, `css/totem.css` e `css/components.css` | Nenhuma regra de largura com `max-width` |
| CT03 | IDs preservados e únicos | unit (Vitest + Happy DOM) | CA17 | Comparar a lista de `id` de botões antes (snapshot gerado no início da atividade) e depois | Mesma lista, sem duplicatas |
| CT04 | Uma primária por contexto | integração (Happy DOM, código real) | CA06, CA08, CA12 | Abrir modal da mesa, cada etapa do fechamento e renderizar um card do KDS em cada status; contar `.btn--primary` visíveis | Exatamente 1 por contexto |
| CT05 | Menu "Mais ações" chama o mesmo fluxo | integração (harness da CAF-000102) | CA07 | Abrir modal da mesa, abrir "Mais ações", clicar em Transferir | Modal de transferência aberto e `transferir_mesa` chamado com o mesmo payload de hoje |
| CT06 | Ícones do card do KDS | integração (Happy DOM, `js/cozinha.js`) | CA13 | Renderizar card em preparo; clicar no ícone de etiqueta | `cozinhaImprimirEtiquetas` chamado com o id do pedido; botão com `aria-label` |
| CT07 | Atalhos de teclado do KDS | integração (Happy DOM) | CA14 | Disparar as teclas documentadas com o menu fechado e aberto | Mesmas ações de antes |
| CT08 | Foco e Esc nos menus | integração (Happy DOM) | CA19 | Abrir menu, enviar Tab várias vezes, enviar Esc | Foco não sai do menu; Esc fecha e devolve foco ao gatilho |
| CT09 | Regressão das suítes existentes | unit/integração | CA17 | `npm test` | Todos os testes das CAF-000040, 051, 052, 054, 055, 056, 091 e 102 passam sem mudar expectativa |
| CT10 | Larguras e rolagem horizontal | manual (navegador) | CA02, CA03 | Abrir as três telas e todos os modais em 320, 360, 390, 768, 1024 e 1280 px; medir alvos no DevTools | Sem rolagem horizontal; alvos ≥ 44 px (≥ 56 px no totem); prints anexados à SDD |
| CT11 | Rodapé fixo e área segura | manual (iPhone real) | CA05, CA16 | Abrir carrinho do PDV e checkout do totem; rolar a lista | Botão primário visível e acima da barra de gestos |
| CT12 | Totem em tablet | manual (tablet do totem) | CA15, CA16 | Fazer um pedido completo em retrato e em paisagem | Grade de 2/3 colunas; "Finalizar" é o maior botão; "Recomeçar" afastado |
| CT13 | Contraste | manual (Lighthouse / DevTools) | CA18 | Rodar Lighthouse nas três telas; checar cada variante e estado | Acessibilidade ≥ 95; nenhum alerta de contraste |
| CT14 | Teste com usuários da operação | manual | CA06, CA11, CA15 | Pedir a 1 atendente, 1 barista e 1 pessoa leiga que façam as tarefas principais no celular/tablet | Concluem sem tocar no botão errado; registrar observações na SDD |
| CT15 | Bottom nav do KDS | integração (Happy DOM, `js/cozinha.js`) + manual (Android) | CA20 | Renderizar KDS com pedidos em cada coluna; clicar em cada aba; no Android, repetir com uma mão | Coluna certa visível, contadores corretos, barra acima da navegação do sistema |
| CT16 | Recomeçar centralizado com animação | integração (Happy DOM, `js/totem.js`) + manual (tablet) | CA21 | Forçar a tela de descanso (timer falso) e a tela final sem impressão; verificar classe da animação e posição do botão | Botão centralizado com a classe da animação configurada; fps ≥ 50 no DevTools do tablet |
| CT17 | Troca de animação pelo admin | integração (Happy DOM) + banco (pgTAP) | CA22 | Salvar `totem_animacao_fundo` pelo admin; chamar `validar_sessao_totem`; recarregar o totem | RPC devolve `animacao_fundo`; totem aplica a animação nova; "Nenhuma" e `prefers-reduced-motion` deixam o fundo estático |
| CT18 | Girar o tablet no meio do pedido | manual (tablet) + integração (Happy DOM, troca de `matchMedia`) | CA23 | Adicionar itens, abrir checkout, escolher forma de pagamento, girar duas vezes | Sacola, modal e escolhas preservados; layout de 2 ↔ 3 colunas |
| CT19 | Publicar MP4 e GIF | integração (Happy DOM + mock do Storage) + manual | CA24 | Publicar MP4 válido e depois GIF válido; abrir a tela de descanso do totem | `upload` chamado com caminho `totem/fundo-*` e tipo certo; config gravada; totem mostra `<video muted loop playsinline>` ou `<img>` |
| CT20 | Recusar arquivo inválido | unit/integração (Happy DOM) | CA25 | Tentar `.mov`, PNG renomeado e MP4 acima do limite | `upload` não é chamado; mensagem de erro; config anterior intacta |
| CT21 | URL maliciosa na configuração | integração (Happy DOM, `js/totem.js`) | CA26 | RPC devolve `url` externa, `javascript:` e `<img onerror>` | Nenhuma requisição à URL, nada executado, fundo "Nenhuma" |

## URL Complementar

- Documentação técnica: `SDD/MODELO_ATIVIDADE.md`, `SDD/INDICE.md`
- Protótipo / mockup: a anexar (mockups 360 px e 1280 px das três telas, ver "Recursos necessários")
- Discussões relacionadas: CAF-000029 (bump bar), CAF-000052, CAF-000054, CAF-000055, CAF-000056 (mobile do PDV), CAF-000040 (totem), CAF-000102 (suíte combinatória do PDV)
- Referências de design: WCAG 2.2 — critério 2.5.8 (Target Size); Material Design 3 e Apple Human Interface Guidelines (tamanhos de toque e posição de ações principais)
- Requisitos originais: pedido do PO em 2026-10-26: "melhorar a disposição dos botões na tela de pedidos, cozinha e totem para ter um layout mais moderno e mobile first"; respostas às dúvidas D01, D02, D03, D04, D06, D07, D08 e D09 e aprovação da SDD em 2026-10-26
- Issue / PR relacionado: —
