# [FIX] Resolução de Vulnerabilidade Crítica Supabase: Habilitar Row-Level Security (RLS) e Policies em Todas as Tabelas Públicas (rls_disabled_in_public)

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-27 · **Atualizada em:** 2026-10-27

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Criar e aplicar a migration de segurança `migration_caf_000106_habilitar_rls_todas_tabelas.sql` que elimina definitivamente o alerta de vulnerabilidade crítica do Supabase Security Advisor (`rls_disabled_in_public`), garantindo que 100% das tabelas do schema `public` possuam `ROW LEVEL SECURITY` habilitado e policies restritivas adequadas configuradas. As tabelas identificadas sem RLS são:
  1. `cardapio_eventos_diarios`
  2. `cortesia_regras`
  3. `pedido_impressoes`
  4. `pedido_item_sabores`
  5. `promocoes`
  6. `promocao_itens`
  Além disso, a migration deve incluir um bloco dinâmico de salvaguarda que itera por `pg_tables` no schema `public` e executa `ENABLE ROW LEVEL SECURITY` preventivo em qualquer tabela existente, impedindo que novas tabelas ou migrações futuras fiquem desprotegidas.
- **Problema e evidência:** 
  O Supabase Security Advisor emitiu notificação de risco crítico em 25/10/2026 para o projeto `cafeteria-do-teatro` (`nyretgvzbnbtiyeioeju`):
  *"CRITICAL ISSUE: Table publicly accessible. Anyone with your project URL can read, edit, and delete all data in this table because Row-Level Security is not enabled (rls_disabled_in_public)"*.
  Uma auditoria estrita em todas as migrações SQL revelou que as tabelas `pedido_impressoes`, `cardapio_eventos_diarios`, `cortesia_regras`, `pedido_item_sabores`, `promocoes` e `promocao_itens` foram criadas sem o comando `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- **Impacto de não fazer:** 
  Risco severo de vazamento, manipulação ou exclusão não autorizada de dados operacionais (eventos do cardápio, cortesias, promoções, sabores de pedidos e comandas de impressão) via chamadas diretas à API PostgREST do Supabase utilizando apenas a chave anônima pública (`anon key`).
- **Para quem é destinado:** 
  Administração, clientes e equipe operacional da Cafeteria do Teatro, assegurando conformidade de segurança e proteção de dados.
- **História de usuário:** 
  Como administrador do sistema, quero que todas as tabelas públicas do banco de dados tenham Row-Level Security ativado com regras restritivas por perfil, para que nenhum usuário anônimo ou não autenticado consiga ler, adulterar ou apagar dados diretamente via API PostgREST.
- **Como saberemos que deu certo:** 
  1. Criação da migration `supabase/migration_caf_000106_habilitar_rls_todas_tabelas.sql`.
  2. Consulta a `pg_tables` onde `schemaname = 'public' AND rowsecurity = false` retorna 0 linhas.
  3. Criação de suíte de testes pgTAP (`supabase/tests/rls_todas_tabelas.test.sql`) e teste funcional (`tests/caf-000106-seguranca-rls-tabelas-publicas.test.js`).
  4. 100% de sucesso em `npm test` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|---|---|
| RF01 | Habilitar RLS (`ENABLE ROW LEVEL SECURITY`) explicitamente nas tabelas desprotegidas: `cardapio_eventos_diarios`, `cortesia_regras`, `pedido_impressoes`, `pedido_item_sabores`, `promocoes`, `promocao_itens` | P0 | CA01 |
| RF02 | Configurar policies restritivas para `cardapio_eventos_diarios`: leitura restrita a staff com permissão `relatorios` ou `admin`; escrita direta revogada de `anon`/`authenticated` (modificação exclusiva via RPC `registrar_evento_cardapio` que é `SECURITY DEFINER`) | P0 | CA02 |
| RF03 | Configurar policies restritivas para `cortesia_regras`, `promocoes` e `promocao_itens`: leitura pública/anônima permitida apenas para registros ativos (`ativo = true`), e controle total (ALL) exclusivo para `admin` | P0 | CA03 |
| RF04 | Configurar policies restritivas para `pedido_impressoes`: leitura restrita a equipe autenticada (`barista`, `cozinha`, `gerente`, `admin`); inserção/modificação direta bloqueada (exclusiva via RPC `travar_impressao_pedido` que é `SECURITY DEFINER`) | P0 | CA04 |
| RF05 | Configurar policies restritivas para `pedido_item_sabores`: leitura pública para visualização do pedido/KDS; inserções diretas restritas a staff autenticado (`barista`, `garcom`, `admin`), enquanto clientes anônimos utilizam as RPCs `SECURITY DEFINER` de pedido | P0 | CA05 |
| RF06 | Implementar salvaguarda dinâmica `DO $$` que percorre todas as tabelas em `public` e aplica `ENABLE ROW LEVEL SECURITY`, garantindo que nenhuma tabela fique sem RLS | P0 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|---|---|
| RNF01 | Idempotência e segurança transacional: a migration deve rodar dentro de `BEGIN ... COMMIT` e utilizar `IF NOT EXISTS` / `DROP POLICY IF EXISTS` para permitir reexecuções seguras | P0 | CA01, CA06 |
| RNF02 | Compatibilidade com o front-end: nenhuma funcionalidade do cardápio digital, totem, PDV ou KDS pode quebrar por conta das novas policies | P0 | Todos |

### Dependências técnicas

- `supabase/migration_caf_000082_seguranca.sql` (estrutura de permissões e RPCs seguras).
- `scripts/test-db-runner.js` (executor de testes isolados pgTAP).

### Recursos necessários

- Acesso ao Supabase SQL Editor para execução em produção da migration após validação.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o banco possui tabelas no schema public, quando a migration 106 for executada, então `cardapio_eventos_diarios`, `cortesia_regras`, `pedido_impressoes`, `pedido_item_sabores`, `promocoes` e `promocao_itens` terão `relrowsecurity = true` em `pg_class`.
- [x] **CA02:** Dado um usuário anônimo (anon key), quando tentar fazer `SELECT`, `INSERT`, `UPDATE` ou `DELETE` diretamente na tabela `cardapio_eventos_diarios`, então a operação é negada pelo RLS, enquanto a RPC `registrar_evento_cardapio` continua registrando métricas normalmente.
- [x] **CA03:** Dado um usuário não autenticado (anon key), quando consultar `cortesia_regras` e `promocoes`, então apenas registros onde `ativo = true` são visíveis, e qualquer tentativa de escrita (`INSERT`/`UPDATE`/`DELETE`) é negada por exigir role `admin`.
- [x] **CA04:** Dado um usuário anônimo, quando tentar ler ou inserir diretamente na tabela `pedido_impressoes`, então a operação é bloqueada pelo RLS, permitindo leitura somente para usuários autenticados com cargo de staff.
- [x] **CA05:** Dado um usuário anônimo ou cliente de autoatendimento, quando consultar itens e sabores de seu pedido, então consegue ler `pedido_item_sabores`, mas tentativas de manipulação direta fora das RPCs transacionais são bloqueadas.
- [x] **CA06:** Dado o catálogo do PostgreSQL, quando executada a consulta `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;`, então o resultado deve ser exatamente zero tabelas.

## O que a atividade não inclui

- Alteração da arquitetura de login ou autenticação existente: o sistema continuará utilizando os papéis (`anon`, `authenticated`, `admin`, `barista`, `cozinha`, `garcom`, `gerente`).
- Modificação de RPCs que já estão como `SECURITY DEFINER` e funcionando normalmente.

### Considerado para o futuro (P2)

- Auditoria automática periódica em CI/CD via Supabase CLI para checagem contínua de Database Advisors.

## Dúvidas em aberto

| # | Dúvida | Responsável | Bloqueante? | Resposta |
|---|--------|-------------|-------------|----------|
| D01 | O cardápio digital do cliente precisa ler regras de cortesias e promoções ativas diretamente? | dev | Não | Sim, as policies permitem SELECT para anônimos quando `ativo = true`. |

## Sugestões de casos de teste

| # | Cenário | Tipo | Cobre | Passos | Resultado esperado |
|---|---------|------|-------|--------|--------------------|
| CT01 | Verificação de RLS em 100% das tabelas | pgTAP | CA01, CA06 | Consultar `pg_tables WHERE schemaname = 'public' AND rowsecurity = false` | Nenhuma linha retornada |
| CT02 | Políticas de acesso a promoções e cortesias | pgTAP | CA03 | Testar SELECT com papel anon para ativo=true e ativo=false | Apenas ativos retornados; escrita negada |
| CT03 | Políticas de trava de impressão | pgTAP | CA04 | Testar SELECT e INSERT como anon em pedido_impressoes | Negado |
| CT04 | Validação de contrato e catálogo | unit/integração | Todos | Executar suíte Vitest `tests/caf-000106-seguranca-rls-tabelas-publicas.test.js` | 100% sucesso |

## URL Complementar

- Documentação técnica: [Supabase Security Advisor - rls_disabled_in_public](https://supabase.com/docs/guides/database/database-advisors)
- Supabase Dashboard Advisors: [cafeteria-do-teatro Security Advisors](https://supabase.com/dashboard/project/nyretgvzbnbtiyeioeju/advisors/security)
