# [FIX] Autorização NULL-safe e revogação de `anon` nas RPCs SECURITY DEFINER

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Garantir que nenhuma RPC interna (PDV, admin, caixa, financeiro, clientes, estoque) possa ser executada por visitante anônimo ou por usuário logado sem perfil, e que ninguém consiga se cadastrar ou ser criado como administrador sem um administrador de verdade. **Severidade crítica: deve ser a primeira da fila.**
- **Problema e evidência:**
  1. **Guard que deixa NULL passar.** `get_user_role()` (`supabase/pedidos_schema.sql:18-23`) faz `SELECT role FROM public.perfis WHERE id = auth.uid()` e devolve NULL para `anon` e para quem não tem linha em `perfis`. Em SQL, `NULL NOT IN (...)`, `NULL != 'admin'` e `true AND NULL` valem NULL, e `IF NULL THEN` não entra: a função segue como se o chamador tivesse permissão. Versões vigentes (pela ordem de `supabase/migrations.manifest.json`):

     | Função | Guard vigente |
     |---|---|
     | `adicionar_itens_pedido` | `migration_caf_000028_itens_lancados_depois.sql:110` `IF v_user_role NOT IN ('barista', 'admin')` |
     | `criar_pedido` | `migration_caf_000034_conta_cliente.sql:293` (mesmo padrão) |
     | `lancar_movimento_conta` | `034:73`; e `034:116` `IF NOT p_bypass_limite OR v_role != 'admin'` (com `p_bypass_limite = true` e role NULL, o teto de crédito é ignorado) |
     | `buscar_clientes_pdv`, `obter_extrato_cliente` | `034:224`, `034:159` |
     | `obter_ficha_cliente`, `mesclar_clientes`, `anonimizar_cliente` | `migration_caf_000033_cadastro_clientes.sql:282`, `:377`, `:416` |
     | `baixar_despesa`, `get_resumo_financeiro`, `get_fluxo_caixa` | `migration_caf_000035_financeiro_despesas.sql:92`, `:167`, `:258` |
     | `get_admin_reports`, `lancar_taxas_pagamento_despesa` | `migration_caf_000039_pix_taxas.sql:425`, `:732` (`v_role != 'admin' AND NOT tem_permissao(...)`) |
     | `get_totais_caixa`, `fechar_caixa`, `get_historico_caixas` | `migration_caf_000044_caixa_fix.sql:341`, `:409`, `:538` (`NOT (tem_permissao(...) OR v_role IN (...))`) |
     | `toggle_produto_disponivel` | `migration_caf_000005.sql:240` |
     | `aprovar_pedido_cliente`, `recusar_pedido_cliente`, `regenerar_qr_token_mesa` | `migration_caf_000037_qr_pedidos_cliente.sql:454`, `:484`, `:535` |
     | `marcar_pedido_nao_retirado`, `receber_pedido_totem` | `migration_caf_000038_pedido_online.sql:540`, `migration_caf_000040_totem.sql:500` |
     | `dar_baixa_lote_vencido` | `migration_caf_000111_lotes_validade_peps_sugestao_compras.sql:170-246`: nenhum guard e nenhuma checagem de `data_validade` |
     | `processar_cashback_pedido` | `migration_caf_000076_correcao_cashback.sql:18`: sem guard de cargo (anon foi revogado em `082:479`, mas qualquer autenticado, inclusive cozinha, credita) |
     | `fechar_conta_mesa`, `registrar_pagamento_parcial_mesa` | `migration_caf_000112_fechamento_parcial_mesa.sql:355` e `:94` `IF v_user_role IS NOT NULL AND ...`: anon está revogado, mas autenticado sem perfil passa |
  2. **EXECUTE aberto.** O Postgres concede EXECUTE a `PUBLIC` em toda função nova; `GRANT ... TO authenticated` (ex.: `037:558-561`, `040:553`, `111:248`) não remove `anon`. O snapshot `supabase/snapshots/producao-2026-10-22-depois.csv` mostra `anon_exec=t` em `criar_pedido`, `adicionar_itens_pedido` e `lancar_movimento_conta`.
  3. **Criação de admin.** Convivem duas sobrecargas de `admin_create_user` (`pedidos_schema.sql:195`, 4 parâmetros; `migration_caf_000023_taxa_desconto.sql:38`, 5 parâmetros), ambas com `IF public.get_user_role() != 'admin'` (`pedidos_schema.sql:206`, `023:50`) e sem REVOKE: quem tem a chave anon (pública, está no JS do site) cria um admin. Além disso, `handle_new_user` (`023:23-35`) grava `COALESCE(new.raw_user_meta_data->>'role', 'barista')`: um `signUp` público com `data: { role: 'admin' }` nasce admin, se o cadastro público estiver ligado no Auth.
  4. **Compromisso anterior não cumprido.** A CAF-000082 (RF11/CA11) previa allowlist de `anon_exec`; o CA11 segue `[ ]`. O padrão correto já existe em `migration_caf_000113_dre_gerencial_recebiveis_metas.sql:58` e `migration_caf_000115_erros_cliente.sql:139` (`COALESCE(v_role, '') != 'admin'` + REVOKE).
  5. `consolidar_contador_dia_anterior` (`supabase/contador_rotina.sql:51`, SECURITY DEFINER) tem GRANT a anon (`:88`) e é chamada pela Action com a chave anon (`.github/workflows/contador_diario.yml:28-30`) e pelo site (`js/db.js:682`).
- **Impacto de não fazer:** Qualquer pessoa na internet pode criar um usuário admin, colocar crédito na carteira de qualquer cliente, ler ficha, extrato e telefone de clientes, anonimizar ou mesclar cadastros, ler DRE e fluxo de caixa, fechar o caixa e zerar lotes de estoque. Risco de fraude, vazamento de dados pessoais (LGPD) e perda de dados.
- **Para quem é destinado:** Dono (Natanael), clientes cadastrados (dados pessoais) e equipe.
- **História de usuário:** Como dono, quero que só a equipe autenticada e com o cargo certo execute operações internas, para que ninguém de fora mexa em dinheiro, clientes ou usuários.
- **Como saberemos que deu certo:** Consulta de privilégios em produção retorna 0 funções SECURITY DEFINER do schema `public` com EXECUTE para `anon` fora da allowlist; 0 guards no padrão `get_user_role() != / NOT IN` sem `COALESCE` nas versões vigentes.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar helper `public.exigir_cargo(VARIADIC p_cargos TEXT[])` (ou `exigir_permissao(p_permissao TEXT)`) que lança `42501` quando `auth.uid()` é NULL, quando não existe perfil ativo ou quando o cargo/permissão não confere; NULL nunca é tratado como permitido | P0 | CA01, CA02 |
| RF02 | Reescrever os guards de todas as funções da tabela acima para usar o helper (ou `COALESCE(v_role, '')`), incluindo `fechar_conta_mesa` e `registrar_pagamento_parcial_mesa` (perfil obrigatório) e o `p_bypass_limite` de `lancar_movimento_conta` | P0 | CA01, CA02, CA03 |
| RF03 | Bloco `DO` que revoga EXECUTE de `anon` e `PUBLIC` de toda função `prosecdef = true` do schema `public`, exceto a allowlist pública explícita (RF04), e concede a `authenticated`; `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM anon, public` para funções futuras | P0 | CA04, CA05 |
| RF04 | Allowlist pública documentada nesta SDD e em tabela `public.rpc_allowlist_anon` (ou constante no teste): `criar_pedido_cliente`, `consultar_status_pedido_cliente`, `chamar_atendente_mesa`, `criar_pedido_online`, `consultar_janelas_ocupadas_online`, `parear_totem`, `validar_sessao_totem`, `criar_pedido_totem`, `consultar_pedido_avaliacao`, `registrar_avaliacao`, `validar_cupom`, `validar_e_calcular_combo`, `registrar_erro_cliente`, `registrar_evento_cardapio`, `get_user_role`, `tem_permissao` (usadas dentro de policies avaliadas como anon; devolvem NULL/false) e, temporariamente, `consolidar_contador_dia_anterior` (até a CAF-000141) | P0 | CA05, CA06 |
| RF05 | `DROP FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT)` (sobrecarga antiga); a de 5 parâmetros passa a exigir admin via helper e fica sem EXECUTE para anon | P0 | CA07 |
| RF06 | `handle_new_user` deixa de ler `role` e `pode_dar_desconto` do metadata: todo usuário criado pelo Auth nasce com o cargo de menor privilégio (ou inativo); só `admin_create_user` define cargo, gravando direto em `perfis` | P0 | CA08 |
| RF07 | `dar_baixa_lote_vencido` exige permissão de estoque e recusa lote com `data_validade` futura | P1 | CA09 |
| RF08 | `processar_cashback_pedido` exige cargo de caixa (`pdv.vender`) ou é chamada só internamente pelo fechamento (detalhes de regra na CAF-000129) | P1 | CA10 |
| RF09 | Teste pgTAP genérico que percorre `pg_proc` (schema `public`, `prosecdef`) e falha se `has_function_privilege('anon', oid, 'EXECUTE')` for verdadeiro fora da allowlist | P0 | CA05 |
| RF10 | Roteiro de verificação em produção, somente leitura, executado antes e depois da migration (consulta abaixo em "Recursos") | P0 | CA11 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma tela da equipe (PDV, KDS, admin) nem canal público (QR, online, totem, avaliação, TV de retirada) quebra: e2e da CAF-000120 verde | P0 | CA06 |
| RNF02 | Toda função SECURITY DEFINER alterada declara `SET search_path = public` | P0 | CA04 |
| RNF03 | Migration idempotente e com rollback em `supabase/rollback/` (CAF-000116) | P0 | CA04 |
| RNF04 | Erro de permissão devolve código `42501` e mensagem genérica, sem revelar se o registro existe | P1 | CA01 |

### Dependências técnicas

- Migration nova registrada em `supabase/migrations.manifest.json` (runner da CAF-000116).
- `tem_permissao` (`migration_caf_000036_cargos_permissoes.sql:156`).
- CAF-000138 (pgTAP de privilégios no CI) pode reaproveitar o teste do RF09; CAF-000141 tira o contador da chave anon.

### Recursos necessários

- Acesso de leitura ao SQL Editor de produção. Verificação imediata, **sem explorar a falha**:
  `SELECT p.proname, pg_get_function_identity_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE') ORDER BY 1;`
- Acesso ao painel Auth do Supabase (configuração de cadastro público).

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado uma sessão `anon`, quando chama `get_resumo_financeiro`, `obter_ficha_cliente` ou `lancar_movimento_conta`, então recebe erro de permissão e nada é lido ou gravado.
- [ ] **CA02:** Dado um usuário autenticado sem linha em `perfis`, quando chama `criar_pedido`, `fechar_conta_mesa` ou `fechar_caixa`, então recebe `42501`.
- [ ] **CA03:** Dado um barista, quando chama `lancar_movimento_conta` com `p_bypass_limite = true` acima do limite, então a operação é recusada; dado um admin, então é aceita.
- [ ] **CA04:** Dado o banco recriado pelo manifesto, quando consulto as funções SECURITY DEFINER de `public`, então todas têm `search_path` fixo e nenhuma fora da allowlist tem EXECUTE para `anon` ou `PUBLIC`.
- [ ] **CA05:** Dado que um dev cria uma função SECURITY DEFINER nova sem REVOKE, quando roda `npm run test:db`, então o teste genérico falha apontando o nome da função.
- [ ] **CA06:** Dado a migration aplicada, quando rodo o e2e (QR, online, totem, avaliação, TV de retirada, PDV, KDS, admin), então todos os fluxos passam.
- [ ] **CA07:** Dado uma sessão `anon` ou de barista, quando chama `admin_create_user`, então recebe `42501` e nenhum usuário é criado; dado um admin, então o usuário é criado com o cargo escolhido; e só existe uma assinatura da função.
- [ ] **CA08:** Dado um cadastro pelo Auth com metadata `{ "role": "admin" }`, quando o trigger cria o perfil, então o perfil não é admin.
- [ ] **CA09:** Dado um lote com validade futura, quando chamo `dar_baixa_lote_vencido`, então é recusado; dado um usuário sem permissão de estoque, então recebe `42501`.
- [ ] **CA10:** Dado um usuário de cozinha, quando chama `processar_cashback_pedido`, então recebe `42501` e nenhum crédito é lançado.
- [ ] **CA11:** Dado a consulta de privilégios em produção depois do deploy, quando executada, então só aparecem funções da allowlist.

## O que a atividade não inclui

- Leitura de tabelas por policies `USING (true)` e hash do PIN: motivo: outra iniciativa (CAF-000127).
- Validação de valores (sinais, quantidade, desconto): motivo: outra iniciativa (CAF-000128).
- Regras de cupom, horário e anti-abuso das RPCs públicas: motivo: outra iniciativa (CAF-000131).
- Mover o contador para service role: motivo: CAF-000141; aqui ele só entra na allowlist temporária.

### Considerado para o futuro (P2)

- Trocar `role` textual por cargos em todas as policies, eliminando `get_user_role()`.
- Auditoria (log) de chamadas negadas para alertas.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Desligar o cadastro público (signup) no Auth do Supabase? Nenhuma tela usa `signUp` hoje | PO | Sim | |
| D02 | Algum usuário admin foi criado sem o dono saber? Conferir `auth.users`/`perfis` criados fora do painel antes de aplicar | PO | Sim | |
| D03 | `expirar_pedidos_totem_vencidos` tem GRANT a anon (`040:552`), mas nenhum JS a chama: há rotina externa que use? Se não, sai da allowlist | dev | Não | |
| D04 | Qual o cargo padrão de quem nasce pelo Auth (RF06): "sem acesso/inativo" ou "barista"? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Anon nas RPCs internas | pgTAP | CA01 | `SET ROLE anon`; `throws_ok` em cada função da tabela | `42501` |
| CT02 | Autenticado sem perfil | pgTAP | CA02 | `SET ROLE authenticated` + `request.jwt.claims` com `sub` sem perfil | `42501` |
| CT03 | Bypass de limite | pgTAP | CA03 | Claims de barista e de admin | Recusa / aceita |
| CT04 | Varredura de privilégios | pgTAP | CA04, CA05 | Percorrer `pg_proc` com `has_function_privilege('anon', oid, 'EXECUTE')` e `proconfig` | Só allowlist; `search_path` presente |
| CT05 | Função nova sem REVOKE | pgTAP | CA05 | Criar função definer dentro da transação de teste | Varredura falha |
| CT06 | Fluxos ponta a ponta | e2e (Playwright) | CA06 | Suite `e2e/fluxos-criticos.spec.js` | Verde |
| CT07 | `admin_create_user` | pgTAP | CA07 | Anon, barista e admin; contar assinaturas em `pg_proc` | Só admin cria; 1 assinatura |
| CT08 | Metadata com role | pgTAP | CA08 | `INSERT` em `auth.users` com `raw_user_meta_data` `{"role":"admin"}` | Perfil não admin |
| CT09 | Baixa de lote | pgTAP | CA09 | Lote com validade amanhã; usuário sem permissão | Recusas |
| CT10 | Cashback por cozinha | pgTAP | CA10 | Claims de cozinha | `42501`, sem movimento |
| CT11 | Produção | manual | CA11 | Rodar a consulta de "Recursos" | Só allowlist |

## URL Complementar

- Documentação técnica: `supabase/pedidos_schema.sql`, `supabase/migration_caf_000023_taxa_desconto.sql`, `supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql`, `supabase/migration_caf_000115_erros_cliente.sql`, `supabase/snapshots/producao-2026-10-22-depois.csv`, `.github/workflows/contador_diario.yml`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000082](CONCLUIDAS/CAF-000082-seguranca-rpcs-policies-e-views-expostas.md), [CAF-000081](CONCLUIDAS/CAF-000081-seguranca-pin-permissoes-por-cargo-e-rls-operacional.md), [CAF-000107](CONCLUIDAS/CAF-000107-seguranca-supabase-advisors-policies-search-path-views.md), [CAF-000036](CONCLUIDAS/CAF-000036-permissoes-por-cargo-e-desempenho.md), [CAF-000116](CONCLUIDAS/CAF-000116-backup-restauracao-e-runner-de-migrations.md); novas: CAF-000127, CAF-000128, CAF-000129, CAF-000131, CAF-000138, CAF-000141
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
