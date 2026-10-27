# [FIX] Correção das Colunas prioridade e prioridade_motivo na Tabela pedidos e RPCs Associadas

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-27 · **Atualizada em:** 2026-10-27

## Detalhes da Atividade

- **O que precisa ser feito:** 
  Criar e aplicar migration corretiva que adiciona as colunas `prioridade` (SMALLINT NOT NULL DEFAULT 0) e `prioridade_motivo` (TEXT) à tabela `public.pedidos` no banco de dados Supabase de produção, recria o índice de aceleração de fila `idx_pedidos_prioridade_created`, restaura a RPC `alterar_prioridade_pedido`, atualiza o gatilho `fn_audit_pedidos` e valida via teste automatizado o registro de pedidos do PDV (Balcão e Viagem).
- **Problema e evidência:** 
  Ao tentar registrar um pedido de Balcão ou Viagem no PDV (`pedidos.html`), a chamada à RPC `criar_pedido` falha com a mensagem:
  `column "prioridade" of relation "pedidos" does not exist` (PostgreSQL Error 42703).
  *Evidência diagnóstica:* Consulta direta ao catálogo de produção via Supabase MCP (`information_schema.columns`) confirmou que a tabela `public.pedidos` possui 41 colunas, mas **não contém** as colunas `prioridade` e `prioridade_motivo`. A função `criar_pedido` definida no banco realiza explicitamente:
  `INSERT INTO public.pedidos (..., prioridade, prioridade_motivo) VALUES (..., v_prioridade, v_prioridade_motivo)`
  bloqueando 100% das criações de novos pedidos no PDV.
- **Impacto de não fazer:** 
  Bloqueio total de operação no PDV para novos pedidos em Balcão e Viagem, impedindo o atendimento ao público e o fluxo da cafeteria.
- **Para quem é destinado:** 
  Atendentes, baristas e clientes do PDV, da Cozinha (KDS) e da operação geral.
- **História de usuário:** 
  Como atendente/barista no PDV, quero registrar pedidos de Balcão e Viagem sem erros de banco de dados, para que os pedidos sejam criados imediatamente e enviados à fila de preparo.
- **Como saberemos que deu certo:** 
  1. As colunas `prioridade` e `prioridade_motivo` existirem na tabela `public.pedidos` no banco de produção.
  2. Chamadas a `criar_pedido` via PDV para Balcão e Viagem executarem com sucesso (HTTP 200 / payload retornado com `id`).
  3. 100% dos testes em `npm test` e `npm run build` passarem sem erros.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|---|---|
| RF01 | Adicionar colunas `prioridade SMALLINT NOT NULL DEFAULT 0` e `prioridade_motivo TEXT` na tabela `public.pedidos` de forma idempotente (`ADD COLUMN IF NOT EXISTS`) | P0 | CA01, CA02 |
| RF02 | Criar índice composto `idx_pedidos_prioridade_created` em `public.pedidos(prioridade DESC, created_at ASC)` para manter a performance da ordenação do KDS | P0 | CA03 |
| RF03 | Instalar/atualizar a RPC `alterar_prioridade_pedido(p_pedido_id BIGINT, p_prioridade SMALLINT, p_motivo TEXT)` e conceder permissão de execução a `authenticated` | P0 | CA04 |
| RF04 | Atualizar a trigger function `fn_audit_pedidos` para auditar alterações de prioridade no histórico de eventos (`pedido_eventos`) | P1 | CA05 |
| RF05 | Registrar a migration na tabela `public.app_migrations` com a versão `104` | P0 | CA06 |

### Requisitos não funcionais

| ID | Descrição | Prioridade | CAs |
|---|---|---|---|
| RNF01 | Não causar downtime, perda de dados ou bloqueio prolongado de tabelas (`IF NOT EXISTS`, locks seguros) | P0 | CA01 |
| RNF02 | Preservar a compatibilidade regressiva com a suíte de testes existente (todos os 111 arquivos e 738 testes passando) | P0 | CA07 |

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o banco de dados de produção, quando inspecionada a estrutura da tabela `public.pedidos`, então as colunas `prioridade` (tipo `smallint`, default `0`) e `prioridade_motivo` (tipo `text`, nullable) estão presentes.
- [x] **CA02:** Dado o formulário do PDV com itens no carrinho para mesa "BALCAO" e "Viagem", quando o atendente clica em Enviar Pedido, então a RPC `criar_pedido` grava com sucesso o pedido, retornando `id` e total calculado sem exceção de coluna inexistente.
- [x] **CA03:** Dado o banco de dados, quando consultados os índices de `public.pedidos`, então o índice `idx_pedidos_prioridade_created` está ativo.
- [x] **CA04:** Dado um pedido existente, quando invocado `alterar_prioridade_pedido(p_pedido_id, 1, 'Urgente')` por usuário autenticado, então a prioridade é atualizada e o motivo gravado.
- [x] **CA05:** Dado um pedido cuja prioridade foi alternada, quando consultada a tabela `pedido_eventos`, então há um evento `prioridade_alterada` registrado com o motivo.
- [x] **CA06:** Dado o banco de dados, quando consultada a tabela `public.app_migrations`, então a migration `migration_caf_000104_correcao_prioridade_pedidos.sql` consta registrada com versão `104`.
- [x] **CA07 (negativo):** Dado o ambiente após a aplicação da migration, quando executados `npm test` e `npm run build`, então 100% dos testes e do build passam com sucesso.

## O que a atividade não inclui

- Alterações nas telas do KDS ou PDV além da validação do fluxo já existente.
- Modificação na regra de cálculo de totais ou itens de pedidos.

## Plano de Implementação Proposto (após aprovação)

1. Criar `supabase/migration_caf_000104_correcao_prioridade_pedidos.sql` contendo o DDL idempotente.
2. Aplicar a migration no Supabase de produção (`project_id: nyretgvzbnbtiyeioeju`) através da ferramenta `execute_sql`.
3. Criar teste pgTAP `supabase/tests/correcao_prioridade.test.sql` e teste funcional `tests/caf-000104-prioridade-pedidos.test.js`.
4. Executar `npm test` e `npm run build`.
5. Marcar os CAs como atendidos, atualizar `SDD/INDICE.md` e mover para `SDD/CONCLUIDAS/`.

