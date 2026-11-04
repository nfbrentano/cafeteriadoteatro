# [FIX] Hardening Completo do Supabase Security & Performance Advisors: Policies com Escopo Admin Real, Search Path Imutável em Funções e Security Invoker em Views

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-11-04

## Detalhes da Atividade

- **O que precisa ser feito:**
  Resolver integralmente os alertas remanescentes de segurança e performance detectados na auditoria do catálogo de produção (`supabase/snapshots/producao-2026-10-22-depois.csv`) e nas regras do **Supabase Security & Performance Advisors**:
  1. **Correção de Escalada de Privilégio em Policies Abertas (`rls_policy_always_true`):** Substituir as policies legadas nomeadas `"Escrita para admins"` nas tabelas `produtos`, `categorias`, `business_hours`, `hero_home`, `promotions` e `site_settings` — que hoje estão definidas com `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — por policies que validem efetivamente `public.get_user_role() = 'admin'` (ou permissão específica `tem_permissao(...)`).
  2. **Fechamento de Escrita Direta na Tabela `contador`:** Remover a policy `"Permitir inserção e atualização no contador"` (`FOR ALL TO {anon,authenticated} USING (true) WITH CHECK (true)`) que permite deleção ou adulteração anônima, restringindo atualizações de contadores às rotinas seguras.
  3. **Fixação de `SET search_path = public` em 100% das Funções Públicas (`function_search_path_mutable`):** Alterar todas as funções do schema `public` (especialmente as `SECURITY DEFINER`, como `criar_pedido`, `adicionar_itens_pedido`, `validar_sessao_totem`, `alterar_prioridade_pedido`, `registrar_evento_cardapio`, `fechar_caixa`, `get_caixa_atual`, `get_totais_caixa`, etc.) para definir `SET search_path = public`, prevenindo ataques de sequestro de `search_path` (CVE-2018-1058).
  4. **Ativação de `security_invoker = true` nas Views Públicas (`security_definer_view`):** Configurar `WITH (security_invoker = true)` nas views `produto_adicionais_permitidos`, `v_adicionais_produto`, `v_cortesias_disponiveis` e `v_painel_retirada` (mantendo os grants de leitura adequados nas tabelas/views subjacentes para não quebrar o cardápio público nem a TV de retirada).
  5. **Remoção de Policies Duplicadas e Otimização `initplan` (`multiple_permissive_policies` / `auth_rls_initplan`):** Consolidar policies redundantes em `business_hours`, `site_settings` e `contador`.
- **Problema e evidência:**
  No snapshot real de produção (`supabase/snapshots/producao-2026-10-22-depois.csv`, linhas 106–126 e 98–104):
  - As policies `"produtos.Escrita para admins"`, `"categorias.Escrita para admins"`, `"site_settings.Escrita para admins"`, `"hero_home.Escrita para admins"`, `"promotions.Escrita para admins"` e `"business_hours.Escrita para admins"` possuem `cmd = ALL | roles = {authenticated} | using = true | check = true`. Na prática, qualquer usuário autenticado (ex.: perfil `cozinha` ou `garcom`) pode alterar preços de produtos, apagar o cardápio ou modificar a chave Pix em `site_settings` via PostgREST.
  - A tabela `contador` possui `ALL | roles = {anon,authenticated,service_role} | using = true | check = true`.
  - Mais de 40 funções no schema `public` não declaram `SET search_path = public`, gerando alertas `function_search_path_mutable` no Supabase Advisor.
- **Impacto de não fazer:**
  Vulnerabilidade de escalada horizontal/vertical de privilégio por qualquer conta autenticada de colaborador, exposição a alertas do Supabase Security Advisor e risco de manipulação de configurações críticas (como chave Pix e preços).
- **Para quem é destinado:**
  Administração e engenharia de segurança da Cafeteria do Teatro.
- **História de usuário:**
  Como administrador do sistema, quero que todas as policies de escrita exijam efetivamente o cargo de administrador ou a permissão correspondente no banco de dados e que todas as funções/views sigam as práticas recomendadas do Supabase Security Advisor, para blindar configurações sensíveis, preços e dados operacionais contra acessos indevidos.
- **Como saberemos que deu certo:**
  1. Nenhuma policy de escrita (`INSERT`, `UPDATE`, `DELETE`, `ALL`) em tabelas de configuração ou catálogo possui `USING (true)` ou `WITH CHECK (true)` para `authenticated` ou `anon` (exceto inserção controlada de telemetria em `acessos`).
  2. 100% das funções do schema `public` possuem `proconfig` contendo `search_path=public`.
  3. As views do schema `public` possuem `security_invoker = true` onde aplicável.
  4. Suíte pgTAP e Vitest passando com 100% de sucesso.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Substituir policies `USING (true)` / `WITH CHECK (true)` em `produtos`, `categorias`, `business_hours`, `hero_home`, `promotions` e `site_settings` por verificação real de `public.get_user_role() = 'admin'` ou permissão equivalente (`tem_permissao`), mantendo leitura pública (`SELECT`) onde necessário | P0 | CA01, CA02 |
| RF02 | Restringir as policies da tabela `contador` para impedir `DELETE` anônimo e consolidar políticas duplicadas | P0 | CA03 |
| RF03 | Aplicar `ALTER FUNCTION ... SET search_path = public` dinamicamente e explicitamente em todas as funções do schema `public` | P0 | CA04 |
| RF04 | Configurar `security_invoker = true` nas views `produto_adicionais_permitidos`, `v_adicionais_produto` e `v_cortesias_disponiveis`, preservando a leitura de cardápio para `anon` e `authenticated` | P1 | CA05 |
| RF05 | Remover policies redundantes/duplicadas em `site_settings` e `business_hours` | P1 | CA02, CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Idempotência total: a migration `migration_caf_000107_hardening_supabase_advisors.sql` deve rodar dentro de `BEGIN ... COMMIT` e poder ser reexecutada sem erros | P0 | CA01 a CA06 |
| RNF02 | Zero regressão nos canais públicos (`index.html`, `cardapio.html`, `totem.html`, `retirada.html`), garantindo que a leitura anônima de produtos, categorias, horários e promoções continue funcionando | P0 | CA01, CA05 |

### Dependências técnicas

- `supabase/migration_caf_000081_seguranca_pin_rls.sql`
- `supabase/migration_caf_000082_seguranca.sql`
- `supabase/migration_caf_000106_habilitar_rls_todas_tabelas.sql`

### Recursos necessários

- Acesso ao SQL Editor do Supabase para aplicação da migration após aprovação.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um usuário autenticado com perfil `cozinha` ou `garcom` (não-admin e sem permissão `produtos` / `admin.configuracoes`), quando tentar executar `INSERT`, `UPDATE` ou `DELETE` diretamente em `produtos`, `categorias`, `promotions` ou `hero_home`, então o banco de dados bloqueia a operação via RLS.
- [x] **CA02:** Dado um usuário autenticado sem perfil `admin` e sem permissão `admin.configuracoes`, quando tentar alterar registros em `site_settings` (ex.: chave Pix) ou `business_hours`, então a escrita é rejeitada pelo RLS, enquanto um usuário `admin` realiza a atualização normalmente.
- [x] **CA03:** Dado um usuário anônimo (`anon`), quando tentar executar `DELETE` na tabela `contador`, então a operação é bloqueada.
- [x] **CA04:** Dado o catálogo `pg_proc` no schema `public`, quando consultadas as funções criadas pelo sistema, então 100% delas possuem `search_path=public` definido em `proconfig` (zero funções vulneráveis a `function_search_path_mutable`).
- [x] **CA05:** Dado um cliente anônimo acessando o cardápio digital ou o totem, quando consultar `produtos`, `categorias`, `produto_adicionais_permitidos`, `v_adicionais_produto` e `v_cortesias_disponiveis`, então os dados continuam sendo retornados sem erro de permissão.
- [x] **CA06:** Dado o catálogo `pg_policies` no schema `public`, quando verificadas as tabelas `site_settings`, `business_hours`, `produtos` e `categorias`, então não existem policies duplicadas com `qual = 'true'` ou `with_check = 'true'` para comandos de escrita (`ALL`, `INSERT`, `UPDATE`, `DELETE`).

## O que a atividade não inclui

- Alteração nas telas de login ou criação de novos cargos no sistema: motivo: escopo focado no fechamento das brechas de RLS, `search_path` e views no banco de dados.

### Considerado para o futuro (P2)

- Criação de índices automáticos para chaves estrangeiras secundárias apontadas pelo Performance Advisor (`unindexed_foreign_keys`).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O barista precisa marcar um produto como "Esgotado" pelo PDV? | dev | Não | Essa ação já utiliza a RPC `toggle_produto_disponivel` (`SECURITY DEFINER`), portanto fechar o `UPDATE` direto na tabela `produtos` para apenas `admin` (ou quem tem permissão `produtos`) não afeta o botão de esgotar item no PDV/KDS. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Validação de policies de escrita restritas a admin/permissão | pgTAP / unit | CA01, CA02, CA06 | Verificar que `migration_caf_000107` remove `"Escrita para admins"` aberta e cria policy exigindo `get_user_role() = 'admin'` | Escrita bloqueada para perfis operacionais comuns |
| CT02 | Proteção da tabela `contador` contra deleção | pgTAP / unit | CA03 | Verificar revogação de `DELETE` para `anon` em `contador` | `anon` não consegue apagar contadores |
| CT03 | Verificação de `SET search_path = public` em todas as funções | pgTAP / unit | CA04 | Consultar `pg_proc` no teste pgTAP procurando funções em `public` sem `search_path` configurado | Zero funções sem `search_path` |
| CT04 | Leitura pública de views com `security_invoker` | pgTAP / integração | CA05 | Consultar `v_adicionais_produto`, `produto_adicionais_permitidos` e `v_cortesias_disponiveis` | Retorno íntegro para o cardápio e PDV |

## URL Complementar

- Documentação técnica: [Supabase Database Linter — Security & Performance Advisors](https://supabase.com/docs/guides/database/database-advisors)
- Evidência no repositório: `supabase/snapshots/producao-2026-10-22-depois.csv` (linhas 98–126)
