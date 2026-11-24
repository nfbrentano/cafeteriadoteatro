# [FIX] Correção da RPC criar_pedido (coluna p.estacao inexistente -> c.estacao)

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael Brentano · **Criada em:** 2026-11-24 · **Atualizada em:** 2026-11-24

## Detalhes da Atividade

- **O que precisa ser feito:** 
  1. Corrigir a instrução SQL interna da RPC `public.criar_pedido(JSONB)` no PostgreSQL: substituir a referência inválida `p.estacao` por `COALESCE(c.estacao, 'cozinha') AS estacao`, obtida através do `LEFT JOIN public.categorias c ON c.id = p.categoria_id`.
  2. Criar a migração idempotente `supabase/migration_caf_000159_correcao_criar_pedido_estacao.sql` e registrá-la em `public.app_migrations` com a versão `'159'`.
  3. Criar o script de rollback correspondente em `supabase/rollback/rollback_caf_000159.sql`.
  4. Atualizar o manifesto de migrações `supabase/migrations.manifest.json` e sincronizar o snapshot do schema em `tests/fixtures/schema-snapshot.json`.
  5. Criar suíte de testes funcionais automatizados em `tests/caf-000159-correcao-rpc-criar-pedido-estacao.test.js` importando e validando a execução do fluxo da aplicação com mocks de borda, cobrindo cenários felizes, fallback de estação, produtos esgotados e permissões.

- **Problema e evidência:** 
  Ao tentar enviar ou registrar pedidos no PDV / balcão, a chamada à RPC `criar_pedido` falha com HTTP 400 Bad Request:
  ```
  POST https://nyretgvzbnbtiyeioeju.supabase.co/rest/v1/rpc/criar_pedido 400 (Bad Request)
  ```
  Conforme verificado nos logs unificados do PostgreSQL do projeto Supabase (`nyretgvzbnbtiyeioeju`), o erro exato retornado pelo engine é:
  ```
  ERROR: 42703: column p.estacao does not exist
  HINT: Perhaps you meant to reference the column "c.estacao".
  CONTEXT: PL/pgSQL function criar_pedido(jsonb) line 82 at SQL statement
  QUERY: SELECT p.id, p.nome, p.preco, p.estacao, p.tipo_montagem, c.nome as categoria_nome
         FROM public.produtos p
         LEFT JOIN public.categorias c ON c.id = p.categoria_id
         WHERE p.id = v_item->>'produto_id' AND p.ativo = true AND p.disponivel = true
  ```
  A tabela `public.produtos` não possui a coluna `estacao`; esta coluna pertence à tabela `public.categorias` (`c.estacao`), assim como já é tratado corretamente nas RPCs `adicionar_itens_pedido` e `criar_pedido_online`.

- **Impacto de não fazer:**
  A criação de pedidos pelo PDV fica 100% inoperante em produção, impedindo qualquer venda no balcão e travando a operação da cafeteria.

- **Para quem é destinado:**
  Baristas, operadores de caixa e administradores do sistema.

- **História de usuário:**
  Como operador do PDV, quero finalizar o pedido do cliente no caixa sem que ocorra erro de coluna inexistente no banco de dados, para que o pedido seja registrado, o pagamento seja processado e os itens sejam direcionados para a estação correta (cozinha/bar).

- **Como saberemos que deu certo:**
  - 0 erros HTTP 400 ao invocar `criar_pedido`;
  - A RPC preenche `pedido_itens.estacao` com base na categoria ou com o fallback `'cozinha'`;
  - 100% de sucesso nos testes funcionais em `npm test` e na compilação em `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Atualizar a consulta de produto em `public.criar_pedido(JSONB)` para selecionar `COALESCE(c.estacao, 'cozinha') AS estacao` a partir de `public.categorias c`, eliminando a referência a `p.estacao` | P0 | CA01, CA02, CA03 |
| RF02 | Preservar a atribuição de estação em `pedido_itens.estacao` utilizando o valor resolvido do registro do produto/categoria | P0 | CA02, CA03 |
| RF03 | Manter todas as validações de segurança da migração 128 (exigir cargo barista/admin, verificação de produto ativo e disponível, limite de quantidade 1..99 e idempotência por `client_id`) | P0 | CA01, CA04 |
| RF04 | Criar migração `supabase/migration_caf_000159_correcao_criar_pedido_estacao.sql` e rollback `supabase/rollback/rollback_caf_000159.sql` | P0 | CA05 |
| RF05 | Criar suíte de testes funcionais automatizados em `tests/caf-000159-correcao-rpc-criar-pedido-estacao.test.js` cobrindo o fluxo completo e edge cases | P0 | CA01, CA02, CA03, CA04, CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Segurança estrita da RPC: `REVOKE EXECUTE ON FUNCTION public.criar_pedido(JSONB) FROM anon, PUBLIC;` e `GRANT EXECUTE ON FUNCTION public.criar_pedido(JSONB) TO authenticated, service_role;` | P0 | CA01 |
| RNF02 | Migração 100% idempotente com suporte a rollback sem perda de dados | P0 | CA05 |
| RNF03 | Cobertura de testes automatizados com 100% de aprovação e sem regressões em `npm test` e `npm run build` | P0 | CA06 |

### Dependências técnicas

- `supabase/migration_caf_000128_integridade_monetaria_servidor.sql`
- `supabase/migration_caf_000027_conclusao_estacao.sql`
- `js/db.js`
- `js/pdv.js`

### Recursos necessários

- Acesso ao banco Supabase de produção (`nyretgvzbnbtiyeioeju`) para aplicação da migração via MCP Tool `execute_sql`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que um usuário autenticado com perfil de barista ou admin invoca `public.criar_pedido` com itens válidos, quando a função consulta os produtos associados, então a execução ocorre sem erro `42703 (column p.estacao does not exist)` e o pedido é inserido com sucesso.
- [x] **CA02:** Dado que o item do pedido pertence a uma categoria com `estacao` definida (ex.: `'bar'` ou `'cozinha'`), quando o item é gravado em `public.pedido_itens`, então a coluna `estacao` recebe exatamente a estação configurada na categoria.
- [x] **CA03:** Dado que o item do pedido possui categoria com `estacao` nula ou ausente, quando o item é gravado em `public.pedido_itens`, então o fallback padrão `'cozinha'` é atribuído.
- [x] **CA04:** Dado que um item enviado no payload referencia um produto inexistente, inativo ou indisponível (`disponivel = false`), quando a RPC é executada, então uma exceção descritiva é levantada e nenhum registro residual é criado no banco.
- [x] **CA05:** Dado o arquivo de migração `supabase/migration_caf_000159_correcao_criar_pedido_estacao.sql` e seu rollback correspondente, quando executados no PostgreSQL, então a migração é aplicada de forma idempotente, registrada em `app_migrations` e reversível.
- [x] **CA06:** Dado que a suíte `tests/caf-000159-correcao-rpc-criar-pedido-estacao.test.js` é executada, quando rodado `npm test`, então 100% dos testes passam sem falhas e `npm run build` conclui com sucesso.

## O que a atividade não inclui

- Alterações na lógica de precificação, adicionais, combos ou cálculo de promoções da RPC.
- Alterações no frontend do PDV (`js/pdv.js`), pois o erro é exclusivo da referência de coluna no banco SQL.

### Considerado para o futuro (P2)

- Adicionar verificação estática pré-deploy (linter de PL/pgSQL) para alertar referências a colunas inexistentes em tabelas consultadas nas RPCs.

## Dúvidas em aberto

| # | Dúvida | Responsável | Bloqueante? | Resposta |
|---|--------|-------------|-------------|----------|
| D01 | O fallback de estação quando a categoria for nula deve ser 'cozinha'? | dev | Não | Sim, 'cozinha' é o padrão já adotado em `adicionar_itens_pedido` e `criar_pedido_online`. |

## Sugestões de casos de teste

| # | Cenário | Tipo | Cobre | Passos | Resultado esperado |
|---|---------|------|-------|--------|--------------------|
| CT01 | `criar_pedido` com itens de categorias com estação 'bar' e 'cozinha' | integração/harness | CA01, CA02 | Chamar a RPC com payload de múltiplos itens | Pedido criado com sucesso e itens gravados com suas respectivas estações |
| CT02 | `criar_pedido` com produto cuja categoria possui `estacao` NULL | integração/harness | CA03 | Chamar a RPC com produto sem estação na categoria | Item criado com `estacao = 'cozinha'` |
| CT03 | `criar_pedido` com produto inativo ou esgotado | integração/harness | CA04 | Chamar a RPC com produto onde `disponivel = false` | Exceção 'Produto não encontrado, inativo ou esgotado' |
| CT04 | Validação da sintaxe SQL da migração 159 e rollback | unit/parser | CA05 | Analisar sintaxe e declarações da migração | Arquivo SQL válido, idempotente e com permissões corretas |
| CT05 | Execução da suíte completa de testes e build | regressão | CA06 | Rodar `npm test` e `npm run build` | 100% de testes passando e build gerado com sucesso |

## URL Complementar

- Documentação técnica: [Supabase Database Functions (RPC)](https://supabase.com/docs/guides/database/functions)
- Referências de design: Tela de PDV `/pdv.html`
- Requisitos originais: Erro em produção `POST https://nyretgvzbnbtiyeioeju.supabase.co/rest/v1/rpc/criar_pedido 400 (Bad Request)` com log Postgres `ERROR: 42703: column p.estacao does not exist`.
