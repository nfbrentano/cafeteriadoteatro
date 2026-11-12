# [FIX] Segurança do front: Content Security Policy, bibliotecas de CDN com versão fixa e SRI, e Dependabot

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Fechar a superfície de execução de script de terceiros nas telas que lidam com dinheiro e dados de clientes.
- **Problema e evidência:**
  - Todas as telas carregam `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (faixa de versão móvel) e o Admin carrega `https://cdn.jsdelivr.net/npm/chart.js` sem versão nenhuma (`admin.html:28`). Nenhuma tag tem `integrity=` (0 ocorrências nos `.html`). Uma publicação nova ou comprometida no CDN roda direto no PDV e no Admin, com a sessão do operador.
  - Nenhuma página define Content Security Policy (0 ocorrências de `Content-Security-Policy`).
  - O código usa `innerHTML` em volume (60 em `js/pedidos.js`, 40 em `js/admin/clientes-admin.js`, 33 em `js/admin/relatorios-admin.js`). As CAF-000075, 000100 e 000101 já corrigiram XSS três vezes; sem CSP, o próximo escape esquecido volta a ser explorável.
  - Não existe `.github/dependabot.yml`, então atualizações de segurança dependem de checagem manual (CAF-000049, CAF-000114).
- **Impacto de não fazer:** Um script injetado consegue fechar contas, dar desconto, ler a base de clientes e alterar o cardápio usando a sessão logada.
- **Para quem é destinado:** Todos os usuários das telas (operadores e clientes).
- **História de usuário:** Como dono, quero que só código da própria cafeteria e de bibliotecas conferidas rode nas telas, para que uma falha de terceiros não vire prejuízo no caixa.
- **Como saberemos que deu certo:** 100% dos scripts externos com versão exata e `integrity`; CSP ativa nas 9 páginas sem violações no console nos fluxos principais; Dependabot abrindo PRs.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | `supabase-js`, `chart.js`, `pdfjs-dist` e `page-flip` com versão exata e `integrity` + `crossorigin`, ou servidos do próprio domínio via build | P0 | CA01 |
| RF02 | CSP por `<meta http-equiv>` em todas as páginas, liberando só o próprio domínio, o CDN usado, o projeto Supabase (REST, Realtime `wss`) e os domínios do Google Maps/Fonts realmente usados | P0 | CA02, CA03 |
| RF03 | Remover `onclick=` inline gerado por template nas telas de operação (19 em `js/pedidos.js`, 17 em `js/cozinha.js`) trocando por delegação de evento, para a CSP não precisar de `unsafe-inline` em script | P0 | CA04 |
| RF04 | `.github/dependabot.yml` para `npm` e `github-actions`, semanal | P0 | CA05 |
| RF05 | Teste automatizado que falha se um `.html` ganhar script externo sem versão exata e `integrity` | P1 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | CSP sem `unsafe-eval`; `unsafe-inline` aceito apenas em `style-src` (o build injeta CSS inline) | P0 | CA02 |
| RNF02 | Nenhuma regressão funcional: `npm test` e `npm run build` 100% verdes | P0 | CA03 |

### Dependências técnicas

- GitHub Pages não permite cabeçalhos HTTP próprios, por isso a CSP vai em `<meta>` (sem `frame-ancestors` e sem `report-uri`).
- `vite.config.js` (plugin que injeta CSS inline) e os scripts inline de registro do service worker em cada página.
- Facilita e é facilitada pela CAF-000121 (modularização).

### Recursos necessários

- Nenhum acesso externo.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado qualquer `.html` publicado, quando inspeciono as tags `<script src="https://...">`, então todas têm versão exata na URL e atributo `integrity`.
- [ ] **CA02:** Dado qualquer página, quando carrego, então existe uma CSP que não contém `unsafe-eval` nem `script-src *`.
- [ ] **CA03:** Dado o PDV, o KDS, o Totem, o Admin e o Cardápio, quando executo os fluxos principais (criar pedido, marcar pronto, fechar conta, abrir relatório, pedido do cliente), então o console não registra violação de CSP.
- [ ] **CA04:** Dado um script inline injetado via observação de pedido, quando a tela renderiza, então o script não executa (bloqueado pela CSP mesmo se o escape falhar).
- [ ] **CA05:** Dado o repositório, quando o Dependabot roda, então abre PRs para dependências desatualizadas de `npm` e de Actions.
- [ ] **CA06:** Dado um PR que adiciona `<script src="https://cdn.../lib">` sem versão ou sem `integrity`, quando o CI roda, então o teste falha.

## O que a atividade não inclui

- Reescrever todos os `innerHTML` para API de DOM: motivo: grande demais; a CSP é a rede de proteção e a CAF-000121 reduz o volume aos poucos.
- Trocar a hospedagem para ter cabeçalhos HTTP: motivo: outra decisão (ver P2).
- Rotação da chave anon do Supabase: motivo: a chave é pública por natureza; a proteção é o RLS (CAF-000106/107).

### Considerado para o futuro (P2)

- Hospedagem com cabeçalhos (Cloudflare Pages/Netlify) para `frame-ancestors`, HSTS e relatório de violações.
- Trusted Types.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Empacotar as bibliotecas no build (sem CDN) ou manter CDN com SRI? Empacotar também resolve o funcionamento offline do PDV | dev | Não | |
| D02 | Quais domínios de terceiros são realmente necessários (Maps, Fonts, analytics)? Levantar antes de escrever a CSP | dev | Sim | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Scripts externos fixos e com SRI | unit (parse de HTML) | CA01, CA06 | Parsear os 9 `.html` | Todos com versão exata e `integrity` |
| CT02 | CSP presente e restrita | unit | CA02 | Ler a meta de cada página | Sem `unsafe-eval` e sem curinga em script |
| CT03 | Fluxos sem violação | e2e/manual | CA03 | Rodar os fluxos com console aberto | 0 violações |
| CT04 | Sem handlers inline gerados | integração (harness) | CA04 | Renderizar lista de pedidos e cards do KDS | Nenhum atributo `onclick` no HTML gerado; cliques funcionam |
| CT05 | Dependabot configurado | unit | CA05 | Validar o YAML | Ecossistemas `npm` e `github-actions` |

## URL Complementar

- Documentação técnica: `vite.config.js`, `admin.html:28`, `pedidos.html:903`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000075](CONCLUIDAS/CAF-000075-correcao-validacao-adicionais-e-xss-no-pdv.md), [CAF-000100](CONCLUIDAS/CAF-000100-seguranca-codeql-e-dependabot-vulnerabilidades.md), [CAF-000101](CONCLUIDAS/CAF-000101-resolucao-codeql-xss-pedidos-obs.md)
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
