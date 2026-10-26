# [FIX] Resolução de Vulnerabilidades de Segurança CodeQL e Dependabot

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-26 · **Atualizada em:** 2026-10-26

## Detalhes da Atividade

A varredura contínua de segurança do GitHub (CodeQL Code Scanning e Dependabot Alerts) identificou 1 vulnerabilidade em dependência direta de desenvolvimento (`happy-dom`) e 7 alertas abertos de segurança de código de alta severidade (CWE-79 / CWE-116 DOM XSS e CWE-94 / CWE-312 higienização incompleta).

- **O que precisa ser feito:** 
  1. Atualizar a dependência `happy-dom` para a versão corrigida `^21.0.4` eliminando a vulnerabilidade CVE-2026-33943 (Dependabot #2).
  2. Corrigir os 7 pontos de código sinalizados pelo CodeQL:
     - Alerta #18: `tests/caf-000023-comanda-voz.test.js` (Incomplete sanitization em escape de apóstrofo).
     - Alerta #17: `js/pix-brcode.js` (DOM XSS na renderização do modal Pix tela cheia com `recebedor` e `subtitulo`).
     - Alerta #16: `js/cozinha.js` (DOM XSS na renderização do resumo de configuração da impressora com o nome do dispositivo lido de `input`).
     - Alerta #15: `js/cardapio-cliente-pedido.js` (DOM XSS na montagem do modal do carrinho cliente com `savedNome` de `localStorage`).
     - Alerta #14: `js/pedidos.js` (DOM XSS na montagem de itens do carrinho e badges de promoção).
     - Alerta #13: `js/pedidos.js` (DOM XSS no grid de produtos com `p.nome` e `p.descricao`).
     - Alerta #11: `js/pedido-print.js` (DOM XSS / doc.write em impressão térmica com dados de comanda/etiqueta).
  3. Criar suíte de testes funcionais automatizados (`tests/caf-000100-seguranca-codeql.test.js`) executando o código real da aplicação e validando que entradas maliciosas contendo payloads XSS (`<script>`, `<img onerror>`, aspas, barras invertidas e caracteres de escape) são devidamente neutralizadas em todos esses pontos.
- **Problema e evidência:** 
  - Alerta Dependabot #2: `happy-dom` vulnerável a Code Injection via import alias não higienizado (CVE-2026-33943).
  - Alertas CodeQL #11, #13, #14, #15, #16, #17 (`js/xss-through-dom`) e #18 (`js/incomplete-sanitization`).
- **Impacto de não fazer:** Riscos de Cross-Site Scripting (XSS) no PDV, KDS e Cardápio caso nomes de produtos, clientes ou dispositivos contenham caracteres HTML; alertas bloqueantes de segurança no repositório GitHub.
- **Para quem é destinado:** Usuários do sistema (garçons, baristas, clientes e operadores do admin) e equipe de manutenção técnica.
- **História de usuário:** Como mantenedor e operador da cafeteria, quero que todas as telas e dependências do sistema estejam imunes a injeção de código e XSS via DOM, para garantir integridade e segurança operacional total.
- **Como saberemos que deu certo:** 100% dos testes passando (`npm test` e `npm run build`), dependência `happy-dom` atualizada e 0 alertas pendentes de vulnerabilidade no GitHub CodeQL e Dependabot.

---

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Atualizar `happy-dom` para `>=21.0.4` eliminando a vulnerabilidade CVE-2026-33943 | P0 | CA01 |
| RF02 | Sanitizar nome e descrição de produtos na grade de vendas (`pedidos.js`) com `escapeHtml` | P0 | CA02 |
| RF03 | Sanitizar labels de promoções e textos dinâmicos do carrinho (`pedidos.js`) | P0 | CA03 |
| RF04 | Sanitizar nome salvo do cliente e código da mesa no modal do cardápio (`cardapio-cliente-pedido.js`) | P0 | CA04 |
| RF05 | Sanitizar nome do dispositivo no modal de impressora do KDS (`cozinha.js`) | P0 | CA05 |
| RF06 | Sanitizar recebedor e subtítulo no modal Pix tela cheia (`pix-brcode.js`) | P0 | CA06 |
| RF07 | Garantir que templates de impressão térmica (`pedido-print.js`) sanitizem dados antes de `doc.write` | P0 | CA07 |
| RF08 | Corrigir o teste unitário de apóstrofo e escape de strings (`tests/caf-000023-comanda-voz.test.js`) | P0 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Zero quebra de layout ou perda de caracteres válidos com acentos e pontuações normais | P0 | CA02 a CA07 |
| RNF02 | Todos os 103+ arquivos de testes automatizados devem passar com 100% de sucesso (`npm test`) | P0 | CA01 a CA08 |
| RNF03 | O build de produção (`npm run build`) deve continuar passando limpo sem regressões | P0 | CA01 a CA08 |

### Dependências técnicas

- Arquivo `package.json` e `package-lock.json`.
- Módulos `js/pix-brcode.js`, `js/cozinha.js`, `js/cardapio-cliente-pedido.js`, `js/pedidos.js`, `js/pedido-print.js`.
- Teste existente `tests/caf-000023-comanda-voz.test.js`.

---

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o `package.json` e `package-lock.json`, quando o projeto for inspecionado e construído, então a versão instalada de `happy-dom` deve ser `>= 21.0.4`, resolvendo o alerta Dependabot #2 sem quebrar o ambiente Vitest.
- [x] **CA02:** Dado um produto cadastrado com caracteres especiais ou tags HTML em seu nome ou descrição (`<img src=x onerror=alert(1)>`), quando a grade de produtos for renderizada em `pedidos.js`, então o conteúdo deve ser escapado como texto plano e nenhuma tag HTML perigosa deve ser interpretada pelo DOM (Alerta CodeQL #13).
- [x] **CA03:** Dado um item com promoção aplicada ou observação contendo caracteres HTML, quando o carrinho de compras for exibido em `pedidos.js`, então as tags e textos dinâmicos de promoção e observação devem ser sanitizados antes de entrar no DOM (Alerta CodeQL #14).
- [x] **CA04:** Dado um nome salvo no `localStorage` ou código de mesa com aspas ou caracteres perigosos (`" onfocus="alert(1)`), quando o modal do carrinho do cliente for aberto em `cardapio-cliente-pedido.js`, então o atributo `value` e o cabeçalho devem ser renderizados de forma segura sem injeção de atributos ou tags (Alerta CodeQL #15).
- [x] **CA05:** Dado um operador digitando um nome de dispositivo contendo tags HTML no campo de configuração da impressora em `cozinha.js`, quando `atualizarResumoConfigModal` for executado, então o texto deve ser escapado e renderizado sem permitir execução de scripts no DOM (Alerta CodeQL #16).
- [x] **CA06:** Dado um pagamento Pix onde o recebedor configurado ou subtítulo contiver caracteres de escape ou HTML, quando `abrirModalClienteTelaCheia` for chamado em `pix-brcode.js`, então todos os textos devem ser sanitizados com segurança antes de atribuir ao `innerHTML` (Alerta CodeQL #17).
- [x] **CA07:** Dado um pedido com dados de comanda e etiquetas contendo caracteres especiais, quando `executePrint` ou os formatadores de impressão em `pedido-print.js` processarem o documento, então todo o conteúdo impresso deve ser protegido contra injeção de scripts (Alerta CodeQL #11).
- [x] **CA08:** Dado o teste `tests/caf-000023-comanda-voz.test.js`, quando o teste for executado pelo Vitest, então ele deve validar escape seguro sem o padrão imperfeito de replace simples flagrado pelo CodeQL, e a suíte `tests/caf-000100-seguranca-codeql.test.js` deve validar de ponta a ponta todos os cenários acima (Alerta CodeQL #18).

---

## O que a atividade não inclui

- Alterações em regras de negócio ou fluxo de pedidos.
- Modificações de schema ou novas migrations SQL no banco Supabase (trata-se puramente de segurança e sanitização no frontend e dependências).

---

## Plano de Implementação

1. **Dependabot (CA01):**
   - Atualizar `happy-dom` para `^21.0.4` em `package.json`.
   - Executar `npm install` e validar integridade do lockfile e compatibilidade com os testes.

2. **Frontend DOM XSS (CA02 a CA07):**
   - Em `js/pedidos.js`: aplicar `window.escapeHtml` ou sanitização rigorosa em `p.nome`, `p.descricao` na grade de produtos (linhas 1537, 1561) e nos labels/itens do carrinho (linhas 2271-2296).
   - Em `js/cardapio-cliente-pedido.js`: escapar `savedNome` e `currentMesa.codigo` antes da interpolação na linha 367-380.
   - Em `js/cozinha.js`: escapar `dev` e demais variáveis de resumo antes de interpolar em `cfgStatusSummary.innerHTML` na linha 254.
   - Em `js/pix-brcode.js`: escapar `res.recebedor` e `subtitulo` antes de interpolar em `overlay.innerHTML` na linha 335-340.
   - Em `js/pedido-print.js`: garantir que todos os campos de cliente, produto, observação e mesa sejam sanitizados via `escapeHtml` antes de gerar os templates de impressão.

3. **Incomplete Sanitization no Teste (CA08):**
   - Em `tests/caf-000023-comanda-voz.test.js`: refatorar o teste para importar a função real de escape da aplicação (`escapeHtml`) e validar nomes com apóstrofos, aspas e barras invertidas sem usar o replace manual que acionou o CodeQL.

4. **Nova Suíte de Testes Reais (CA01 a CA08):**
   - Criar `tests/caf-000100-seguranca-codeql.test.js` cobrindo cenários com payloads XSS para cada uma das telas e funções afetadas.
   - Executar `npm test` e `npm run build`.
