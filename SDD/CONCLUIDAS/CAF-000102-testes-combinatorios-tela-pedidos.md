# [CHORE] Suíte de Testes Funcionais Combinatórios da Tela de Pedidos (PDV — `pedidos.html`)

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-26 · **Concluída em:** 2026-10-26

## Detalhes da Atividade

- **O que precisa ser feito:** Criar uma suíte de testes automatizados que execute o código real de `pedidos.html` + `js/pedidos.js` (harness Happy DOM + mock do Supabase) e valide **todos os cenários da tela de pedidos**, combinando sistematicamente as variáveis de cada fluxo:
  - **Matriz completa (produto cartesiano)** nas regras críticas: envio do pedido (`criar_pedido`) e fechamento de conta (`fechar_conta_mesa`).
  - **Cobertura pairwise (todas as combinações 2 a 2)** nos demais fluxos: catálogo, carrinho, fila offline, painel de mesas, cancelamento, transferência/junção, triagem de pedidos de cliente, sessão/permissões e rascunho.
- **Problema e evidência:**
  - `js/pedidos.js` tem ~5.800 linhas e ~130 funções, mas só 3 arquivos de teste executam o código real (`caf-000099`, `caf-000100`, `caf-000101`). Os outros ~20 testes ligados à tela só procuram texto no arquivo com regex, o que o `GEMINI.md` não aceita como cobertura funcional.
  - Bug real achado só ao executar o código na CAF-000101: `pedidoEmEdicaoId` não era declarado, o que gerava `ReferenceError` em `'use strict'` sempre que o rascunho era salvo. Nenhum teste existente tinha detectado.
- **Impacto de não fazer:** regressões no fluxo principal de vendas (pedido errado na cozinha, cobrança errada, pedido perdido offline, desconto sem autorização) só aparecem em produção, durante a operação.
- **Para quem é destinado:** time de desenvolvimento (rede de segurança para refatorar) e, indiretamente, baristas e atendentes que usam o PDV.
- **História de usuário:** Como mantenedor do sistema, quero que cada combinação relevante de entrada da tela de pedidos seja validada automaticamente contra o código real, para poder alterar o PDV sem medo de quebrar vendas, cobranças ou a fila offline.
- **Como saberemos que deu certo:**
  - 100% das combinações das matrizes M1 e M2 executadas e passando.
  - 100% dos pares de valores (pairwise) das matrizes M3 a M9 cobertos, com a cobertura de pares verificada automaticamente pelo gerador.
  - A suíte nova roda em **< 60 s** localmente.
  - `npm test`, `npm run test:db` e `npm run build` passando 100%.
  - Cobertura de linhas de `js/pedidos.js` (via `npm run test:coverage`) com aumento registrado na SDD (valor antes × depois).

## Requisitos da Atividade

### Matrizes de combinação

**M1 — Envio do pedido (cartesiano completo = 3 × 4 × 5 × 2 × 3 = 360 casos)**

| Dimensão | Valores |
|---|---|
| Destino | mesa selecionada · para viagem · nenhum |
| Cliente | nenhum · nome livre · cadastrado com conta habilitada · cadastrado com conta desabilitada |
| Forma de pagamento | vazio · dinheiro · pix · cartão · `conta_cliente` |
| Marcado como pago | sim · não |
| Prioridade | normal · prioritário (com motivo) · intervalo do espetáculo |

Oráculo (tabela de decisão, nesta ordem de precedência):

1. Carrinho vazio → bloqueia com "Adicione ao menos um item ao carrinho." e não chama RPC.
2. Sem mesa e sem "para viagem" → bloqueia com "Por favor, selecione uma mesa para o pedido."
3. `conta_cliente` sem cliente cadastrado → bloqueia com "Selecione um cliente cadastrado…".
4. `conta_cliente` com conta desabilitada → bloqueia com "…não está habilitada para fiado/créditos."
5. Caso contrário → `criar_pedido` chamado uma única vez com `p_payload` contendo: `mesa_codigo` (código ou `BALCAO`), `para_viagem`, `cliente_id`/`cliente_nome`, `forma_pagamento`, `status_pagamento` (`pago` se `conta_cliente` ou marcado como pago, senão `pendente`), `prioridade` (1 se prioritário ou intervalo), `prioridade_motivo` (`Espetáculo (Intervalo)` no intervalo), `is_intervalo`, `retirada_em` (preenchido só no intervalo), observação geral com sufixo `[🎭 Intervalo]` no intervalo, `client_id` em formato UUID e itens corretos. Depois do envio o carrinho e o formulário ficam limpos.

**M1b — Resultado da conexão (cartesiano sobre um subconjunto representativo de M1 × 4 modos)**

| Modo | Resultado esperado |
|---|---|
| online, RPC ok | toast de envio e nada gravado na fila offline |
| online, erro de negócio | toast de erro com ação "Restaurar", que devolve carrinho e formulário |
| online, erro de rede (`fetch`/`network`/`Failed`/`timeout`) | pedido gravado na fila offline e contador atualizado |
| offline (`navigator.onLine=false`) | pedido gravado direto na fila e RPC não chamada; `conta_cliente` offline é bloqueado |

**M2 — Fechamento de conta (cartesiano = 5 × 2 × 4 × 2 = 80 casos)**

| Dimensão | Valores |
|---|---|
| Pagamentos | nenhum · 1 forma no valor exato · 1 forma a menor · 2 formas somando o total · valor a maior (troco) |
| Taxa de serviço | 0 · 10% |
| Desconto | 0 · > 0 com permissão `pdv.desconto` · > 0 sem permissão e PIN aprovado · > 0 sem permissão e PIN negado |
| RPC `fechar_conta_mesa` | sucesso · erro |

Complementos pairwise de M2: divisão (1 parte · N partes iguais · por itens) × `conta_cliente` (ausente · com cliente vinculado · sem cliente · débito recusado) × cupom (sem · válido).

**M3–M9 — Pairwise**

| Matriz | Fluxo | Dimensões principais |
|---|---|---|
| M3 | Catálogo | categoria (Rápidos/Todos/Promos/específica) × busca (vazia/com resultado/sem resultado) × produto (disponível/esgotado) × promoção (sim/não) |
| M4 | Carrinho | tipo de item (simples/com adicionais/meio a meio/cortesia) × quantidade (1/N/decremento até remover) × observação (sem/com/HTML malicioso) × agrupamento (mesmo item/item diferente) |
| M5 | Fila offline | quantidade na fila (0/1/N) × ação (reenviar/descartar/reconexão automática) × resultado (sucesso/erro de negócio/erro de rede) |
| M6 | Painel de mesas e pedidos | status (pendente/em preparo/pronto/entregue) × ação (entregar + desfazer/alternar prioridade/receber do totem/marcar não retirado) × RPC (ok/erro) |
| M7 | Cancelamento e transferência | permissão (com/sem + PIN ok/PIN negado) × alvo (item único/último item do pedido) · transferir/juntar × destino (livre/ocupada/nenhum) × RPC (ok/erro) |
| M8 | Triagem de pedidos de cliente | origem (QR mesa/online/retirada agendada) × ação (aprovar/recusar) × RPC (ok/erro) × conteúdo (normal/HTML malicioso) |
| M9 | Sessão, permissões e rascunho | sessão (ausente/válida) × perfil (com/sem `pdv.vender`/inativo) × rascunho (nenhum/válido/expirado/produto removido do catálogo) |

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Gerador pairwise determinístico com verificação automática de que todos os pares foram cobertos | P0 | CA01 |
| RF02 | Page object `pedidos-page` que só interage com a tela pelo DOM e pelas funções `window.*` expostas pela própria aplicação | P0 | CA02 |
| RF03 | Matriz M1 completa (360 casos) validando bloqueios e o payload de `criar_pedido` | P0 | CA03, CA04 |
| RF04 | M1b: comportamento online/erro/rede/offline, incluindo "Restaurar" e gravação na fila | P0 | CA05 |
| RF05 | Matriz M2 completa (80 casos) + complementos pairwise do fechamento | P0 | CA06, CA07 |
| RF06 | Pairwise de catálogo e carrinho (M3, M4) | P0 | CA08 |
| RF07 | Pairwise da fila offline com IndexedDB em memória (M5) | P0 | CA09 |
| RF08 | Pairwise de painel, cancelamento, transferência e triagem (M6–M8) | P0 | CA10 |
| RF09 | Pairwise de sessão, permissões e rascunho (M9) | P1 | CA11 |
| RF10 | Bug da aplicação encontrado pelos testes vira SDD de correção própria, nunca é escondido no teste | P0 | CA12 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Suíte nova em < 60 s locais e sem afetar o tempo do CI em mais de 90 s | P0 | CA13 |
| RNF02 | Determinística: sem `Math.random` sem semente e sem depender do relógio real (datas fixas por fake timers quando necessário) | P0 | CA13 |
| RNF03 | Nenhum teste lê `pedidos.js` por regex nem reimplementa regra de negócio; o oráculo é a tabela de decisão desta SDD | P0 | CA02 |
| RNF04 | Rede externa bloqueada (harness atual) e nenhum acesso ao Supabase real | P0 | CA13 |
| RNF05 | Nome de cada caso descreve a combinação (ex.: `mesa · cadastrado-hab · conta_cliente · pago · intervalo`) para falhas legíveis | P1 | CA13 |

### Dependências técnicas

- `tests/helpers/page-harness.js` e `tests/helpers/supabase-mock.js` (já existentes; o mock pode receber métodos de filtro faltantes, como foi feito com `.gt`/`.lt` na CAF-000101).
- IndexedDB em memória para a fila offline: dependência de desenvolvimento `fake-indexeddb` (ver D01).
- `pedidos.html` e `js/pedidos.js` atuais (commit `5e3a64e`).

### Recursos necessários

- Nenhum acesso a produção ou credencial. Tudo roda em mock local.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o gerador pairwise, quando receber N dimensões, então todo par de valores de quaisquer duas dimensões aparece em pelo menos um caso; a saída é idêntica entre execuções; dimensões com 1 valor e listas vazias são tratadas sem erro.
- [x] **CA02:** Dado qualquer teste da suíte, quando executado, então ele carrega `pedidos.html` + `js/pedidos.js` reais pelo harness e interage só pelo DOM e por `window.*`; nenhum arquivo da suíte usa `readFileSync` sobre código da aplicação.
- [x] **CA03:** Dado cada uma das 360 combinações de M1, quando o pedido é enviado, então o resultado bate com a tabela de decisão: o bloqueio certo com a mensagem certa e **zero** chamadas a `criar_pedido`, ou **exatamente uma** chamada com o payload esperado.
- [x] **CA04:** Dado um envio aceito de M1, quando a RPC é chamada, então carrinho, observação, cliente, pagamento, prioridade, "para viagem" e mesa são limpos e o rascunho é apagado do `localStorage`.
- [x] **CA05:** Dados os 4 modos de conexão de M1b, quando o pedido é enviado, então: com RPC ok nada vai para a fila; com erro de negócio aparece o toast com "Restaurar", que repõe o estado anterior; com erro de rede e offline o pedido vai para a fila com `status=aguardando_envio`; `conta_cliente` offline é bloqueado.
- [x] **CA06:** Dado cada uma das 80 combinações de M2, quando o fechamento é confirmado, então: pagamento ausente ou a menor bloqueia sem chamar RPC; desconto sem permissão pede PIN e, se negado, bloqueia; nos casos válidos `fechar_conta_mesa` recebe `p_pagamentos`, `p_taxa_servico`, `p_desconto_manual` e `p_idempotency_key` corretos; erro da RPC mostra toast e reabilita o botão.
- [x] **CA07:** Dados os complementos pairwise de M2, quando há `conta_cliente`, então sem cliente vinculado bloqueia; débito recusado por `lancarMovimento` bloqueia sem chamar `fechar_conta_mesa`; divisão por itens não passa de 100% por item; cupom válido envia `p_cupom_codigo`/`p_campanha_id`.
- [x] **CA08:** Dados os pares de M3 e M4, quando o catálogo e o carrinho são usados, então os filtros mostram só os produtos esperados; produto esgotado não entra no carrinho; quantidades e total batem; itens iguais sem adicionais/observação se agrupam; HTML em observação nunca vira elemento.
- [x] **CA09:** Dados os pares de M5, quando a fila offline é processada, então reenviar com sucesso remove o item e atualiza o contador; erro de rede mantém o item e incrementa `tentativas`; descartar remove; com a fila vazia o modal mostra o estado vazio.
- [x] **CA10:** Dados os pares de M6–M8, quando as ações de painel, cancelamento, transferência e triagem são executadas, então a RPC certa é chamada com os parâmetros certos, o PIN é pedido quando falta permissão, ações negadas não chamam RPC e erros mostram toast sem quebrar a tela.
- [x] **CA11:** Dados os pares de M9, quando a página é carregada, então sem sessão aparece o login; perfil sem `pdv.vender` ou inativo é barrado com mensagem; rascunho válido é restaurado; rascunho expirado ou com produto removido é descartado sem erro no console.
- [x] **CA12:** Dado um bug da aplicação revelado pela suíte, quando ele for confirmado, então ele é registrado em uma SDD de correção própria (o caso fica `it.fails`/`skip` apontando para essa SDD) ou corrigido nesta atividade com teste de regressão; se ficar pendente, esta SDD fecha como "Concluída com ressalvas".
- [x] **CA13:** Dada a suíte completa, quando `npm test` roda, então todos os arquivos `caf-000102-*` passam em < 60 s locais, sem chamada de rede externa e com o mesmo resultado em 3 execuções seguidas.

## O que a atividade não inclui

- Migrar ou apagar os ~20 testes antigos de `pedidos.js` baseados em regex: motivo: decisão do revisor; vira item futuro.
- Testes e2e em navegador real (Playwright): motivo: complexo demais agora; o harness Happy DOM cobre a lógica.
- Notificações nativas, vibração, som, chamada por voz e compartilhamento/WhatsApp de comprovante: motivo: dependem de APIs de dispositivo e têm baixo impacto nas regras de venda.
- Validar as RPCs no banco: motivo: já coberto pelos testes pgTAP (CAF-000092/099); aqui as RPCs são mockadas e só o contrato de chamada é verificado.
- Telas fora de `pedidos.html` (admin, cozinha, totem, cardápio): motivo: outra iniciativa.

### Considerado para o futuro (P2)

- Migrar os testes de regex de `pedidos.js` para o page object desta SDD.
- Reaproveitar o gerador pairwise e o padrão de matriz em `cozinha.js`, `totem.js` e `admin`.
- Mutation testing (ex.: Stryker) para medir a força da suíte.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Pode adicionar `fake-indexeddb` como devDependency para testar a fila offline com IndexedDB real em memória? (Alternativa: stub manual de IndexedDB no teste, mais frágil.) | PO/dev | Sim | Sim, `fake-indexeddb` integrado com sucesso garantindo transações reais no IndexedDB. |
| D02 | Bugs achados durante a implementação: corrigir nesta SDD (com teste de regressão) ou abrir SDD de correção separada? | PO | Não | Corrigidos nesta atividade (correções pontuais e objetivas de bugs reais com testes de regressão no código real). |

## Sugestões de casos de teste

| # | Cenário | Tipo | Cobre | Passos | Resultado esperado |
|---|---------|------|-------|--------|--------------------|
| CT01 | Gerador pairwise | unit | CA01 | gerar casos para 3×4×5 e 2×2×2×2 | todos os pares cobertos, saída estável, entradas de borda aceitas |
| CT02 | Auditoria da suíte | unit | CA02 | ler os próprios arquivos `tests/caf-000102-*` | nenhum `readFileSync` sobre `js/` ou `*.html` além do harness |
| CT03 | Matriz M1 | integração | CA03, CA04 | `it.each` com as 360 combinações | bloqueio/payload conforme a tabela de decisão |
| CT04 | Conexão M1b | integração | CA05 | 4 modos × subconjunto de M1 | fila/toast/"Restaurar" corretos |
| CT05 | Matriz M2 | integração | CA06 | `it.each` com as 80 combinações | bloqueios e parâmetros de `fechar_conta_mesa` corretos |
| CT06 | Fechamento pairwise | integração | CA07 | divisão × conta_cliente × cupom | regras de conta do cliente, divisão e cupom |
| CT07 | Catálogo e carrinho | integração | CA08 | pairwise M3 e M4 | grid, carrinho e total corretos |
| CT08 | Fila offline | integração | CA09 | pairwise M5 com IndexedDB em memória | fila e contador corretos |
| CT09 | Operações de painel | integração | CA10 | pairwise M6–M8 | RPCs, PIN e toasts corretos |
| CT10 | Sessão e rascunho | integração | CA11 | pairwise M9 | login, bloqueio de perfil e restauração do rascunho |
| CT11 | Estabilidade | integração | CA13 | rodar `npx vitest run tests/caf-000102-*` 3 vezes | mesmo resultado e < 60 s |

## URL Complementar

- Documentação técnica: `tests/helpers/page-harness.js`, `tests/helpers/supabase-mock.js`
- Discussões relacionadas: CAF-000099 (suíte efetiva), CAF-000101 (bug `pedidoEmEdicaoId` achado ao executar o código real)
- Requisitos originais: `GEMINI.md` — testes funcionais obrigatórios e proibição de testes por regex
