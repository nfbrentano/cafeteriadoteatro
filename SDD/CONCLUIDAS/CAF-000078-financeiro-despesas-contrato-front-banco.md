# [FIX] CAF-000078 — Financeiro: alinhar cadastro, baixa e listagem de despesas ao schema real

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Corrigir a tela de Contas a Pagar (CAF-000035) para que cadastrar, editar, dar baixa, listar, totalizar e exportar despesas funcionem com as colunas que realmente existem na tabela `public.despesas` em produção. Complementarmente, entregar anexo de comprovante seguro, a integração sangria → despesa e a auditoria de alterações em despesas pagas, que constavam na SDD original e não foram implementados.
- **Problema e evidência:**
  1. **Contrato divergente front × camada de dados × banco.** Em produção (sonda REST de 2026-10-20) a tabela `despesas` tem `valor`, `pago_em`, `recorrencia`, `anexo_url`, `vencimento`, `categoria_id`, `fornecedor_id`. As colunas `valor_total`, `data_pagamento` e `status` **não existem**.
  2. O formulário monta o payload com `valor_total`, `tipo`, `documento_numero` e, quando "já paga", `status: 'pago'` e `data_pagamento` (`js/admin/financeiro-admin.js:637-655`).
  3. `db.financeiro.despesas.create` lê `dados.valor` (`js/db.js:1204`), que vem `undefined`. O resultado é `Number(undefined) = NaN`, e o insert falha no `CHECK (valor > 0)` (`supabase/migration_caf_000035_financeiro_despesas.sql:50`). **Hoje nenhuma despesa é criada pela UI.** A despesa "já paga" também perderia `pago_em`, porque `db.js:1206` lê `dados.pago_em`.
  4. **Recorrência inválida.** O select oferece `value="unica"` (`admin.html:4552`) e a edição usa `|| 'unica'` (`financeiro-admin.js:593`). O CHECK aceita só `'nenhuma' | 'mensal'` (`migration_caf_000035:56`). O `db.js` só converte o valor ausente para `'nenhuma'`, então `'unica'` chega ao banco e é recusado.
  5. **Baixa quebrada.** A UI chama `db.baixar(id, { valor_pago, data_pagamento, forma_pagamento, comprovante, obs })` (`financeiro-admin.js:741-750`), mas a assinatura é `baixar({ id, pagoEm, valorPago, formaPagamento })` (`db.js:1278`). Com isso, `id` chega `undefined` à RPC `baixar_despesa`, e `p_valor_pago` vira `NaN`.
  6. **Listagem, edição, KPIs e CSV.** Todos leem campos inexistentes:
     - `d.status === 'pago'` (`financeiro-admin.js:409, 475, 988`);
     - `d.data_pagamento` (`:481, 989, 1061`);
     - `d.valor_total` (`:537-538, 588, 682, 706-708, 997, 1059`).
     Consequências: despesas pagas aparecem como pendentes, os valores aparecem como R$ 0,00/NaN e os totais do mês ficam errados.
  7. **Campos sem coluna.** `tipo` e `documento_numero` não existem em `despesas`. O tipo pertence a `despesa_categorias.tipo` (`migration_caf_000035:23`), e o número do documento não tem destino.
  8. **Requisitos não implementados da CAF-000035:**
     - upload de anexo para bucket privado com URL assinada (há a coluna `anexo_url`, mas não há upload);
     - sangria do caixa gerando despesa com `origem='sangria'` (`caixa-admin.js` não cria despesa);
     - auditoria de edição/exclusão de despesa já paga.
- **Impacto de não fazer:** O módulo financeiro está inutilizável: não registra contas a pagar, e o fluxo de caixa e o DRE simplificado (CAF-000035) mostram dados falsos. Isso afeta decisões de compra e o fechamento do mês.
- **Para quem é destinado:** Gestor/admin financeiro da cafeteria.
- **História de usuário:** Como gestor, quero cadastrar, pagar e consultar despesas com valores e status corretos, para acompanhar o fluxo de caixa real do negócio.
- **Como saberemos que deu certo:** 100% das operações (criar, criar já paga, editar, baixar, excluir, exportar) concluem sem erro em produção. A listagem mostra status e valores idênticos aos do banco, e os KPIs do mês batem com `SELECT SUM(valor_pago) FROM despesas WHERE pago_em` no mês.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Unificar o contrato de despesa em um único mapeador (ex.: `js/utils/despesa-mapper.js`). Ele converte o formulário para a linha do banco (`valor`, `pago_em`, `valor_pago`, `forma_pagamento`, `recorrencia`) e a linha do banco para a view (status derivado: `pago` se `pago_em` não for nulo; `vencida` se `vencimento < hoje(SP)` e não paga; senão `pendente`) | P0 | CA01, CA02, CA05 |
| RF02 | Trocar `'unica'` por `'nenhuma'` em `admin.html:4552` e `financeiro-admin.js:593`, e validar no mapeador que só `nenhuma`/`mensal` são enviados | P0 | CA03 |
| RF03 | Corrigir a chamada de baixa para a assinatura real de `db.financeiro.despesas.baixar` (ou ajustar a assinatura), enviando `p_despesa_id`, `p_pago_em`, `p_valor_pago` e `p_forma_pagamento` válidos | P0 | CA04 |
| RF04 | Listagem, edição, exclusão, KPIs do mês e exportação CSV passam a usar apenas campos existentes (via RF01) | P0 | CA05, CA06 |
| RF05 | Decidir o destino de `tipo` (usar o da categoria) e de `documento_numero`: incluir coluna `documento` via migration ou guardar em `observacoes`. Nenhum campo enviado pode ser descartado silenciosamente | P0 | CA07 |
| RF06 | Upload do comprovante para bucket privado do Supabase Storage. A coluna `anexo_url` passa a guardar só o caminho do objeto, e a visualização usa URL assinada com expiração ≤ 10 min | P1 | CA08 |
| RF07 | Sangria registrada no caixa gera automaticamente uma despesa com `origem='sangria'`, `caixa_movimento_id` preenchido e já paga na data da sangria (configurável por categoria) | P1 | CA09 |
| RF08 | Editar ou excluir despesa já paga exige permissão `financeiro.editar_pago` e grava registro no log de auditoria (CAF-000019) com valores antes/depois | P1 | CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Zero referências a `valor_total`, `data_pagamento` ou `d.status` em `js/admin/financeiro-admin.js` (verificável por `grep`) | P0 | CA05 |
| RNF02 | Teste de contrato que falha se o payload do front tiver chave que não exista na lista de colunas de `despesas` (lista mantida a partir do baseline da CAF-000072) | P0 | CA01 |
| RNF03 | Datas de vencimento/pagamento calculadas no fuso `America/Sao_Paulo` (ver CAF-000080) | P1 | CA05 |
| RNF04 | Bucket de anexos privado; nenhuma URL pública permanente | P1 | CA08 |

### Dependências técnicas

- **CAF-000072**: baseline do schema de produção (colunas reais de `despesas`, CHECK de `recorrencia`, assinatura de `baixar_despesa`).
- **CAF-000080**: fuso horário (cálculo de "vencida" e "mês atual").
- `js/admin/financeiro-admin.js`, `js/db.js:1159-1300`, `admin.html` (form de despesa ≈4520-4570), `supabase/migration_caf_000035_financeiro_despesas.sql`, `js/admin/caixa-admin.js` (sangria).

### Recursos necessários

- Acesso ao Supabase (Storage) para criar o bucket privado `comprovantes-despesas` e policies.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o formulário preenchido com descrição, valor 150,00, vencimento e categoria, quando salvo, então a despesa é criada com `valor = 150.00` e aparece na lista como pendente.
- [ ] **CA02:** Dada uma nova despesa marcada "já paga" em 10/10 via Pix, quando salva, então o banco grava `pago_em = '2026-10-10'`, `valor_pago = 150.00` e `forma_pagamento = 'pix'`, e a lista mostra "Paga em 10/10/2026".
- [ ] **CA03:** Dada a recorrência "Única", quando salvo, então o banco recebe `recorrencia = 'nenhuma'` e não há violação de CHECK; "Mensal" grava `'mensal'`.
- [ ] **CA04:** Dada uma despesa pendente mensal, quando dou baixa com valor 140,00 em 15/10, então `baixar_despesa` recebe o `id` correto, a despesa fica paga com `valor_pago = 140.00` e a próxima recorrência é criada.
- [ ] **CA05:** Dadas despesas pagas e pendentes no mês, quando abro a aba, então status, valores e o total pago do mês batem com a consulta SQL de referência.
- [ ] **CA06:** Dado o filtro do mês, quando exporto CSV, então as colunas Valor, Status e Data de Pagamento vêm preenchidas a partir de `valor`, do status derivado e de `pago_em`.
- [ ] **CA07:** Dado o campo "Nº Documento" preenchido, quando salvo e reabro a edição, então o valor é exibido de volta (não é perdido).
- [ ] **CA08:** Dado um comprovante PDF anexado, quando outro admin clica em "ver anexo", então abre via URL assinada que expira; acessar o caminho sem assinatura retorna 400/403.
- [ ] **CA09:** Dada uma sangria de R$ 50,00 registrada no caixa, quando consulto despesas, então existe uma despesa paga de R$ 50,00 com `origem='sangria'` vinculada ao movimento.
- [ ] **CA10:** Dada uma despesa paga, quando um usuário sem `financeiro.editar_pago` tenta editar, então a ação é bloqueada; com a permissão, a edição grava entrada no log de auditoria com valores antes e depois.
- [ ] **CA11 (negativo):** Dado valor 0 ou vazio, quando tento salvar, então o front bloqueia com aviso e nenhuma requisição é feita.

## O que a atividade não inclui

- DRE completo por competência: motivo: nova funcionalidade (gap de paridade com a Saipos), com SDD própria.
- Importação de XML de nota de fornecedor: motivo: depende de integração fiscal, fora do escopo de correção.

### Considerado para o futuro (P2)

- Coluna `competencia` para DRE por competência (não existe hoje em produção).
- Conciliação bancária via OFX.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | "Nº Documento" deve virar coluna própria (`documento`) ou ir para `observacoes`? | PO | Sim | |
| D02 | Toda sangria vira despesa ou só algumas (ex.: sangria para depósito bancário não é despesa)? | PO | Não (P1) | |
| D03 | Existem despesas criadas manualmente no banco com dados a migrar? | dev | Não | |

## Sugestões de casos de teste

Arquivo obrigatório: `tests/caf-000078-financeiro-despesas.test.js`. Ele deve carregar `js/admin/financeiro-admin.js` e o módulo `cafeteriaDB.financeiro` reais em `happy-dom`, com `tests/helpers/supabase-mock.js` configurado com as colunas e CHECKs reais de `despesas`, e verificar os payloads enviados ao mock. Não basta testar o mapeador isolado.

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Criar despesa pendente | integração (DOM + mock) | CA01 | Preencher form e submeter | Insert com `valor=150`, sem chaves desconhecidas |
| CT02 | Criar despesa já paga | integração (DOM + mock) | CA02 | Marcar "já paga" e submeter | `pago_em`, `valor_pago`, `forma_pagamento` no payload |
| CT03 | Recorrência única/mensal | unit + integração | CA03 | Submeter com cada opção | `nenhuma` / `mensal` |
| CT04 | Baixa com recorrência | integração (DOM + mock) | CA04 | Abrir modal de baixa e confirmar | RPC `baixar_despesa` com `p_despesa_id` correto e números válidos |
| CT05 | Listagem e KPIs | integração (DOM + mock) | CA05 | Mock retorna linhas pagas/pendentes | Badges e totais corretos |
| CT06 | CSV | integração | CA06 | Exportar | Colunas preenchidas |
| CT07 | Nº Documento persistido | integração | CA07 | Salvar e reabrir edição | Valor exibido |
| CT08 | Anexo privado | manual | CA08 | Upload e acesso com e sem assinatura | Só a URL assinada funciona |
| CT09 | Sangria → despesa | integração | CA09 | Registrar sangria | Despesa `origem='sangria'` criada |
| CT10 | Edição de despesa paga | integração + manual (SQL) | CA10 | Editar com e sem permissão | Bloqueio / log de auditoria |
| CT11 | Valor inválido | integração | CA11 | Submeter valor 0 | Nenhuma chamada ao mock |
| CT12 | Contrato de colunas | unit | RNF02 | Comparar chaves do payload com a lista de colunas | Nenhuma chave desconhecida |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md`, `supabase/diagnostico_schema_producao.sql`
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs concluídas (2026-10-20)
- Referências de design: N/A
- Requisitos originais: CAF-000035
- Issue / PR relacionado: —
