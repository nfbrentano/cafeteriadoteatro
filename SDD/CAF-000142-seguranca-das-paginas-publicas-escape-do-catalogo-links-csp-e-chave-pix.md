# [FIX] Segurança das páginas públicas: escape de HTML do catálogo, links, CSP do jsDelivr e tipo de chave Pix

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Garantir que textos e links vindos do banco apareçam no site como texto, nunca como HTML; apertar a CSP; e fazer o QR Pix apontar sempre para a chave que o dono escolheu, sem adivinhar o tipo.
- **Problema e evidência:**
  - Catálogo sem escape. Nomes, descrições e links cadastrados no admin são colados em `innerHTML`:
    - `js/cardapio-cliente-pedido.js:875` (`${produto.descricao || ''}`), `:885` e `:891` (`${s.nome}` dos sabores), `:906` (`${a.nome}` dos adicionais);
    - `js/cardapio-dynamic.js:170` (`${c.icone}`, `${c.nome}`), `:212-216` (ícone, nome e descrição da categoria), `:266,274-275` e `:342,345,351-352` (nome, `alt`, descrição e `src` do produto), `:364` (itens do combo);
    - `js/cardapio.js:84,97-98,103` (`promo.titulo`, `promo.descricao`, `alt`) e `:85,99` (`href="${promo.link}"` sem validar esquema), `:103` (`src="${promo.image_url}"`);
    - `js/home-dynamic.js:64` (`sobre_texto`) e `:212-214` (badge, título, descrição e `href` da promoção).
  - O próprio projeto já tem o padrão certo: `window.escapeHtml` em `js/supabase-client.js:24-33`, e o totem usa `esc()` e `sanitizarUrlMidia()` (`js/totem.js:20,191`). As CAF-000075, 100 e 101 corrigiram só o PDV.
  - Ameaça: uma conta com permissão de produtos/promoções comprometida (ou uma brecha de RLS, ver CAF-000127) publica um nome como `<img src=x onerror=...>` ou um formulário falso pedindo dados do cliente. A CSP sem `unsafe-inline` bloqueia scripts inline, mas não bloqueia HTML falso, links externos nem envio de formulário para outro site (não há `form-action`). Além disso, `script-src` libera `https://cdn.jsdelivr.net` inteiro (`index.html:5`, igual nas 9 páginas), o que permite carregar qualquer pacote npm caso surja outro ponto de injeção de script.
  - Pix: `normalizarChavePix` adivinha o tipo. Com 11 dígitos sem `(` nem espaço, se os dígitos formarem um CPF válido, a chave vira CPF (`js/pix-brcode.js:77-79`); senão, com 9 na 3ª posição, vira celular `+55` (`:81-82`). Um celular digitado sem máscara cujos dois últimos dígitos coincidam com os dígitos verificadores de CPF gera QR para um CPF, de outra pessoa ou inexistente. O admin salva só o texto da chave, sem tipo (`js/admin/settings.js:622`). CRC16, tamanhos dos campos e `toFixed(2)` estão corretos.
  - Cidade do recebedor: o admin preenche `FORTALEZA` por padrão (`js/admin/settings.js:562,616,657`), enquanto o gerador usa `LAJEADO` (`js/pix-brcode.js:131`).
- **Impacto de não fazer:** Página oficial da cafeteria exibindo conteúdo de golpe; Pix pago para a pessoa errada sem ninguém perceber até o fechamento.
- **Para quem é destinado:** Cliente do site e do cardápio; dono (recebimento Pix).
- **História de usuário:** Como cliente, quero confiar que o que aparece no cardápio e no QR Pix é da cafeteria, para pagar sem medo de golpe.
- **Como saberemos que deu certo:** 0 interpolações de dado do banco sem escape nas páginas públicas (revisão + testes); 100% das chaves Pix salvas com tipo explícito; QR decodificado no admin igual à chave e tipo informados.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Escapar com `escapeHtml` todo dado do banco interpolado em HTML em `cardapio-cliente-pedido.js`, `cardapio-dynamic.js`, `cardapio.js` e `home-dynamic.js` (texto e atributos) | P0 | CA01, CA02, CA03 |
| RF02 | Links e imagens vindos do banco passam por um validador único (`js/utils/`): só `https:` ou caminho relativo do próprio site; fora disso o link/imagem não é renderizado | P0 | CA04, CA05 |
| RF03 | Admin: tipo de chave Pix obrigatório (CPF, CNPJ, telefone, e-mail, aleatória), salvo em `configuracoes_sistema.pix_tipo_chave`, com validação por tipo (DV de CPF/CNPJ, `+55` + DDD + 9 dígitos, e-mail, UUID) | P0 | CA06, CA07 |
| RF04 | `normalizarChavePix(chave, tipo)` usa o tipo informado e não adivinha; tipo incoerente com a chave gera erro, não QR | P0 | CA07, CA08 |
| RF05 | Pré-visualização no admin antes de salvar: BR Code de teste (R$ 1,00) decodificado mostrando tipo, chave, nome e cidade | P1 | CA09 |
| RF06 | Chave já salva sem tipo: o admin pede para confirmar o tipo; até lá o QR continua com a regra atual e o admin mostra aviso | P1 | CA10 |
| RF07 | Cidade padrão do recebedor igual no admin e no gerador (`LAJEADO`) | P1 | CA11 |
| RF08 | CSP das 9 páginas: `script-src` com os caminhos exatos e versionados do jsDelivr em uso e `form-action 'self'` | P1 | CA12, CA13 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhum texto do catálogo muda de aparência para o cliente (acentos, emojis dos ícones, `&` exibidos corretamente) | P0 | CA02 |
| RNF02 | 0 violações de CSP no console nas páginas públicas e de operação depois da mudança | P0 | CA13 |
| RNF03 | O QR gerado continua válido no app de pelo menos 2 bancos diferentes | P0 | CA09 |

### Dependências técnicas

- `js/supabase-client.js` (`escapeHtml`), `js/pix-brcode.js`, `js/admin/settings.js`, `configuracoes_sistema` (nova chave `pix_tipo_chave`, lida em `js/admin/settings.js:554`).
- CSP definida por `<meta>` nas páginas (CAF-000117).
- CAF-000123 (Pix dinâmico) reutiliza o tipo de chave daqui.

### Recursos necessários

- Chave Pix real e seu tipo, informados pelo dono.
- Dois celulares com apps de bancos diferentes para conferência manual.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um produto com nome `<img src=x onerror=alert(1)>`, quando o cardápio, o modal de personalização e a home são renderizados, então o nome aparece como texto, nenhum elemento `img` novo é criado e nenhum handler é executado.
- [ ] **CA02:** Dado um produto chamado `Café & Pão "Especial"` e categoria com ícone ☕, quando o cardápio é renderizado, então o texto aparece exatamente assim.
- [ ] **CA03:** Dado uma descrição de categoria, sabor, adicional, item de combo ou texto "sobre" com `<form action="https://exemplo.invalid">`, quando renderizado, então nenhum `form` existe no DOM.
- [ ] **CA04:** Dado uma promoção com link `javascript:alert(1)` ou `data:text/html,...`, quando renderizada, então o botão de link não é exibido e o restante da promoção aparece.
- [ ] **CA05:** Dado uma promoção com link `https://cafeteriadoteatro.com.br/cardapio.html` ou `/cardapio.html`, quando renderizada, então o link aparece e funciona.
- [ ] **CA06:** Dado o admin, quando tento salvar uma chave sem escolher o tipo, então o salvamento é recusado com mensagem.
- [ ] **CA07:** Dado o tipo "telefone" e a chave `51999999999` (inclusive quando os dígitos formam um CPF válido), quando gero o QR, então o campo de chave do BR Code é `+5551999999999`.
- [ ] **CA08:** Dado o tipo "CPF" e uma chave com dígitos verificadores errados, quando salvo, então é recusado; dado tipo "CNPJ" com 11 dígitos, então é recusado (caso negativo: nenhum QR é gerado).
- [ ] **CA09:** Dado uma chave válida, quando clico em pré-visualizar, então vejo tipo, chave, nome e cidade decodificados do BR Code e o QR de R$ 1,00 abre no app do banco com esses dados.
- [ ] **CA10:** Dado uma chave antiga salva sem tipo, quando abro Configurações, então aparece o pedido de confirmação do tipo e o PDV continua gerando QR.
- [ ] **CA11:** Dado o campo cidade vazio, quando salvo e gero o QR, então a cidade no BR Code é `LAJEADO`.
- [ ] **CA12:** Dado uma página pública, quando um script de `https://cdn.jsdelivr.net/npm/outro-pacote@1.0.0/x.js` é inserido, então o navegador bloqueia por CSP.
- [ ] **CA13:** Dado a nova CSP, quando abro as 9 páginas e uso o cardápio em PDF, o QR e o admin, então não há violação de CSP no console.

## O que a atividade não inclui

- Pix dinâmico com confirmação automática: motivo: CAF-000123.
- Escape nas telas de operação (PDV, KDS): motivo: feito na CAF-000075/101; refatoração delas na CAF-000137.
- Restringir quem pode editar produtos/promoções e corrigir policies abertas: motivo: CAF-000127.
- Trocar a CSP de `<meta>` por cabeçalho HTTP: motivo: GitHub Pages não permite cabeçalhos próprios.

### Considerado para o futuro (P2)

- Trusted Types (`require-trusted-types-for 'script'`) depois que todo `innerHTML` público passar por funções de escape.
- Auto-hospedar supabase-js, pdf.js e page-flip e tirar o jsDelivr da CSP.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual é o tipo da chave Pix cadastrada hoje em produção? Se for telefone sem máscara, conferir já se o QR atual aponta para a chave certa | PO | Sim | |
| D02 | Promoções podem ter link para sites externos (Instagram, bilheteria)? Se sim, lista de domínios permitidos | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Injeção no catálogo | integração (`tests/caf-000142-*.test.js`, happy-dom carregando `cardapio-dynamic.js`, `cardapio-cliente-pedido.js`, `cardapio.js`, `home-dynamic.js` com Supabase simulado) | CA01, CA03 | Dados com `<img onerror>` e `<form>` | Texto; sem `img`/`form` novos; handler não chamado |
| CT02 | Texto comum | integração | CA02 | Nome com `&`, aspas e emoji | Exibido igual |
| CT03 | Validador de URL | unit | CA04, CA05 | `javascript:`, `data:`, `http:`, `https:`, relativo | Só `https:` e relativo passam |
| CT04 | Tipo obrigatório | integração (DOM do admin) | CA06, CA08 | Salvar sem tipo / com DV errado | Recusado |
| CT05 | Telefone com cara de CPF | unit (importa `js/pix-brcode.js`) | CA07 | Gerar payload com tipo telefone | `+55...` no campo 26/01 |
| CT06 | Pré-visualização | integração | CA09 | Clicar em pré-visualizar | Campos decodificados corretos |
| CT07 | Chave legada | integração | CA10 | Configuração sem `pix_tipo_chave` | Aviso; QR gerado |
| CT08 | Cidade padrão | unit | CA11 | Cidade vazia | `LAJEADO` |
| CT09 | CSP restrita | e2e (Playwright, evento `securitypolicyviolation`) | CA12, CA13 | Inserir script de outro pacote; navegar nas 9 páginas | Bloqueio só do pacote estranho |
| CT10 | QR em apps reais | manual | CA09 | Ler QR de R$ 1,00 em 2 bancos | Recebedor e chave corretos |

## URL Complementar

- Documentação técnica: `js/cardapio-dynamic.js`, `js/cardapio-cliente-pedido.js`, `js/cardapio.js`, `js/home-dynamic.js`, `js/supabase-client.js`, `js/pix-brcode.js`, `js/admin/settings.js`, `js/totem.js` (padrão `esc`/`sanitizarUrlMidia`)
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000039](CONCLUIDAS/CAF-000039-pix-qr-code-e-taxas-de-pagamento.md), [CAF-000075](CONCLUIDAS/CAF-000075-correcao-validacao-adicionais-e-xss-no-pdv.md), [CAF-000079](CONCLUIDAS/CAF-000079-pix-no-admin-e-taxas-no-fechamento-de-caixa.md), [CAF-000100](CONCLUIDAS/CAF-000100-seguranca-codeql-e-dependabot-vulnerabilidades.md), [CAF-000101](CONCLUIDAS/CAF-000101-resolucao-codeql-xss-pedidos-obs.md), [CAF-000117](CONCLUIDAS/CAF-000117-seguranca-front-csp-sri-versoes-cdn-dependabot.md), [CAF-000123](CAF-000123-pix-dinamico-com-confirmacao-automatica.md); novas: CAF-000127, CAF-000137
- Referências de design: Manual de Padrões para Iniciação do Pix (Banco Central), https://www.bcb.gov.br/estabilidadefinanceira/pix
- Requisitos originais: auditoria de 2026-11-20
- Issue / PR relacionado: —
