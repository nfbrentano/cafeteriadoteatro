# [UI] Acessibilidade do Totem e do cardápio com pedido do cliente (WCAG 2.1 AA)

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Auditar e corrigir a acessibilidade das duas telas usadas diretamente pelo público — Totem (`totem.html`) e cardápio com pedido (`cardapio.html` + `js/cardapio-cliente-pedido.js`) — para que funcionem com leitor de tela, teclado, texto ampliado e sem depender de cor ou animação.
- **Problema e evidência:** As telas públicas de pedido têm pouca semântica de acessibilidade em comparação com o restante: `totem.html` tem 3 atributos `aria-*` em 361 linhas e `js/totem.js` (1.375 linhas, que gera os cards, o carrinho e os modais) tem 1 ocorrência de `aria-`/`role`; para comparação, `index.html` tem 52 e `admin.html` 85. Esta evidência é só uma contagem: ainda não foi feita auditoria com ferramenta nem com leitor de tela, e ela é o primeiro requisito desta SDD. O público do teatro inclui pessoas idosas e com baixa visão, e o totem é o canal que a CAF-000040 criou para reduzir a fila do intervalo.
- **Impacto de não fazer:** Parte do público não consegue pedir sozinha e volta para a fila do balcão; exposição à Lei Brasileira de Inclusão (Lei 13.146/2015, art. 63) nos canais digitais.
- **Para quem é destinado:** Cliente com baixa visão, cego (leitor de tela no celular), com mobilidade reduzida ou sensível a movimento.
- **História de usuário:** Como cliente com baixa visão, quero ampliar o texto e ouvir o que está na tela, para fazer meu pedido sem ajuda.
- **Como saberemos que deu certo:** 0 violações "critical" e "serious" do axe-core nas duas telas; pedido completo feito só com teclado e só com leitor de tela (VoiceOver/TalkBack); contraste mínimo 4,5:1 em texto.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Auditoria inicial (axe-core + roteiro manual com leitor de tela e teclado) registrada nesta SDD como lista de achados | P0 | CA01 |
| RF02 | Cards de produto, botões de quantidade, categorias e carrinho como elementos interativos nativos com nome acessível (produto, preço, estado "esgotado") | P0 | CA02, CA03 |
| RF03 | Modais e bottom sheets (montagem do item, adicionais, carrinho, pagamento) com `role="dialog"`, título associado, foco preso dentro e devolvido ao fechar, fechamento por Esc | P0 | CA04 |
| RF04 | Avisos dinâmicos (item adicionado, erro, pedido enviado, senha do pedido) anunciados por região `aria-live` | P0 | CA05 |
| RF05 | Ordem de foco lógica e foco sempre visível | P0 | CA03 |
| RF06 | Contraste AA em textos e controles; informação nunca só por cor (ex.: esgotado, selecionado) | P0 | CA06 |
| RF07 | Respeito a `prefers-reduced-motion` em todas as animações do Totem (fundo animado da CAF-000103 incluído) e do cardápio | P1 | CA07 |
| RF08 | Totem: botão "Texto maior / alto contraste" visível na tela inicial, que amplia a fonte em 30% e aplica tema de alto contraste até o fim do pedido | P1 | CA08 |
| RF09 | Layout sem perda de conteúdo com zoom de 200% no cardápio | P1 | CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | WCAG 2.1 nível AA nas duas telas | P0 | CA01 |
| RNF02 | Áreas de toque de no mínimo 44×44 px (já adotado no PDV pela CAF-000055) | P0 | CA02 |
| RNF03 | Nenhuma regressão visual para quem não usa os recursos | P0 | — |

### Dependências técnicas

- `totem.html`, `js/totem.js`, `css/totem.css`, `cardapio.html`, `js/cardapio-cliente-pedido.js`, `css/cardapio-cliente-pedido.css`.
- `axe-core` como `devDependency` (roda no Happy DOM para regras estruturais; contraste precisa de navegador real — CAF-000120).

### Recursos necessários

- Um celular com VoiceOver ou TalkBack e o tablet do totem para o teste manual.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado as duas telas, quando rodo o axe-core, então há 0 violações de impacto "critical" ou "serious", e a lista de achados da auditoria inicial está anexada com cada item resolvido ou justificado.
- [ ] **CA02:** Dado um card de produto, quando o leitor de tela o foca, então anuncia nome, preço e, se for o caso, "esgotado".
- [ ] **CA03:** Dado só o teclado, quando navego com Tab/Enter/Espaço, então consigo escolher produto, adicionais, quantidade, revisar o carrinho e enviar o pedido, sempre com foco visível.
- [ ] **CA04:** Dado um modal aberto, quando pressiono Tab repetidamente, então o foco não sai do modal; ao fechar (botão ou Esc), o foco volta ao elemento que o abriu.
- [ ] **CA05:** Dado um item adicionado ao carrinho ou um erro de envio, quando acontece, então o leitor de tela anuncia a mensagem sem mover o foco.
- [ ] **CA06:** Dado os textos e botões das duas telas, quando meço o contraste, então todos têm no mínimo 4,5:1 (3:1 para texto grande e ícones de controle).
- [ ] **CA07:** Dado o sistema com "reduzir movimento" ativado, quando abro o Totem, então o fundo animado e as transições ficam estáticos.
- [ ] **CA08:** Dado o Totem, quando toco em "Texto maior / alto contraste", então a fonte aumenta 30% sem cortar conteúdo e a opção se desfaz ao iniciar um novo pedido.
- [ ] **CA09:** Dado o cardápio com zoom de 200%, quando navego, então não há rolagem horizontal nem texto sobreposto.

## O que a atividade não inclui

- Telas internas (PDV, KDS, Admin): motivo: usuários treinados; tratar em outra iniciativa.
- Tradução para outros idiomas e Libras: motivo: outra iniciativa.
- Totem com saída de áudio/fone: motivo: depende de hardware.

### Considerado para o futuro (P2)

- Mesma auditoria no site institucional e na tela de avaliação.
- Cardápio em inglês/espanhol para público de eventos.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O totem físico tem teclado ou só toque? Define a prioridade do CA03 no Totem (no cardápio do celular vale sempre) | PO | Não | |
| D02 | A paleta atual (dourado sobre escuro) pode ser ajustada onde o contraste falhar? | PO/design | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | axe-core nas telas | integração (harness) | CA01 | Carregar Totem e cardápio com dados e rodar axe | 0 critical/serious |
| CT02 | Nome acessível do card | integração | CA02 | Renderizar produto normal e esgotado | Nome inclui preço e estado |
| CT03 | Pedido só com teclado | e2e / manual | CA03 | Percorrer o fluxo com Tab/Enter | Pedido enviado |
| CT04 | Foco preso no modal | integração | CA04 | Abrir modal, simular Tab e Esc | Foco contido e devolvido |
| CT05 | Anúncio em `aria-live` | integração | CA05 | Adicionar item / simular erro | Região atualizada |
| CT06 | Contraste | e2e (navegador real) | CA06 | Rodar regra de contraste do axe | 0 violações |
| CT07 | Movimento reduzido | unit (CSS) + manual | CA07 | Ativar preferência | Sem animação |
| CT08 | Texto maior no Totem | integração | CA08 | Ativar, concluir pedido, reiniciar | Aplica e desfaz |
| CT09 | Leitor de tela real | manual | CA02–CA05 | VoiceOver/TalkBack no fluxo | Pedido concluído |
| CT10 | Zoom 200% | manual / e2e | CA09 | Aplicar zoom no cardápio | Sem rolagem horizontal |

## URL Complementar

- Documentação técnica: `totem.html`, `js/totem.js`, `js/cardapio-cliente-pedido.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000040](CONCLUIDAS/CAF-000040-totem-de-autoatendimento-no-balcao.md), [CAF-000037](CONCLUIDAS/CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md), [CAF-000103](CONCLUIDAS/CAF-000103-layout-botoes-mobile-first-pedidos-cozinha-totem.md)
- Referências de design: WCAG 2.1 — https://www.w3.org/TR/WCAG21/
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
