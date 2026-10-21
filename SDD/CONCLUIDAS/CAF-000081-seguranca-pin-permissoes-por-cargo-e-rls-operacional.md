# [FIX] CAF-000081 — Segurança: PIN com bloqueio, permissões por cargo efetivas no banco e RLS das operações do PDV/KDS

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer o controle de acesso da CAF-000036 valer de fato no servidor:
  - PIN de autorização resistente a força bruta;
  - retirar uma permissão de um cargo restringe de verdade no banco;
  - o admin só mostra as abas permitidas;
  - as operações críticas do PDV/KDS (marcar entregue, cancelar item, transferir mesa) validam papel e regras no servidor, não só no front.
- **Problema e evidência:**
  1. **Força bruta no PIN.** `validar_pin_autorizacao` (`supabase/migration_caf_000036_cargos_permissoes.sql:271-300`) procura **qualquer** perfil ativo cujo `pin_hash` bata com o PIN digitado (`WHERE p.pin_hash = v_hash ... LIMIT 1`), sem informar de quem é o PIN.
     - Quando não encontra, só retorna "PIN inválido" e não incrementa `pin_tentativas_erradas`. O próprio comentário admite: "Verifica se algum usuário está sendo alvo de força bruta…".
     - O bloqueio após 5 erros da SDD original nunca acontece. As colunas `pin_tentativas_erradas` e `pin_bloqueado_ate` (`:29-31`) existem, mas não são alimentadas.
     - Com PIN de 4 dígitos (10.000 combinações) e busca em todos os usuários, um barista acha o PIN de algum gerente em minutos.
  2. **Hash fraco e colisão.** `fn_hash_pin` (`:145-151`) é `sha256` com salt fixo no código-fonte. Dois usuários com o mesmo PIN são indistinguíveis (`LIMIT 1` escolhe um), e a autorização é atribuída à pessoa errada no log.
  3. **Retirar a permissão não restringe.** As policies e RPCs posteriores combinam `tem_permissao(...) OR get_user_role() IN ('barista','admin')`:
     - `migration_caf_000037_qr_pedidos_cliente.sql:77, 454, 484`;
     - `migration_caf_000040_totem.sql:500`.
     Um barista cujo cargo perdeu `pdv.vender` continua vendendo. O mesmo acontece no front: `usuarioTemPermissao` (`js/pedidos.js:806-814`) retorna `true` para `pdv.vender` sempre que `role === 'barista'`. As policies antigas (`pedidos_schema.sql:125-134` e outras) seguem baseadas só em `get_user_role()`.
  4. **Admin não oculta abas por permissão.** `cafeteriaDB.cargos.getMinhasPermissoes()` existe (`js/db.js:1494-1500`), mas não é chamado em nenhum lugar de `js/admin/`. A sidebar (`admin.html:76-82`) mostra todas as abas a qualquer usuário logado no admin. Falha o CA "Gerente vê só as abas permitidas" da CAF-000036.
  5. **Cozinha pode marcar entregue (CAF-000001).** A policy `pedidos_update` permite `UPDATE` a `('cozinha','admin','barista')` sem restringir colunas ou transições (`supabase/pedidos_schema.sql:130-134`). O RNF da CAF-000001 dizia que só barista/admin marcam `entregue`.
  6. **`cancelar_item` sem checagem no servidor (CAF-000004).** A RPC (`supabase/migration_caf_000004.sql:27-75`) só exige admin quando o pedido está pago. Para pedidos não pagos, qualquer autenticado (inclusive `cozinha`) cancela itens. `p_motivo` não é validado: vazio ou nulo é aceito, e só o front exige motivo.
  7. **`transferir_mesa` sem checagem (CAF-000011).** A função (`supabase/migration_caf_000022_transferir_mesa.sql:6-29`) não é `SECURITY DEFINER` e não verifica papel nem permissão `pdv.transferir_mesa`. Depende só das RLS de `UPDATE` em `pedidos`, que por sua vez deixam `cozinha` alterar.
- **Impacto de não fazer:**
  - Descontos, cancelamentos e estornos autorizados por PIN podem ser obtidos por qualquer funcionário.
  - A matriz de permissões por cargo é decorativa.
  - Perfis da cozinha podem alterar pedidos e mesas.
  - Os logs de auditoria (CAF-000019) atribuem ações à pessoa errada.
- **Para quem é destinado:** Dono/gestor (controle), gerente (autorizador) e equipe operacional.
- **História de usuário:** Como dono, quero que as permissões que configuro por cargo e as autorizações por PIN sejam impossíveis de contornar, para que descontos, cancelamentos e transferências só sejam feitos por quem eu autorizei.
- **Como saberemos que deu certo:**
  - Após 5 PINs errados para um autorizador, ele fica bloqueado por 15 min.
  - Retirar `pdv.vender` de um cargo faz `criar_pedido` falhar para esse usuário via API direta.
  - `cozinha` recebe erro ao tentar `UPDATE status='entregue'`, `cancelar_item` ou `transferir_mesa` via REST.
  - O admin mostra só as abas permitidas.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | A autorização por PIN passa a exigir a **identificação do autorizador** (seleção do gerente no modal ou usuário + PIN). A RPC valida o PIN só daquele perfil | P0 | CA01 |
| RF02 | PIN errado para o autorizador incrementa `pin_tentativas_erradas`. Na 5ª falha, define `pin_bloqueado_ate = now() + 15 min`. Sucesso zera o contador. Toda falha e bloqueio gera entrada no log de auditoria | P0 | CA02, CA03 |
| RF03 | Limitar tentativas por solicitante (`auth.uid()`): no máximo 10 falhas de PIN em 15 min, somando todos os autorizadores | P0 | CA04 |
| RF04 | Trocar o hash do PIN para `crypt(pin, gen_salt('bf'))` (pgcrypto), com migração forçando a redefinição dos PINs existentes no próximo uso ou pelo admin | P1 | CA05 |
| RF05 | Remover os fallbacks `OR get_user_role() IN (...)` das policies e RPCs que já usam `tem_permissao`. Manter o fallback por role **somente** para perfis sem `cargo_id` (o próprio `tem_permissao` já trata isso, em `migration_caf_000036:203-210`) | P0 | CA06 |
| RF06 | No front do PDV, `usuarioTemPermissao` (`js/pedidos.js:806-814`) usa apenas as permissões retornadas por `get_minhas_permissoes`. O fallback por role vale só quando o usuário não tem cargo | P0 | CA06 |
| RF07 | O admin carrega `getMinhasPermissoes()` no login e oculta as abas da sidebar e as rotas sem permissão. Acesso direto por hash/URL a uma aba proibida mostra "sem permissão" | P0 | CA07 |
| RF08 | Restringir a mudança de `pedidos.status` para `entregue` a barista/admin (ou à permissão `pdv.entregar`), via RPC dedicada ou trigger de validação de transição. `cozinha` só move `pendente → em_preparo → pronto/concluido` | P0 | CA08 |
| RF09 | `cancelar_item` exige a permissão `pdv.cancelar_item` (ou autorização por PIN válida na mesma transação) e `p_motivo` com ≥ 3 caracteres não vazios. Itens de pedido pago continuam exigindo admin | P0 | CA09, CA10 |
| RF10 | `transferir_mesa` vira `SECURITY DEFINER SET search_path = public`, exige `pdv.transferir_mesa` e registra no log de auditoria | P0 | CA11 |
| RF11 | Revogar `EXECUTE` de `anon` nas RPCs de operação interna (`cancelar_item`, `transferir_mesa`, `validar_pin_autorizacao`, `set_usuario_pin`) | P0 | CA12 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Toda regra de acesso é imposta no banco (RLS/RPC). O front apenas reflete a regra; desligar o JS não concede acesso | P0 | CA06, CA08-CA12 |
| RNF02 | Mensagem de PIN errado não revela se o autorizador existe ou está bloqueado além do necessário ("PIN inválido ou bloqueado") | P0 | CA02 |
| RNF03 | Migration idempotente. Após aplicar, a seção `8_policy` do diagnóstico não lista policies de escrita em `pedidos`/`pedido_itens` com roles amplas sem checagem de permissão | P0 | CA08 |
| RNF04 | Nenhuma regressão no fluxo normal: barista com cargo padrão continua vendendo, fechando conta e transferindo mesa sem passos extras | P0 | CA13 |

### Dependências técnicas

- **CAF-000072**: baseline do schema de produção. Ver policies e grants reais (diagnóstico, seções `1_funcao` e `8_policy`) e se `pgcrypto` está habilitada.
- `supabase/migration_caf_000036_cargos_permissoes.sql`, `supabase/pedidos_schema.sql`, `supabase/migration_caf_000004.sql`, `supabase/migration_caf_000022_transferir_mesa.sql`, `supabase/migration_caf_000037_qr_pedidos_cliente.sql`, `supabase/migration_caf_000040_totem.sql`.
- `js/pedidos.js` (≈805-930: permissões e modal de PIN), `js/db.js:1494-1520`, `js/admin/main.js`, `js/admin/auth.js`, `admin.html` (sidebar e modal de PIN).

### Recursos necessários

- Lista de cargos e permissões desejadas por cargo (PO), para semear a matriz antes de remover os fallbacks.
- Contas de teste com os papéis `barista`, `cozinha`, gerente e admin em ambiente de teste.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o modal de autorização, quando o barista pede um desconto, então precisa escolher o gerente autorizador e digitar o PIN dele. O PIN de outro gerente digitado para o gerente escolhido é recusado.
- [ ] **CA02:** Dado o gerente G, quando são digitados 5 PINs errados para G, então a 6ª tentativa (mesmo com o PIN correto) é recusada por 15 min com "PIN inválido ou bloqueado", e o log registra o bloqueio.
- [ ] **CA03:** Dado G com 3 falhas, quando o PIN correto é digitado, então a autorização é concedida e o contador volta a 0.
- [ ] **CA04:** Dado o barista B, quando acumula 10 falhas de PIN em 15 min (alternando autorizadores), então novas tentativas de B são recusadas até a janela expirar.
- [ ] **CA05:** Dada a migração de hash, quando um gerente com PIN antigo tenta autorizar, então é orientado a redefinir o PIN (ou a validação legada converte o hash no primeiro uso), e nenhum hash `sha256` permanece após a redefinição.
- [ ] **CA06:** Dado o cargo "Atendente" sem `pdv.vender` atribuído a um usuário com `role='barista'`, quando ele tenta lançar pedido pela tela **ou** via `POST /rpc/criar_pedido` direto, então ambos são recusados.
- [ ] **CA07:** Dado um usuário com cargo "Gerente" com permissões `admin.relatorios` e `admin.caixa`, quando entra no admin, então vê só as abas Relatórios e Caixa. Acessar `admin.html#financeiro` mostra "sem permissão".
- [ ] **CA08:** Dado um usuário `cozinha`, quando tenta `PATCH /pedidos?id=eq.X` com `status=entregue`, então recebe erro. Barista com permissão consegue.
- [ ] **CA09:** Dado um usuário `cozinha` sem `pdv.cancelar_item`, quando chama `cancelar_item` em pedido não pago, então recebe "Acesso negado".
- [ ] **CA10:** Dado um barista com permissão, quando chama `cancelar_item` com `p_motivo` vazio ou "  ", então recebe erro de motivo obrigatório.
- [ ] **CA11:** Dado um usuário sem `pdv.transferir_mesa`, quando chama `transferir_mesa('M1','M2')`, então recebe "Acesso negado". Com permissão, a transferência ocorre e gera log de auditoria.
- [ ] **CA12:** Dada a chave anônima, quando chama `cancelar_item`, `transferir_mesa`, `validar_pin_autorizacao` ou `set_usuario_pin`, então recebe 401/403.
- [ ] **CA13 (negativo/regressão):** Dado um barista com o cargo padrão, quando vende, fecha conta, entrega e transfere mesa, então nenhuma etapa nova de autorização aparece e tudo funciona como antes.

## O que a atividade não inclui

- RPCs e policies abertas a `anon` dos canais de cliente (cashback, cupom, impressões, chamados de mesa) e views com dados pessoais sem `security_invoker`: motivo: tratadas em SDD de segurança própria. Cupom em CAF-000077.
- Autenticação em dois fatores para o admin: motivo: nova funcionalidade.

### Considerado para o futuro (P2)

- Login por PIN + crachá/NFC no PDV.
- Relatório de tentativas de PIN por funcionário.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Quais policies e grants estão ativos em produção hoje? (diagnóstico, seções 1 e 8) | dev | Sim | |
| D02 | Todos os usuários atuais já têm `cargo_id`? Se não, quais cargos atribuir antes de remover os fallbacks (RF05/RF06)? | PO | Sim | |
| D03 | Seleção do autorizador no modal (lista de gerentes) é aceitável na operação, ou preferem usuário + PIN digitado? | PO/design | Sim | |
| D04 | Tempo de bloqueio (15 min) e limites (5 por autorizador, 10 por solicitante) estão adequados? | PO | Não | |
| D05 | `pgcrypto` está habilitada no projeto Supabase? | dev | Não (RF04 é P1) | |

## Sugestões de casos de teste

Arquivo obrigatório: `tests/caf-000081-seguranca-pin-permissoes.test.js`. Ele exercita o código real de `js/pedidos.js` (`usuarioTemPermissao`, modal de PIN e chamadas a `cafeteriaDB.cargos.validarPin`) e da sidebar do admin (`js/admin/main.js` com `getMinhasPermissoes` mockado) em `happy-dom` com `tests/helpers/supabase-mock.js`. As regras de banco (RLS/RPC) ficam em `supabase/tests/caf-000081.sql`, que roda com `SET ROLE authenticated` e `request.jwt.claims` de cada papel, e em verificação REST com a chave anon (CT12).

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | PIN do autorizador escolhido | integração (DOM + mock) + SQL | CA01 | Escolher G1 e digitar o PIN de G2 | Recusado |
| CT02 | Bloqueio após 5 falhas | manual (SQL) | CA02 | 5 chamadas erradas e depois a correta | Bloqueado 15 min; log criado |
| CT03 | Reset no sucesso | manual (SQL) | CA03 | 3 erradas + 1 correta | Contador 0 |
| CT04 | Limite por solicitante | manual (SQL) | CA04 | 10 falhas alternando autorizadores | 11ª recusada |
| CT05 | Migração de hash | manual (SQL) | CA05 | Validar com PIN legado | Fluxo de redefinição/conversão |
| CT06 | Permissão removida | integração (mock) + SQL | CA06 | Cargo sem `pdv.vender`; UI e RPC | Ambos recusados |
| CT07 | Abas do admin | integração (DOM + mock) | CA07 | Mock de permissões do Gerente | Só as abas permitidas visíveis; rota bloqueada |
| CT08 | Cozinha não entrega | manual (SQL/REST) | CA08 | UPDATE como cozinha | Erro |
| CT09 | `cancelar_item` sem permissão | manual (SQL) | CA09 | Chamar como cozinha | Acesso negado |
| CT10 | Motivo obrigatório | manual (SQL) + integração | CA10 | Motivo vazio | Erro |
| CT11 | `transferir_mesa` com e sem permissão | manual (SQL) | CA11 | Chamar com os dois perfis | Negado / sucesso + log |
| CT12 | RPCs internas fechadas para anon | integração (REST) | CA12 | `curl` com chave anon | 401/403 |
| CT13 | Regressão do barista padrão | integração (DOM + mock) + manual | CA13 | Fluxo completo de venda | Sem passos extras |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/CAF-000036-permissoes-por-cargo-e-desempenho.md`, `supabase/diagnostico_schema_producao.sql`
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs concluídas (2026-10-20)
- Referências de design: N/A
- Requisitos originais: CAF-000001, CAF-000004, CAF-000011, CAF-000036
- Issue / PR relacionado: —
