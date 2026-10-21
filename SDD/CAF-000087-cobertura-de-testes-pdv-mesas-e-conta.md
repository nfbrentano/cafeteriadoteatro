# [CHORE] CAF-000087 — Cobertura de Testes: PDV, Mesas e Fechamento de Conta (SDDs 001–005, 010–013, 016, 018, 019)

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** escrever testes funcionais automatizados para as 12 SDDs do PDV/mesa já entregues e sem teste: um arquivo `tests/caf-0000XX-*.test.js` por SDD original, cobrindo os CAs originais (fluxo principal, erro, limite e caso negativo). Lógica pura usada pelos testes é extraída de `js/pedidos.js` para `js/utils/` conforme a regra da CAF-000086 (sem mudar comportamento). Testes que expõem bug conhecido ficam como `it.fails('[CAF-0000NN] …')` apontando a SDD de correção.
- **Problema e evidência:** nenhuma das SDDs 001–019 tem teste (auditoria de 2026-10-20). O fluxo mais crítico do caixa — fechamento de conta (002/012/013) — está quebrado no repositório: `fechar_conta_mesa` é chamada com `p_subtotal`/`p_desconto` (js/pedidos.js:4870) e a única assinatura versionada espera `p_desconto_manual` (migration_caf_000023_taxa_desconto.sql:86); o total soma pedidos cancelados; o filtro de pedidos ativos (003, js/pedidos.js:2922) não tem corte de data. Tudo isso passou com a suíte verde.
- **Impacto de não fazer:** regressões no fechamento de conta, divisão e desconto chegam direto ao caixa (perda financeira e atendimento parado); as correções da CAF-000073 e CAF-000080 ficam sem rede de proteção.
- **Para quem é destinado:** Desenvolvedor / Agente de IA; indiretamente garçons e operador de caixa.
- **História de usuário:** Como responsável pelo produto, quero que cada regra do PDV de mesas tenha teste automatizado, para que fechar, dividir, descontar, transferir e cancelar nunca quebrem silenciosamente.
- **Como saberemos que deu certo:** 12 arquivos de teste criados; 100% dos CAs originais com pelo menos um teste (ou `it.todo` justificado); cobertura ≥ 80% linhas nos utils extraídos e ≥ 35% em `js/pedidos.js`; reintroduzir os bugs de 002/003/013 faz a suíte falhar.

## Requisitos da Atividade

### Requisitos funcionais

Matriz SDD-alvo → CAs → tipo → arquivo:

| SDD original | CAs a cobrir | Tipo de teste | Arquivo esperado | Bug conhecido (SDD de correção) |
|---|---|---|---|---|
| 001 Status entregue persistido | CA01–CA14 (update `status='entregue'`, `entregue_em`, desfazer, permissão) | DOM (harness pedidos.html) + unit | `tests/caf-000001-status-entregue.test.js` | RLS deixa `cozinha` marcar entregue → CAF-000082 |
| 002 Fechamento de conta | CA01–CA17 (total da mesa, pagamentos múltiplos, troco, idempotência, mesa liberada) | unit (cálculo extraído) + DOM + contrato | `tests/caf-000002-fechamento-conta.test.js` | parâmetros da RPC, soma de cancelados, sem lock → CAF-000073 |
| 003 Limitar pedidos ativos | CA01–CA11 (corte do dia, exclusão de entregue/cancelado, limite) | unit (montagem do filtro extraída) + DOM | `tests/caf-000003-limite-pedidos-ativos.test.js` | `.or(...)` sem data → CAF-000080 |
| 004 Cancelar item | CA01–CA15 (motivo obrigatório, recálculo, aviso na cozinha) | DOM + contrato | `tests/caf-000004-cancelar-item.test.js` | papel/motivo não validados no servidor → CAF-000082; toast sem mesa → CAF-000084 |
| 005 Adicionar itens a pedido enviado | CA01–CA11 | DOM + contrato | `tests/caf-000005-adicionar-itens.test.js` | marca "ADICIONAL" ausente na cozinha → CAF-000084 |
| 010 Nome do cliente / viagem | CA01–CA14 | DOM + unit | `tests/caf-000010-nome-cliente-viagem.test.js` | lista do admin sem nome → CAF-000084 |
| 011 Transferir/juntar mesas | CA01–CA12 | DOM + contrato | `tests/caf-000011-transferir-juntar-mesas.test.js` | RPC sem checagem de papel → CAF-000082 |
| 012 Dividir conta | CA01–CA10 (por pessoa, por item, sobra de centavos) | unit (divisão extraída) | `tests/caf-000012-dividir-conta.test.js` | arredondamento float → CAF-000073 |
| 013 Taxa de serviço e desconto | CA01–CA12 (10% opcional, desconto com motivo/permissão, limites) | unit + contrato | `tests/caf-000013-taxa-servico-desconto.test.js` | `p_desconto` ≠ `p_desconto_manual` → CAF-000073 |
| 016 Exportar CSV | CA01–CA11 (BOM, separador, escape, fuso SP, paginação) | unit (gerador CSV de pedidos-admin.js extraído) | `tests/caf-000016-exportar-csv.test.js` | sem paginação/fuso do navegador → CAF-000080 |
| 018 Tolerância a queda de internet | CA01–CA15 (fila IndexedDB, reenvio, idempotência) | unit + DOM (fake-indexeddb, `navigator.onLine`) | `tests/caf-000018-offline.test.js` | — |
| 019 Log de auditoria | CA01–CA12 | contrato + DOM admin | `tests/caf-000019-log-auditoria.test.js` | — |

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar os 12 arquivos da matriz, com `describe('CAF-0000XX — …')` e um `it` por CA original (nome do teste inicia com o ID do CA) | P0 | CA01 |
| RF02 | Extrair para `js/utils/conta-mesa.js`: cálculo de subtotal da mesa (ignorando cancelados), taxa de serviço, desconto, total, troco, divisão por pessoa/por item com distribuição de centavos, montagem do payload de `fechar_conta_mesa` | P0 | CA02, CA03 |
| RF03 | Extrair para `js/utils/pdv-filtros.js` a montagem do filtro de pedidos ativos (003) e para `js/utils/csv-export.js` o gerador CSV (016) | P0 | CA04 |
| RF04 | Testes de bug conhecido como `it.fails('[CAF-000073] …')` / `[CAF-000080]` / `[CAF-000082]` / `[CAF-000084]` | P0 | CA05 |
| RF05 | Todos os testes de RPC passam pelo mock em modo estrito (CAF-000086 RF04), de forma que o contrato também seja exercido no fluxo | P0 | CA03 |
| RF06 | Testes offline (018) com `fake-indexeddb` e simulação de `online/offline`, garantindo envio único por chave de idempotência | P1 | CA06 |
| RF07 | Meta de cobertura registrada nos thresholds: `js/utils/conta-mesa.js` ≥ 95% linhas/90% branches; `pdv-filtros.js` e `csv-export.js` ≥ 90%; `js/pedidos.js` ≥ 35% linhas | P1 | CA07 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Valores monetários testados com casos de centavos (ex.: R$ 100,00 ÷ 3 = 33,34 + 33,33 + 33,33) e soma exata | P0 | CA03 |
| RNF02 | Suíte desta SDD roda em < 8 s e sem rede | P0 | CA01 |
| RNF03 | Extrações não alteram comportamento visível (verificado por teste DOM antes/depois) | P0 | CA02 |

### Dependências técnicas

- CAF-000086 (harness de página, mock estrito, snapshot de schema, thresholds) — pré-requisito.
- SDDs de correção: CAF-000073, CAF-000080, CAF-000082, CAF-000084 (os `it.fails` viram `it` quando entregues).

### Recursos necessários

- devDependency `fake-indexeddb`.
- SDDs originais em `SDD/CONCLUIDAS/` como fonte dos CAs.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o fim desta atividade, quando `npm test` roda, então existem os 12 arquivos da matriz e cada CA original das SDDs-alvo aparece em pelo menos um `it` (ou `it.todo` com justificativa no próprio teste).
- [ ] **CA02:** Dado uma mesa com 3 pedidos (um cancelado), quando o total é calculado pelo util extraído, então o cancelado não entra no subtotal e o fechamento na tela mostra o mesmo valor.
- [ ] **CA03:** Dado fechamento com taxa de 10%, desconto de R$ 5 com motivo e dois pagamentos (Pix + dinheiro com troco), quando o PDV fecha a conta, então a RPC recebe exatamente os parâmetros do snapshot e os valores batem ao centavo. Enquanto a CAF-000073 não for entregue, este teste existe como `it.fails('[CAF-000073] …')`.
- [ ] **CA04:** Dado pedidos de ontem ainda com `status_pagamento='pendente'`, quando o filtro de pedidos ativos é montado, então eles não são carregados no PDV do dia (`it.fails('[CAF-000080]')` até a correção).
- [ ] **CA05:** Dado qualquer `it.fails` desta SDD, quando a SDD de correção referenciada é entregue, então o teste passa a falhar até ser convertido em `it` (nenhum bug conhecido fica sem dono).
- [ ] **CA06:** Dado o PDV offline, quando 2 pedidos são lançados e a conexão volta, então cada pedido é enviado uma única vez com a mesma chave de idempotência, mesmo com reenvio duplo.
- [ ] **CA07:** Dado `npm run test:coverage`, quando roda, então as metas de cobertura do RF07 são atingidas e ficam registradas como thresholds.
- [ ] **CA08 (negativo):** Dado um garçom sem permissão de desconto, quando tenta aplicar desconto, então o teste comprova que a UI bloqueia e nenhuma RPC é chamada.

## O que a atividade não inclui

- Corrigir os bugs encontrados: motivo: escopo das SDDs 073, 080, 082 e 084.
- Testar RLS/policies em banco real: motivo: depende de Supabase local (P2 da CAF-000086).
- SDDs mobile do PDV (051–060): motivo: outra SDD de cobertura (UX/mobile).

### Considerado para o futuro (P2)

- Testes pgTAP para `fechar_conta_mesa`, `cancelar_item`, `transferir_mesa` (lock, idempotência e papel).
- E2E Playwright do fluxo garçom → cozinha → caixa.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Regra oficial de sobra de centavos na divisão: primeira pessoa paga a sobra ou a última? | PO | Não (teste usa a regra atual e é ajustado na 073) | |
| D02 | Meta de 35% em `js/pedidos.js` é suficiente enquanto a extração avança? | PO/dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Marcar entregue e desfazer | DOM | 001 CA01–CA05 | Pedido pronto → Entregar → Desfazer | `update` com `entregue` e depois reversão |
| CT02 | Total ignora cancelados | unit | CA02 | 3 pedidos, 1 cancelado | Subtotal só dos 2 válidos |
| CT03 | Fechamento completo | DOM + contrato | CA03 | Taxa + desconto + 2 pagamentos | Payload conforme snapshot (`it.fails` até 073) |
| CT04 | Toque duplo no fechar | DOM | 002 | Clicar 2× rápido | Apenas 1 RPC |
| CT05 | Divisão com centavos | unit | 012, RNF01 | R$ 100,00 / 3 | 33,34 + 33,33 + 33,33 = 100,00 |
| CT06 | Filtro do dia | unit | CA04 | Pedido pendente de ontem | Excluído (`it.fails` até 080) |
| CT07 | Cancelar item sem motivo | DOM (negativo) | 004 | Confirmar sem motivo | Bloqueado, sem RPC |
| CT08 | Adicionar itens | DOM | 005 | Abrir pedido enviado → adicionar | RPC `adicionar_itens_pedido` com itens corretos |
| CT09 | Para viagem com nome | DOM | 010 | Marcar viagem, informar nome | Pedido sem mesa e com `cliente_nome` |
| CT10 | Transferir mesa | DOM + contrato | 011 | Mesa 3 → Mesa 5 | RPC com parâmetros do snapshot |
| CT11 | Desconto sem permissão | DOM (negativo) | CA08 | Garçom sem `pode_dar_desconto` | Botão bloqueado |
| CT12 | CSV com acentos e vírgula | unit | 016 | Item "Pão, queijo" | BOM UTF-8 + campo entre aspas |
| CT13 | Reenvio offline idempotente | unit | CA06 | Offline → 2 pedidos → online 2× | 2 inserts no total |
| CT14 | Log de auditoria | contrato | 019 | Cancelar item | Ação gera registro esperado |

## URL Complementar

- Documentação técnica: `js/pedidos.js`, `js/admin/pedidos-admin.js`, `supabase/migration_caf_000002.sql`, `supabase/migration_caf_000023_taxa_desconto.sql`
- Discussões relacionadas: auditoria de SDDs de 2026-10-20
- Requisitos originais: `SDD/CONCLUIDAS/CAF-000001` … `CAF-000019`
- Issue / PR relacionado: CAF-000086 (pré-requisito), CAF-000073, CAF-000080, CAF-000082, CAF-000084
