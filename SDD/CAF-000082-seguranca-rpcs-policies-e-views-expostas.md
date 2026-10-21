# [FIX] CAF-000082 — Segurança: RPCs, policies e views expostas a anônimos e a qualquer autenticado

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fechar as superfícies de escrita e de leitura indevidas que a auditoria de 2026-10-20 encontrou nas migrations. O trabalho cobre RPCs liberadas para `anon`, policies com `WITH CHECK (true)` ou `USING (true)` para qualquer autenticado e views `SECURITY DEFINER` (sem `security_invoker`) que expõem dados pessoais. Depois, fazer uma varredura sistemática em produção com a seção 8 de `supabase/diagnostico_schema_producao.sql`, para encontrar casos que não estão versionados.
- **Problema e evidência:**
  - **Impressão (CAF-000028):** `supabase/migration_caf_000028_tela_impressora.sql:65` dá `GRANT SELECT, INSERT ON pedido_impressoes TO authenticated, anon`. Qualquer pessoa com a chave pública pode gravar travas de impressão falsas e impedir que comandas e etiquetas saiam.
  - **Chamados de mesa (CAF-000037):** `supabase/migration_caf_000037_qr_pedidos_cliente.sql:73` cria `mesa_chamados_insert_anon ... WITH CHECK (true)`. Assim é possível inserir chamados diretamente na tabela, sem passar pela RPC `chamar_atendente_mesa` (que tem anti-spam, linha 430). Isso permite inundar o PDV com chamados falsos.
  - **Estoque (CAF-000031):** `supabase/migration_caf_000031_controle_estoque.sql:298-299` (`estoque_movimentos_insert_auth`) aceita entrada, ajuste e perda de **qualquer** usuário autenticado, inclusive `cozinha` e `barista`. O resultado altera saldo e custo médio sem controle.
  - **CRM (CAF-000041):** `supabase/migration_caf_000041_crm_campanhas.sql:29, 56, 78, 101` cria policies `FOR ALL TO authenticated` em `cliente_tags`, `cliente_tag_vinculos`, `campanhas` e `campanha_envios`. Qualquer cargo lê e altera segmentação e campanhas.
  - **Dados pessoais (LGPD, CAF-000033/034/041):** `v_clientes_rfv` (`migration_caf_000041_crm_campanhas.sql:109`, com GRANT na `:257`) e `v_cliente_saldo` (`migration_caf_000034_conta_cliente.sql:34`) não declaram `security_invoker = true`. Elas rodam com os privilégios do dono da view e ignoram a RLS de `clientes`. Na sondagem de 2026-10-20, as duas existem em produção.
  - **Painel de retirada (CAF-000027):** `v_painel_retirada` (`migration_caf_000027_painel_retirada.sql:9` e redefinida em `migration_caf_000038_pedido_online.sql:578`) é `security_invoker = false` e tem GRANT para anon. Ela expõe `id`, `mesa_codigo`, `para_viagem` e `created_at` além do mínimo (número, primeiro nome, status). O recorte "do dia" usa `CURRENT_DATE AT TIME ZONE`, que erra depois das 21h. O fallback em `js/retirada.js:218` lê `pedidos` direto como anon.
  - **RPCs públicas de pedido (CAF-000037/038):** `criar_pedido_cliente` (`migration_caf_000037:555`) e `criar_pedido_online` (`migration_caf_000038:599`) estão abertas a anon. Elas não validam `business_hours` no servidor (só o front valida, em `js/cardapio-cliente-pedido.js:112`) e não têm limite de pedidos por mesa, telefone ou janela de tempo.
  - **Menu analytics (CAF-000069):** `registrar_evento_cardapio` (`migration_caf_000069_menu_analytics.sql:20`, SECURITY DEFINER na `:34`) aceita qualquer `p_canal`, `p_tipo_evento` e `p_data` vindos do cliente. Um script consegue inflar ou retrodatar o funil.
  - **Cashback e cupom (CAF-000063/061):** `processar_cashback_pedido` (`migration_caf_000063_cashback_fidelidade.sql:47`, GRANT anon na `:150`) e `registrar_uso_cupom` (`migration_caf_000061_cupons_desconto.sql:101`, GRANT anon na `:122`) são SECURITY DEFINER e estão abertas a anon. No cashback, um `p_pedido_id` NULL pula a checagem de duplicidade e permite creditar saldo em qualquer cliente.
- **Impacto de não fazer:** fraude financeira direta (cashback e cupom), vazamento de dados pessoais com risco de sanção da LGPD, sabotagem da operação (travas de impressão e chamados falsos), estoque e custo adulterados e relatórios de conversão sem confiabilidade.
- **Para quem é destinado:** PO/dono da cafeteria (risco financeiro e LGPD) e dev responsável pelo banco.
- **História de usuário:** Como dono da cafeteria, quero que só usuários com o cargo certo e as RPCs controladas consigam gravar ou ler dados sensíveis, para não perder dinheiro com fraude nem expor dados de clientes.
- **Como saberemos que deu certo:** a seção 8 do diagnóstico em produção retorna **0** policies de escrita com `roles` contendo `anon`/`public` ou `with_check = true` fora de uma allowlist documentada. A seção 7 retorna `security_invoker=true` em todas as views com dados pessoais. A seção 1 mostra `anon_exec=false` para toda RPC que não esteja na allowlist pública.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Revogar o `INSERT` direto de `anon` e `authenticated` em `pedido_impressoes`. A gravação passa a ocorrer só pela RPC `travar_impressao_pedido`, SECURITY DEFINER, que valida o papel (`cozinha`, `barista` ou `admin`). | P0 | CA01 |
| RF02 | Remover a policy `mesa_chamados_insert_anon`. A criação de chamado fica restrita à RPC `chamar_atendente_mesa`, que mantém o anti-spam. | P0 | CA02 |
| RF03 | Restringir o `INSERT` em `estoque_movimentos`: tipos `entrada`, `ajuste` e `perda` só para quem tem a permissão de estoque (`tem_permissao('estoque')` ou admin). A baixa automática por venda continua via trigger SECURITY DEFINER. | P0 | CA03 |
| RF04 | Trocar as policies `*_auth_all` de CRM (`cliente_tags`, `cliente_tag_vinculos`, `campanhas`, `campanha_envios`) por policies baseadas na permissão `crm` ou no admin. Leitura de `campanhas` para validar cupom só via RPC `validar_cupom`. | P0 | CA04 |
| RF05 | Recriar `v_clientes_rfv`, `v_cliente_saldo` e `v_campanhas_conversao` com `WITH (security_invoker = true)` e revogar o SELECT de `anon`. | P0 | CA05 |
| RF06 | Recriar `v_painel_retirada` expondo só `numero_pedido`, `primeiro_nome`, `status` e `pronto_em`, com o recorte do dia em `America/Sao_Paulo` correto. Remover o fallback de `js/retirada.js:218`, que lê `pedidos` como anon. | P0 | CA06 |
| RF07 | Validar `business_hours` (e a pausa de pedidos online, se houver) no servidor, dentro de `criar_pedido_cliente`, `criar_pedido_online` e da RPC do totem. Fora do horário, retornar erro de negócio legível. | P0 | CA07 |
| RF08 | Limitar a taxa de criação nas RPCs públicas: no máximo N pedidos por mesa ou telefone por janela de M minutos, configurável em `site_settings`. | P1 | CA08 |
| RF09 | Em `registrar_evento_cardapio`: aceitar só `p_canal` e `p_tipo_evento` de uma lista fechada, ignorar o `p_data` vindo do cliente (usar a data de São Paulo do servidor) e validar se `p_produto_id` existe. | P1 | CA09 |
| RF10 | Revogar o `EXECUTE` de `anon` em `processar_cashback_pedido` e `registrar_uso_cupom`, tornar `p_pedido_id` obrigatório e validar a idempotência por pedido. A regra de negócio (cálculo, estorno, uso por pedido) fica nas SDDs CAF-000076 (cashback) e CAF-000077 (cupons). Esta SDD garante só a superfície de acesso. | P0 | CA10 |
| RF11 | Rodar a seção 8 de `supabase/diagnostico_schema_producao.sql` em produção, classificar cada policy de escrita aberta e cada RPC com `anon_exec=true` (corrigir ou justificar) e registrar a allowlist pública final nesta SDD. | P0 | CA11 |
| RF12 | Criar a migration `supabase/migration_caf_000082_seguranca.sql`, idempotente, aplicada depois da reconciliação de schema da CAF-000072. | P0 | CA01–CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | As telas públicas legítimas continuam funcionando sem login: cardápio, pedido por QR, pedido online, totem, painel de retirada e avaliação. | P0 | CA12 |
| RNF02 | Nenhuma view com coluna de dado pessoal (nome completo, telefone, e-mail, saldo) pode ser lida por `anon`. | P0 | CA05 |
| RNF03 | Cada RPC SECURITY DEFINER declara `SET search_path = public`. | P0 | CA11 |
| RNF04 | Toda negativa de acesso retorna erro tratável. O front mostra toast em português e nunca uma tela em branco. | P1 | CA07 |

### Dependências técnicas

- **CAF-000072** (reconciliação do schema de produção com as migrations), que precisa ser aplicada antes.
- CAF-000076 (cashback) e CAF-000077 (cupons) para a regra de negócio das RPCs do RF10.
- Funções `get_user_role()` e `tem_permissao()` (`migration_caf_000036_cargos_permissoes.sql`).
- Resultado das seções 1, 7 e 8 de `supabase/diagnostico_schema_producao.sql`, rodado em produção.
- Arquivos afetados: `js/retirada.js`, `js/cozinha.js` (trava de impressão, `:415`), `js/cardapio-cliente-pedido.js`, `js/totem.js` e `js/analytics.js`.

### Recursos necessários

- Acesso ao SQL Editor do Supabase de produção para rodar o diagnóstico e aplicar a migration.
- Um usuário de teste para cada cargo (admin, gerente, barista, cozinha), para a validação manual.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um cliente com a chave anônima, quando ele tentar `insert` em `pedido_impressoes`, então o banco retorna erro de permissão. Dado o KDS logado como `cozinha`, quando ele chamar `travar_impressao_pedido`, então a trava é gravada normalmente.
- [ ] **CA02:** Dado um cliente com a chave anônima, quando ele tentar `insert` direto em `mesa_chamados`, então recebe erro de permissão. Quando ele usar `chamar_atendente_mesa` duas vezes em menos de 60 s para a mesma mesa, então a segunda chamada retorna `repetido: true` (o anti-spam de `:428-435` existe) e só 1 linha é gravada.
- [ ] **CA03:** Dado um usuário `cozinha`, quando ele tentar lançar uma `entrada` ou `perda` em `estoque_movimentos`, então recebe erro de permissão. Dado um usuário com a permissão `estoque`, quando ele lançar uma entrada, então o saldo e o custo médio são atualizados.
- [ ] **CA04:** Dado um usuário `barista` sem a permissão `crm`, quando ele tentar ler ou alterar `campanhas` ou `cliente_tags`, então recebe 0 linhas ou erro. Dado um cliente anônimo no checkout, quando ele aplicar um cupom válido, então `validar_cupom` continua funcionando.
- [ ] **CA05:** Dado um usuário `cozinha`, quando ele fizer `select` em `v_clientes_rfv` ou `v_cliente_saldo`, então só vê o que a RLS de `clientes` permite. Dado um cliente anônimo, quando ele tentar ler essas views, então recebe erro de permissão.
- [ ] **CA06:** Dado o painel de retirada em uma TV sem login, quando ele carregar, então mostra número, primeiro nome e status dos pedidos de hoje no horário de São Paulo (inclusive pedidos feitos depois das 21h). A resposta da view não contém `id`, `mesa_codigo` nem `created_at`.
- [ ] **CA07:** Dado o horário de funcionamento fechado em `business_hours`, quando um cliente chamar `criar_pedido_cliente` ou `criar_pedido_online` direto pela API, então a RPC retorna o erro "Estamos fechados no momento" e não cria o pedido.
- [ ] **CA08:** Dado o limite configurado de 3 pedidos em 10 minutos por mesa, quando um quarto pedido for enviado pela mesma mesa dentro da janela, então a RPC recusa o pedido com uma mensagem clara.
- [ ] **CA09:** Dado um script que chama `registrar_evento_cardapio` com `p_canal='hack'` ou `p_data='2020-01-01'`, quando a chamada for executada, então o canal inválido é recusado e a data gravada é a de hoje.
- [ ] **CA10:** Dado um cliente anônimo, quando ele chamar `processar_cashback_pedido` ou `registrar_uso_cupom`, então recebe erro de permissão. Dado o PDV autenticado, quando ele fechar um pedido com cliente, então o cashback é processado uma única vez por pedido.
- [ ] **CA11:** Dado o diagnóstico rodado em produção depois da migration, quando as seções 1, 7 e 8 forem conferidas, então todo item com `anon_exec=true` ou com policy de escrita aberta consta na allowlist documentada nesta SDD, e toda RPC SECURITY DEFINER tem `search_path` fixo.
- [ ] **CA12 (negativo):** Dado o fluxo completo de cliente anônimo (cardápio → QR → pedido → acompanhamento → avaliação) e de totem, quando executado depois da migration, então nenhum passo legítimo falha por permissão.

## O que a atividade não inclui

- Regra de negócio de cashback (cálculo, estorno ao cancelar): motivo: CAF-000076.
- Regra de negócio de cupons (uso por pedido, gravação no fechamento): motivo: CAF-000077.
- Bloqueio de PIN e permissões de cargo no admin (CAF-000036): motivo: tratado na CAF-000081.
- WAF ou rate limit por IP na borda (Cloudflare): motivo: infraestrutura fora do Supabase. O RF08 cobre o limite de negócio.

### Considerado para o futuro (P2)

- Captcha invisível (Turnstile) no pedido online e no QR, se o RF08 não bastar.
- Teste automatizado de RLS com pgTAP rodando contra um Supabase local no CI.
- Alertas de anomalia (pico de pedidos ou créditos de cashback fora do padrão).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O banco de produção tem policies ou grants criados à mão que não estão nas migrations? (Depende do resultado da seção 8 do diagnóstico.) | Dev | Sim | |
| D02 | Quais RPCs entram na allowlist pública definitiva? Proposta: `validar_cupom`, `criar_pedido_cliente`, `criar_pedido_online`, `consultar_status_pedido_cliente`, `consultar_janelas_ocupadas_online`, `chamar_atendente_mesa`, RPCs do totem, `registrar_evento_cardapio` e a RPC de avaliação. | PO/Dev | Sim | |
| D03 | Valores padrão do rate limit (pedidos por mesa ou telefone por janela)? | PO | Não | |
| D04 | Algum cargo além de admin e gerente precisa ver o CRM (por exemplo, marketing terceirizado)? | PO | Não | |

## Sugestões de casos de teste

Os testes ficam em `tests/caf-000082-seguranca.test.js` e exercitam o código real:
- os helpers de `js/retirada.js` e de `js/cozinha.js` contra o mock do Supabase, conferindo que não há leitura de `pedidos` como anon nem `insert` direto;
- uma checagem estática da migration `migration_caf_000082_seguranca.sql`, que falha se encontrar `GRANT ... TO anon` fora da allowlist ou `WITH CHECK (true)`.

Os testes de RLS no banco são manuais ou feitos via diagnóstico até existir o pgTAP (P2).

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Gravação anônima em `pedido_impressoes` | Manual (SQL/REST) + unit | CA01 | Fazer POST REST com a chave anon em `pedido_impressoes`. No unit, conferir que `cozinha.js` só usa a RPC. | REST retorna 401/403. Nenhum `from('pedido_impressoes').insert` no código. |
| CT02 | Chamado direto e spam | Manual | CA02 | Fazer o insert direto com anon e depois chamar a RPC 2x seguidas. | Insert negado; a segunda chamada retorna `repetido` e há 1 linha só. |
| CT03 | Estoque por cargo | Manual | CA03 | Logar como cozinha e lançar uma perda; repetir como gerente com permissão de estoque. | Negado para cozinha e aceito para gerente. |
| CT04 | Policies de CRM | Manual + unit (estático) | CA04 | Fazer select em `campanhas` como barista e aplicar um cupom como anon. | Barista recebe 0 linhas ou erro; o cupom é validado. |
| CT05 | Views de dados pessoais | Manual (diagnóstico seção 7) | CA05 | Rodar a seção 7 e ler a view como anon. | `security_invoker=true` e anon negado. |
| CT06 | Payload do painel | Unit | CA06 | Passar a resposta mockada da view pelo renderizador de `retirada.js`. | Renderiza com 4 colunas; o código não referencia `from('pedidos')`. |
| CT07 | Pedido fora do horário via API | Manual + unit | CA07 | Configurar `business_hours` fechado e chamar a RPC; no unit, conferir que o front mostra a mensagem do erro. | RPC recusa; toast "Estamos fechados". |
| CT08 | Rate limit | Manual | CA08 | Enviar 4 pedidos da mesma mesa em 10 min. | O 4º é recusado. |
| CT09 | Analytics adulterado | Manual + unit | CA09 | Chamar a RPC com canal inválido e data antiga. | Canal recusado; data = hoje. |
| CT10 | Cashback/cupom como anon | Manual | CA10 | Chamar as duas RPCs com anon. | 401/403. |
| CT11 | Varredura de produção | Manual | CA11 | Rodar o diagnóstico completo depois da migration. | Só itens da allowlist aparecem. |
| CT12 | Regressão do fluxo público | E2E/manual | CA12 | Percorrer o fluxo anônimo completo e o do totem. | Sem erro de permissão. |
| CT13 | Lint da migration | Unit | CA11, RF12 | Ler o arquivo SQL e procurar `TO anon` e `WITH CHECK (true)`. | Só ocorrências da allowlist. |

## URL Complementar

- Documentação técnica: `supabase/diagnostico_schema_producao.sql` (seções 1, 7 e 8); Supabase RLS e `security_invoker` em views (PG15+).
- Discussões relacionadas: auditoria de SDDs de 2026-10-20 (sessão Claude Code).
- Requisitos originais: CAF-000027, CAF-000028, CAF-000031, CAF-000033, CAF-000034, CAF-000037, CAF-000038, CAF-000041, CAF-000061, CAF-000063 e CAF-000069.
- Issue / PR relacionado: depende da CAF-000072.
