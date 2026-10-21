# [CHORE] CAF-000089 — Cobertura de Testes: Gestão e Admin (Relatórios, Caixa, Estoque, Ficha Técnica, Clientes, Financeiro, Permissões, Pix, CRM, Exportação e Compras)

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** escrever testes funcionais automatizados para 13 SDDs de gestão/admin: 014, 015, 031, 032, 033, 034, 035, 036, 039, 041, 044, 045 e 068. Para 068, que já tem teste do util `js/utils/stock-purchase.js`, o escopo é a **integração real** com `js/admin/estoque.js` e o contas a pagar. Um arquivo `tests/caf-0000XX-*.test.js` por SDD original (068 ganha `tests/caf-000068-integracao-estoque-financeiro.test.js`). Lógica pura de `js/admin/*.js` e `js/pix-brcode.js` é exposta/extraída para `js/utils/` conforme a CAF-000086.
- **Problema e evidência:** nenhuma dessas SDDs tem teste de integração. A auditoria de 2026-10-20 encontrou, com suíte verde:
  - cadastro de despesa quebrado: front usa `valor_total`, `data_pagamento`, `status` e `recorrencia='unica'`, inexistentes em produção (erro 42703 confirmado);
  - estoque lendo `unidade_medida`, `saldo_atual`, `data_validade`, inexistentes em produção;
  - custo médio sobrescrito pelo front antes do trigger (js/admin/estoque.js:516), quebrando o CA de R$ 1,83 da 031;
  - `estoque_itens` com duas colunas de custo (`custo_medio` e `custo_unitario_medio`) em produção, e a ficha técnica lendo a que o trigger não atualiza;
  - `cafeteriaPix.getPixConfig`/`gerarPayload` inexistentes (js/admin/settings.js:593, 618);
  - a 044 sobrescreve o cálculo de caixa da 039 sem taxas;
  - PIN sem bloqueio após tentativas (036);
  - depósitos de conta do cliente fora do caixa (034);
  - views de clientes sem `security_invoker` (033/041).
- **Impacto de não fazer:** números de gestão errados (CMV, caixa, contas a pagar) levam a decisões financeiras erradas; Pix com BR Code inválido gera pagamento recusado no balcão.
- **Para quem é destinado:** Desenvolvedor / Agente de IA; indiretamente o gestor/PO e o caixa.
- **História de usuário:** Como gestor, quero que os módulos de caixa, estoque, custos, financeiro, Pix e clientes tenham testes automatizados, para confiar nos números que uso para decidir e não ser surpreendido por telas quebradas.
- **Como saberemos que deu certo:**
  - 13 arquivos de teste criados, com 100% dos CAs originais cobertos (ou `it.todo` justificado);
  - BR Code validado com vetores conhecidos;
  - cobertura ≥ 90% nos utils extraídos e ≥ 30% em cada `js/admin/*.js` alvo;
  - reintroduzir os bugs da evidência faz a suíte falhar.

## Requisitos da Atividade

### Requisitos funcionais

Matriz SDD-alvo → CAs → tipo → arquivo:

| SDD original | CAs a cobrir | Tipo de teste | Arquivo esperado | Bug conhecido (SDD de correção) |
|---|---|---|---|---|
| 014 Relatórios no admin | CA01–CA19 (vendas por período, ticket médio, ranking, tempo de preparo) | unit (agregações extraídas) + DOM admin | `tests/caf-000014-relatorios.test.js` | tempos deslocados por fuso → CAF-000080 |
| 015 Fechamento de caixa do dia | CA01–CA13 (abertura única, sangria/suprimento, alerta de pendentes) | unit + DOM | `tests/caf-000015-fechamento-caixa.test.js` | alerta não lista mesas; sem reabertura → CAF-000083 |
| 031 Controle de estoque | todos os CAs (entrada, saída, ajuste, perda, custo médio R$ 1,83, mínimo) | unit (custo médio extraído) + DOM + contrato | `tests/caf-000031-controle-estoque.test.js` | colunas inexistentes e custo sobrescrito → CAF-000074; INSERT de movimento por qualquer autenticado → CAF-000082 |
| 032 Ficha técnica, custo e lucro | todos os CAs (custo por produto/adicional, margem, CMV) | unit + contrato | `tests/caf-000032-ficha-tecnica.test.js` | `custo_unitario_medio` × `custo_medio` → CAF-000074 |
| 033 Cadastro de clientes | todos os CAs (busca por telefone, duplicidade, LGPD) | DOM + contrato | `tests/caf-000033-cadastro-clientes.test.js` | view RFV sem `security_invoker` → CAF-000082 |
| 034 Conta do cliente / fiado | todos os CAs (limite, depósito, estorno, saldo) | unit + DOM + contrato | `tests/caf-000034-conta-cliente.test.js` | depósito fora do caixa; sem `conta_cliente` no fechamento → CAF-000083 |
| 035 Contas a pagar e fluxo | todos os CAs (cadastro, recorrência, pagar, fluxo previsto × realizado) | DOM + contrato | `tests/caf-000035-contas-pagar.test.js` | campos/recorrência inexistentes → CAF-000078 |
| 036 Permissões por cargo e PIN | todos os CAs (abas por permissão, PIN, bloqueio) | DOM + unit | `tests/caf-000036-permissoes-pin.test.js` | sem bloqueio de PIN; abas não ocultas → CAF-000081 |
| 039 Pix QR e taxas | todos os CAs | unit (pix-brcode) + DOM settings + contrato | `tests/caf-000039-pix-brcode-taxas.test.js` | `getPixConfig`/`gerarPayload` inexistentes; 044 remove taxas → CAF-000079 |
| 041 CRM, segmentação e tags | todos os CAs (RFV, segmentos, tags, campanhas) | unit (segmentação extraída) + DOM | `tests/caf-000041-crm-segmentacao.test.js` | policies abertas; filtro "produto comprado" ausente → CAF-000082, CAF-000083 |
| 044 Caixa cego e correções | todos os CAs (contagem cega, diferença, fechamento) | unit + DOM | `tests/caf-000044-caixa-cego.test.js` | perda das taxas da 039 → CAF-000079 |
| 045 Exportação de produtos | todos os CAs (XLS/CSV, BOM, colunas) | unit | `tests/caf-000045-exportacao-produtos.test.js` | — |
| 068 Compras e contas a pagar (integração) | CA03 e CAs de entrada integrada | DOM (estoque.js) + contrato | `tests/caf-000068-integracao-estoque-financeiro.test.js` | `custo_medio` × ficha técnica; `produtos.fornecedor_padrao_id` inexistente → CAF-000074 |

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar os 13 arquivos da matriz, um `it` por CA original (nome inicia com o ID do CA) | P0 | CA01 |
| RF02 | Testes do BR Code (`js/pix-brcode.js`, via `window.cafeteriaPix` carregado no happy-dom ou exportado como ESM): CRC16-CCITT-FALSE com vetor `"123456789"` → `29B1`; payload de exemplo do Manual de Padrões BR Code do BACEN reproduzido byte a byte; campos obrigatórios (00, 26 com GUI `br.gov.bcb.pix`, 52, 53=986, 54 opcional, 58=BR, 59 ≤ 25, 60 ≤ 15, 62/05 txid, 63); remoção de acentos e truncamento; valores com 2 casas | P0 | CA02 |
| RF03 | Extrair para `js/utils/estoque-custos.js`: custo médio ponderado, custo de produto/adicional pela ficha técnica, margem e CMV | P0 | CA03 |
| RF04 | Extrair para `js/utils/caixa-calculos.js`: totais por forma de pagamento, taxas por forma (039), líquido, diferença do caixa cego (044), sangria/suprimento (015) e créditos de conta do cliente (034) | P0 | CA04 |
| RF05 | Extrair para `js/utils/crm-segmentos.js` a classificação RFV e os filtros de segmento (041) e para `js/utils/relatorios-agregados.js` as agregações do 014 | P1 | CA05 |
| RF06 | Testes de permissão (036) com o harness carregando `admin.html` para cargos admin, gerente, barista e cozinha, verificando abas visíveis e ações bloqueadas | P0 | CA06 |
| RF07 | Bugs conhecidos como `it.fails('[CAF-0000NN] …')` | P0 | CA07 |
| RF08 | Metas de cobertura nos thresholds: utils novos ≥ 90% linhas/85% branches; `js/pix-brcode.js` ≥ 95%; `js/admin/estoque.js`, `financeiro-admin.js`, `caixa-admin.js`, `clientes-admin.js`, `usuarios-admin.js`, `settings.js` ≥ 30% cada | P1 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Cálculos financeiros testados ao centavo (sem tolerância de float); custo médio com 4 casas, como no schema | P0 | CA03, CA04 |
| RNF02 | Nenhum dado pessoal real em fixtures (clientes fictícios, telefones inválidos do tipo 11 90000-0000) | P0 | CA01 |
| RNF03 | Suíte desta SDD < 10 s, sem rede | P0 | CA01 |

### Dependências técnicas

- CAF-000086 (harness, mock estrito, snapshot, thresholds).
- SDDs de correção: CAF-000074, CAF-000078, CAF-000079, CAF-000080, CAF-000081, CAF-000082, CAF-000083.
- Teste existente `tests/caf-000068-compras-estoque.test.js` (mantido; esta SDD adiciona a integração).

### Recursos necessários

- Manual de Padrões para Iniciação do Pix / BR Code (BACEN) para os vetores de teste.
- SDDs originais em `SDD/CONCLUIDAS/` como fonte dos CAs.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o fim desta atividade, quando `npm test` roda, então existem os 13 arquivos da matriz e cada CA original aparece em pelo menos um `it` (ou `it.todo` justificado).
- [ ] **CA02:** Dado chave Pix, recebedor com acento ("Cafeteria do Teatro Ltda"), cidade e valor R$ 12,50, quando o BR Code é gerado, então o CRC confere com o recalculado, o vetor `"123456789"` → `29B1` passa e o payload de exemplo do BACEN é reproduzido exatamente.
- [ ] **CA03:** Dado estoque de 10 un a R$ 1,50 e entrada de 5 un a R$ 2,50, quando a entrada é registrada pela tela do estoque, então o custo médio resultante é R$ 1,8333 e a ficha técnica passa a usar esse custo (`it.fails('[CAF-000074]')` até a correção).
- [ ] **CA04:** Dado caixa com vendas em dinheiro, débito (taxa 1,99%), crédito (3,49%) e Pix (0%), sangria de R$ 50 e contagem cega de R$ 412,30, quando o fechamento é calculado, então bruto, taxas, líquido e diferença batem ao centavo, e as taxas da 039 continuam aplicadas depois da 044 (`it.fails('[CAF-000079]')` até a correção).
- [ ] **CA05:** Dado 5 clientes fictícios com recência/frequência/valor diferentes, quando a segmentação RFV é calculada, então cada um cai no segmento esperado e o filtro por tag funciona.
- [ ] **CA06:** Dado um usuário com cargo "barista", quando abre o admin, então não vê as abas Financeiro, Usuários e Configurações. Dado 5 PINs errados seguidos, então o 6º é bloqueado (`it.fails('[CAF-000081]')` até a correção).
- [ ] **CA07:** Dado os bugs conhecidos da matriz, quando a suíte roda, então aparecem como `it.fails` com a SDD de correção, e passam a falhar quando a correção é entregue.
- [ ] **CA08:** Dado `npm run test:coverage`, quando roda, então as metas do RF08 são atingidas e registradas como thresholds.
- [ ] **CA09 (negativo):** Dado o cadastro de despesa com recorrência "única", quando salvo pela tela, então o payload enviado respeita o CHECK do banco (`nenhuma`/`mensal`) e as colunas do snapshot (`it.fails('[CAF-000078]')` até a correção).

## O que a atividade não inclui

- Corrigir os bugs da matriz: motivo: SDDs 074, 078, 079, 080, 081, 082 e 083.
- Validar policies/RLS em banco real: motivo: depende de Supabase local (P2 da CAF-000086).
- Testar envio real de campanhas (WhatsApp): motivo: não existe integração automática; fora do escopo.

### Considerado para o futuro (P2)

- pgTAP para os triggers de custo médio (031), `fn_calcular_custo_produto` (032), `lancar_movimento_conta` (034) e `fn_calcular_totais_caixa_interno` (039/044).
- Teste de leitura do BR Code por biblioteca decodificadora independente.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Coluna de custo oficial do estoque: `custo_medio` ou `custo_unitario_medio`? Os testes da 031/032/068 seguem a decisão da CAF-000074. | PO/dev | Não (testes marcados `it.fails`) | |
| D02 | Taxas por forma de pagamento usadas nos testes (1,99% / 3,49%) devem refletir as configuradas em produção? | PO | Não | |
| D03 | Matriz de cargos × abas do admin definitiva para o CA06 | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Relatório de vendas por período | unit | 014 | 3 dias de pedidos fictícios | Totais e ticket médio corretos |
| CT02 | Apenas um caixa aberto | DOM + contrato | 015 | Abrir caixa com outro aberto | Bloqueado |
| CT03 | Custo médio ponderado | unit | CA03 | 10×1,50 + 5×2,50 | 1,8333 |
| CT04 | Entrada pela tela do estoque | DOM + contrato | CA03, 068 | Registrar entrada | Colunas do snapshot; custo não sobrescrito (`it.fails` até 074) |
| CT05 | Custo e margem pela ficha | unit | 032 | Cappuccino com 3 insumos | Custo, margem e alerta abaixo do mínimo |
| CT06 | Cliente duplicado | DOM | 033 | Mesmo telefone 2× | Segundo cadastro bloqueado |
| CT07 | Limite do fiado | unit + contrato | 034 | Compra acima do limite | Recusada |
| CT08 | Depósito entra no caixa | unit | 034 | Depósito Pix de R$ 100 | Caixa do dia +R$ 100 (`it.fails` até 083) |
| CT09 | Cadastro de despesa | DOM + contrato | CA09 | Salvar despesa mensal | Payload conforme snapshot (`it.fails` até 078) |
| CT10 | Abas por cargo | DOM | CA06 | Login barista | Abas restritas ocultas |
| CT11 | Bloqueio de PIN | DOM | CA06 | 6 PINs errados | Bloqueio (`it.fails` até 081) |
| CT12 | CRC16 vetor conhecido | unit | CA02 | `"123456789"` | `29B1` |
| CT13 | Payload BACEN | unit | CA02 | Dados do exemplo do manual | Payload idêntico |
| CT14 | Testar Pix no admin | DOM | 039 | Clicar "Testar Pix" | QR gerado sem erro (`it.fails` até 079) |
| CT15 | Caixa cego com taxas | unit | CA04 | Cenário do CA04 | Valores ao centavo |
| CT16 | Segmentação RFV | unit | CA05 | 5 clientes | Segmentos esperados |
| CT17 | Exportação de produtos | unit | 045 | 3 produtos com acento e vírgula | BOM, colunas e escape corretos |

## URL Complementar

- Documentação técnica: `js/admin/*.js`, `js/pix-brcode.js`, `js/db.js`, `js/utils/stock-purchase.js`, migrations 024, 025, 031–036, 039, 041, 044, 068
- Referências: Manual de Padrões para Iniciação do Pix (BACEN), especificação EMV QRCPS-MPM
- Discussões relacionadas: auditoria de SDDs de 2026-10-20; sondagem do schema de produção (colunas confirmadas por erro 42703)
- Requisitos originais: `SDD/CONCLUIDAS/CAF-000014`, `015`, `031`–`036`, `039`, `041`, `044`, `045`, `068`
- Issue / PR relacionado: CAF-000086 (pré-requisito), CAF-000074, CAF-000078, CAF-000079, CAF-000080, CAF-000081, CAF-000082, CAF-000083
