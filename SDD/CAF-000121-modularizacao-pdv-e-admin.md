# [REFACTOR] Modularização do PDV (`js/pedidos.js`) e do Admin (`admin.html`) sem mudança de comportamento

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-10

## Detalhes da Atividade

- **O que precisa ser feito:** Dividir os dois maiores arquivos do sistema em módulos por assunto, mantendo exatamente o mesmo comportamento para o operador.
- **Problema e evidência:**
  - `js/pedidos.js` tem 6.381 linhas em um único arquivo de script clássico: carrinho, mesas, fechamento de conta, fechamento parcial, cupons, cashback, clientes, impressão, realtime e fila offline juntos. Ele expõe estado e funções por `window.*` (35 atribuições) e monta HTML com 60 `innerHTML` e 19 `onclick=` inline.
  - `admin.html` tem 5.087 linhas (283 KB) com a marcação de todas as abas e 824 estilos inline (`style="..."`/`<style>`); `js/cozinha.js` tem 3.019 linhas.
  - As últimas features (CAF-000110, 000112, 000113) tocaram todas em `js/pedidos.js` ou `admin.html`; cada mudança no fechamento de conta exige ler milhares de linhas não relacionadas, e as correções de regressão em fechamento/transferência (CAF-000073, 000108) nasceram nesse acoplamento.
  - Os scripts clássicos são copiados sem empacotar nem minificar (`viteStaticCopy` em `vite.config.js`), enquanto os módulos de `js/utils/` já são ES modules testáveis — o caminho de migração já existe.
- **Impacto de não fazer:** Custo e risco crescentes a cada nova feature no PDV; impossível aplicar CSP estrita (CAF-000117) e hash de arquivos (CAF-000118) por completo.
- **Para quem é destinado:** Desenvolvedor (efeito indireto para o operador: menos regressão).
- **História de usuário:** Como desenvolvedor, quero o PDV dividido em módulos com fronteiras claras, para alterar o fechamento de conta sem risco de quebrar o carrinho.
- **Como saberemos que deu certo:** Nenhum arquivo de tela acima de 1.500 linhas; 100% da suíte existente verde sem alterar asserções; PDV carregado como ES module empacotado pelo Vite.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | `js/pedidos.js` dividido em módulos ES em `js/pdv/` (ex.: `estado`, `catalogo`, `carrinho`, `mesas`, `fechamento`, `clientes`, `realtime`, `impressao`), com um `index` que inicializa a tela | P0 | CA01, CA02 |
| RF02 | Estado compartilhado em um único módulo explícito, no lugar de variáveis globais soltas; `window.*` permanece só para o que os testes/harness e handlers legados ainda exigem, em uma lista documentada | P0 | CA03 |
| RF03 | `admin.html` passa a conter só a casca; a marcação de cada aba vai para parciais incluídos no build (um arquivo por aba) | P0 | CA04 |
| RF04 | Estilos inline do Admin movidos para `css/admin.css` | P1 | CA05 |
| RF05 | PDV e Admin empacotados e minificados pelo Vite (com hash no nome do arquivo) | P1 | CA06 |
| RF06 | Mesma divisão aplicada a `js/cozinha.js` | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Zero mudança de comportamento: nenhuma asserção de teste existente é alterada, apenas caminhos de import/carga no harness | P0 | CA01 |
| RNF02 | Entrega em fatias: cada módulo extraído é um PR separado com a suíte verde | P0 | CA02 |
| RNF03 | Tempo de carregamento do PDV não piora (medido em tablet, primeira carga e carga em cache) | P1 | CA06 |

### Dependências técnicas

- CAF-000119 (lint e cobertura real) e CAF-000120 (e2e) concluídas antes: são a rede de segurança.
- `tests/helpers/page-harness.js` e `tests/helpers/pedidos-page.js` (carregam `pedidos.js` como script clássico).
- `vite.config.js`, `sw.js` (lista de arquivos muda — CAF-000118).

### Recursos necessários

- Janela sem features novas no PDV durante a extração de cada módulo.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o PDV modularizado, quando rodo `npm test`, então todos os testes existentes passam sem alteração nas asserções.
- [ ] **CA02:** Dado o repositório ao final, quando conto as linhas, então nenhum arquivo em `js/pdv/` passa de 1.500 linhas e `js/pedidos.js` não existe mais (ou é só o ponto de entrada).
- [ ] **CA03:** Dado o código do PDV, quando procuro atribuições a `window.*`, então só encontro os nomes da lista documentada.
- [ ] **CA04:** Dado o build, quando abro o Admin, então todas as abas aparecem e funcionam como antes, e `admin.html` de origem tem menos de 500 linhas.
- [ ] **CA05:** Dado `admin.html` e as parciais, quando procuro `style="`, então há no máximo 50 ocorrências (valores dinâmicos).
- [ ] **CA06:** Dado o `dist/`, quando inspeciono, então o JS do PDV e do Admin está minificado e com hash no nome.

## O que a atividade não inclui

- Adotar framework (React, Vue, etc.): motivo: complexo demais agora e sem ganho para o operador; módulos ES resolvem o acoplamento.
- Redesenho de telas ou mudança de fluxo: motivo: é refatoração sem mudança de comportamento.
- TypeScript: motivo: outra iniciativa (P2 da CAF-000119).

### Considerado para o futuro (P2)

- Modularização de `js/cozinha.js` (RF06) e de `js/db.js` (2.062 linhas) por domínio.
- Componentes reutilizáveis de modal/bottom sheet entre PDV, Totem e Admin.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Parciais do Admin por plugin de include no Vite ou carregadas sob demanda ao abrir a aba? | dev | Não | |
| D02 | Qual a ordem de extração? Sugestão: impressão → clientes → mesas → fechamento → carrinho (do menos para o mais acoplado) | dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Suíte existente intacta | integração | CA01 | `npm test` após cada fatia | 100% verde, asserções inalteradas |
| CT02 | Limite de tamanho | unit (conta linhas) | CA02, CA04 | Varredura de `js/pdv/` e `admin.html` | Dentro dos limites |
| CT03 | Globais controladas | unit (AST com acorn, já no projeto) | CA03 | Listar atribuições a `window.*` | Só nomes da lista |
| CT04 | Abas do Admin | integração (harness) / e2e | CA04 | Abrir cada aba | Conteúdo renderiza |
| CT05 | Estilos inline | unit | CA05 | Contar `style="` | ≤ 50 |
| CT06 | Build empacotado | integração (pós-build) | CA06 | Inspecionar `dist/` | Arquivos com hash e minificados |

## URL Complementar

- Documentação técnica: `js/pedidos.js`, `admin.html`, `vite.config.js`, `tests/helpers/pedidos-page.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000102](CONCLUIDAS/CAF-000102-testes-combinatorios-tela-pedidos.md)
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: —
