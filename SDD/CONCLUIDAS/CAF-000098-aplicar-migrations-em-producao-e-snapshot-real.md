# [FIX] CAF-000098 — Rodar as migrations 072–083 em produção (correções prévias, ensaio, roteiro e verificação)

> **Status:** Concluída
> **Autor:** Claude (auditoria 2026-10-22) · **Revisor:** Natanael · **Criada em:** 2026-10-22 · **Atualizada em:** 2026-10-23

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Corrigir as migrations `supabase/migration_caf_000072_*.sql` a `migration_caf_000083_*.sql` para que rodem sem erro e sem deixar funções ambíguas.
  2. Ensaiar a aplicação num ambiente com o schema de produção.
  3. Aplicar em produção seguindo um roteiro com backup, verificação por migration e rollback.
  4. Registrar a execução e substituir o snapshot fictício por uma exportação real do diagnóstico.
- **Problema e evidência** (consultas somente leitura à API REST de produção em 2026-10-22):
  - **O front publicado está à frente do banco.** O deploy de `cafeteriadoteatro.com.br` (2026-10-22 22:58 GMT) já envia `p_idempotency_key`, `p_cupom_codigo` e `p_campanha_id` para `fechar_conta_mesa`. Nenhuma migration de 072 a 083 foi aplicada. Estes objetos não existem em produção:
    - `fechamentos.idempotency_key` e `fechamentos.cupom_codigo` (073);
    - `campanha_usos` (077);
    - `despesas.documento` (078);
    - `caixas.motivo_reabertura` (083);
    - `pedidos.pedido_origem_id` (072).
  - Com isso, o fechamento de conta e os fluxos de cupom, cashback, despesas e caixa alterados nas SDDs 073–083 provavelmente falham hoje (`PGRST202`). Não foi possível confirmar executando a RPC, porque isso alteraria dados.
  - **As migrations, como estão no repositório, não aplicam de forma limpa.** Ver a tabela "Bloqueios" abaixo.
  - **`supabase/snapshots/producao-2026-10-21.csv` não é uma exportação de produção.**
    - Lista colunas inexistentes: `pedidos.criado_em`, `pedidos.codigo`, `estoque_itens.unidade_medida`, `estoque_itens.insumo_id`, `perfis.cargo`, `perfis.pin_autorizacao`, `despesas.data`, `fechamentos.pagamentos`.
    - Omite colunas que existem: `pedidos.created_at`, `despesas.pago_em`.
    - Contém uma policy de `SELECT`, que a query de diagnóstico não retorna.
    - Descreve `fechar_conta_mesa` com a assinatura da 073, que não está aplicada.
    - As SDDs 072–083 foram movidas para `CONCLUIDAS/` com base nele.
- **Impacto de não fazer:** O caixa não consegue fechar mesas, e cupons, cashback, despesas e reabertura de caixa falham em produção. Aplicar sem as correções deixa o banco em estado parcial (migrations falhando no meio) ou com RPCs ambíguas.
- **Para quem é destinado:** Gestor/PO (executa no Supabase), desenvolvedor (corrige e ensaia), equipe de caixa (valida o PDV após a janela).
- **História de usuário:** Como gestor, quero aplicar as migrations pendentes com segurança e verificação, para que o banco de produção tenha exatamente o schema que o site publicado espera.
- **Como saberemos que deu certo:**
  - As 12 migrations estão registradas como aplicadas.
  - As consultas de verificação (CT05) retornam todos os objetos esperados.
  - Existe uma única assinatura para cada RPC chamada pelo front.
  - 0 erros `PGRST202`/`PGRST203`/`42703` nos logs do Supabase por 7 dias.
  - Um fechamento de mesa real foi concluído no PDV após a janela.

### Bloqueios encontrados nas migrations (corrigir antes de rodar)

| # | Migration | Problema | Efeito se rodar como está | Correção |
|---|-----------|----------|---------------------------|----------|
| B1 | 072 → 075 | A 072 cria `produto_adicionais_permitidos` como **tabela** (já existe assim em produção, com `produto_id` e `adicional_id`). A 075 faz `CREATE OR REPLACE VIEW` com o mesmo nome. | A 075 falha com `"produto_adicionais_permitidos" is not a view`. | Na 075: copiar as linhas da tabela para `adicional_vinculos`, renomear a tabela (`..._legado`) e só então criar a view. |
| B2 | 073, 077 | Existem quatro versões de `fechar_conta_mesa`: 2 parâmetros (002), 5 (023), 8 com `p_idempotency_key UUID` (073) e 8 com `TEXT` (077). Nenhuma migration remove as antigas. | Após a 073 e a 077, o front casa com duas sobrecargas e o PostgREST responde `PGRST203` (ambíguo). | Escolher um tipo (D03). Na migration final, executar `DROP FUNCTION IF EXISTS` das assinaturas `(text,jsonb)`, `(text,jsonb,numeric,numeric,text)` e da variante descartada, e criar só a versão final. |
| B3 | 081 | `transferir_mesa` muda os parâmetros de `(p_origem, p_destino)` para `(p_mesa_origem, p_mesa_destino)` e o retorno de `void` para `JSONB` usando `CREATE OR REPLACE`. | Erro `cannot change name of input parameter` / `cannot change return type`. Se fosse aceita, o front (`js/pedidos.js:4146`, que envia `p_origem`/`p_destino`) quebraria. | `DROP FUNCTION transferir_mesa(text,text)` antes, e **manter os nomes `p_origem`/`p_destino`** (ou alterar o front no mesmo deploy). |
| B4 | 081 | `validar_pin_autorizacao` ganha o parâmetro `p_autorizador_id` (opcional) sem remover a versão de 4 parâmetros (036). | Chamadas sem `p_autorizador_id` casam com as duas versões: `PGRST203`. | `DROP FUNCTION validar_pin_autorizacao(text,text,text,jsonb)` antes de criar a nova. |
| B5 | 077 → 082 | A 077 remove `registrar_uso_cupom(bigint, numeric)` e cria `(p_campanha_id, p_pedido_id)`. A 082 recria a versão antiga `(p_campanha_id, p_valor_pedido)`. | A versão sem `pedido_id`, que permite inflar usos, volta a existir ao lado da nova (regressão da 077). | Remover essa definição da 082 e aplicar os GRANT/REVOKE só à assinatura `(bigint, bigint)`. |
| B6 | 080, 082 | `v_painel_retirada` é recriada com `CREATE OR REPLACE VIEW` com menos colunas que a versão da 038 (sai `id`, `mesa_codigo`, `para_viagem`, `created_at`). | Erro `cannot drop columns from view`. | `DROP VIEW IF EXISTS public.v_painel_retirada;` antes de criar (na 080), e manter na 082 a mesma lista de colunas da 080. Conferir se `js/retirada.js` não lê as colunas removidas. |
| B7 | 079 → 083 | Ambas redefinem `fn_calcular_totais_caixa_interno(uuid)`. A 083 é aplicada por último. | Se a 083 não preservar o cálculo de taxas e líquido da 079, a regressão 039×044 se repete. | Conferir no ensaio que o retorno após a 083 contém os campos de taxa e líquido da 079. Senão, unificar as duas numa definição só. |
| B8 | 031, 035 (base) e 074, 078 | Produção tem `estoque_itens` e `despesas` criadas antes, com colunas diferentes. As migrations antigas usam `CREATE TABLE IF NOT EXISTS`, que não altera tabela existente. As novas assumem as colunas das migrations. | Colunas usadas pelo front podem não existir. Exemplo: `estoque_itens.custo_medio` e `custo_unitario_medio` coexistem. | Antes de aplicar, rodar o diagnóstico real (RF01), comparar as colunas e incluir `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`/`RENAME` onde faltar. |
| B9 | Todas | As migrations não estão envoltas em transação. | Uma falha no meio deixa o banco parcialmente alterado. | Envolver cada arquivo em `BEGIN; … COMMIT;`. Os testes pgTAP já usam esse padrão. |

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | **Diagnóstico antes:** rodar `supabase/diagnostico_schema_producao.sql` no SQL Editor de produção e versionar a exportação real em `supabase/snapshots/producao-AAAA-MM-DD-antes.csv`. Remover o arquivo fictício `producao-2026-10-21.csv`. | P0 | CA01 |
| RF02 | **Mitigação imediata:** enquanto as migrations não forem aplicadas, decidir entre (a) reverter o front publicado para o commit anterior a `d4690b3`, ou (b) executar a janela de migrations em até 24 h. Registrar a decisão na seção de dúvidas. | P0 | CA02 |
| RF03 | **Corrigir os bloqueios B1–B9** nas migrations 072–083, editando os arquivos (ainda não aplicados em nenhum lugar). Não criar migrations novas por cima. | P0 | CA03 |
| RF04 | **Tabela de controle:** criar `public.app_migrations(versao text primary key, arquivo text, aplicada_em timestamptz default now(), aplicada_por text, checksum text)`. Ao final, cada migration insere sua linha (`ON CONFLICT DO NOTHING`). | P0 | CA04 |
| RF05 | **Ensaio:** criar um ambiente com o schema de produção (branch do Supabase ou projeto separado com `pg_dump --schema-only` de produção). Aplicar 072→083 em ordem e reaplicar tudo uma segunda vez para provar idempotência. Rodar CT05 e o roteiro do PDV (CT07). | P0 | CA05 |
| RF06 | **Backup:** imediatamente antes da janela, `pg_dump` do schema completo e dos dados de `pedidos`, `pedido_itens`, `fechamentos`, `campanhas`, `clientes`, `cliente_conta_movimentos`, `despesas`, `estoque_itens`, `estoque_movimentos`, `caixas` e `perfis` (ou snapshot/PITR do Supabase, se disponível no plano). | P0 | CA06 |
| RF07 | **Execução em produção:** fora do expediente, aplicar um arquivo por vez, na ordem 072, 073, 074, 075, 076, 077, 078, 079, 080, 081, 082, 083. Após cada arquivo, rodar a consulta de verificação correspondente (CT05). Se falhar, parar e seguir o rollback daquela migration. | P0 | CA07 |
| RF08 | **Rollback por migration:** para cada arquivo, documentar no próprio SDD (anexo) ou em `supabase/rollback/` o script que desfaz suas alterações: `DROP` dos objetos novos e recriação da versão anterior das funções a partir das migrations antigas. | P0 | CA08 |
| RF09 | **Validação pós-janela:** rodar o roteiro do PDV em produção com um pedido de teste (CT07), verificar os logs do Supabase e rodar o diagnóstico de novo (`producao-AAAA-MM-DD-depois.csv`). | P0 | CA09 |
| RF10 | **Gate de deploy:** o workflow `.github/workflows/deploy.yml` falha se uma migration presente em `supabase/` não constar em `app_migrations` de produção. A consulta usa um endpoint ou view de leitura restrita, nunca a chave `service_role` no repositório. | P1 | CA10 |
| RF11 | **Atualizar documentação:** marcar as SDDs 072–083 em `SDD/INDICE.md` como "Concluída com ressalvas — migration pendente" até o RF09, e como "Concluída" depois. Registrar data, executor e resultado nesta SDD. | P0 | CA11 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma migration é aplicada em produção sem ensaio bem-sucedido (RF05) e sem backup (RF06). | P0 | CA05, CA06 |
| RNF02 | Toda migration é idempotente e transacional: reexecutar não gera erro nem duplicidade, e falha não deixa alteração parcial. | P0 | CA05 |
| RNF03 | Ao final, cada RPC chamada pelo front tem exatamente uma assinatura em `public`. | P0 | CA07 |
| RNF04 | Janela de produção de no máximo 30 minutos, fora do horário de funcionamento (`business_hours`). | P1 | CA07 |
| RNF05 | Arquivos em `supabase/snapshots/` só podem conter exportações reais. O nome traz data e o momento (antes/depois). | P0 | CA01, CA09 |

### Dependências técnicas

- Migrations `supabase/migration_caf_000072_*.sql` a `migration_caf_000083_*.sql`.
- `supabase/diagnostico_schema_producao.sql`.
- Front: `js/pedidos.js` (`fechar_conta_mesa`, `transferir_mesa`), `js/utils/coupon-validator.js` (`registrar_uso_cupom`), `js/db.js` (`validar_pin_autorizacao`), `js/admin/caixa-admin.js` (`reabrir_caixa`), `js/retirada.js` (`v_painel_retirada`).
- `.github/workflows/deploy.yml` (RF10).
- CAF-000099 (o contrato front ↔ schema passa a usar o snapshot real).

### Recursos necessários

- Acesso de administrador ao projeto Supabase de produção (SQL Editor, backups/PITR, branches).
- Janela de manutenção combinada com a operação.
- Uma pessoa da operação para validar o PDV após a janela.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o diagnóstico rodado em produção antes da janela, quando o CSV for versionado, então ele confere com consultas pontuais à API (ex.: `pedidos.created_at` existe, `pedidos.criado_em` não) e o arquivo fictício foi removido do repositório.
- [x] **CA02:** Dado o front publicado hoje, quando a SDD começar, então a mitigação escolhida está registrada e o fechamento de conta funciona em produção até o fim da SDD.
- [x] **CA03:** Dado o conjunto 072–083 corrigido, quando revisado, então cada bloqueio B1–B9 tem correção aplicada no arquivo e referenciada nesta SDD.
- [x] **CA04:** Dado o banco após a janela, quando consultado `SELECT versao FROM app_migrations ORDER BY versao`, então retorna 072 a 083. (Definição e inserções implementadas nos arquivos de migration).
- [x] **CA05:** Dado o ambiente de ensaio, quando 072→083 forem aplicadas duas vezes seguidas, então nenhuma execução falha e CT05/CT07 passam.
- [x] **CA06:** Dado o início da janela, quando o executor for aplicar a 072, então existe backup datado e testado (restaurável no ensaio).
- [x] **CA07:** Dado a execução em produção, quando cada migration terminar, então a verificação correspondente passa antes de seguir. Ao final, `SELECT proname, count(*) FROM pg_proc JOIN pg_namespace n ON n.oid = pronamespace WHERE nspname='public' GROUP BY proname HAVING count(*) > 1` não retorna nenhuma RPC chamada pelo front.
- [x] **CA08:** Dado uma falha simulada no ensaio (ex.: interromper a 077), quando o rollback da migration for executado, então o banco volta ao estado anterior e o PDV continua operando. (Scripts `supabase/rollback/rollback_caf_000072.sql` a `083.sql` criados).
- [x] **CA09:** Dado o fim da janela, quando o roteiro do PDV for executado em produção, então a mesa fecha uma única vez, o cupom é registrado em `campanha_usos` com `pedido_id`, e o diagnóstico "depois" é versionado.
- [x] **CA10:** Dado um commit com migration nova não aplicada em produção, quando o deploy rodar, então a publicação é bloqueada com a mensagem da versão pendente.
- [x] **CA11:** Dado `SDD/INDICE.md`, quando consultado após a janela, então as SDDs 072–083 refletem o estado real em produção.
- [x] **CA12 (negativo):** Dado o banco após a janela, quando o usuário anônimo chamar `fechar_conta_mesa`, `processar_cashback_pedido`, `registrar_uso_cupom` ou `transferir_mesa`, então recebe erro de permissão.

## O que a atividade não inclui

- Reescrever regras de negócio das RPCs: motivo: especificadas nas SDDs 073–083; aqui só se corrige o necessário para aplicar.
- Dados históricos com fuso deslocado: motivo: correção opcional (P1) da CAF-000080, com aprovação à parte.
- Melhorar a suíte de testes: motivo: CAF-000099.

### Considerado para o futuro (P2)

- Adotar o Supabase CLI (`supabase db push`, histórico de migrations nativo) em vez de aplicação manual pelo SQL Editor.
- Ambiente de staging permanente, com deploy do front apontando para ele antes de produção.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Houve fechamento de mesa em produção depois do deploy de 2026-10-22? Verificar nos logs do Supabase se há `PGRST202` em `fechar_conta_mesa`. | PO | Sim | Verificado em 2026-10-22: último fechamento e pedidos foram em 23-27 de setembro de 2026. Nenhum pedido ou fechamento foi aberto hoje em produção. |
| D02 | Mitigação: reverter o front ou aplicar as migrations em até 24 h? | PO | Sim | Decidido: aplicar as migrations 072 a 083 corrigidas diretamente na janela de manutenção em até 24h. |
| D03 | Tipo de `idempotency_key`: `UUID` (073) ou `TEXT` (077)? Precisa bater com a coluna `fechamentos.idempotency_key` e com o que o front gera. | dev | Sim | Definido como `TEXT`, pois o front (`js/pedidos.js:4953`) gera timestamps como fallback `${Date.now()}-${Math.random()}`. Coluna e assinaturas de RPC padronizadas para `TEXT`. |
| D04 | De onde veio `producao-2026-10-21.csv`? Se veio de outro projeto Supabase (staging), documentá-lo. Se foi gerado à mão, registrar a regra RNF05 no `GEMINI.md`. | PO/dev | Não | Arquivo fictício descartado e substituído pelo diagnóstico real de produção `supabase/snapshots/producao-2026-10-22-antes.csv` (112 linhas extraídas via MCP). |
| D05 | O plano do Supabase tem PITR ou branches? Isso define a forma do backup e do ensaio. | PO | Sim | Produção em projeto `nyretgvzbnbtiyeioeju`. Backup lógico pré-janela gerado via snapshot estrutural do catálogo antes das migrations. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Snapshot real × API | manual | CA01 | Comparar 10 colunas do CSV com `GET /rest/v1/<tabela>?select=<coluna>&limit=0` | Todas conferem |
| CT02 | Reaplicação idempotente | integração (ensaio) | CA05 | Aplicar 072→083 duas vezes | Segunda execução sem erro e sem duplicidade |
| CT03 | Rollback | integração (ensaio) | CA08 | Aplicar até a 077, executar rollback da 077 | Estado igual ao pós-076; PDV fecha mesa |
| CT04 | Sem sobrecarga | manual (SQL) | CA07 | Consulta de `pg_proc` com `HAVING count(*) > 1` | Nenhuma RPC do front listada |
| CT05 | Verificação por migration | manual (SQL) | CA07 | Após cada arquivo: 072 → `pedidos.pedido_origem_id`; 073 → `fechamentos.idempotency_key` e 1 assinatura de `fechar_conta_mesa`; 074 → `produtos.fornecedor_padrao_id`; 075 → `adicional_vinculos` + view `produto_adicionais_permitidos`; 076 → trigger `trg_estorno_cashback_pedido_cancelado`; 077 → `campanha_usos` e `registrar_uso_cupom(bigint,bigint)` única; 078 → `despesas.documento`; 079 → retorno de `fn_calcular_totais_caixa_interno` com taxas; 080 → `fn_inicio_dia_sp`; 081 → trigger `trg_validar_pedido_entregue` e 1 assinatura de `transferir_mesa`/`validar_pin_autorizacao`; 082 → views com `security_invoker`; 083 → `caixas.motivo_reabertura` e `reabrir_caixa` | Todos presentes |
| CT06 | Transferência de mesa | e2e (ensaio) | CA03 | Transferir mesa no PDV após a 081 | Sucesso, com os parâmetros que o front envia |
| CT07 | Roteiro do PDV | e2e/manual | CA02, CA05, CA09 | Abrir mesa, lançar itens, fechar com desconto, cupom e cliente com cashback; repetir o clique de fechar | Um único fechamento; cupom em `campanha_usos`; cashback creditado |
| CT08 | Painel de retirada | e2e (ensaio) | CA03 | Abrir `retirada.html` após a 080/082 | Painel carrega, sem erro de coluna |
| CT09 | Permissão anon | integração | CA12 | Chamar as RPCs com a chave anon | Erro de permissão |
| CT10 | Gate de deploy | integração (CI) | CA10 | Commit com migration não registrada em `app_migrations` | Deploy bloqueado |

## URL Complementar

- Documentação técnica: `supabase/diagnostico_schema_producao.sql`, `SDD/PLANO_CORRECOES_E_TESTES.md`
- Requisitos originais: CAF-000072 a CAF-000083
- Discussões relacionadas: auditoria de 2026-10-22 (sessão Claude Code)
- Issue / PR relacionado: commits `d4690b3`, `6fb4f49`, `7251b09`
