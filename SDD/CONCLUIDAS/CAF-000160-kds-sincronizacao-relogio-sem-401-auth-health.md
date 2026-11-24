# [FIX] Sincronização de Relógio no KDS sem Erro 401 em auth/v1/health (RPC get_server_time)

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael Brentano · **Criada em:** 2026-11-24 · **Atualizada em:** 2026-11-24

## Detalhes da Atividade

- **O que precisa ser feito:** 
  1. Criar a RPC `public.get_server_time()` no PostgreSQL retornando `TIMESTAMPTZ` (`now()`), com permissão de execução concedida a `anon`, `authenticated` e `service_role`.
  2. Atualizar a função `syncServerClock()` em `js/cozinha.js` para consultar o horário do servidor via `window.cafeteriaSupabase.rpc('get_server_time')`, eliminando a chamada direta via `fetch` para `${supabaseUrl}/auth/v1/health` que causava erro 401 (Unauthorized) no console.
  3. No cliente `js/supabase-client.js`, disponibilizar `window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY` para que qualquer integração que necessite da chave de API tenha acesso consistente no escopo global.
  4. Manter fallback resiliente: se a chamada à RPC falhar (ex.: modo offline), definir `serverClockSkewMs = 0` de forma silenciosa e sem quebrar o carregamento dos pedidos da cozinha.
  5. Criar a migração idempotente `supabase/migration_caf_000160_get_server_time.sql` e respectivo script de rollback `supabase/rollback/rollback_caf_000160.sql`.
  6. Atualizar o manifesto `supabase/migrations.manifest.json` e regerar o snapshot do schema em `tests/fixtures/schema-snapshot.json`.
  7. Criar suíte de testes funcionais automatizados em `tests/caf-000160-kds-sincronizacao-relogio-sem-401.test.js` importando os módulos reais da aplicação e cobrindo cenários com skew positivo, negativo, latência de rede, fallback de erro e permissões da RPC.

- **Problema e evidência:** 
  Ao inicializar o sistema de exibição de cozinha (KDS em `cozinha.html`), o console do navegador registra o seguinte erro HTTP 401:
  ```text
  cozinha.js:140  GET https://nyretgvzbnbtiyeioeju.supabase.co/auth/v1/health 401 (Unauthorized)
  syncServerClock @ cozinha.js:140
  loadProfile @ cozinha.js:658
  await in loadProfile
  checkSession @ cozinha.js:621
  await in checkSession
  (anonymous) @ cozinha.js:3105
  (anonymous) @ cozinha.js:3116
  ```
  Na implementação original de `syncServerClock()`, a aplicação realizava um `fetch` sem cabeçalhos para o endpoint `${supabaseUrl}/auth/v1/health` na tentativa de extrair o cabeçalho HTTP `date`. O gateway Kong do Supabase requer a chave de API (`apikey`) para qualquer requisição ao serviço de autenticação, rejeitando a requisição com `401 Unauthorized` e poluindo o log do navegador.

- **Impacto de não fazer:**
  - Erro 401 vermelho exibido em todos os dispositivos KDS (tablets/telas de cozinha e bar) ao carregar a página;
  - Falha silenciosa no ajuste de desvio de relógio (`serverClockSkewMs`), fazendo com que tablets com horário desajustado exibam tempos de semáforo incorretos (alertas de atraso falsos ou tardios).

- **Para quem é destinado:**
  Equipe de cozinha, baristas, gerentes e operadores do KDS da cafeteria.

- **História de usuário:**
  Como operador do KDS na cozinha ou bar, quero que o sistema sincronize o relógio com o servidor de forma limpa e segura sem mensagens de erro 401 no console, para que os tempos de preparo e o semáforo de atraso dos pedidos sejam calculados com precisão.

- **Como saberemos que deu certo:**
  - 0 requisições HTTP 401 no console ao carregar `cozinha.html`;
  - A RPC `get_server_time` retorna timestamp válido e `serverClockSkewMs` é calculado corretamente;
  - 100% dos testes automatizados passando em `npm test` e compilação sem erros em `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar a RPC `public.get_server_time()` no banco retornando `TIMESTAMPTZ` com `now()` | P0 | CA01, CA04 |
| RF02 | Refatorar `syncServerClock()` em `js/cozinha.js` para usar `window.cafeteriaSupabase.rpc('get_server_time')`, eliminando a chamada desprotegida a `/auth/v1/health` | P0 | CA01, CA02 |
| RF03 | Garantir fallback seguro em `syncServerClock()` caso a conexão falhe, zerando o skew sem interromper a tela da cozinha | P0 | CA03 |
| RF04 | Disponibilizar `window.SUPABASE_ANON_KEY` em `js/supabase-client.js` para alinhamento com `window.SUPABASE_URL` | P1 | CA01 |
| RF05 | Criar migração idempotente `migration_caf_000160_get_server_time.sql` e rollback `rollback_caf_000160.sql` | P0 | CA05 |
| RF06 | Criar suíte de testes funcionais automatizados em `tests/caf-000160-kds-sincronizacao-relogio-sem-401.test.js` importando o código real da aplicação | P0 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | RPC `get_server_time` com `STABLE` e `SECURITY DEFINER`, executável por `anon` e `authenticated` | P0 | CA04 |
| RNF02 | Migração 100% idempotente e reversível | P0 | CA05 |
| RNF03 | Cobertura de testes automatizados com 100% de aprovação e sem regressões em `npm test` e `npm run build` | P0 | CA06 |

### Dependências técnicas

- `js/cozinha.js`
- `js/supabase-client.js`
- `supabase/migration_caf_000029_tempo_alvo_semaforo.sql`

### Recursos necessários

- Acesso ao banco Supabase de produção (`nyretgvzbnbtiyeioeju`) para aplicação da RPC via MCP Tool `execute_sql`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que a tela da cozinha (`cozinha.html` / `cozinha.js`) é inicializada com um usuário autenticado, quando `syncServerClock()` é invocado, então a sincronização utiliza a RPC `get_server_time` via cliente Supabase oficial e nenhuma requisição desprotegida para `/auth/v1/health` é emitida.
- [x] **CA02:** Dado que a RPC `get_server_time` retorna o horário do servidor, quando a resposta é recebida, então `serverClockSkewMs` é calculado considerando a latência de ida e volta (`roundTrip / 2`) e `getNowAdjusted()` reflete o horário corrigido.
- [x] **CA03:** Dado que a chamada à RPC falha (ex.: erro de rede ou modo offline), quando `syncServerClock()` captura a falha, então `serverClockSkewMs` é ajustado para `0` e o fluxo de inicialização da cozinha prossegue sem exceções não tratadas.
- [x] **CA04:** Dado que um cliente (seja `anon` ou `authenticated`) executa a RPC `get_server_time()`, quando a função é executada no PostgreSQL, então ela retorna o timestamp atual com timezone de forma estável e segura.
- [x] **CA05:** Dado o arquivo de migração `supabase/migration_caf_000160_get_server_time.sql` e seu rollback correspondente, quando executados no PostgreSQL, então a migração é aplicada de forma idempotente, registrada em `app_migrations` e reversível.
- [x] **CA06:** Dado que a suíte `tests/caf-000160-kds-sincronizacao-relogio-sem-401.test.js` é executada, quando rodado `npm test`, então 100% dos testes passam sem falhas e `npm run build` conclui com sucesso.

## O que a atividade não inclui

- Alteração nas cores e thresholds do semáforo de atraso do KDS (`verde`, `amarelo`, `vermelho`), que permanecem inalterados.
- Alteração no mecanismo de WebSockets ou realtime do KDS.

### Considerado para o futuro (P2)

- Re-sincronização periódica do relógio em intervalos longos (ex.: a cada 30 minutos) caso a aba permaneça aberta por muitas horas seguidas.

## Dúvidas em aberto

| # | Dúvida | Responsável | Bloqueante? | Resposta |
|---|--------|-------------|-------------|----------|
| D01 | O fuso horário de retorno da RPC deve ser UTC ou America/Sao_Paulo? | dev | Não | Retornar `TIMESTAMPTZ` padrão do Postgres (com timezone), que o JavaScript interpreta universalmente em UTC/ISO-8601 com `new Date(...)`. |

## Sugestões de casos de teste

| # | Cenário | Tipo | Cobre | Passos | Resultado esperado |
|---|---------|------|-------|--------|--------------------|
| CT01 | `syncServerClock` com RPC retornando horário adiantado | integração/harness | CA01, CA02 | Simular RPC retornando servidor 5min à frente | `serverClockSkewMs` calculado próximo a +300.000ms |
| CT02 | `syncServerClock` com RPC retornando erro de rede | integração/harness | CA03 | Mockar RPC retornando erro | `serverClockSkewMs = 0`, sem quebrar KDS |
| CT03 | Execução direta de `get_server_time()` no PostgreSQL | unit/DB | CA04 | Executar `SELECT public.get_server_time()` como anon e auth | Retorno do timestamp atual com sucesso |
| CT04 | Validação da sintaxe SQL da migração 160 e rollback | unit/parser | CA05 | Analisar sintaxe e declarações da migração | Arquivo SQL válido, idempotente e reversível |
| CT05 | Execução da suíte completa de testes e build | regressão | CA06 | Rodar `npm test` e `npm run build` | 100% de testes passando e build bem-sucedido |

## URL Complementar

- Documentação técnica: [Supabase Database Functions (RPC)](https://supabase.com/docs/guides/database/functions)
- Referências de design: Tela de KDS Cozinha `/cozinha.html`
- Requisitos originais: Erro em produção `cozinha.js:140 GET https://nyretgvzbnbtiyeioeju.supabase.co/auth/v1/health 401 (Unauthorized)`.
