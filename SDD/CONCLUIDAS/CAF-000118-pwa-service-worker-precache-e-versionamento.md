# [FIX] PWA: service worker com precache gerado no build, versão automática e cobertura do Totem, Retirada e Admin

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-13

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer o service worker refletir os arquivos que realmente existem em cada publicação e cobrir todas as telas de operação, com aviso de nova versão para o operador.
- **Problema e evidência:**
  - `sw.js` mantém à mão a lista `STATIC_ASSETS` e a constante `CACHE_VERSION = 'v15'`. A lista não inclui `totem.html`, `retirada.html`, `admin.html`, `avaliar.html`, `js/totem.js`, `js/retirada.js`, `js/cardapio-cliente-pedido.js` nem nenhum arquivo de `js/utils/` (28 módulos usados pelo PDV, como `conta-mesa.js`, `offline-queue.js` e `combos.js`).
  - `totem.html`, `retirada.html` e `avaliar.html` não registram o service worker (só `index`, `cardapio`, `pedidos`, `cozinha` e `admin` registram).
  - Os scripts clássicos são copiados sem hash (`viteStaticCopy` de `js/` e `css/` em `vite.config.js`), então a única forma de invalidar o cache é lembrar de subir `CACHE_VERSION` a cada deploy; se esquecer, o tablet do balcão continua com o `pedidos.js` antigo falando com um banco já migrado.
- **Impacto de não fazer:** A tolerância a queda de internet (CAF-000018/057) fica parcial: o PDV abre offline, mas módulos de `js/utils/` podem faltar; o Totem não abre sem rede; versões antigas do front continuam rodando após mudança de RPC.
- **Para quem é destinado:** Barista, cozinha e cliente no totem.
- **História de usuário:** Como barista, quero que o tablet sempre abra a versão atual do PDV, mesmo com a internet oscilando, para não perder pedido no intervalo.
- **Como saberemos que deu certo:** PDV, KDS e Totem abrem e ficam utilizáveis em modo avião após uma visita online; em até 1 recarga após o deploy a tela roda a versão nova; 0 edições manuais de versão no `sw.js`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | A lista de precache e a versão do cache são geradas no `npm run build` a partir dos arquivos de `dist/` (hash do conteúdo) | P0 | CA01, CA02 |
| RF02 | O precache inclui todos os HTML, JS (incluindo `js/utils/` e `js/admin/`) e CSS necessários para PDV, KDS, Totem e Retirada | P0 | CA03 |
| RF03 | `totem.html`, `retirada.html` e `avaliar.html` registram o service worker | P0 | CA04 |
| RF04 | Quando há versão nova, a tela mostra um aviso "Nova versão disponível — Atualizar" (toast próprio, sem `confirm`) e não recarrega sozinha com carrinho ou fechamento em andamento | P0 | CA05, CA06 |
| RF05 | A versão do build fica disponível em `window.APP_VERSION` e visível no rodapé do Admin | P1 | CA07 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Chamadas ao Supabase (`/rest/v1`, `/auth/v1`, Realtime) continuam fora do cache | P0 | CA08 |
| RNF02 | Precache total abaixo de 5 MB (sem imagens de galeria) | P1 | CA03 |

### Dependências técnicas

- `vite.config.js` (novo passo pós-build), `sw.js`, os 9 `.html`.
- Fornece a "versão do app" usada pela CAF-000115.

### Recursos necessários

- Um tablet/celular para o teste manual em modo avião.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado dois builds com conteúdo diferente em `js/pedidos.js`, quando comparo os `sw.js` gerados, então a versão do cache é diferente sem edição manual.
- [x] **CA02:** Dado dois builds idênticos, quando comparo, então a versão do cache é a mesma.
- [x] **CA03:** Dado o `sw.js` gerado, quando verifico a lista de precache, então todo arquivo listado existe em `dist/` e todo script/CSS referenciado por `pedidos.html`, `cozinha.html`, `totem.html` e `retirada.html` está na lista.
- [x] **CA04:** Dado o Totem aberto uma vez online, quando recarrego em modo avião, então a tela abre e mostra o cardápio em cache.
- [x] **CA05:** Dado um deploy novo, quando o operador abre o PDV, então vê o aviso de nova versão e, ao tocar em Atualizar, passa a rodar a versão nova.
- [x] **CA06:** Dado um carrinho com itens ou um fechamento de conta aberto, quando chega versão nova, então a tela não recarrega sozinha.
- [x] **CA07:** Dado o Admin, quando abro o rodapé, então vejo a versão do build.
- [x] **CA08:** Dado o service worker ativo, quando o PDV chama uma RPC, então a resposta nunca vem do cache.

## O que a atividade não inclui

- Adotar Workbox: motivo: o `sw.js` atual é pequeno (188 linhas); basta gerar a lista.
- Empacotar os scripts clássicos com hash no nome: motivo: depende da modularização (CAF-000121).
- Sincronização em segundo plano (Background Sync): motivo: a fila offline da CAF-000018 já reenvia ao reconectar.

### Considerado para o futuro (P2)

- Background Sync para a fila offline.
- Precache de imagens dos produtos mais vendidos no Totem.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O Totem deve aceitar pedido offline (fila) ou apenas mostrar "sem conexão, peça no balcão"? | PO | Não | O Totem abre o cardápio em cache para navegação; se o cliente tentar enviar o pedido sem rede, exibe toast/aviso amigável: "Sem conexão com a internet no momento. Por favor, dirija-se ao balcão para fazer seu pedido." (já que o Totem depende de confirmação financeira prévia). |
| D02 | O Admin precisa abrir offline ou só as telas de operação? | PO | Não | Apenas as telas de operação (PDV, KDS, Totem, Retirada, Cardápio, Home) precisam de cache offline pleno. O Admin registra o Service Worker e cacheia seus assets essenciais para carregamento rápido e detecção de versão, mas suas operações administrativas dependem de rede com o Supabase. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Versão muda com o conteúdo | unit (gerador) | CA01, CA02 | Gerar com dois conjuntos de arquivos | Hash diferente / igual |
| CT02 | Lista consistente com `dist/` | integração (pós-build) | CA03 | Rodar build e validar a lista | Sem ausentes nem faltantes |
| CT03 | Registro nas páginas | unit (parse de HTML) | CA04 | Verificar registro nos 3 HTML | Registro presente |
| CT04 | Totem em modo avião | manual | CA04 | Abrir online, desligar rede, recarregar | Tela abre |
| CT05 | Aviso de atualização | integração (harness) | CA05, CA06 | Simular `updatefound` com e sem carrinho | Toast aparece; sem reload automático com carrinho |
| CT06 | Supabase fora do cache | unit (handler de fetch) | CA08 | Requisição a `/rest/v1` | Vai para a rede |

## URL Complementar

- Documentação técnica: `sw.js`, `vite.config.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000018](CONCLUIDAS/CAF-000018-tolerancia-a-queda-de-internet.md), [CAF-000057](CONCLUIDAS/CAF-000057-carrinho-persistente-e-status-offline.md)
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
