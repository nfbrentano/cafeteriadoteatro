# [CHORE] CAF-000092 — Testes SQL Automatizados das RPCs, Triggers e Policies (pgTAP em Banco Isolado)

> **Status:** Em revisão
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Criar uma suíte de testes SQL automatizados com **pgTAP**, ou SQL de asserção com `RAISE EXCEPTION`, para as regras de negócio que vivem no banco: RPCs, triggers, constraints e policies RLS. A suíte roda em um banco **isolado**: Supabase local (CLI + Docker) no CI ou uma branch de preview do Supabase. Esse banco é montado com o baseline do schema de produção (CAF-000072) e as migrations versionadas. A suíte entra no CI em um job separado e **nunca roda contra produção**.
- **Problema e evidência:** A auditoria de 2026-10-20 mostrou que os bugs mais graves estão no contrato entre o front e o banco, e que nenhum teste os detecta:
  - O front chama `fechar_conta_mesa` com `p_subtotal`/`p_desconto`, mas a assinatura versionada (`migration_caf_000023:86`) espera `p_desconto_manual`. A soma também inclui pedidos cancelados e não há `FOR UPDATE` nem idempotência.
  - As versões de `criar_pedido` posteriores à 020 deixaram de validar adicionais permitidos.
  - Produção tem tabelas e colunas que não estão versionadas: `produto_adicionais_permitidos` e a dupla `custo_medio`/`custo_unitario_medio` em `estoque_itens`.
  - `processar_cashback_pedido` e `registrar_uso_cupom` estão liberadas para anon e não são idempotentes.
  - `pedido_impressoes`, `mesa_chamados` e `estoque_movimentos` aceitam escrita ampla.
  - As views `v_clientes_rfv`/`v_cliente_saldo` não usam `security_invoker`.
  - A 044 sobrescreve `fn_calcular_totais_caixa_interno` sem as taxas da 039.
  - Timestamps são gravados com `timezone('America/Sao_Paulo', now())` em colunas `timestamptz`.

  Os testes atuais em Vitest usam mock em memória e não conseguem pegar nenhum desses problemas.
- **Impacto de não fazer:** Erros de dinheiro (fechamento, caixa, cashback, cupom, custo) e de segurança (dados pessoais, crédito indevido) continuam chegando a produção, e as correções das CAF-000073 a 083 não ficam protegidas contra regressão.
- **Para quem é destinado:** Desenvolvedor / agente de IA que escreve migrations; PO e gestor financeiro, que dependem de caixa e custo corretos.
- **História de usuário:** Como responsável pelo produto, quero que toda migration seja validada automaticamente por testes SQL que exercitam as RPCs, os triggers e as permissões de cada papel em um banco descartável, para que nenhuma mudança de schema quebre o fechamento de conta, o caixa ou a segurança dos dados dos clientes.
- **Como saberemos que deu certo:**
  - `npm run test:db` (ou `supabase test db`) cria o banco, aplica baseline + migrations e roda todas as asserções em menos de 5 min no CI, terminando com código 0.
  - Cada RPC e trigger listado no RF03 tem pelo menos 1 teste positivo e 1 negativo.
  - Para cada papel (anon, cozinha, barista e admin) existe uma matriz de permissões testada.
  - Reverter a correção de qualquer SDD 073–083 faz pelo menos um teste falhar.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Configurar o ambiente de banco isolado: `supabase/config.toml` + `supabase start` (CLI + Docker), ou uma branch de preview do Supabase como alternativa. Aplicar o **baseline de produção da CAF-000072**, depois as migrations em ordem determinística, e por fim um seed de teste com produtos, categorias, adicionais e vínculos, mesas, usuários de cada papel e configurações | P0 | CA01 |
| RF02 | Estrutura `supabase/tests/*.test.sql` com pgTAP (`plan`, `ok`, `is`, `throws_ok`, `lives_ok`, `results_eq`), cada arquivo em transação com `ROLLBACK`, e helpers para simular papéis (`set local role authenticated; set local request.jwt.claims = '{...}'`) | P0 | CA01, CA09 |
| RF03 | Testes das RPCs e triggers críticos: `fechar_conta_mesa`, `criar_pedido` (adicionais permitidos e negados), `adicionar_itens_pedido`, `cancelar_item`, `transferir_mesa`, triggers de estoque e custo médio (031) e de custo do pedido (`trg_gravar_custo_pedido_item`, 032), `fn_calcular_totais_caixa_interno` e o fluxo de caixa cego (044), `processar_cashback_pedido` e `registrar_uso_cupom` (idempotência), `lancar_movimento_conta` (limite de fiado, 034) | P0 | CA02 a CA08 |
| RF04 | Matriz de **RLS por papel** (anon, cozinha, barista, admin) para `pedidos`, `pedido_itens`, `clientes`, `despesas`, `estoque_movimentos`, `pedido_impressoes`, `mesa_chamados`, `campanhas`/tags, além das views `v_clientes_rfv` e `v_cliente_saldo` | P0 | CA09 |
| RF05 | **Testes de contrato do catálogo**: as assinaturas das RPCs chamadas pelo front (lista extraída pela CAF-000086 em `tests/fixtures/schema-snapshot.json`) existem no banco com os mesmos nomes de parâmetros; nenhuma função ou tabela referenciada em migration deixa de existir | P0 | CA10 |
| RF06 | Testes de **fuso horário**: com o servidor em UTC, `created_at`, `pronto_em`, `concluido_em` e `impresso_em` gravam o instante correto, e o "corte do dia" de São Paulo (pedidos do PDV, painel de retirada, caixa) inclui um pedido às 22h locais no mesmo dia | P0 | CA11 |
| RF07 | Job **`db-tests`** no GitHub Actions, separado do `build-and-deploy` existente: sobe o Supabase local, aplica o schema e roda `supabase test db`. Em PR é obrigatório; no deploy da `main`, `build-and-deploy` depende (`needs`) do `db-tests` | P0 | CA12 |
| RF08 | Bugs conhecidos que ainda não foram corrigidos entram como teste marcado `TODO` do pgTAP (`todo('CAF-0000NN', n)`), apontando a SDD de correção, e não quebram o CI até ela ser entregue | P0 | CA13 |
| RF09 | Teste de **concorrência** do fechamento de conta: duas chamadas simultâneas de `fechar_conta_mesa` para a mesma mesa resultam em um único fechamento (via `dblink` ou script com 2 conexões no CI) | P1 | CA14 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | **Proibido** apontar a suíte para `nyretgvzbnbtiyeioeju.supabase.co`. O script de teste aborta se a URL ou a connection string não for `localhost`/`127.0.0.1` ou o host de uma branch de preview explicitamente configurada; um teste valida essa trava | P0 | CA15 |
| RNF02 | Nenhuma credencial `service_role` ou senha de produção no repositório ou no CI. A branch de preview, se usada, recebe credenciais via `secrets` do GitHub e é descartada ao fim do job | P0 | CA15 |
| RNF03 | Os testes são independentes e idempotentes: cada arquivo roda em transação com rollback e pode ser executado isoladamente e em qualquer ordem | P0 | CA01 |
| RNF04 | O job `db-tests` conclui em menos de 5 min (com cache da imagem Docker do Supabase) | P1 | CA12 |
| RNF05 | O servidor de teste roda em `TimeZone = 'UTC'` para reproduzir o ambiente real do Supabase Cloud | P0 | CA11 |

### Dependências técnicas

- **CAF-000072** (baseline/reconciliação do schema de produção): é bloqueante. Sem ela, o banco de teste não reflete produção.
- **CAF-000086**: snapshot de contrato `tests/fixtures/schema-snapshot.json` e script `test:coverage`.
- SDDs de correção cujos comportamentos os testes fixam: **073** (fechamento), **074** (estoque/ficha), **075** (adicionais), **076** (cashback), **077** (cupons), **078** (financeiro), **079** (Pix/caixa), **080** (fuso/corte do dia), **081** (PIN/permissões), **082** (segurança de RPC/views), **083** (pendências de operação/caixa).
- Ferramentas: Supabase CLI, Docker no runner do CI (`ubuntu-latest` já tem), extensão `pgtap` (disponível no Supabase), `supabase/diagnostico_schema_producao.sql` como referência do estado real.

### Recursos necessários

- Saída do `supabase/diagnostico_schema_producao.sql` rodado em produção, ou um `pg_dump --schema-only` feito pelo responsável, para montar o baseline da 072.
- Decisão do PO/dev entre Supabase local (Docker) e branch de preview (plano pago).
- Usuários de teste por papel criados no seed (`auth.users` + `perfis`), sem dados reais.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o repositório limpo, quando o desenvolvedor roda `npm run test:db`, então o Supabase local sobe, aplica baseline + migrations + seed sem erro e executa todos os arquivos `supabase/tests/*.test.sql`. Cada arquivo roda isolado em transação e o comando retorna 0 quando tudo passa.
- [ ] **CA02 (fechamento):** Dada uma mesa com 2 pedidos pendentes e 1 cancelado, quando `fechar_conta_mesa` é chamada com os parâmetros que o front envia, então:
  - o total ignora o cancelado e aplica taxa de serviço e desconto manual;
  - a soma dos pagamentos precisa bater com o total;
  - os pedidos passam para pago e um registro é criado em `fechamentos`.

  Pagamento menor que o total → `throws_ok`. Mesa já fechada → erro ou no-op idempotente. A divergência de parâmetros e a soma de cancelados ficam como `todo` → CAF-000073.
- [ ] **CA03 (pedido e adicionais):** Dado um Cappuccino sem vínculo com Cheddar, quando `criar_pedido` (e `adicionar_itens_pedido`) recebe Cappuccino + Cheddar, então a RPC rejeita. Com um adicional vinculado, aceita e grava `pedido_item_adicionais` com o preço correto. Produto esgotado (`disponivel=false`) é rejeitado. Pendente até a correção: `todo` → CAF-000075.
- [ ] **CA04 (cancelar e transferir):** Dado um item de pedido, quando `cancelar_item` é chamada sem motivo ou por um papel não autorizado, então falha. Com motivo e por barista/admin, o item é marcado cancelado e o total do pedido é recalculado. `transferir_mesa` move os pedidos pendentes da mesa A para a B e registra auditoria; um papel sem permissão recebe erro.
- [ ] **CA05 (estoque e custo):** Dado um insumo com saldo 10 a R$ 1,50, quando entra uma movimentação de 20 a R$ 2,00, então o custo médio vai para R$ 1,83 (±0,01) e o saldo para 30. A ficha técnica, `fn_calcular_custo_produto`, passa a usar esse custo. Ao inserir em `pedido_itens`, o trigger grava `custo_unitario` sem erro. A divergência `custo_medio`/`custo_unitario_medio` fica como `todo` → CAF-000074.
- [ ] **CA06 (caixa):** Dado um caixa aberto com vendas em dinheiro, Pix e cartão, sangria e suprimento, quando `fn_calcular_totais_caixa_interno` roda, então os totais por forma, as taxas de pagamento (039) e o líquido estão corretos. No caixa cego, a diferença declarado × esperado só fica visível ao admin. Não é possível abrir dois caixas ao mesmo tempo. Taxas perdidas pela 044 → `todo` → CAF-000079.
- [ ] **CA07 (cashback e cupom):** Dado um pedido pago de cliente identificado, quando `processar_cashback_pedido` é chamada duas vezes para o mesmo pedido, então o saldo é creditado uma vez só. Com `p_pedido_id` NULL, a chamada é rejeitada. Como anon, sem permissão. `registrar_uso_cupom` duas vezes para o mesmo pedido conta 1 uso. Cupom esgotado é rejeitado. Pendentes: `todo` → CAF-000076 / CAF-000077.
- [ ] **CA08 (conta do cliente):** Dado um cliente com limite de fiado de R$ 100, quando `lancar_movimento_conta` lança um débito que ultrapassa o limite, então falha. Duas chamadas concorrentes não furam o limite (`FOR UPDATE`). Um estorno restaura o saldo. Depósitos aparecem no caixa do dia: `todo` → CAF-000083.
- [ ] **CA09 (RLS por papel):** Dada a matriz papel × tabela/view × operação definida nesta SDD, quando cada papel tenta cada operação, então o resultado é o esperado. Em especial:
  - anon não lê `clientes` nem as views `v_clientes_rfv`/`v_cliente_saldo`;
  - anon não insere em `pedido_impressoes`;
  - cozinha não marca pedido como entregue nem lança entrada em `estoque_movimentos`;
  - barista sem a permissão revogada não acessa `despesas`.

  Divergências atuais → `todo` → CAF-000081 / CAF-000082.
- [ ] **CA10 (contrato):** Dado o snapshot `tests/fixtures/schema-snapshot.json` com as RPCs, parâmetros e colunas usados pelo front, quando o teste de catálogo roda (`has_function`, `has_column`, `function_args`), então cada item existe no banco com o mesmo nome. Qualquer divergência falha com a lista dos itens ausentes.
- [ ] **CA11 (fuso):** Dado o servidor em UTC e o relógio de teste fixado em 2026-10-20 22:00 de São Paulo (01:00 UTC de 21/10), quando um pedido é criado, então `created_at` corresponde a esse instante, sem deslocamento de 3h, e as consultas de "pedidos do dia", do painel de retirada e do caixa o atribuem a 20/10. Pendente: `todo` → CAF-000080.
- [ ] **CA12 (CI):** Dado um PR que altere `supabase/**`, quando o GitHub Actions roda, então o job `db-tests` executa e bloqueia o merge se falhar. Na `main`, o `build-and-deploy` só roda depois do `db-tests` verde.
- [ ] **CA13 (bugs conhecidos):** Dado um teste que expõe um bug já registrado, quando a suíte roda, então ele aparece como TODO com a referência à SDD de correção e não falha o job. Quando a SDD de correção é entregue, o TODO é removido e o teste passa.
- [ ] **CA14 (concorrência, P1):** Dadas duas sessões chamando `fechar_conta_mesa` ao mesmo tempo para a mesma mesa, quando ambas terminam, então existe um único registro em `fechamentos` e a segunda recebe erro ou resultado idempotente.
- [ ] **CA15 (proteção de produção):** Dada uma variável de ambiente apontando para o host de produção, quando `npm run test:db` é executado, então o script aborta antes de qualquer conexão, com a mensagem "testes SQL só rodam em banco local/preview".

## O que a atividade não inclui

- Corrigir as RPCs, triggers ou policies: motivo: cada correção tem sua SDD (073 a 083). Esta SDD só cria a rede de proteção e os testes TODO.
- Montar o baseline do schema de produção: motivo: é escopo da CAF-000072, da qual esta depende.
- Testes de carga/performance do banco: motivo: geram custo e não validam regra de negócio.
- Testes de Edge Functions ou de integrações externas (NFC-e, iFood, TEF): motivo: ainda não existem no projeto.

### Considerado para o futuro (P2)

- Relatório de cobertura de funções SQL (quais funções públicas não têm teste) publicado no CI.
- Teste automático de "drift": comparar periodicamente o schema de produção (via diagnóstico somente leitura) com o baseline + migrations e abrir alerta se divergir.
- Testes de RLS gerados automaticamente a partir de uma matriz declarativa em YAML.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Supabase local com Docker no CI ou branch de preview (custo do plano)? | PO / dev | Sim | Proposta: Supabase local (sem custo) |
| D02 | Qual a matriz oficial de permissões por papel (anon, cozinha, barista, gerente, admin)? A CAF-000036 não fecha todas as combinações. | PO | Sim (para CA09) | Será definida na CAF-000081 |
| D03 | Fechar uma mesa já fechada deve gerar erro ou ser no-op idempotente? | PO | Não | Proposta: idempotente com a mesma chave |
| D04 | Quem gera o `pg_dump --schema-only` de produção para o baseline? | Natanael | Sim | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Subida do ambiente | Integração (SQL) | CA01 | `npm run test:db` em máquina limpa | Baseline + migrations + seed aplicados; exit 0 |
| CT02 | Fechamento excluindo cancelados | Integração (SQL) | CA02 | Seed com 2 pendentes + 1 cancelado; chamar a RPC | Total sem o cancelado (TODO → 073) |
| CT03 | Pagamento insuficiente | Integração (SQL, negativo) | CA02 | Pagamentos < total | `throws_ok` |
| CT04 | Adicional não vinculado | Integração (SQL, negativo) | CA03 | `criar_pedido` Cappuccino + Cheddar | Rejeitado (TODO → 075) |
| CT05 | Produto esgotado | Integração (SQL, negativo) | CA03 | `disponivel=false`; criar pedido | Rejeitado |
| CT06 | Cancelar item sem motivo / como cozinha | Integração (SQL, negativo) | CA04 | Chamar com claims de cozinha | Erro de permissão |
| CT07 | Transferir mesa | Integração (SQL) | CA04 | A→B com 2 pedidos | Pedidos em B; log de auditoria |
| CT08 | Custo médio ponderado | Integração (SQL) | CA05 | 10 × 1,50 + 20 × 2,00 | 1,83 e saldo 30 |
| CT09 | Trigger de custo no pedido | Integração (SQL) | CA05 | Inserir `pedido_itens` de produto com ficha | `custo_unitario` preenchido, sem erro (TODO → 074) |
| CT10 | Totais do caixa com taxas | Integração (SQL) | CA06 | Vendas mistas + sangria | Totais, taxas e líquido corretos (TODO → 079) |
| CT11 | Dois caixas abertos | Integração (SQL, negativo) | CA06 | Abrir o segundo caixa | Erro |
| CT12 | Cashback idempotente | Integração (SQL) | CA07 | Chamar 2× o mesmo pedido | Crédito 1× (TODO → 076) |
| CT13 | Cashback/cupom como anon | Integração (SQL, negativo) | CA07, CA09 | `set role anon`; chamar as RPCs | Sem permissão (TODO → 082) |
| CT14 | Limite de fiado | Integração (SQL, negativo) | CA08 | Débito acima do limite | Erro |
| CT15 | Matriz RLS | Integração (SQL) | CA09 | Loop papel × tabela × operação | Resultado igual à matriz |
| CT16 | Contrato do catálogo | Integração (SQL) | CA10 | `has_function`/`function_args` para cada item do snapshot | Todos presentes |
| CT17 | Pedido às 22h de São Paulo | Integração (SQL) | CA11 | Fixar o horário; criar pedido; consultar o dia | Atribuído a 20/10 (TODO → 080) |
| CT18 | Gate no CI | Integração (CI) | CA12 | PR alterando migration com teste quebrado | Job `db-tests` vermelho bloqueia o merge |
| CT19 | Fechamento concorrente | Integração (SQL, 2 conexões) | CA14 | 2 chamadas simultâneas | 1 fechamento |
| CT20 | Trava de produção | Unit (script) | CA15 | `SUPABASE_DB_URL` com host de produção | Aborta antes de conectar |

### Matriz SDD-alvo → CAs originais → tipo de teste → arquivo

| SDD-alvo | CAs originais cobertos (lado servidor) | Tipo | Arquivo | Bug conhecido (SDD de correção) |
|---|---|---|---|---|
| CAF-000001 Status entregue | Só barista/admin marcam entregue | RLS | `supabase/tests/rls_pedidos.test.sql` | Cozinha pode marcar → 081 |
| CAF-000002/012/013 Fechamento, divisão, taxa/desconto | Total, pagamentos, taxa, desconto, idempotência | RPC | `supabase/tests/fechar_conta_mesa.test.sql` | Parâmetros, cancelados, lock → 073 |
| CAF-000004 Cancelar item | Motivo, papel, recálculo | RPC | `supabase/tests/cancelar_item.test.sql` | Sem checagem de papel → 081 |
| CAF-000005/024 Adicionar itens | Itens novos e validação | RPC | `supabase/tests/adicionar_itens_pedido.test.sql` | Tabela não versionada → 072/075 |
| CAF-000006/020b Esgotado e adicionais | Rejeição no servidor | RPC | `supabase/tests/criar_pedido.test.sql` | Validação perdida → 075 |
| CAF-000011 Transferir/juntar mesas | Transferência e permissão | RPC | `supabase/tests/transferir_mesa.test.sql` | Não é SECURITY DEFINER → 082 |
| CAF-000015/044 Caixa e caixa cego | Totais, um caixa aberto, cego | Função | `supabase/tests/caixa.test.sql` | Taxas perdidas → 079 |
| CAF-000019 Log de auditoria | Triggers de auditoria gravam o diff | Trigger | `supabase/tests/auditoria.test.sql` | — |
| CAF-000028 Impressão por estação | Trava sem duplicar; INSERT restrito | RPC + RLS | `supabase/tests/impressao.test.sql` | anon insere → 082 |
| CAF-000031/032/068 Estoque, ficha e compras | Custo médio, trigger de custo, entrada | Trigger | `supabase/tests/estoque_custo.test.sql` | Colunas divergentes → 074 |
| CAF-000033/041 Clientes e CRM | RLS e views de dados pessoais | RLS + view | `supabase/tests/rls_clientes.test.sql` | Views sem invoker → 082 |
| CAF-000034 Conta do cliente | Limite, lock, estorno | RPC | `supabase/tests/conta_cliente.test.sql` | Caixa não recebe depósitos → 083 |
| CAF-000035 Despesas | Constraints e RLS | Tabela + RLS | `supabase/tests/despesas.test.sql` | Campos/recorrência → 078 |
| CAF-000036 Permissões e PIN | Bloqueio após 5 erros, `tem_permissao` | RPC + RLS | `supabase/tests/permissoes_pin.test.sql` | Sem bloqueio, OR de papel → 081 |
| CAF-000037/038/040 QR, online, totem | `business_hours`, mesa válida, expiração | RPC | `supabase/tests/pedidos_cliente.test.sql` | Horário só no front → 082 |
| CAF-000061 Cupons | Uso único por pedido; anon | RPC | `supabase/tests/cupons.test.sql` | → 077 |
| CAF-000063 Cashback | Idempotência; anon | RPC | `supabase/tests/cashback.test.sql` | → 076 |
| CAF-000003/014/027 Corte do dia e relatórios | Fuso e recorte diário | Função/view | `supabase/tests/fuso_corte_dia.test.sql` | → 080 |
| Contrato front↔banco | Todas as RPCs e colunas do snapshot | Catálogo | `supabase/tests/contrato_catalogo.test.sql` | Qualquer drift |

## URL Complementar

- Documentação técnica: Supabase CLI `supabase test db` (pgTAP); `supabase/diagnostico_schema_producao.sql`; `.github/workflows/deploy.yml`
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs de 2026-10-20 e sondagem somente leitura do banco de produção (colunas/tabelas não versionadas)
- Referências de design: N/A
- Requisitos originais: SDDs CAF-000001 a 044, 061, 063 e 068 em `SDD/CONCLUIDAS/`
- Issue / PR relacionado: depende de CAF-000072 e CAF-000086
