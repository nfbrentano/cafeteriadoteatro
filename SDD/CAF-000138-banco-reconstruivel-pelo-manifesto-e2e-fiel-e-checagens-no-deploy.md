# [CHORE] Banco reconstruível pelo manifesto, E2E fiel à produção, pgTAP que roda de verdade e checagem de migrations no deploy

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer com que um banco vazio, recebendo só as migrations do manifesto, fique igual ao de produção; fazer o E2E e o pgTAP rodarem sobre esse banco sem remendos; e impedir que o site seja publicado quando produção não tiver as migrations que o front exige.
- **Problema e evidência:**
  - O manifesto não reconstrói produção. `adicionais`, `pedido_item_adicionais` (`supabase/migration_fase2.sql`), `pedido_item_sabores`, `cortesia_regras`, `promocoes`, `promocao_itens`, os triggers `validar_cortesia`, `cancelar_itens_por_pedido`, `cancelar_cortesia_em_cascata` e a RPC `promocoes_do_dia` (`supabase/migration_fase3_final.sql`) só existem em arquivos listados como `arquivos_historicos_ignorados` em `supabase/migrations.manifest.json`. O PDV chama `rpc('promocoes_do_dia')` (`js/pdv/catalogo.js:26`) e o admin chama `rpc('consolidar_contador_dia_anterior')` (`js/db.js:682`), que só existe em `supabase/contador_rotina.sql` (ignorado como "manutenção").
  - O harness do E2E remenda o banco: injeta fase2/fase3 fora do manifesto (`scripts/e2e-db.mjs:56`), troca a FK de `fechamento_id` para a tabela inexistente `fechamentos_caixa` (`scripts/e2e-db.mjs:75`), troca BIGINT por TEXT na 072 (`scripts/e2e-db.mjs:84`) e cria `pedidos.pronto_em` à mão (`scripts/e2e-db.mjs:113`).
  - Tipos divergentes: produção tem `lancar_movimento_conta(... p_fechamento_id uuid ...)` (`supabase/snapshots/producao-2026-10-22-depois.csv:13`); o repo declara `p_fechamento_id BIGINT` (`supabase/migration_caf_000034_conta_cliente.sql:54`).
  - pgcrypto: a 107 fixa `search_path = public` em todas as funções (`supabase/migration_caf_000107_hardening_supabase_advisors.sql:162-175`), mas `digest()` (`migration_caf_000040_totem.sql:141,179,263`; `migration_caf_000103_totem_animacao_fundo.sql:28`), `gen_random_bytes()` (`migration_caf_000037_qr_pedidos_cliente.sql:19,539`) e `crypt()/gen_salt()` (`migration_caf_000023_taxa_desconto.sql:56`) são chamadas sem schema. Na Supabase o pgcrypto fica no schema `extensions`; o bootstrap do E2E instala em `public` (`supabase/e2e/00_bootstrap.sql:7`), então os testes não percebem. Pode estar quebrando pareamento do totem e geração de QR em produção (D01).
  - O bootstrap do E2E usa `DEFAULT timezone('America/Sao_Paulo'::text, now())` em `acessos`/`contador` (`supabase/e2e/00_bootstrap.sql:262,270`), padrão que a CAF-000080 removeu das tabelas operacionais; não há como saber se produção é igual, pois o diagnóstico (`supabase/diagnostico_schema_producao.sql`) não exporta defaults, schema das extensões nem tabelas da publicação realtime.
  - **O pgTAP do CI nunca executou uma asserção.** `scripts/test-db-runner.js:91` roda `psql -f` num `postgres:17-alpine` vazio, sem a extensão pgtap, sem aplicar migrations e sem `ON_ERROR_STOP`. No run 43777167533 (main, 2026-11-15) todos os arquivos dão `ERROR: function plan(integer) does not exist` e o passo termina verde. Além disso, só `supabase/tests/erros_cliente.test.sql` usa `has_function_privilege`, nenhum teste usa `SET ROLE`, e `supabase/tests/pedidos_cliente.test.sql` só confere `has_function`/`has_table`.
  - Deploy: `db:migrate` é manual e o CI não confere se produção tem as migrations exigidas; o job `build-and-deploy` refaz o build (`.github/workflows/deploy.yml:110`) em vez de publicar o `dist` que passou nos testes (`:86`).
- **Impacto de não fazer:** Restauração de desastre (CAF-000116) gera um banco sem promoções, adicionais e cortesias; testes verdes que não testam nada; front publicado chamando RPC que ainda não existe em produção; defeito de schema (pgcrypto) só aparece no balcão.
- **Para quem é destinado:** Dev/mantenedor e, indiretamente, operação (barista, totem).
- **História de usuário:** Como mantenedor, quero que "suite verde" signifique "produção vai funcionar", para publicar sem conferir o banco à mão.
- **Como saberemos que deu certo:** E2E e pgTAP sem nenhum arquivo fora do manifesto e sem substituição de texto; ≥ 1 teste pgTAP falhando derruba o CI; 0 deploys com migration exigida ausente em produção.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Migration de baseline idempotente (`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`) com as tabelas, triggers e RPCs listados acima, incluindo `consolidar_contador_dia_anterior`, com colunas e tipos iguais aos de produção | P0 | CA01, CA02 |
| RF02 | Alinhar tipos ao que produção tem (`p_fechamento_id uuid`, FK válida ou removida, IDs TEXT na 072) por migration nova, sem editar migrations antigas | P0 | CA03 |
| RF03 | Remover de `scripts/e2e-db.mjs` a injeção de fase2/fase3, as substituições de texto e o `ALTER TABLE ... pronto_em` | P0 | CA03 |
| RF04 | Qualificar `extensions.digest`, `extensions.gen_random_bytes`, `extensions.crypt`, `extensions.gen_salt` nas funções afetadas (via `CREATE OR REPLACE`); bootstrap E2E e banco do CI criam pgcrypto no schema `extensions` | P0 | CA04, CA05 |
| RF05 | Runner pgTAP real: instala pgtap, aplica o manifesto no banco de teste, usa `ON_ERROR_STOP=1` (ou `pg_prove`) e falha com qualquer `not ok`, plano divergente ou erro SQL | P0 | CA06, CA07 |
| RF06 | Job `verificar-migrations-producao` antes do deploy: lê `app_migrations` de produção com credencial somente leitura (secret) e bloqueia se faltar versão do manifesto ou o checksum divergir | P0 | CA08, CA09, CA10 |
| RF07 | Ampliar `diagnostico_schema_producao.sql` (schema das extensões, defaults de colunas, tabelas da publicação `supabase_realtime`) e regenerar o snapshot a partir de produção; bootstrap E2E passa a usar os mesmos defaults | P1 | CA11 |
| RF08 | Infraestrutura pgTAP comportamental: helper para assumir `anon`/`authenticated` com claims e cargo (inclusive cargo NULL), e 3 testes-modelo (valor negativo rejeitado, `anon` sem execução, cargo NULL negado) | P1 | CA12 |
| RF09 | Deploy publica o artefato `dist` gerado e testado no job de testes, sem novo build | P1 | CA13 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A checagem de produção só executa `SELECT` em `app_migrations`; a credencial não aparece em log | P0 | CA10 |
| RNF02 | Baseline aplicada 2 vezes seguidas: 0 erros e catálogo idêntico (diff vazio) | P0 | CA02 |
| RNF03 | CI completo cresce no máximo 3 min em relação ao run de 2026-11-15 (3m39s) | P1 | CA06 |
| RNF04 | Snapshots continuam gerados só a partir de produção (regra do GEMINI.md), nunca editados à mão | P0 | CA11 |

### Dependências técnicas

- `scripts/db-migrate.mjs` (já tem `calcularDiferencasMigracao` e `--check`), `scripts/e2e-db.mjs`, `scripts/test-db-runner.js`, `.github/workflows/deploy.yml`.
- Imagem Postgres com pgtap no CI (ex.: instalar `postgresql-17-pgtap` ou usar imagem com a extensão).
- Base para CAF-000126 (privilégios de `anon`), CAF-000128, CAF-000129 e CAF-000136, que escreverão seus testes sobre esta infraestrutura.

### Recursos necessários

- Acesso ao SQL Editor de produção para rodar o diagnóstico ampliado e criar a role somente leitura do CI.
- Secret `PROD_DB_READONLY_URL` no repositório.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um banco vazio, quando aplico só as migrations do manifesto, então todas as tabelas, triggers e funções listadas existem e `SELECT * FROM promocoes_do_dia()` executa sem erro.
- [ ] **CA02:** Dado o banco já com a baseline, quando aplico a baseline de novo, então não há erro e o catálogo (colunas, funções, triggers) não muda.
- [ ] **CA03:** Dado o E2E rodando, quando listo os arquivos aplicados, então a lista é exatamente a do manifesto, sem substituição de texto, e `lancar_movimento_conta` tem `p_fechamento_id uuid` como no snapshot.
- [ ] **CA04:** Dado pgcrypto instalado só no schema `extensions`, quando gero e valido token de totem e gero `qr_token` de mesa, então as funções funcionam.
- [ ] **CA05:** Dado uma função com `search_path = public` que chama `digest(` sem schema, quando o teste de catálogo pgTAP roda, então ele falha e nomeia a função.
- [ ] **CA06:** Dado o CI, quando `test:db` roda, então todos os `.test.sql` executam sobre o banco migrado e o relatório mostra o número de asserções aprovadas (> 0).
- [ ] **CA07:** Dado um teste pgTAP com asserção falsa ou erro SQL, quando o CI roda, então o job falha (caso negativo: não pode terminar verde).
- [ ] **CA08:** Dado produção sem uma versão presente no manifesto, quando há push na main, então o deploy é bloqueado e o log lista as versões faltantes.
- [ ] **CA09:** Dado produção com checksum diferente do manifesto para uma versão, quando a checagem roda, então o deploy é bloqueado com a versão divergente.
- [ ] **CA10:** Dado o secret ausente ou inválido, quando a checagem roda, então o job falha com mensagem clara (não é pulado) e nenhum comando diferente de `SELECT` é enviado.
- [ ] **CA11:** Dado o snapshot regenerado, quando o E2E sobe, então o schema do pgcrypto e os defaults de `acessos.created_at` e `contador.created_at` são iguais aos do snapshot.
- [ ] **CA12:** Dado o helper de papel, quando assumo `anon` e chamo uma RPC restrita, então `throws_ok` com código `42501`; quando assumo usuário com cargo NULL, então a ação de admin é negada.
- [ ] **CA13:** Dado um deploy, quando publicado, então o `dist/version.json` publicado tem o mesmo `version` gerado no job de testes.

## O que a atividade não inclui

- Revogar `anon` das RPCs e corrigir autorização: motivo: é a CAF-000126; aqui só a infraestrutura de teste.
- Testes de regra de valores, cashback concorrente e estorno PEPS: motivo: pertencem a CAF-000128, CAF-000129 e CAF-000136.
- Aplicar migrations automaticamente em produção: motivo: `db:migrate` manual com backup (CAF-000116) continua sendo a política.
- Preview de PR: motivo: GitHub Pages não oferece preview por PR; exige outro host.

### Considerado para o futuro (P2)

- Migrar para o fluxo de migrations da Supabase CLI com branch de banco por PR.
- Preview de PR em host com suporte a ambientes temporários.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Em produção, em qual schema está o pgcrypto e o pareamento do totem/QR funciona hoje? (`SELECT extname, extnamespace::regnamespace FROM pg_extension`) Define se RF04 vira hotfix | dev | Não (a correção serve aos dois casos), mas responder primeiro | |
| D02 | Quem cria a role somente leitura (`GRANT SELECT ON app_migrations`) e o secret do CI? | PO | Sim | |
| D03 | As tabelas legadas em produção têm colunas além das de fase2/fase3? Depende do diagnóstico ampliado (RF07) | dev | Sim (para RF01) | |
| D04 | O bloqueio vale para todas as versões do manifesto ou só para as marcadas como exigidas pelo front? | dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Banco só com manifesto | integração (PGlite via `createE2EDatabase`) | CA01 | Subir banco e chamar `promocoes_do_dia()` | Objetos existem; RPC responde |
| CT02 | Idempotência da baseline | pgTAP | CA02 | Aplicar 2 vezes e comparar catálogo | Sem erro, diff vazio |
| CT03 | Harness sem remendos | unit (`tests/caf-000138-*.test.js`, importa `getOrderedE2EMigrationEntries`) | CA03 | Comparar entradas com o manifesto | Listas iguais |
| CT04 | Assinatura alinhada | pgTAP | CA03 | `has_function('lancar_movimento_conta', ARRAY[..., 'uuid', ...])` | Passa |
| CT05 | pgcrypto em `extensions` | pgTAP | CA04 | Gerar e validar token de totem; criar mesa | Funciona |
| CT06 | Chamada sem schema | pgTAP (consulta a `pg_proc`) | CA05 | Criar função de teste sem qualificação | Teste falha nomeando a função |
| CT07 | Runner real | integração (CI) | CA06, CA07 | Rodar suíte; depois incluir asserção falsa | Verde com contagem; vermelho com a falsa |
| CT08 | Migration faltando | unit (script de checagem com cliente simulado) | CA08, CA09 | Simular `app_migrations` sem uma versão / checksum diferente | Exit ≠ 0 com a lista |
| CT09 | Secret ausente e só leitura | unit | CA10 | Rodar sem secret; inspecionar SQL emitido | Falha clara; só `SELECT` |
| CT10 | Defaults iguais ao snapshot | integração | CA11 | Comparar `information_schema.columns` do E2E com snapshot | Iguais |
| CT11 | Helper de papel | pgTAP | CA12 | `anon` e cargo NULL chamando RPC restrita | `42501` / negado |
| CT12 | Artefato publicado | manual (Actions) | CA13 | Comparar `version.json` do artefato e do site | Iguais |

## URL Complementar

- Documentação técnica: `scripts/e2e-db.mjs`, `scripts/test-db-runner.js`, `scripts/db-migrate.mjs`, `supabase/migrations.manifest.json`, `supabase/diagnostico_schema_producao.sql`, `.github/workflows/deploy.yml`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000072](CONCLUIDAS/CAF-000072-baseline-schema-producao-e-reconciliacao-migrations.md), [CAF-000092](CONCLUIDAS/CAF-000092-testes-sql-rpcs-triggers-e-policies.md), [CAF-000098](CONCLUIDAS/CAF-000098-aplicar-migrations-em-producao-e-snapshot-real.md), [CAF-000099](CONCLUIDAS/CAF-000099-suite-de-testes-efetiva-codigo-real-contrato-e-pgtap.md), [CAF-000107](CONCLUIDAS/CAF-000107-seguranca-supabase-advisors-policies-search-path-views.md), [CAF-000116](CONCLUIDAS/CAF-000116-backup-restauracao-e-runner-de-migrations.md), [CAF-000120](CONCLUIDAS/CAF-000120-testes-e2e-fluxos-criticos-navegador-real.md); novas: CAF-000126, CAF-000128, CAF-000129, CAF-000136, CAF-000141
- Referências de design: —
- Requisitos originais: auditoria de 2026-11-20; run 43777167533 do workflow "Deploy to GitHub Pages"
- Issue / PR relacionado: —
