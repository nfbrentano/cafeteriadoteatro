# CAF-000021 — [Bug] [Home] Mapa do Google Maps não carrega na página inicial

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Site público (home) | 🔴 Alta | P | Análise concluída · correção a fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** fazer o mapa da seção "Como chegar" voltar a aparecer na página inicial, sem perder o ganho de desempenho que motivou a troca do iframe.
- **Por que é necessário:** hoje o visitante vê só um retângulo cinza com o botão "📍 Abrir no Google Maps" no lugar do mapa. A localização dentro do Teatro da Univates é uma das principais informações do site.
- **Qual valor será agregado:** o visitante vê onde fica o café sem sair da página, e a seção volta a ter aparência de site acabado.
- **Para quem é destinado:** visitantes do site (principalmente no celular).

### Análise da causa

**1. O iframe foi removido.** No commit `aa3e157` ("feat: add WhatsApp floating button, pull-to-refresh for orders, and static map view"), o `<iframe src="https://www.google.com/maps/embed?...">` foi retirado de `index.html` e trocado por uma imagem estática. A troca seguiu o item de performance do [MELHORIAS_UX.md](CONCLUIDAS/MELHORIAS_UX.md): "Trocar o iframe do Google Maps por uma imagem estática com botão 'Abrir no Maps', carregando o iframe só se o usuário pedir".

**2. A imagem estática nunca foi adicionada.** O código atual (`index.html:597-608`) aponta para `assets/images/mapa-estatico.webp`:

```html
<img src="assets/images/mapa-estatico.webp" alt="Mapa de localização da Cafeteria"
     style="position:absolute; width:100%; height:100%; object-fit:cover;"
     onerror="this.style.display='none'" />
```

- O arquivo **não existe** em `assets/images/` e nunca entrou em nenhum commit (`git log --all -- 'assets/images/mapa*'` não retorna nada).
- Em produção, `https://cafeteriadoteatro.com.br/assets/images/mapa-estatico.webp` responde **HTTP 404** (conferido em 23/09/2026).

**3. O erro fica escondido.** O `onerror="this.style.display='none'"` oculta a imagem quebrada, então sobra só o fundo `#e0e0e0` do contêiner com o botão por cima. Não aparece erro visível, só um mapa "vazio".

**4. A outra metade da solução não foi feita.** A proposta era carregar o iframe **sob demanda** (quando o usuário tocar), mas nenhum script faz isso: não há referência a iframe de mapa em `js/main.js` nem em `js/home-dynamic.js`. Mesmo com a imagem, o mapa interativo nunca abriria dentro da página.

**Pontos secundários encontrados**
- Estilos inline em `.chegar__map` (`min-height: 300px`, `background: #e0e0e0`) conflitam com o CSS (`css/home.css:904`, `height: 420px`, `background: var(--bege)`). O cinza inline não segue a identidade visual nem o modo escuro.
- `css/home.css:919` (`.chegar__map iframe`) e `.chegar__map-placeholder` (`:941`) ficaram sem uso.
- O service worker (`sw.js`) pode manter a versão antiga do `index.html` em cache para quem já visitou; qualquer correção precisa subir a versão do cache (hoje `v8`, commit `1488d50`).

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Implementar o mapa como **fachada (facade)**:
  1. Mostra uma imagem estática do mapa com o botão "Ver mapa interativo".
  2. Ao tocar, troca a imagem pelo `<iframe>` do Google Maps (o mesmo `src` removido no `aa3e157`), com `loading="lazy"`.
- [ ] Gerar e versionar `assets/images/mapa-estatico.webp`, uma captura do mapa com o marcador da Cafeteria do Teatro em cerca de 1200×840 px e menos de 80 KB, com uma versão `.png` ou `.jpg` de reserva, se necessário.
- [ ] **Fallback:** se a imagem falhar ao carregar, carregar o iframe direto em vez de esconder a imagem e deixar o quadro vazio.
- [ ] Manter o link externo "📍 Abrir no Google Maps" (`#chegar-maps-btn`).
- [ ] Registrar no GA4 (`js/analytics.js`) o evento de abrir o mapa interativo.
- [ ] Mover os estilos inline para `css/home.css` e usar as variáveis de cor (`--bege`) no lugar de `#e0e0e0`.
- [ ] Remover o CSS sem uso (`.chegar__map-placeholder`) ou reaproveitá-lo na fachada.
- [ ] Subir a versão do cache do `sw.js`.

### Requisitos não funcionais
- [ ] **Desempenho:** nenhuma requisição a `google.com/maps` antes da interação do usuário; a imagem com `loading="lazy"` e `width`/`height` definidos, para não causar deslocamento de layout (CLS).
- [ ] **Acessibilidade:** o botão da fachada tem texto claro e é acessível por teclado; o iframe tem `title` ("Mapa — Teatro da Univates, Lajeado RS").
- [ ] **Responsivo:** altura de 300 px no mobile e 420 px no desktop, sem scroll horizontal em 360 px.
- [ ] **Build:** conferir se o `vite.config.js` (`viteStaticCopy`) copia `assets/images/` para o `dist/`.

### Dependências técnicas
- URL de embed original do Google Maps (disponível no diff do commit `aa3e157`).
- Não usa a API paga do Google Maps (Static Maps API), para não exigir chave nem faturamento. A imagem é gerada uma vez e versionada.

### Recursos necessários
- Captura do mapa com o marcador (feita manualmente no Google Maps ou no OpenStreetMap, respeitando os termos de uso).

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um visitante abre a página inicial, **quando** rola até "Como chegar", **então** vê a imagem do mapa com a localização do café, e não um quadro cinza.
- [ ] **Dado que** o visitante toca em "Ver mapa interativo", **quando** a ação acontece, **então** o mapa do Google carrega dentro do quadro e pode ser arrastado e ampliado.
- [ ] **Dado que** a página acabou de carregar, **quando** se olha a aba Network do navegador, **então** nenhuma requisição para `google.com/maps` foi feita antes do toque.
- [ ] **Dado que** a imagem estática falha (404 ou rede), **quando** o erro acontece, **então** o iframe é carregado no lugar e o quadro não fica vazio.
- [ ] **Dado que** o visitante já tinha o site em cache, **quando** abre a home depois do deploy, **então** vê a versão nova da seção.
- [ ] **Dado que** o deploy foi feito, **quando** se acessa `https://cafeteriadoteatro.com.br/assets/images/mapa-estatico.webp`, **então** a resposta é HTTP 200.

---

## O que a atividade não inclui

- Uso da Google Maps JavaScript API ou da Static Maps API (exigem chave e faturamento).
- Rotas ou "como chegar" calculados dentro do site.
- Mudanças no texto, nos horários ou no endereço da seção.
- Outros itens de desempenho do [MELHORIAS_UX.md](CONCLUIDAS/MELHORIAS_UX.md).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Imagem estática | Abrir a home e rolar até o mapa | Imagem do mapa visível |
| 2 | Abrir mapa | Tocar em "Ver mapa interativo" | Iframe do Google carrega no quadro |
| 3 | Sem carga antecipada | DevTools → Network → recarregar | Nenhuma requisição a `google.com/maps` |
| 4 | Fallback | Renomear a imagem localmente e recarregar | Iframe carrega direto |
| 5 | Teclado | Navegar com Tab até o botão e pressionar Enter | Mapa abre |
| 6 | Mobile | 360 px e 768 px | Quadro com altura correta, sem scroll horizontal |
| 7 | Modo escuro | `prefers-color-scheme: dark` | Fundo do quadro segue o tema |
| 8 | Cache do SW | Visitar antes e depois do deploy | Versão nova após recarregar |
| 9 | Produção | `curl -I` na URL da imagem | HTTP 200 |
| 10 | Link externo | Tocar em "Abrir no Google Maps" | Abre o Maps em nova aba |
| 11 | Analytics | Abrir o mapa interativo | Evento registrado no GA4 |

---

## URL Complementar

- Commit que removeu o iframe: `aa3e157` (`git show aa3e157 -- index.html`)
- Commit do cache do SW: `1488d50`
- Origem da troca: [MELHORIAS_UX.md](CONCLUIDAS/MELHORIAS_UX.md) · "Site público → Performance"
- Código: `index.html:597-608`, `css/home.css:904-950`, `sw.js`, `vite.config.js`, `js/analytics.js`
- Asset ausente: `https://cafeteriadoteatro.com.br/assets/images/mapa-estatico.webp` (404)
- Referência: padrão "facade" para embeds de terceiros (web.dev — *Lazy load third-party resources with facades*)
