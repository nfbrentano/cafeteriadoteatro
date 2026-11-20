# [FIX] Dados sensíveis legíveis: `pin_hash` com bcrypt e policies `USING (true)` de financeiro, caixa e estoque

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Impedir que o hash do PIN de supervisores seja lido por qualquer usuário logado, trocar o hash por um algoritmo lento com sal por usuário e fechar a leitura anônima de faturamento, pagamentos, sangrias, custos e estoque.
- **Problema e evidência:**
  1. **`pin_hash` visível para toda a equipe.** A policy `perfis_select_authenticated` (`supabase/pedidos_schema.sql:26-27`) é `FOR SELECT TO authenticated USING (true)`, e `perfis` tem `pin_hash`, `pin_tentativas_erradas` e `pin_bloqueado_ate` (`migration_caf_000036_cargos_permissoes.sql:29`). Qualquer barista ou conta de cozinha lê o hash de todos. O admin ainda busca `select('*, cargo:cargos(...)')` (`js/admin/usuarios-admin.js:246-247`) e usa `u.pin_hash` só para mostrar o selo "PIN ativo" (`:287`).
  2. **Hash fraco.** `fn_hash_pin` (`migration_caf_000036_cargos_permissoes.sql:145-151`) é `encode(sha256(('cafeteria_teatro_pin_salt_2026_' || TRIM(p_pin))::bytea), 'hex')`: sal fixo e público no repositório. Com PIN de 4 a 8 dígitos (no máximo 100 milhões de combinações), quem tem o hash descobre o PIN offline, sem passar pelo bloqueio de tentativas da CAF-000081. O RF04 da CAF-000081 (`crypt(pin, gen_salt('bf'))`, P1) não foi implementado.
  3. **Leitura anônima de dados financeiros e de estoque.** Policies `FOR SELECT USING (true)` sem cláusula `TO` valem também para `anon`:
     - `fechamentos_select`, `fechamento_pagamentos_select`, `fechamento_pedidos_select` (`supabase/migration_caf_000002.sql:16`, `:28`, `:39`): total de cada conta, taxa, desconto e motivo, forma de pagamento.
     - `caixa_movimentos_select` (`migration_caf_000025_caixa.sql:37`): sangrias e suprimentos.
     - `estoque_lotes_select` (`migration_caf_000111_lotes_validade_peps_sugestao_compras.sql:45`) somado a `GRANT SELECT ON public.estoque_lotes TO anon` (`:60`): custo unitário e validade.
     - `estoque_itens_select` e `estoque_movimentos_select` (`migration_caf_000031_controle_estoque.sql:288-296`).
     Nenhuma migration posterior recria essas policies (conferido por busca nos arquivos do manifesto).
- **Impacto de não fazer:** Um funcionário descobre o PIN do gerente e aprova descontos, cancelamentos e sangrias em nome dele; qualquer pessoa com a chave anon (pública) baixa o faturamento, os descontos e o custo de insumos da cafeteria.
- **Para quem é destinado:** Dono e gerentes (PIN de autorização) e equipe administrativa.
- **História de usuário:** Como gerente, quero que meu PIN não possa ser descoberto por colegas, para que toda autorização registrada em meu nome tenha sido dada por mim.
- **Como saberemos que deu certo:** 0 colunas de PIN legíveis por `authenticated` via API; 0 policies de leitura sem `TO` nas tabelas citadas; 100% dos PINs ativos em formato bcrypt (`$2a$`/`$2b$`) ou anulados.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | `REVOKE SELECT (pin_hash, pin_tentativas_erradas, pin_bloqueado_ate) ON public.perfis FROM authenticated, anon` (privilégio por coluna) ou view `perfis_publico` sem essas colunas; o front deixa de usar `select('*')` em `perfis` | P0 | CA01, CA02 |
| RF02 | Expor `tem_pin BOOLEAN` (coluna gerada ou campo na view/RPC de listagem do admin) para o selo "PIN ativo" | P0 | CA02 |
| RF03 | `fn_hash_pin` passa a usar `extensions.crypt(p_pin, extensions.gen_salt('bf', 10))` e a verificação usa `extensions.crypt(p_pin, pin_hash) = pin_hash` (schema qualificado, com `search_path` fixo) | P0 | CA03, CA04 |
| RF04 | Migração dos PINs: os hashes sha256 atuais são anulados (`pin_hash = NULL`) e cada supervisor redefine o PIN; o admin vê a lista de quem precisa redefinir | P0 | CA05 |
| RF05 | `validar_pin_autorizacao` (`migration_caf_000081_seguranca_pin_rls.sql:18`) deixa de procurar "qualquer perfil com o mesmo hash" (`:66-69`), pois bcrypt tem sal por usuário: compara só contra o autorizador escolhido (`p_autorizador_id`) ou percorre os perfis com PIN ativo, conforme D01 | P0 | CA03, CA06 |
| RF06 | Recriar as 7 policies citadas como `FOR SELECT TO authenticated USING (<perfil ativo da equipe>)` e remover `GRANT SELECT ON public.estoque_lotes TO anon` | P0 | CA07, CA08 |
| RF07 | Escopo por permissão: fechamentos e caixa só para `pdv.vender`, `caixa.abrir_fechar` ou `admin.financeiro`; estoque para permissões de estoque; cozinha não lê financeiro | P1 | CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Validação de PIN responde em menos de 500 ms no PDV com até 20 perfis com PIN (custo do bcrypt ajustado a isso) | P0 | CA06 |
| RNF02 | TV de retirada (`v_painel_retirada`, `security_invoker` desde `migration_caf_000107_hardening_supabase_advisors.sql:198`), cardápio, totem e QR continuam funcionando sem login | P0 | CA10 |
| RNF03 | Nenhum hash de PIN aparece em resposta de API, log ou exportação | P0 | CA01 |
| RNF04 | Migration com rollback em `supabase/rollback/` (sem restaurar hashes sha256) | P1 | CA05 |

### Dependências técnicas

- `pgcrypto` no schema `extensions` (já criada em `pedidos_schema.sql:193` e `migration_caf_000040_totem.sql:5`; confirmar o schema em produção).
- `set_usuario_pin` (`migration_caf_000036_cargos_permissoes.sql:358`), `validar_pin_autorizacao`, `js/pdv/sessao.js` (`pedirAutorizacaoPin`, `:374`), `js/admin/usuarios-admin.js`.
- CAF-000126 (EXECUTE de anon) deve vir antes ou junto; CAF-000128 usa o PIN validado para o desconto.

### Recursos necessários

- Janela combinada com a equipe para redefinir PINs (RF04).
- Acesso ao SQL Editor de produção para conferir policies e o schema do `pgcrypto`.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um usuário de cozinha logado, quando faz `select pin_hash from perfis` pela API, então recebe erro de permissão.
- [ ] **CA02:** Dado o admin na aba Usuários, quando a lista carrega, então o selo "PIN ativo/Sem PIN" aparece correto sem que `pin_hash` trafegue na resposta.
- [ ] **CA03:** Dado um gerente que definiu o PIN 4821, quando o PIN é validado com 4821, então autoriza; com 4822, então recusa e conta a tentativa.
- [ ] **CA04:** Dado dois usuários com o mesmo PIN, quando os hashes são gravados, então são diferentes e começam com `$2`.
- [ ] **CA05:** Dado a migration aplicada, quando consulto `perfis`, então nenhum `pin_hash` está no formato sha256 (64 caracteres hexadecimais) e o admin vê quem precisa redefinir.
- [ ] **CA06:** Dado 20 perfis com PIN, quando um supervisor autoriza um desconto no PDV, então a resposta chega em menos de 500 ms.
- [ ] **CA07:** Dado uma sessão `anon`, quando lê `fechamentos`, `fechamento_pagamentos`, `fechamento_pedidos`, `caixa_movimentos`, `estoque_itens`, `estoque_movimentos` ou `estoque_lotes`, então recebe 0 linhas ou erro de permissão.
- [ ] **CA08:** Dado um barista logado, quando o PDV fecha uma conta e o admin abre o estoque, então as telas funcionam como hoje.
- [ ] **CA09:** Dado um usuário de cozinha, quando lê `fechamentos` ou `caixa_movimentos`, então recebe 0 linhas.
- [ ] **CA10:** Dado a TV de retirada sem login, quando um pedido fica pronto, então a senha aparece na tela (não regressão).

## O que a atividade não inclui

- Revogar EXECUTE de RPCs: motivo: CAF-000126.
- Exportações CSV e dados de clientes (LGPD): motivo: CAF-000132.
- Trocar PIN por autenticação forte (senha/biometria) do supervisor: motivo: complexo demais agora; PIN com bcrypt e bloqueio resolve o risco atual.

### Considerado para o futuro (P2)

- PIN de 6 dígitos como mínimo para cargos com permissão financeira.
- Alerta ao dono quando um PIN for bloqueado por tentativas.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | No modal de autorização, o supervisor escolhe o próprio nome antes do PIN (mais rápido e seguro) ou o sistema testa todos os PINs ativos? | PO | Sim | |
| D02 | Quando os supervisores podem redefinir o PIN (todos de uma vez, fora do expediente)? | PO | Sim | |
| D03 | O `pgcrypto` de produção está no schema `extensions` ou `public`? | dev | Não | |
| D04 | A TV de retirada depende de alguma das tabelas fechadas aqui? (a leitura indica que não; confirmar no e2e) | dev | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Coluna protegida | pgTAP | CA01 | `SET ROLE authenticated` com claims de cozinha; `throws_ok` no select de `pin_hash`; `column_privilege_is` | Negado |
| CT02 | Selo de PIN | integração (harness do admin) | CA02 | Carregar aba Usuários com mock que recusa `pin_hash` | Selo correto |
| CT03 | Validação bcrypt | pgTAP | CA03, CA04 | `set_usuario_pin` e `validar_pin_autorizacao` com PIN certo/errado; comparar hashes | Autoriza/recusa; hashes distintos |
| CT04 | Migração dos hashes | pgTAP | CA05 | Semear hash sha256 e aplicar migration | `pin_hash` nulo; lista de pendentes |
| CT05 | Tempo de resposta | integração | CA06 | 20 perfis com PIN; medir `validar_pin_autorizacao` | < 500 ms |
| CT06 | Anon nas tabelas | pgTAP | CA07 | `SET ROLE anon`; `is_empty` em cada tabela | Vazio/negado |
| CT07 | Fluxos da equipe | e2e | CA08, CA09 | Fechar conta no PDV; abrir estoque no admin; logar cozinha | Funciona; cozinha não lê |
| CT08 | TV de retirada | e2e | CA10 | Pedido pronto com TV anônima | Senha exibida |

## URL Complementar

- Documentação técnica: `supabase/pedidos_schema.sql`, `supabase/migration_caf_000036_cargos_permissoes.sql`, `supabase/migration_caf_000081_seguranca_pin_rls.sql`, `supabase/migration_caf_000002.sql`, `supabase/migration_caf_000025_caixa.sql`, `supabase/migration_caf_000031_controle_estoque.sql`, `supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql`, `js/admin/usuarios-admin.js`, `js/pdv/sessao.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000081](CONCLUIDAS/CAF-000081-seguranca-pin-permissoes-por-cargo-e-rls-operacional.md) (RF04), [CAF-000036](CONCLUIDAS/CAF-000036-permissoes-por-cargo-e-desempenho.md), [CAF-000106](CONCLUIDAS/CAF-000106-habilitar-rls-tabelas-publicas-supabase.md), [CAF-000107](CONCLUIDAS/CAF-000107-seguranca-supabase-advisors-policies-search-path-views.md), [CAF-000027](CONCLUIDAS/CAF-000027-painel-de-senhas-retirada.md); novas: CAF-000126, CAF-000128, CAF-000132
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
