# [FIX] CAF-000077 — Cupons: uso único por pedido, RPC protegida e rastreio do cupom no fechamento do PDV

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Corrigir a contabilização de cupons entregue na CAF-000061 para que cada uso fique vinculado a um pedido real, não possa ser contado duas vezes nem inflado por chamadas anônimas, e para que o fechamento de mesa no PDV grave no pedido qual cupom/campanha foi aplicado.
- **Problema e evidência:**
  1. `registrar_uso_cupom(p_campanha_id, p_valor_pedido)` (`supabase/migration_caf_000061_cupons_desconto.sql:101-120`) não recebe `pedido_id`: apenas soma `usos_registrados + 1` e `receita_atribuida + valor`. Não há como garantir "1 uso por pedido" nem auditar quais pedidos usaram o cupom.
  2. A função é `SECURITY DEFINER` e tem `GRANT EXECUTE ... TO anon, authenticated` (`migration_caf_000061:122`). Qualquer visitante com a chave pública pode chamá-la em loop e inflar usos e receita atribuída das campanhas (métrica de ROI do CRM — CAF-000041).
  3. Fallback no cliente (`js/utils/coupon-validator.js:133-147`): se a RPC falhar, o front faz `select` + `update` direto em `campanhas` (leitura-modificação-escrita sem lock — perde incrementos concorrentes e depende de RLS aberta).
  4. No PDV, o cupom validado é guardado em `currentFechamento._cupomCampanhaId/_cupomCodigo` (`js/pedidos.js:4285-4288`), mas a chamada a `fechar_conta_mesa` (`js/pedidos.js:4870-4877`) não envia esses campos. As colunas `pedidos.cupom_codigo` e `pedidos.campanha_id` existem em produção (confirmado por sonda REST em 2026-10-20), mas ficam nulas para vendas de mesa — só totem (`js/totem.js:872-873`) e cardápio do cliente (`js/cardapio-cliente-pedido.js:1184-1185`) gravam.
  5. O registro de uso no PDV (`js/pedidos.js:4881-4886`) é disparado sem `await` e sem tratamento: se falhar, a venda é fechada mas o uso não é contado; se o operador reabrir/fechar, conta de novo.
- **Impacto de não fazer:** Relatórios de campanha (usos, receita atribuída, ROI) ficam incorretos e manipuláveis por terceiros; impossível auditar descontos concedidos por cupom em vendas de mesa; risco de decisões de marketing baseadas em números inflados.
- **Para quem é destinado:** PO/gestor (relatórios de CRM), barista/caixa (fechamento de mesa) e desenvolvedor.
- **História de usuário:** Como gestor, quero que cada uso de cupom fique ligado ao pedido que o utilizou e não possa ser registrado por terceiros, para confiar nos números de usos e receita das minhas campanhas.
- **Como saberemos que deu certo:** 0 incrementos possíveis via chamada anônima direta; `usos_registrados` de cada campanha = `COUNT(DISTINCT pedido_id)` dos pedidos com aquela `campanha_id` (consulta de conciliação retorna 0 divergências); 100% dos fechamentos de mesa com cupom gravam `cupom_codigo` e `campanha_id`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Alterar `registrar_uso_cupom` para receber `p_pedido_id` obrigatório; o uso é registrado em uma tabela/coluna que garanta unicidade por pedido (ex.: `campanha_usos(campanha_id, pedido_id)` com `UNIQUE(pedido_id)`), e `usos_registrados`/`receita_atribuida` são derivados ou atualizados atomicamente apenas quando o registro é novo | P0 | CA01, CA02 |
| RF02 | A RPC deve validar no servidor que o pedido existe, não está cancelado, tem `campanha_id` igual ao informado e usar o `total` do próprio pedido como receita (ignorar valor enviado pelo cliente) | P0 | CA03 |
| RF03 | Revogar `EXECUTE` de `anon` na RPC de registro; canais anônimos (QR/mesa, pedido online, totem) passam a registrar o uso dentro da própria RPC de criação de pedido (`criar_pedido_cliente`/`criar_pedido_online`/totem), na mesma transação | P0 | CA04 |
| RF04 | Remover o fallback de `update` direto em `campanhas` em `js/utils/coupon-validator.js:133-147` | P0 | CA05 |
| RF05 | O fechamento de mesa no PDV deve gravar `cupom_codigo` e `campanha_id` nos pedidos fechados e registrar o uso na mesma transação de `fechar_conta_mesa` (ou chamada aguardada com tratamento de erro visível ao operador) | P0 | CA06, CA07 |
| RF06 | Cancelar um pedido que usou cupom deve estornar o uso (remover registro e recalcular contadores) | P1 | CA08 |
| RF07 | Script SQL de conciliação que recalcula `usos_registrados`/`receita_atribuida` a partir dos pedidos existentes, para corrigir o histórico | P1 | CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma RPC que altere contadores de campanha pode ser executável por `anon` (verificável pela seção `1_funcao` de `supabase/diagnostico_schema_producao.sql`: `anon_exec=false`) | P0 | CA04 |
| RNF02 | Registro de uso idempotente: chamar N vezes com o mesmo `pedido_id` resulta em exatamente 1 uso | P0 | CA02 |
| RNF03 | Migration idempotente (`CREATE OR REPLACE`, `IF NOT EXISTS`) e com `DROP FUNCTION` da assinatura antiga `(BIGINT, NUMERIC)` | P0 | CA01 |

### Dependências técnicas

- **CAF-000072** (baseline do schema de produção) — confirmar a assinatura real de `registrar_uso_cupom` e de `fechar_conta_mesa` em produção antes de escrever a migration.
- CAF-000073 — correção do fechamento de conta (`fechar_conta_mesa`, parâmetros divergentes entre front e banco) — RF05 altera a mesma RPC; implementar depois dela ou junto.
- `supabase/migration_caf_000061_cupons_desconto.sql`, `js/utils/coupon-validator.js`, `js/pedidos.js` (≈4180-4290, 4860-4890), `js/totem.js:860-900`, `js/cardapio-cliente-pedido.js:1180-1210`.

### Recursos necessários

- Acesso ao SQL Editor do Supabase de produção para aplicar a migration e rodar o script de conciliação.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado que a migration foi aplicada, quando consulto `pg_proc`, então existe apenas `registrar_uso_cupom(p_campanha_id, p_pedido_id)` (sem a versão `(BIGINT, NUMERIC)`).
- [ ] **CA02:** Dado um pedido pago com cupom, quando o registro de uso é chamado 3 vezes para o mesmo pedido, então `usos_registrados` da campanha aumenta exatamente 1.
- [ ] **CA03:** Dado um pedido com `total = 40,00`, quando o cliente envia o registro com valor `9999`, então `receita_atribuida` aumenta 40,00; e dado um pedido cancelado ou com outra `campanha_id`, então a chamada é recusada.
- [ ] **CA04:** Dado um usuário anônimo com a chave pública, quando chama `POST /rpc/registrar_uso_cupom`, então recebe erro de permissão e nenhum contador muda.
- [ ] **CA05:** Dado que a RPC de registro falha, quando o front trata o erro, então não há `update` direto em `campanhas` (teste verifica que o mock não recebe `from('campanhas').update`).
- [ ] **CA06:** Dado que o barista aplica o cupom `TEATRO10` no fechamento da mesa 5, quando confirma o fechamento, então todos os pedidos fechados da mesa têm `cupom_codigo = 'TEATRO10'` e `campanha_id` preenchidos.
- [ ] **CA07:** Dado que o registro do uso falha no fechamento, quando o operador conclui, então recebe aviso visível (toast) e a falha é logada — a venda não é silenciosamente contada como sem cupom.
- [ ] **CA08:** Dado um pedido com cupom já registrado, quando o pedido é cancelado, então o uso é removido e os contadores voltam ao valor anterior.
- [ ] **CA09:** Dado o histórico atual, quando o script de conciliação roda, então a consulta `usos_registrados <> COUNT(DISTINCT pedido_id)` retorna 0 linhas.
- [ ] **CA10 (negativo):** Dado um fechamento de mesa sem cupom, quando confirmado, então nenhum registro de uso é criado e `cupom_codigo` permanece nulo.

## O que a atividade não inclui

- Limite de usos por cliente/CPF ou validade por quantidade: motivo: regra de negócio nova, fora do escopo de correção.
- Reescrever a validação do cupom (`validar_cupom`): motivo: funciona corretamente e já é coberta por `tests/caf-000061-cupons.test.js`.

### Considerado para o futuro (P2)

- Limite máximo de usos por campanha e por cliente usando a mesma tabela `campanha_usos`.
- Painel de cupons com lista dos pedidos que usaram cada código.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | A assinatura de `registrar_uso_cupom` em produção é a mesma da migration 061? (rodar `diagnostico_schema_producao.sql`, seção 1) | dev | Sim | |
| D02 | Em mesa com vários pedidos, o cupom vale para todos os pedidos da conta ou só um? (impacta quantos registros de uso por fechamento) | PO | Sim | |
| D03 | O histórico inflado deve ser recalculado (RF07) ou apenas corrigido daqui em diante? | PO | Não | |

## Sugestões de casos de teste

Arquivo obrigatório: `tests/caf-000077-cupons-uso-por-pedido.test.js`, exercitando o código real (`js/utils/coupon-validator.js` e o fluxo de fechamento de `js/pedidos.js` carregado com `happy-dom` + `tests/helpers/supabase-mock.js`), não apenas utilitários isolados. Os casos SQL (CA01-CA04, CA08, CA09) devem ter script de verificação em `supabase/tests/caf-000077.sql` executável no SQL Editor.

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Assinatura nova da RPC | manual (SQL) | CA01 | Rodar seção 1 do diagnóstico | Só a assinatura `(p_campanha_id, p_pedido_id)` |
| CT02 | Idempotência por pedido | manual (SQL) | CA02 | Chamar 3x com mesmo pedido | +1 em `usos_registrados` |
| CT03 | Valor vem do pedido | manual (SQL) | CA03 | Chamar com valor falso; com pedido cancelado | Receita = total real; cancelado recusado |
| CT04 | Bloqueio anônimo | integração (REST) | CA04 | `curl` com chave anon | 401/403, contadores inalterados |
| CT05 | Sem fallback de update | unit | CA05 | Mock da RPC retornando erro e chamar `registerCouponUsage` | Mock não registra `update` em `campanhas` |
| CT06 | Fechamento grava cupom | integração (DOM + mock) | CA06 | Aplicar cupom no modal e confirmar | Payload de `fechar_conta_mesa` contém `cupom_codigo` e `campanha_id` |
| CT07 | Falha no registro avisa operador | integração (DOM + mock) | CA07 | Mock de erro no registro | Toast de aviso exibido; erro logado |
| CT08 | Estorno no cancelamento | manual (SQL) | CA08 | Cancelar pedido com cupom | Contadores voltam |
| CT09 | Conciliação | manual (SQL) | CA09 | Rodar script e query de divergência | 0 linhas |
| CT10 | Fechamento sem cupom | integração (DOM + mock) | CA10 | Fechar sem aplicar cupom | Nenhuma chamada de registro; campos nulos |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/CAF-000061-validacao-cupons-desconto-checkout-e-pdv.md`, `supabase/diagnostico_schema_producao.sql`
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs concluídas (2026-10-20)
- Referências de design: N/A
- Requisitos originais: CAF-000061, CAF-000041
- Issue / PR relacionado: —
