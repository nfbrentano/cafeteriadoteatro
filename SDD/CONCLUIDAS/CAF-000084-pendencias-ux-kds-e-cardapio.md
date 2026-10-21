# [FIX] CAF-000084 — Pendências de UX, KDS e cardápio (diálogos nativos, busca, banner do espetáculo, destaque de adicionais, desfazer e mapa)

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fechar os requisitos de interface que ficaram incompletos em SDDs marcadas como concluídas: CAF-000005, 010, 021, 024, 047, 056, 062, 065 e 067.
- **Problema e evidência:**
  - **Diálogos nativos (CAF-000056):** ainda restam `alert()`/`confirm()` em `js/pedidos.js:3180, 3193, 3222` (erros ao aprovar e recusar pedido do cliente e ao atender chamado), `:3573` (confirmar QR Pix) e `:5629` (marcar chamado como atendido). O RF da 056 pedia eliminar todos. Esses diálogos bloqueiam a thread e destoam dos bottom sheets e toasts.
  - **Busca (CAF-000065, RF04 P0):** o `SmartSearch` (`js/utils/smart-search.js`) é usado só no PDV (`js/pedidos.js:1499`) e no admin (`js/admin/products.js:95`). O cardápio público (`cardapio.html`, `js/cardapio-dynamic.js`) e o totem (`totem.html`, `js/totem.js`) não têm campo de busca.
  - **Banner do espetáculo no totem (CAF-000062):** `totem.html:314` carrega `js/utils/theater-mode.js`, mas `js/totem.js` nunca o usa. O totem não mostra o banner nem oferece reservar para o intervalo.
  - **Pedido adicional na cozinha (CAF-000005, opção A):** quando o garçom usa "Adicionar itens", o novo pedido chega à cozinha e à comanda impressa sem a marca "➕ ADICIONAL — Mesa X". A cozinha não sabe que se junta a um pedido em andamento.
  - **Itens novos no KDS (CAF-000024):** `novosPendentesCount` é calculado em `js/cozinha.js:1312-1322` mas nunca é exibido no cabeçalho do card. O selo `NOVO` (`:1328`) não mostra o horário em que o item entrou.
  - **Nome do cliente no admin (CAF-000010):** a lista de pedidos do admin (`js/admin/pedidos-admin.js`) não mostra `cliente_nome`, que é essencial para pedidos para viagem.
  - **Desfazer entrega (CAF-000067):**
    - O desfazer de "Pedido entregue" (`js/pedidos.js:3697-3712`) sempre volta o pedido para `status: 'concluido'`, mesmo que o anterior fosse outro.
    - Usa a duração padrão do toast, 4 s (`js/pedidos.js:281`), e a SDD pede 5 s.
    - O swipe só é ligado em pedidos com status pronto.
  - **Mapa estático (CAF-000021):** `assets/images/mapa-estatico.webp` tem 574 KB, e a meta é menos de 80 KB. Isso prejudica o LCP da home no 4G.
  - **Safe area no hero (CAF-000047, RF06):** `css/home.css:47, 404` tratam só `safe-area-inset-top`. Falta `safe-area-inset-bottom` nos botões do hero em iPhones com barra de gestos.
- **Impacto de não fazer:** inconsistência de UX e bloqueios de thread no PDV, cliente sem conseguir achar um produto no cardápio e no totem, venda perdida do intervalo no totem, cozinha preparando pedido adicional como se fosse novo, status corrompido ao desfazer e home mais lenta.
- **Para quem é destinado:** garçom e barista (PDV), cozinha (KDS), cliente final (cardápio e totem) e gerente (admin).
- **História de usuário:** Como cliente no totem, quero buscar "capu" e achar o Cappuccino, e ver que posso reservar para o intervalo do espetáculo, para pedir rápido sem fila.
- **Como saberemos que deu certo:**
  - 0 ocorrências de `alert(`/`confirm(` em `js/pedidos.js`, verificadas por teste.
  - Busca presente no cardápio e no totem.
  - `mapa-estatico.webp` com menos de 80 KB.
  - Desfazer restaura o status anterior em 100% dos casos testados.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Substituir os `alert`/`confirm` restantes de `js/pedidos.js` (`:3180, 3193, 3222, 3573, 5629`) por `showToast` (erros) e pelo bottom sheet de confirmação da CAF-000056. | P0 | CA01 |
| RF02 | Adicionar campo de busca com `SmartSearch` (tolera acentos, erros de digitação e códigos curtos) no cardápio público e no totem, filtrando categorias e produtos em tempo real. | P0 | CA02, CA03 |
| RF03 | Ligar `theater-mode.js` no totem: banner do espetáculo do dia e opção de reservar para o intervalo, com o mesmo comportamento e payload (`retirada_em`, ver CAF-000083) do cardápio público. | P1 | CA04 |
| RF04 | Marcar pedidos criados por "Adicionar itens" com referência ao pedido original (por exemplo, coluna `pedido_origem_id` ou flag `is_adicional`) e exibir "➕ ADICIONAL — Mesa X" no card do KDS e na comanda impressa (`js/pedido-print.js`). | P0 | CA05 |
| RF05 | Exibir "+N itens novos" no cabeçalho do card do KDS quando `novosPendentesCount > 0`, e o horário de lançamento (HH:MM) no selo `NOVO`. | P1 | CA06 |
| RF06 | Mostrar `cliente_nome` na lista de pedidos do admin e incluí-lo no filtro de busca da lista. | P1 | CA07 |
| RF07 | Desfazer entrega: guardar o status anterior antes do update e restaurá-lo no desfazer; toast de 5 s; habilitar o swipe também para os status em que "Entregar" é permitido. | P0 | CA08 |
| RF08 | Recomprimir `assets/images/mapa-estatico.webp` para menos de 80 KB (dimensão máxima de exibição, qualidade aprox. 60, via `sharp`, que já é dependência). | P1 | CA09 |
| RF09 | Aplicar `env(safe-area-inset-bottom)` ao container dos botões do hero em `css/home.css`. | P2 | CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A busca filtra em menos de 50 ms para um cardápio de 300 itens no totem (dispositivo modesto) e funciona offline com o cardápio já carregado. | P0 | CA02 |
| RNF02 | Todo texto vindo do banco e interpolado em HTML (nome do cliente, nome do produto, mesa) passa por `escapeHtml`. | P0 | CA05, CA07 |
| RNF03 | Alvos de toque de 44 px ou mais no campo de busca e no banner do totem; o campo de busca usa `font-size: 16px` (anti-zoom iOS, CAF-000051). | P1 | CA02, CA03 |

### Dependências técnicas

- **CAF-000072** (reconciliação de schema), que precisa ser aplicada antes por causa da coluna nova do RF04.
- CAF-000083 (modelo `retirada_em` para o intervalo), para o RF03.
- `js/utils/smart-search.js`, `js/utils/theater-mode.js`, `showToast` e o bottom sheet de `js/pedidos.js:281/369`.
- `sharp` (devDependency) para o RF08.

### Recursos necessários

- Totem e iPhone com barra de gestos para a validação visual.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o código de `js/pedidos.js`, quando o teste estático procurar `alert(` e `confirm(`, então encontra 0 ocorrências. Dado um erro ao aprovar um pedido do cliente, quando ele ocorrer, então aparece um toast de erro, não um alert.
- [ ] **CA02:** Dado o cardápio público, quando o cliente digitar "capu" ou "cappucino", então o Cappuccino aparece no resultado e as categorias sem resultados são escondidas.
- [ ] **CA03:** Dado o totem, quando o cliente digitar "pao queijo", então "Pão de Queijo" aparece. Quando o cliente apagar a busca, então o cardápio completo volta.
- [ ] **CA04:** Dado um espetáculo ativo hoje, quando o totem abrir, então mostra o banner com o nome e o horário do intervalo e permite reservar; o pedido é criado com `retirada_em` do intervalo. Sem espetáculo ativo, o banner não aparece.
- [ ] **CA05:** Dado o pedido #120 da Mesa 5 em preparo, quando o garçom adicionar 1 item, então o novo card no KDS e a comanda impressa mostram "➕ ADICIONAL — Mesa 5 (ref. #120)".
- [ ] **CA06:** Dado um card do KDS com 2 itens novos não prontos, quando ele renderizar, então o cabeçalho mostra "+2 itens novos" e cada selo `NOVO` mostra o horário de lançamento.
- [ ] **CA07:** Dado um pedido para viagem com o cliente "Ana", quando o gerente abrir a lista de pedidos no admin, então vê "Ana" na linha e encontra o pedido buscando por "ana".
- [ ] **CA08:** Dado um pedido com status `pronto`, quando o garçom deslizar para entregar e tocar em "Desfazer" em até 5 s, então o pedido volta para `pronto` (e não para `concluido`). Depois de 5 s, o botão Desfazer some.
- [ ] **CA09:** Dado o build, quando o tamanho de `assets/images/mapa-estatico.webp` for medido, então é menor que 80 KB e o mapa continua legível.
- [ ] **CA10:** Dado um iPhone com barra de gestos, quando a home abrir, então os botões do hero não ficam sob a barra.

## O que a atividade não inclui

- Busca por voz no totem: motivo: baixo impacto agora.
- Pull-to-refresh no PDV (`MELHORIAS_UX.md`): motivo: outra iniciativa de UX.
- Refatorar o KDS para componentes: motivo: complexo demais agora.

### Considerado para o futuro (P2)

- Sugestões de busca ("mais pedidos") no totem quando o campo estiver vazio.
- Destaque visual "Entregar" maior que "Chamar" (`MELHORIAS_UX.md`).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Como marcar o pedido adicional: `pedido_origem_id` (FK) ou só `is_adicional` + `mesa_codigo`? Recomendação: FK, para rastreio. | Dev | Sim (RF04) | |
| D02 | O swipe-para-entregar deve valer também para `em_preparo` (entrega parcial) ou só para `pronto`/`concluido`? | PO | Não | |
| D03 | No totem, a busca fica fixa no topo ou atrás de um ícone de lupa? | Design | Não | |

## Sugestões de casos de teste

Os testes ficam em `tests/caf-000084-pendencias-ux.test.js`, com happy-dom e importando o código real (`js/utils/smart-search.js`, funções de render extraídas de `js/cozinha.js`/`js/totem.js` para `js/utils/` quando necessário), além de verificações estáticas sobre os arquivos-fonte.

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Sem diálogos nativos | Unit (estático) | CA01 | Ler `js/pedidos.js` e procurar `\b(alert|confirm)\(`. | 0 ocorrências. |
| CT02 | Busca no cardápio | Unit (happy-dom) | CA02 | Renderizar o cardápio mockado e digitar "cappucino". | Cappuccino visível e categorias vazias ocultas. |
| CT03 | Busca no totem e limpar | Unit (happy-dom) | CA03 | Digitar "pao queijo" e depois apagar. | Filtra e depois restaura tudo. |
| CT04 | Banner do totem | Unit (happy-dom) | CA04 | Mockar `site_settings` com o espetáculo ativo e depois inativo. | Banner presente/ausente; payload com `retirada_em`. |
| CT05 | Marca de adicional | Unit | CA05 | Renderizar um card e uma comanda de pedido com origem #120. | O texto contém "ADICIONAL — Mesa 5". |
| CT06 | +N itens novos | Unit | CA06 | Renderizar um card com 2 itens novos. | Cabeçalho "+2 itens novos" e horário no selo. |
| CT07 | Cliente na lista do admin | Unit (happy-dom) | CA07 | Renderizar a lista com "Ana" e buscar "ana". | Linha visível. |
| CT08 | Desfazer restaura o status | Unit (mock Supabase) | CA08 | Entregar um pedido `pronto` e acionar o callback do desfazer. | Update com `status: 'pronto'`; duração do toast de 5000 ms. |
| CT09 | Tamanho do mapa | Unit (fs) | CA09 | `fs.statSync` no webp. | Menos de 80 × 1024 bytes. |
| CT10 | Safe area | Unit (estático) + manual | CA10 | Procurar `safe-area-inset-bottom` em `css/home.css`; testar no iPhone. | Presente; visual ok. |

## URL Complementar

- Documentação técnica: `js/utils/smart-search.js`, `js/utils/theater-mode.js`.
- Discussões relacionadas: auditoria de SDDs de 2026-10-20.
- Requisitos originais: CAF-000005, CAF-000010, CAF-000021, CAF-000024, CAF-000047, CAF-000056, CAF-000062, CAF-000065 e CAF-000067.
- Issue / PR relacionado: depende da CAF-000072.
