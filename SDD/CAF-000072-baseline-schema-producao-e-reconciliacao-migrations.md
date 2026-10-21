# [CHORE] CAF-000072 — Baseline do schema de produção e reconciliação com as migrations

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:**
  1. Rodar `supabase/diagnostico_schema_producao.sql` no SQL Editor do Supabase de produção (`nyretgvzbnbtiyeioeju`) e versionar o resultado (CSV) em `supabase/snapshots/`.
  2. Gerar uma migration **baseline idempotente** (`supabase/migration_caf_000072_baseline_producao.sql`) que versiona tudo o que hoje só existe em produção, para que um banco novo criado a partir do repositório fique igual ao de produção.
  3. Definir e documentar a **fonte de verdade** do schema e a ordem oficial de aplicação das migrations.
  4. Padronizar a correspondência entre o número da migration e o número da SDD.
  5. Habilitar o **teste de contrato front ↔ schema** (especificado na CAF-000086), que impede o front de chamar RPC, parâmetro ou coluna inexistente.
- **Problema e evidência:** A auditoria de 2026-10-20 comparou o código com produção, usando apenas leituras com a chave anônima, e encontrou divergências:
  - `estoque_itens` tem **duas** colunas de custo, `custo_medio` (migration 031) e `custo_unitario_medio`, que não é criada por nenhuma migration.
  - A tabela `produto_adicionais_permitidos` (colunas `produto_id` e `adicional_id`) existe em produção e é usada pelas migrations 027, 028, 037, 038 e 040 e por `js/totem.js:296`. Nenhum arquivo em `supabase/` a cria.
  - Colunas que o front usa não existem em produção: `estoque_itens.unidade_medida`, `estoque_itens.saldo_atual`, `estoque_movimentos.data_validade`, `despesas.valor_total`, `despesas.data_pagamento`, `despesas.status`, `pedidos.horario_retirada` e `produtos.fornecedor_padrao_id`.
  - As assinaturas reais de `fechar_conta_mesa`, `adicionar_itens_pedido`, `cancelar_item`, `processar_cashback_pedido` e `registrar_uso_cupom` não puderam ser lidas com a chave anônima.
  - `fn_calcular_totais_caixa_interno` é redefinida na 039 (com taxas) e de novo na 044 (sem taxas). O resultado depende da ordem em que as migrations forem aplicadas.
  - A numeração das migrations não bate com a das SDDs (tabela em "Dependências técnicas"). Também existe o arquivo `supabase/migrations_todas_consolidadas.sql`, cujo papel não está documentado.
- **Impacto de não fazer:** As correções 073 a 084 seriam escritas contra um schema que não é o de produção. Um ambiente novo (staging ou recuperação de desastre) criado a partir do repositório nasceria quebrado. E o front continuaria podendo chamar colunas e RPCs inexistentes sem que nenhum teste acusasse.
- **Para quem é destinado:** Desenvolvedor / agente de IA que mantém o banco, e o PO, que precisa de ambientes reproduzíveis.
- **História de usuário:** Como desenvolvedor, quero que o repositório descreva exatamente o schema de produção, para corrigir bugs sem surpresas e conseguir recriar o banco do zero.
- **Como saberemos que deu certo:**
  - O diff entre o snapshot de produção e um banco recriado só com as migrations do repositório é igual a **0 itens** nas seções 1 a 8 do diagnóstico.
  - O teste de contrato (CAF-000086) roda em `npm test` com 0 violações.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Executar `supabase/diagnostico_schema_producao.sql` em produção e salvar o resultado em `supabase/snapshots/producao-AAAA-MM-DD.csv` | P0 | CA01 |
| RF02 | Criar `migration_caf_000072_baseline_producao.sql`, idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`), contendo: a tabela `produto_adicionais_permitidos` (PK `produto_id`+`adicional_id`, FKs, RLS, grants); `estoque_itens.custo_unitario_medio` tal como existe hoje (a unificação fica na 074); e o corpo **atual de produção** de todas as RPCs listadas na seção 1 do diagnóstico | P0 | CA02, CA03 |
| RF03 | Documentar em `supabase/README.md`: a fonte de verdade (o repositório passa a ser a fonte; nenhuma alteração direta em produção sem migration), a ordem oficial de aplicação e o papel de `migrations_todas_consolidadas.sql` (manter atualizado ou remover) | P0 | CA04 |
| RF04 | Padronizar o nome das migrations novas como `migration_caf_<NNNNNN da SDD>_<slug>.sql`. Para as antigas, criar uma tabela de correspondência no README em vez de renomear os arquivos | P1 | CA05 |
| RF05 | Resolver a redefinição de `fn_calcular_totais_caixa_interno` (039 × 044): a baseline grava a versão vigente em produção, e a escolha da versão correta (com ou sem taxas) é registrada como dúvida para a 080 | P0 | CA03 |
| RF06 | Gerar a partir do snapshot o arquivo `tests/fixtures/schema-producao.json` (RPCs com parâmetros e tabelas com colunas), consumido pelo teste de contrato da CAF-000086 | P0 | CA06 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | O diagnóstico e a baseline não podem alterar dados. A baseline só cria o que não existe e substitui funções pelo corpo idêntico ao de produção | P0 | CA02 |
| RNF02 | Aplicar a baseline duas vezes seguidas não gera erro nem diferença (idempotência) | P0 | CA03 |
| RNF03 | O snapshot não pode conter dados pessoais, apenas metadados de catálogo | P0 | CA01 |

### Dependências técnicas

- `supabase/diagnostico_schema_producao.sql` (já criado).
- Divergências de numeração entre migration e SDD:

| Arquivo de migration | SDD correspondente |
|---|---|
| `migration_caf_000005.sql` | CAF-000006 (produto esgotado) |
| `migration_caf_000006_estacoes.sql` | CAF-000007 (estação bar × cozinha) |
| `migration_caf_000021_cliente_viagem.sql` | CAF-000010 |
| `migration_caf_000022_transferir_mesa.sql` | CAF-000011 |
| `migration_caf_000023_taxa_desconto.sql` | CAF-000013 |
| `migration_caf_000024_relatorios.sql` | CAF-000014 |
| `migration_caf_000025_caixa.sql` | CAF-000015 |
| `migration_caf_000026_idempotencia.sql` | CAF-000018 |
| `migration_caf_000027_conclusao_estacao.sql` | CAF-000022 |
| `migration_caf_000028_itens_lancados_depois.sql` | CAF-000024 |
| `migration_caf_000029_tempo_alvo_semaforo.sql` | CAF-000025 |

- É pré-requisito das CAF-000073 a CAF-000084.
- O teste de contrato está especificado na CAF-000086.

### Recursos necessários

- Acesso ao SQL Editor do Supabase de produção (PO).
- Opcional: `supabase` CLI e Docker para subir um banco local e conferir o diff.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado que o diagnóstico foi executado em produção, quando o CSV for salvo em `supabase/snapshots/`, então ele deve conter as seções 1 a 9 e nenhuma linha de dados de clientes ou pedidos.
- [ ] **CA02:** Dado um banco vazio com as migrations aplicadas na ordem oficial e depois a baseline, quando o diagnóstico rodar nele, então o resultado das seções 1 a 8 deve ser idêntico ao snapshot de produção.
- [ ] **CA03:** Dado o banco de produção, quando a baseline for aplicada duas vezes, então nenhuma execução deve falhar e o diagnóstico depois delas deve ser idêntico ao de antes.
- [ ] **CA04:** Dado um desenvolvedor novo, quando ler `supabase/README.md`, então deve saber a ordem de aplicação, a fonte de verdade e a proibição de alterar produção sem migration.
- [ ] **CA05:** Dado o README, quando alguém procurar a migration de uma SDD antiga (por exemplo, a CAF-000013), então deve encontrar o arquivo correto na tabela de correspondência.
- [ ] **CA06:** Dado `tests/fixtures/schema-producao.json`, quando o teste de contrato (CAF-000086) rodar contra o código atual, então ele deve listar as violações conhecidas (por exemplo, `fechar_conta_mesa.p_subtotal` e `despesas.valor_total`). Isso prova que o teste detecta o problema.
- [ ] **CA07 (negativo):** Dado que a baseline foi aplicada, quando houver qualquer diferença em `pedidos`, `fechamentos` ou `cliente_conta_movimentos`, então a contagem de linhas antes e depois deve ser a mesma, ou seja, nenhum dado é alterado.

## O que a atividade não inclui

- Corrigir os bugs de cada módulo: motivo: cada correção tem sua SDD (073 a 084).
- Renomear migrations antigas: motivo: quebraria o histórico de quem já aplicou os arquivos. A tabela de correspondência resolve.
- Migrar o projeto para `supabase/migrations` com timestamps do CLI: motivo: complexo demais agora.

### Considerado para o futuro (P2)

- Ambiente de staging no Supabase, recriado a partir do repositório e usado no CI.
- Detecção automática de drift: rodar o diagnóstico em agendamento e comparar com o snapshot.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Quem alterou produção diretamente (`custo_unitario_medio`, `produto_adicionais_permitidos`), e existem outros scripts aplicados fora do repositório? | PO | Sim | |
| D02 | `migrations_todas_consolidadas.sql` é usado para criar ambientes? Mantemos ou removemos? | PO/dev | Não | |
| D03 | Podemos ter um projeto Supabase de staging (custo do plano)? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Snapshot sem dados pessoais | manual | CA01 | Abrir o CSV e procurar telefone, nome ou e-mail | Só metadados de catálogo |
| CT02 | Paridade banco novo × produção | integração (Supabase local) | CA02 | `supabase db reset` com as migrations e a baseline; rodar o diagnóstico; comparar com o CSV | Diff vazio nas seções 1 a 8 |
| CT03 | Idempotência | integração | CA03, CA07 | Aplicar a baseline 2× em uma cópia de produção; contar as linhas das tabelas principais | Sem erro; contagens e diagnóstico iguais |
| CT04 | README | manual | CA04, CA05 | Revisão pelo PO | Ordem, fonte de verdade e tabela de correspondência presentes |
| CT05 | Fixture alimenta o contrato | unit | CA06 | Rodar o teste da 086 com o fixture e o código atual | O teste falha listando as violações conhecidas |

## URL Complementar

- Documentação técnica: `supabase/diagnostico_schema_producao.sql`, `supabase/migrations_todas_consolidadas.sql`
- Discussões relacionadas: auditoria de SDDs de 2026-10-20 (sessão Claude Code)
- Requisitos originais: CAF-000020, 031, 032, 039, 044 e 068
- Issue / PR relacionado: CAF-000073 a CAF-000086
