# [FIX] Correção das RPCs get_resumo_financeiro (404 sem parâmetros) e admin_create_user (pgcrypto gen_salt)

> **Status:** Em revisão
> **Autor:** Antigravity · **Revisor:** Natanael Brentano · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** 
  1. Corrigir o erro 404 em `get_resumo_financeiro`: no banco de dados, prover defaults para os parâmetros `p_mes` e `p_ano` (mês e ano correntes) e, no cliente (`js/db.js` e `js/admin/main.js`), normalizar os parâmetros para que chamadas sem argumentos ou com string `"YYYY-MM"` sejam sempre enviadas com inteiros válidos `p_mes` e `p_ano`.
  2. Corrigir o erro 42883 (`function gen_salt(unknown) does not exist`) em `admin_create_user`: qualificar as funções do `pgcrypto` com o schema `extensions` (`extensions.crypt`, `extensions.gen_salt`) e configurar `SET search_path = public, extensions`, garantindo que extensões criadas no schema `extensions` do Supabase sejam acessíveis mesmo após o hardening da migração 107.
  3. Auditar e qualificar preventivamente demais chamadas de funções do `pgcrypto` (`digest`, `gen_random_bytes`) que possam ter sido afetadas pela migração 107.
  4. Criar migração idempotente `migration_caf_000158_correcao_rpcs_pgcrypto_financeiro.sql` e respectivo rollback em `supabase/rollback/`.
  5. Criar suíte de testes funcionais automatizados em `tests/caf-000158-correcao-rpcs-get-resumo-financeiro-admin-create-user.test.js` cobrindo chamadas reais do cliente, tratamento de erros, parâmetros padrão e validação de schema.

- **Problema e evidência:** 
  Ao inicializar o painel administrativo (`admin.html`), o console exibe sucessivos erros:
  - `Failed to load resource: the server responded with a status of 404 ()`
  - `[CafeteriaDB][financeiro.getResumo] Could not find the function public.get_resumo_financeiro without parameters in the schema cache`
  - `admin-CyCtvIcc.js:335 [ERROR] Erro ao criar usuário: function gen_salt(unknown) does not exist (code: 42883)`

- **Impacto de não fazer:**
  - O alerta de despesas vencidas e os indicadores (KPIs) financeiros no painel admin não carregam ou quebram silenciosamente.
  - A funcionalidade de criação de novos usuários (baristas, gerentes, admins) fica 100% inoperante em produção, impedindo o onboarding de colaboradores.

- **Para quem é destinado:** Administradores e gerentes do sistema da cafeteria.
- **História de usuário:** Como administrador do sistema, quero visualizar os alertas e KPIs financeiros no dashboard e cadastrar novos colaboradores com sucesso, para que a gestão operacional da cafeteria funcione sem falhas de integração no banco.
- **Como saberemos que deu certo:** 0 erros no console do navegador ao acessar o painel administrativo e ao submeter o formulário de cadastro de usuário; testes funcionais passando com 100% de sucesso em `npm test` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Atualizar a RPC `public.get_resumo_financeiro` no Postgres para ter valores padrão `p_mes INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT` e `p_ano INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT`, permitindo chamadas com 0, 1 ou 2 parâmetros | P0 | CA01, CA02 |
| RF02 | Atualizar `db.financeiro.getResumo` em `js/db.js` para tratar chamadas sem parâmetros (assumindo mês/ano atuais) e aceitar strings `"YYYY-MM"`, repassando inteiros para a RPC | P0 | CA01, CA03 |
| RF03 | Atualizar a RPC `public.admin_create_user` para usar `extensions.crypt` e `extensions.gen_salt('bf')` com `SET search_path = public, extensions`, garantindo execução mesmo com `search_path` restrito | P0 | CA04, CA05 |
| RF04 | Criar a migração `supabase/migration_caf_000158_correcao_rpcs_pgcrypto_financeiro.sql` e rollback correspondente | P0 | CA01, CA04 |
| RF05 | Criar suíte de testes funcionais automatizados em `tests/caf-000158-correcao-rpcs-get-resumo-financeiro-admin-create-user.test.js` importando o código real da aplicação | P0 | CA01, CA02, CA03, CA04, CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma alteração de segurança deve reintroduzir permissões públicas indevidas: `REVOKE EXECUTE FROM anon, public` mantido em `admin_create_user` | P0 | CA05 |
| RNF02 | Migração 100% idempotente com suporte a rollback | P0 | CA01, CA04 |
| RNF03 | Cobertura de testes com 100% de aprovação e sem regressão no `npm test` e `npm run build` | P0 | CA06 |

### Dependências técnicas

- `supabase/migration_caf_000035_financeiro_despesas.sql`
- `supabase/migration_caf_000023_taxa_desconto.sql`
- `supabase/migration_caf_000107_hardening_supabase_advisors.sql`
- `js/db.js`
- `js/admin/main.js`
- `js/admin/financeiro-admin.js`
- `js/admin/usuarios-admin.js`

### Recursos necessários

- Acesso ao repositório local e permissão para aplicar migrations no ambiente Supabase.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado que o cliente chama `get_resumo_financeiro` sem parâmetros ou com parâmetros parciais, quando a RPC é executada no banco, então ela utiliza o mês e ano correntes como default e retorna os dados resumidos sem erro 404.
- [ ] **CA02:** Dado que o cliente chama `window.cafeteriaDB.financeiro.getResumo()` sem argumentos em `js/admin/main.js`, quando a promessa resolve, então ela envia `{ p_mes, p_ano }` numéricos válidos e preenche o banner de alerta sem lançar erro no console.
- [ ] **CA03:** Dado que `db.financeiro.getResumo("2026-11")` é chamado em `js/admin/financeiro-admin.js`, quando os argumentos são processados, então a chamada RPC recebe `{ p_mes: 11, p_ano: 2026 }`.
- [ ] **CA04:** Dado que um administrador autenticado executa `admin_create_user`, quando a função gera a senha criptografada, então ela localiza `extensions.gen_salt` e `extensions.crypt` com sucesso e cria o usuário sem erro 42883.
- [ ] **CA05:** Dado que um usuário anônimo (`anon`) tenta chamar `admin_create_user`, quando a requisição é recebida, então o acesso é negado (permissão revogada / erro 42501).
- [ ] **CA06:** Dado que a suíte de testes `tests/caf-000158-correcao-rpcs-get-resumo-financeiro-admin-create-user.test.js` é executada, quando rodado `npm test`, então todos os testes passam com 100% de sucesso e o build (`npm run build`) conclui sem erros.

## O que a atividade não inclui

- Alteração da interface visual do painel administrativo ou do formulário de usuários (apenas correção de integração/backend).
- Criação de novos fluxos de recuperação de senha ou autenticação externa (fora do escopo da correção das RPCs).

### Considerado para o futuro (P2)

- Unificação de catálogo de extensões do Postgres em script único de bootstrap de ambiente de desenvolvimento.

## Dúvidas em aberto

| # | Dúvida | Responsável | Bloqueante? | Resposta |
|---|--------|-------------|-------------|----------|
| D01 | O script SQL deve ser executado no SQL Editor do Supabase ou via runner automático? | dev | Não | Fornecer o arquivo `.sql` na pasta `supabase/` e instruir a execução no Supabase SQL Editor. |

## Sugestões de casos de teste

| # | Cenário | Tipo | Cobre | Passos | Resultado esperado |
|---|---------|------|-------|--------|--------------------|
| CT01 | `financeiro.getResumo()` sem argumentos | unit/integração | CA01, CA02 | Chamar `db.financeiro.getResumo()` | RPC chamada com `p_mes` e `p_ano` inteiros correntes |
| CT02 | `financeiro.getResumo("2026-11")` com formato YYYY-MM | unit/integração | CA03 | Chamar com string `"2026-11"` | RPC chamada com `p_mes: 11` e `p_ano: 2026` |
| CT03 | `admin_create_user` com mock Supabase e validação de schema | unit/integração | CA04, CA05 | Chamar criação de usuário como admin vs anon | Sucesso com payload correto para admin; bloqueio para anon |
| CT04 | Validação da sintaxe SQL da migration e rollback | unit | CA01, CA04 | Parsear e validar arquivos de migração SQL | Scripts válidos e idempotentes |

## URL Complementar

- Documentação técnica: [Supabase Database Functions (RPC)](https://supabase.com/docs/guides/database/functions)
- Referências de design: Painel Administrativo `/admin.html`
- Requisitos originais: Solicitação do usuário com log de erros de console em produção.
