# [FIX] Estoque: trigger de combos quebrado, PEPS no estorno e saldo incremental com lock

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer os componentes de combo baixarem estoque pelo schema real, devolver aos lotes o que for estornado, e calcular o saldo de cada insumo de forma incremental e segura contra vendas simultâneas.
- **Problema e evidência:**
  - **Trigger de combo escrito contra um schema que não existe:** `fn_baixa_estoque_combo_escolha` (`supabase/migration_caf_000110_combos_kits.sql:226-272`) lê `ficha_tecnica_itens` (a tabela real é `fichas_tecnicas`), atualiza `estoque_itens.quantidade_atual` (a coluna real é `quantidade`) e insere em `estoque_movimentos` as colunas `estoque_item_id`, `pedido_id` e `criado_em` (reais: `item_id`, `pedido_item_id`, `created_at`) com `tipo = 'venda'`, que o CHECK recusa (`supabase/migration_caf_000031_controle_estoque.sql:29` aceita `'entrada','saida_venda','estorno','ajuste','perda'`). O PL/pgSQL só valida isso ao executar, por isso a migration aplicou sem erro. Colunas conferidas em `tests/fixtures/schema-snapshot.json`.
  - **Nada grava escolhas de combo:** nenhuma RPC nem tela insere em `pedido_item_combo_escolhas` (busca em `supabase/*.sql` e `js/` só encontra a criação da tabela e policies). `validar_e_calcular_combo` existe (`supabase/migration_caf_000110_combos_kits.sql:120`) mas não é chamada pela criação do pedido, e o seletor de combo previsto na CAF-000110 (RF03) não existe no PDV, totem nem cardápio (`js/utils/combos.js` só é importado por testes). O pgTAP só verifica que tabelas, função e trigger existem (`supabase/tests/combos_kits.test.sql:5-31`). Hoje os componentes do combo nunca baixam estoque; e se alguém ligar a gravação das escolhas, o trigger aborta o pedido inteiro.
  - **PEPS não volta no estorno:** `fn_estoque_abater_lotes_peps` (`supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql:117-161`) abate lotes em `saida_venda`, `perda` e `ajuste` negativo. O estorno (`fn_estorno_estoque_pedido_item`, `supabase/migration_caf_000031_controle_estoque.sql:224-251`) grava um movimento `estorno` que soma ao saldo, mas não repõe `estoque_lotes.quantidade_restante`. Ajuste positivo também não cria nem repõe lote (`fn_estoque_criar_lote_entrada` só trata `entrada`, `:63-108` da 111). Com o tempo, a soma dos lotes fica menor que o saldo e a sugestão de compras, o alerta de validade e a baixa de vencidos passam a errar.
  - **Saldo recalculado do zero e sem lock:** `fn_estoque_recalcular_saldo` (`supabase/migration_caf_000031_controle_estoque.sql:56-103`) faz `SUM` de todo o histórico do item a cada movimento (custo cresce com o histórico) e só depois dá `UPDATE`. Duas vendas simultâneas do mesmo insumo leem o SUM sem ver o movimento da outra transação e a última a gravar sobrescreve o saldo (lost update).
- **Impacto de não fazer:** Estoque de componentes de combo sempre maior que o real; quebra total do pedido de combo assim que as escolhas forem gravadas; lotes "fantasmas" esgotados enquanto o saldo diz que há produto; saldo errado após picos de venda; trigger mais lento a cada mês.
- **Para quem é destinado:** Dono/gestor de estoque (compras e validade) e operação (produto marcado esgotado na hora certa).
- **História de usuário:** Como gestor, quero que o saldo e os lotes reflitam o que foi vendido, cancelado e ajustado, inclusive em combos, para comprar certo e não perder insumo vencido.
- **Como saberemos que deu certo:** Soma de `quantidade_restante` dos lotes = saldo do item (para itens que controlam lote) após um roteiro de venda, cancelamento e ajuste; 0 divergência de saldo em teste com 20 vendas concorrentes; tempo do trigger constante com 10 mil movimentos no item.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Reescrever `fn_baixa_estoque_combo_escolha` sobre `fichas_tecnicas` e `estoque_movimentos` (`item_id`, `tipo = 'saida_venda'`, `pedido_item_id`, `created_at`), sem `UPDATE` direto no saldo | P0 | CA01 |
| RF02 | `criar_pedido`, `criar_pedido_cliente`, `criar_pedido_online`, `criar_pedido_totem` e `adicionar_itens_pedido` aceitam `combo_escolhas` por item, validam com `validar_e_calcular_combo` e gravam em `pedido_item_combo_escolhas` | P0 | CA01, CA02 |
| RF03 | Cancelamento de item de combo estorna também os componentes (já coberto pelo estorno por `pedido_item_id` depois do RF01; garantir por teste) | P0 | CA03 |
| RF04 | Tabela `estoque_movimento_lotes` (movimento, lote, quantidade) preenchida pelo abatimento PEPS; estorno devolve a cada lote o que saiu dele e reativa o lote | P0 | CA04 |
| RF05 | Ajuste positivo cria lote "ajuste" sem validade (ou repõe o último lote consumido, conforme D02) | P1 | CA05 |
| RF06 | Saldo incremental: o trigger aplica o delta do movimento com `SELECT ... FOR UPDATE` na linha de `estoque_itens` antes de calcular; custo médio usa o saldo travado | P0 | CA06, CA07 |
| RF07 | Função de reconciliação (admin) que recalcula saldo e lotes a partir do histórico e informa divergências, para rodar uma vez após a migration | P1 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Tempo do trigger de saldo não cresce com o número de movimentos (medido com 10 mil movimentos: < 5 ms por inserção no banco local) | P0 | CA07 |
| RNF02 | Pedido com combo inválido é recusado inteiro, sem baixa parcial | P0 | CA02 |
| RNF03 | Migração não altera saldos atuais sem passar pela reconciliação revisada (RF07) | P0 | CA08 |

### Dependências técnicas

- Migrations 031, 032, 074, 110 e 111; RPCs de pedido (034, 037, 038, 040).
- CAF-000135 e CAF-000131 também alteram RPCs de pedido: combinar ordem.
- CAF-000138 (banco reconstruível pelo manifesto) para rodar os pgTAP novos no CI.

### Recursos necessários

- Cópia do banco de produção (backup da CAF-000116) para ensaiar a reconciliação.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um combo "Café + Croissant" cujas fichas usam 18 g de café e 1 croissant, quando um pedido com 2 combos é criado com as escolhas, então existem movimentos `saida_venda` de 36 g de café e 2 croissants ligados ao `pedido_item_id` e os saldos caem nesses valores.
- [ ] **CA02:** Dado um combo com grupo obrigatório sem escolha, ou com produto esgotado, quando o pedido é enviado, então a RPC recusa e nenhum movimento ou item é gravado (caso negativo).
- [ ] **CA03:** Dado o item de combo do CA01, quando é cancelado, então surgem movimentos `estorno` para café e croissant e os saldos voltam ao valor anterior.
- [ ] **CA04:** Dado um insumo com lote A (validade próxima, 5 un) e lote B (10 un), quando uma venda de 7 un é cancelada, então A volta a 5 e B volta a 10, e A é reativado.
- [ ] **CA05:** Dado um ajuste positivo de 3 un, quando gravado, então a soma dos lotes ativos aumenta 3 e continua igual ao saldo.
- [ ] **CA06:** Dado 20 vendas simultâneas de 1 un do mesmo insumo com saldo 50, quando todas concluem, então o saldo é 30.
- [ ] **CA07:** Dado um item com 10 mil movimentos, quando um novo movimento é inserido, então o tempo do trigger fica dentro do RNF01.
- [ ] **CA08:** Dado um banco com divergências entre lotes e saldo, quando a reconciliação roda em modo relatório, então lista os itens divergentes sem alterar nada; em modo aplicar, corrige.

## O que a atividade não inclui

- Seletor de combo no PDV, totem e cardápio (RF03 da CAF-000110, que não foi implementado): motivo: trabalho de interface em três telas; abrir SDD própria (D01). Esta SDD deixa o servidor pronto.
- Custo médio por lote (PEPS também no custo): motivo: mudança contábil; manter custo médio ponderado atual.
- Inventário cíclico e contagem por lote: motivo: outra iniciativa.

### Considerado para o futuro (P2)

- Alerta quando a reconciliação diária encontrar divergência.
- Baixa de combo por "kit" fixo sem escolha (componentes predefinidos).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | O seletor de combo nas telas entra numa SDD nova ou reabre a CAF-000110 como "Concluída com ressalvas"? | PO | Não | |
| D02 | Ajuste positivo cria lote novo sem validade ou repõe o último lote consumido? | PO | Não | |
| D03 | Itens com divergência na reconciliação: aplicar automaticamente ou só após conferência física? | PO | Sim | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Baixa de combo | pgTAP | CA01 | Criar ficha, combo e pedido com escolhas | Movimentos e saldos corretos |
| CT02 | Combo inválido | pgTAP | CA02 | Sem escolha obrigatória; produto esgotado | Exceção; nada gravado |
| CT03 | Estorno de combo | pgTAP | CA03 | Cancelar item via `cancelar_item` | Estornos e saldo restaurado |
| CT04 | Estorno nos lotes | pgTAP | CA04 | Dois lotes, vender 7, cancelar | Lotes restaurados e reativados |
| CT05 | Ajuste positivo | pgTAP | CA05 | Inserir ajuste +3 | Soma dos lotes = saldo |
| CT06 | Concorrência | integração (script com 20 conexões no Postgres local) | CA06 | Disparar vendas em paralelo | Saldo 30 |
| CT07 | Desempenho | pgTAP/benchmark | CA07 | 10 mil movimentos e medir inserção | Dentro do limite |
| CT08 | Reconciliação | pgTAP | CA08 | Criar divergência; rodar relatório e aplicar | Lista e corrige |
| CT09 | Contrato de colunas | pgTAP `has_column`/`col_type_is` | CA01 | Conferir colunas usadas pelo trigger | Todas existem |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000031_controle_estoque.sql`, `supabase/migration_caf_000110_combos_kits.sql`, `supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql`, `supabase/tests/combos_kits.test.sql`, `js/utils/combos.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000031](CONCLUIDAS/CAF-000031-controle-de-estoque.md), [CAF-000032](CONCLUIDAS/CAF-000032-ficha-tecnica-custo-e-lucro.md), [CAF-000074](CONCLUIDAS/CAF-000074-correcao-estoque-ficha-tecnica-e-lista-de-compras.md), [CAF-000110](CONCLUIDAS/CAF-000110-combos-e-kits-promocionais-cardapio-totem-pdv.md), [CAF-000111](CONCLUIDAS/CAF-000111-sugestao-inteligente-compras-lotes-validade-peps-estoque.md), [CAF-000116](CONCLUIDAS/CAF-000116-backup-restauracao-e-runner-de-migrations.md); novas: CAF-000131, CAF-000135, CAF-000138
- Referências de design: PostgreSQL, "Explicit Locking" (`SELECT ... FOR UPDATE`)
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
