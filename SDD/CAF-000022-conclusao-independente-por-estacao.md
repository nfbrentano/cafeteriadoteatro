# CAF-000022 — [Bug] [Cozinha] Conclusão independente por estação (bar × cozinha)

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Cozinha (KDS) + banco | 🔴 Alta | M | Especificação · aguardando revisão |

---

## Detalhes da Atividade

- **O que precisa ser feito:** fazer cada estação (bar e cozinha) concluir **só os próprios itens**. O pedido passa para "Pronto" apenas quando **todas** as estações envolvidas terminarem.
- **Por que é necessário:** a [CAF-000007](CONCLUIDAS/CAF-000007-separacao-por-estacao-bar-cozinha.md) criou o filtro de estação, mas as ações do card continuam valendo para o pedido inteiro. Quando o bar toca em "Pronto!" num pedido com 1 café e 1 baguete, a baguete também é marcada como pronta e o pedido é chamado por voz enquanto a cozinha ainda está preparando.
- **Qual valor será agregado:** o salão só é avisado quando o pedido está completo, o barista para de levar pedidos pela metade e o tempo de preparo nos relatórios ([CAF-000014](CONCLUIDAS/CAF-000014-relatorios-no-admin.md)) passa a refletir a realidade.
- **Para quem é destinado:** equipe de cozinha e bar e baristas do salão.

### Análise da causa

1. **"Pronto!" conclui o pedido inteiro.** `window.updateStatus(pedidoId, 'concluido')` (`js/cozinha.js:594-605`) marca `pronto_em` em **todos** os itens não cancelados do pedido (`.eq('pedido_id', pedidoId)`), sem filtrar pela estação selecionada.
2. **"Iniciar Preparo" também vale para o pedido inteiro.** `updateStatus(..., 'em_preparo')` grava `pedidos.iniciado_em` (`js/cozinha.js:587-592`) no primeiro toque de qualquer estação, e não existe registro de início por estação.
3. **A regra de conclusão fica no navegador.** Em `toggleItemPronto` (`js/cozinha.js:562-578`), quem conclui o pedido é a tela que marcou o último item. Se duas telas (bar e cozinha) marcam itens ao mesmo tempo, cada uma calcula o progresso com o estado local e o pedido pode não ser concluído, ou ser concluído duas vezes (a voz toca duas vezes).
4. **Pedido pendente com um item só não conclui.** Em `toggleItemPronto`, marcar o único item de um pedido `pendente` só o move para `em_preparo` (o `if/else if` impede a checagem de conclusão). É preciso tocar em "Pronto!" depois.
5. **"Desfazer" deixa os itens marcados.** Voltar um pedido para `em_preparo` (`js/cozinha.js:489`) não limpa `pronto_em`, e o card volta para "Em preparo" com 100% dos itens marcados.
6. **A estação é deduzida da categoria atual.** `produtosCache` (`js/cozinha.js:109-127`) resolve a estação pela categoria **no momento da consulta**. Se o admin muda a categoria de estação, pedidos antigos mudam de tela.

### Referência de mercado

- **SAIPOS:** a tela KDS trabalha por etapas de produção. Cada produto é selecionado e avançado de etapa individualmente (seta verde) e a tela de expedição só mostra a senha quando o pedido está completo.
- **Padrão de mercado (Food Sistemas, Teknisa e outros):** um monitor por praça (quente, frios, bar, sobremesa) e uma **tela consolidada do expedidor** que mostra quando cada componente ficou pronto.

---

## Requisitos da Atividade

### Requisitos funcionais
- [ ] Gravar a estação no item no momento do pedido: `pedido_itens.estacao TEXT CHECK (estacao IN ('bar','cozinha'))`, preenchida por `criar_pedido` e `adicionar_itens_pedido` a partir de `categorias.estacao`, com backfill dos itens existentes.
- [ ] Nova RPC `concluir_estacao(p_pedido_id BIGINT, p_estacao TEXT)` que marca `pronto_em`/`pronto_por` só nos itens daquela estação. Com `p_estacao = NULL` (filtro "Todas"), mantém o comportamento atual e conclui tudo.
- [ ] Nova RPC `iniciar_estacao(p_pedido_id, p_estacao)` que grava `pedido_itens.iniciado_em` nos itens da estação e muda o pedido para `em_preparo` se ainda estiver `pendente`. `pedidos.iniciado_em` continua sendo o primeiro início de qualquer estação.
- [ ] Trigger `AFTER UPDATE OF pronto_em, cancelado ON pedido_itens` que muda o pedido para `concluido` (com `concluido_em`) quando todos os itens não cancelados tiverem `pronto_em`, e o devolve para `em_preparo` quando algum item for desmarcado. A regra sai do navegador.
- [ ] No KDS com estação filtrada:
  - O card mostra o status **da estação** ("Bar: pronto ✓ · aguardando Cozinha").
  - Um pedido cuja estação terminou sai da coluna "Em preparo" **daquela tela** e vai para "Prontos", com o selo "Aguardando outra estação" até o pedido ser concluído.
- [ ] Voz e alerta de pronto (KDS e PDV) disparam **uma vez**, quando o pedido fica `concluido` (evento de realtime do banco), e não a cada clique local.
- [ ] "Desfazer" limpa `pronto_em` dos itens da estação e o trigger devolve o pedido para `em_preparo`.
- [ ] O filtro "Todas" continua funcionando como hoje (conclui o pedido inteiro).

### Requisitos não funcionais
- [ ] **Concorrência:** duas telas concluindo estações diferentes ao mesmo tempo resultam em exatamente **um** evento `concluido` no `pedido_eventos` ([CAF-000019](CONCLUIDAS/CAF-000019-log-de-auditoria.md)).
- [ ] **Segurança:** as RPCs são `SECURITY DEFINER` e validam `get_user_role() IN ('cozinha','admin')`.
- [ ] **Compatibilidade:** pedidos criados antes da migration (sem `estacao` no item) caem no backfill; se a categoria não existir mais, usar `'cozinha'`.
- [ ] **Desempenho:** a trigger faz um único `SELECT count(*)` por pedido e não recarrega itens de outros pedidos.

### Dependências técnicas
- [CAF-000007](CONCLUIDAS/CAF-000007-separacao-por-estacao-bar-cozinha.md) (coluna `categorias.estacao`) e [CAF-000008](CONCLUIDAS/CAF-000008-marcar-item-a-item-como-pronto.md) (coluna `pedido_itens.pronto_em`).
- RPCs `criar_pedido` (`supabase/migration_caf_000026_idempotencia.sql`) e `adicionar_itens_pedido` (`supabase/migration_caf_000020_vinculo_adicionais.sql`).
- Os eventos da trigger de auditoria (`supabase/migration_caf_000019_log_auditoria.sql`) precisam continuar registrando quem concluiu.

### Recursos necessários
- Acesso ao Supabase para a nova migration (próximo número livre em `supabase/`, hoje `migration_caf_000027_*.sql`).
- Dois dispositivos (ou duas abas) para testar bar e cozinha ao mesmo tempo.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** um pedido tem 1 cappuccino (bar) e 1 baguete (cozinha), **quando** o bar toca em "Pronto!", **então** só o cappuccino fica pronto, o pedido continua em preparo na tela da cozinha e ninguém é chamado por voz.
- [ ] **Dado que** o bar já terminou, **quando** a cozinha toca em "Pronto!" na baguete, **então** o pedido fica `concluido` e o PDV toca o alerta e chama o pedido **uma vez**.
- [ ] **Dado que** o filtro está em "Todas", **quando** alguém toca em "Pronto!", **então** o pedido inteiro é concluído, como hoje.
- [ ] **Dado que** um pedido `pendente` tem um único item, **quando** a cozinha toca no item, **então** o pedido vai direto para "Prontos".
- [ ] **Dado que** a cozinha desfaz um pedido concluído, **quando** a ação termina, **então** os itens da cozinha ficam desmarcados e o pedido volta para "Em preparo".
- [ ] **Dado que** o admin muda uma categoria de "cozinha" para "bar", **quando** a cozinha recarrega a tela, **então** os pedidos já lançados continuam na estação original.

---

## O que a atividade não inclui

- Mais estações além de bar e cozinha (ex.: "sobremesas"). O `CHECK` pode ser ampliado depois.
- Tela exclusiva do expedidor (ver [CAF-000027](CAF-000027-painel-de-senhas-retirada.md), painel de senhas).
- Mudanças na impressão (ver [CAF-000028](CAF-000028-tela-impressora-e-comanda-por-estacao.md)).
- Tempo alvo por estação (ver [CAF-000025](CAF-000025-tempo-alvo-de-preparo-e-semaforo.md)).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Bar conclui | Pedido misto; filtro Bar; "Pronto!" | Só itens do bar prontos; pedido segue `em_preparo` |
| 2 | Cozinha conclui por último | Após o caso 1, filtro Cozinha; "Pronto!" | Pedido `concluido`; 1 chamada de voz no PDV |
| 3 | Pedido só de bar | Pedido só com cafés; bar conclui | Pedido `concluido` direto |
| 4 | Filtro Todas | "Pronto!" com filtro Todas | Todos os itens prontos |
| 5 | Concorrência | Duas abas concluem estações diferentes no mesmo segundo | 1 evento `concluido` em `pedido_eventos` |
| 6 | Item único pendente | Tocar no único item | Pedido vai para Prontos |
| 7 | Desfazer | Desfazer pedido concluído na cozinha | Itens da cozinha desmarcados; pedido `em_preparo` |
| 8 | Item cancelado | Cancelar o único item pendente da cozinha | Pedido conclui se o bar já terminou |
| 9 | Mudança de categoria | Trocar a estação da categoria após o pedido | Item continua na estação original |
| 10 | Permissão | Barista chama `concluir_estacao` pela API | Recusado |

---

## URL Complementar

- Código: `js/cozinha.js:537-631` (`toggleItemPronto`, `updateStatus`), `js/cozinha.js:109-127` (`produtosCache`), `js/cozinha.js:363-385` (filtro de estação), `js/pedidos.js:2745-2755` (voz no PDV)
- Schema: `supabase/migration_caf_000006_estacoes.sql`, `supabase/migration_caf_000008_pronto.sql`
- Requisito original: [CAF-000007](CONCLUIDAS/CAF-000007-separacao-por-estacao-bar-cozinha.md) · "Status do pedido 'pronto' só quando todas as estações terminarem"
- Análise de mercado: [ANALISE_PEDIDOS_COZINHA.md](ANALISE_PEDIDOS_COZINHA.md)
- SAIPOS — Tela KDS: https://meajuda.saipos.com/hc/pt-br/articles/20211492079252-Tela-KDS-Sistema-de-Display-para-Cozinha
