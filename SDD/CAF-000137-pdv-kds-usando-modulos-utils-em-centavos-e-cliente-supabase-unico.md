# [REFACTOR] PDV/KDS usando os módulos de js/utils (centavos), fim das cópias e cliente Supabase único

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer as telas reais (PDV, KDS, admin) usarem os módulos testados de `js/utils/`, apagar as cópias divergentes, padronizar o acesso ao cliente Supabase e ao objeto do admin, e quebrar os módulos gigantes do admin, sem mudar comportamento, exceto a correção de arredondamento documentada.
- **Problema e evidência:**
  - **Módulos testados que não rodam em produção:** `conta-mesa.js`, `offline-queue.js`, `kds-regras.js`, `kds-patch.js`, `impressao-trava.js`, `order-calculator.js`, `caixa-calculos.js` e `csv-export.js` não são importados por nenhum arquivo de `js/` nem HTML; só por `tests/*` (grep por `utils/<nome>`: 0 importações em telas; 2 a 7 em testes cada). A cobertura com pisos no CI (CAF-000119) mede, em boa parte, código que o usuário nunca executa.
  - **Reimplementações em float:** o PDV calcula conta e divisão em reais com ponto flutuante (`js/pdv/fechamento.js:456` `pt.valor_devido += (valorPedido * (a.perc / 100))`, `:484`, `:513-530`), enquanto `js/utils/conta-mesa.js` faz o mesmo em centavos inteiros (`parseCurrencyToCents`, `dividirIgualmenteCents`, `distribuirTaxaEDesconto`). A tolerância de R$ 0,05 (`js/pdv/fechamento.js:87`, `:380`, `:988`) esconde a diferença de arredondamento.
  - **Preço meio a meio calculado em vários lugares:** `js/pdv/carrinho.js:215-222` (montagem), `:568-571` (promoção) e `:632-635` (exibição), além do SQL de `criar_pedido`.
  - **Fila offline duplicada:** `js/pdv/offline.js` reimplementa `js/utils/offline-queue.js` com as mesmas constantes (`CafeteriaPDV_DB`, `pedidos_offline`) e já diverge (a versão do PDV retorna `true` no fallback que falhou; ver CAF-000133).
  - **Aliases inconsistentes:** `js/supabase-client.js:20` define só `window.cafeteriaSupabase`, mas 35 linhas usam `window.supabaseClient`, que não existe. Em `js/avaliar.js:156,231` (bug da CAF-000130) e `js/admin/avaliacoes-admin.js:34,80` é usado sozinho e a tela quebra; nas demais aparece como fallback inútil. `js/admin/main.js:612-613` publica o mesmo objeto como `window.cafeteriaAdmin` e `window.admin`, e os módulos alternam (ex.: `js/admin/mesas-admin.js:306` `(window.cafeteriaAdmin?.confirm || window.admin?.confirm)`).
  - **Outros desvios:** `confirm()` nativo em `js/admin/estoque.js:219`, contra o padrão da CAF-000109; o botão "Pedir" do cardápio casa produto pelo nome visível (`js/cardapio-cliente-pedido.js:785` `allProdutos.find(p => p.nome.trim().toLowerCase() === nome.toLowerCase())`), o que falha com nomes repetidos ou renomeados; `module.exports` dentro de módulo ES em `js/admin/caixa-admin.js:996-997` e `js/admin/financeiro-admin.js:1468-1469` (aviso no build).
  - **Módulos grandes:** `js/admin/clientes-admin.js` (1813 linhas), `financeiro-admin.js` (1474), `estoque.js` (1311), `settings.js` (1290).
- **Impacto de não fazer:** Correções feitas nos utilitários (e testadas) não chegam ao usuário; centavos de diferença no fechamento; bugs como o da avaliação se repetem; testes verdes dão falsa segurança.
- **Para quem é destinado:** Desenvolvedores do projeto (manutenção) e, indiretamente, barista e dono (valores corretos).
- **História de usuário:** Como dev, quero que a regra de negócio exista em um só lugar e que os testes executem o código que vai para produção, para corrigir uma vez e confiar na cobertura.
- **Como saberemos que deu certo:** 0 módulos de `js/utils/` sem importação em tela (exceto os listados como só de teste, se houver justificativa); 0 ocorrências de `window.supabaseClient` e `window.admin.` (lint falha se aparecer); fechamento de conta com diferença 0 centavo nos casos de teste, sem tolerância.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | `js/pdv/fechamento.js` usa `conta-mesa.js` (centavos inteiros) para totais, divisão, taxa, desconto e troco; tolerância de R$ 0,05 removida | P0 | CA01, CA02 |
| RF02 | Preço de item (base, meio a meio, adicionais) calculado por uma função única em `order-calculator.js`, usada pelo carrinho, pela promoção e pela fila offline | P0 | CA03 |
| RF03 | `js/pdv/offline.js` passa a usar `offline-queue.js`; a cópia é apagada | P0 | CA04 |
| RF04 | KDS usa `kds-regras.js`, `kds-patch.js` e `impressao-trava.js`; caixa do admin usa `caixa-calculos.js`; exportações usam `csv-export.js`; cópias locais apagadas | P1 | CA04, CA05 |
| RF05 | `getSupabase()` único exportado por `js/supabase-client.js`; regra ESLint `no-restricted-properties` proíbe `window.supabaseClient`; todas as ocorrências substituídas | P0 | CA06, CA07 |
| RF06 | Só `window.cafeteriaAdmin` (ou import do módulo); `window.admin` removido e proibido no lint | P1 | CA07 |
| RF07 | `confirm()` nativo em `estoque.js` trocado pelo diálogo do admin | P1 | CA08 |
| RF08 | Cards do cardápio com `data-produto-id`; botão "Pedir" casa pelo id | P1 | CA09 |
| RF09 | Remover `module.exports` dos módulos ES do admin (testes importam via `export`) | P1 | CA10 |
| RF10 | Quebrar `clientes-admin.js`, `financeiro-admin.js`, `estoque.js` e `settings.js` em módulos ≤ 600 linhas, como a CAF-000121 fez no PDV | P2 | CA11 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma mudança visível de comportamento, exceto valores antes errados por arredondamento (lista dos casos no PR) | P0 | CA01, CA12 |
| RNF02 | Pisos de cobertura do CI mantidos ou maiores, agora medindo código importado pelas telas | P0 | CA05 |
| RNF03 | `npm run build` sem avisos de `module.exports`/CommonJS | P1 | CA10 |
| RNF04 | `npm run lint` passa com as novas regras | P0 | CA07 |

### Dependências técnicas

- CAF-000129 (saldo da mesa com fonte única) e CAF-000133 (envio sem perda e fila offline): fazer depois ou junto, para não refatorar código que elas vão reescrever.
- CAF-000134 e CAF-000135 mexem em `cozinha.js` e `carrinho.js`: combinar a ordem dos PRs.
- CAF-000121 (padrão de modularização), CAF-000119 (ESLint e cobertura).

### Recursos necessários

- Lista de casos de fechamento reais (valores e divisões) do caixa para validar que só o arredondamento muda.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado uma conta de R$ 100,00 dividida por 3, quando o PDV calcula as partes, então são R$ 33,34 + R$ 33,33 + R$ 33,33 e o fechamento só conclui quando o pago soma exatamente R$ 100,00.
- [ ] **CA02:** Dado pagamento R$ 0,01 menor que o total, quando o operador tenta concluir, então o sistema recusa (caso negativo: a tolerância de R$ 0,05 não existe mais).
- [ ] **CA03:** Dado um crepe meio a meio com sabores de R$ 20,00 e R$ 25,00 e um adicional de R$ 3,00, quando exibido no carrinho, na promoção e na fila offline, então o valor unitário é o mesmo nos três e igual ao gravado pelo servidor.
- [ ] **CA04:** Dado o código de `js/`, quando procuro funções duplicadas da fila offline, do KDS e do caixa, então só existe a versão de `js/utils/`, importada pelas telas.
- [ ] **CA05:** Dado o relatório de cobertura, quando o CI roda, então os arquivos de `js/utils/` aparecem cobertos pelos testes de tela, não só pelos testes unitários isolados.
- [ ] **CA06:** Dado a página de avaliação e a aba de avaliações do admin, quando abertas, então carregam dados pelo `getSupabase()`.
- [ ] **CA07:** Dado um arquivo novo com `window.supabaseClient` ou `window.admin.`, quando roda `npm run lint`, então o lint falha.
- [ ] **CA08:** Dado o registro de perda de lote vencido, quando o admin clica, então aparece o diálogo padrão do admin, não o `confirm()` do navegador.
- [ ] **CA09:** Dado dois produtos com o mesmo nome em categorias diferentes, quando o cliente toca "Pedir" em cada um, então cada botão adiciona o produto certo.
- [ ] **CA10:** Dado o build, quando roda `npm run build`, então não há aviso de `module.exports`.
- [ ] **CA11:** Dado o admin, quando os módulos são divididos, então nenhum arquivo de `js/admin/` passa de 600 linhas e os testes e2e do admin passam.
- [ ] **CA12:** Dado a suíte e2e da CAF-000120, quando roda após a refatoração, então todos os fluxos passam sem alteração nos testes (exceto valores de arredondamento listados).

## O que a atividade não inclui

- Mudança de regra de negócio (preço, promoção, taxa): motivo: refatoração; regras mudam nas CAF-000128, 129 e 135.
- Migrar o projeto para TypeScript ou framework: motivo: fora do escopo e alto custo.
- Corrigir o fluxo de envio do PDV: motivo: CAF-000133.

### Considerado para o futuro (P2)

- Valores monetários em centavos também nas RPCs e colunas do banco.
- RF10 pode ser feito em PRs separados por módulo.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Ao trocar float por centavos, onde fica o centavo que sobra na divisão: primeira parte (proposta) ou quem paga por último? | PO | Não | |
| D02 | `avaliacoes-admin.js` já entra na CAF-000130 ou fica aqui? | dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Divisão por 3 | integração (harness `fechamento.js` importando `conta-mesa.js`) | CA01 | Dividir R$ 100 | 33,34/33,33/33,33 |
| CT02 | Sem tolerância | integração | CA02 | Pagar 1 centavo a menos | Bloqueado |
| CT03 | Preço único | unit + integração | CA03 | Mesmo item nos três caminhos | Valores iguais |
| CT04 | Sem cópias | unit (análise de imports com o grafo do Vite/ESLint, não regex de texto) | CA04 | Montar grafo de módulos das páginas | Utils presentes no grafo |
| CT05 | Cobertura real | CI | CA05 | `npm run test:coverage` | Pisos mantidos |
| CT06 | Avaliação | e2e | CA06 | Abrir `avaliar.html` e aba do admin | Dados carregados |
| CT07 | Lint | integração (ESLint API sobre fixture) | CA07 | Lintar arquivo com alias proibido | Erro reportado |
| CT08 | Diálogo de perda | integração (DOM do admin) | CA08 | Clicar em registrar perda | Diálogo próprio |
| CT09 | Pedir por id | integração (DOM do cardápio) | CA09 | Dois produtos homônimos | Produto certo |
| CT10 | Build limpo | CI | CA10 | `npm run build` | Sem aviso |
| CT11 | Tamanho e e2e | CI | CA11, CA12 | Contar linhas e rodar e2e | ≤ 600 linhas; e2e verde |

## URL Complementar

- Documentação técnica: `js/utils/`, `js/pdv/fechamento.js`, `js/pdv/carrinho.js`, `js/pdv/offline.js`, `js/supabase-client.js`, `js/admin/main.js`, `eslint.config.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000087](CONCLUIDAS/CAF-000087-cobertura-de-testes-pdv-mesas-e-conta.md), [CAF-000093](CONCLUIDAS/CAF-000093-cobertura-testes-camada-dados-cache-offline.md), [CAF-000099](CONCLUIDAS/CAF-000099-suite-de-testes-efetiva-codigo-real-contrato-e-pgtap.md), [CAF-000109](CONCLUIDAS/CAF-000109-eliminacao-dialogos-nativos-totem-cardapio-pdv-kds-admin.md), [CAF-000119](CONCLUIDAS/CAF-000119-qualidade-eslint-e-cobertura-real-no-ci.md), [CAF-000120](CONCLUIDAS/CAF-000120-testes-e2e-fluxos-criticos-navegador-real.md), [CAF-000121](CONCLUIDAS/CAF-000121-modularizacao-pdv-e-admin.md); novas: CAF-000129, CAF-000130, CAF-000133, CAF-000134, CAF-000135
- Referências de design: ESLint, regra `no-restricted-properties`
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
