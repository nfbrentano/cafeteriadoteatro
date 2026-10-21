# [FIX] CAF-000074 — Correção de estoque, ficha técnica (CMV) e lista de compras

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Alinhar o front do estoque, da ficha técnica e da lista de compras (CAF-000031, 032 e 068) ao schema real de produção, unificar o custo médio em uma única coluna calculada só pelo banco e tornar configurável a margem mínima da ficha técnica.
- **Problema e evidência** (confirmado em produção em 2026-10-20 com consultas somente leitura):
  - **Colunas inexistentes lidas e gravadas pelo front:**
    - `estoque_itens.unidade_medida`: o banco tem `unidade`. Usada em `js/db.js:736, 791, 810, 830` e `js/admin/estoque.js:233-237, 272, 304, 325, 342`.
    - `estoque_itens.saldo_atual`: o banco tem `quantidade`. Usada em `js/admin/estoque.js:147, 163, 199, 226`.
    - `estoque_movimentos.data_validade`: o banco tem `validade`. Usada em `js/admin/estoque.js:587, 776`.
    - Resultado: listagens e cadastros de insumo retornam erro `42703` ou mostram saldo 0 e unidade `undefined`.
  - **Custo médio em duas colunas:** produção tem `estoque_itens.custo_medio`, atualizada pelo trigger `fn_estoque_recalcular_saldo` (`migration_caf_000031_controle_estoque.sql:56-109`), e `custo_unitario_medio`, criada fora do repositório. Essa segunda coluna é lida pela ficha técnica (`fn_calcular_custo_produto` e `fn_calcular_custo_adicional`, `migration_caf_000032_ficha_tecnica.sql:46, 67, 87, 103`) e pelo front (`js/admin/estoque.js:164, 228`; `js/db.js:792, 811, 831`). Nada mantém as duas sincronizadas, então o CMV de cada venda, gravado pelo trigger `trg_gravar_custo_pedido_item` (`:114-128`), pode estar usando custo desatualizado ou zero.
  - **Front sobrescreve o custo médio:** em `js/admin/estoque.js:516-526`, a entrada faz `update({ custo_medio: custoUnit })` **antes** de inserir o movimento. O trigger então calcula a média ponderada sobre o valor já sobrescrito. O CA da CAF-000031 (média de R$ 1,83) falha.
  - **`produtos.fornecedor_padrao_id` não existe** em produção. A CAF-000068 RF01 previa a coluna em insumos **e** produtos, mas a migration 068 só criou em `estoque_itens`.
  - **Margem mínima fixa** em 50% (`js/admin/products.js:306`), sem configuração.
  - **Permissão de lançamento:** a policy `estoque_movimentos_insert_auth` (`migration_caf_000031_controle_estoque.sql:298-299`) deixa qualquer autenticado (barista, cozinha) lançar entrada, ajuste e perda. A correção geral de policies fica na CAF-000082. Aqui só se define a regra de negócio.
- **Impacto de não fazer:** O estoque mostra saldos errados, o insumo não pode ser cadastrado, o CMV e a margem dos relatórios ficam incorretos e a lista de compras sugere quantidades erradas.
- **Para quem é destinado:** Gestor/admin que controla estoque e custo; PO que acompanha margem.
- **História de usuário:** Como gestor, quero lançar compras e ver o saldo e o custo médio corretos de cada insumo, para que a ficha técnica mostre o custo e a margem reais de cada produto.
- **Como saberemos que deu certo:**
  - 0 erros `42703` nas telas de Estoque e Ficha técnica.
  - O CA de custo médio da CAF-000031 passa: 10 un a R$ 1,50 + 20 un a R$ 2,00 = R$ 1,83.
  - O CMV gravado em `pedido_itens.custo_unitario` é maior que 0 para todos os produtos com ficha técnica.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Adotar os nomes do banco como fonte de verdade: `unidade`, `quantidade` (saldo) e `validade`. Ajustar `js/db.js` e `js/admin/estoque.js`. Não criar colunas espelho | P0 | CA01, CA02 |
| RF02 | Unificar o custo médio em **`custo_medio`**: migrar o dado (`custo_medio = COALESCE(NULLIF(custo_medio,0), custo_unitario_medio)`), trocar `custo_unitario_medio` por `custo_medio` nas funções da 032 e no front e, depois da validação, remover `custo_unitario_medio` (ou transformá-la em coluna gerada só leitura durante a transição) | P0 | CA03, CA04 |
| RF03 | Remover o `update` de `custo_medio` feito pelo front (`js/admin/estoque.js:516-526`). O custo médio é calculado exclusivamente pelo trigger `fn_estoque_recalcular_saldo`, a partir de `estoque_movimentos.custo_unitario` | P0 | CA03 |
| RF04 | Verificar no snapshot da CAF-000072 se `estoque_movimentos.fornecedor_id` e `despesa_id` (gravados em `js/admin/estoque.js:588-589`) existem. Se não existirem, criá-los na migration desta SDD | P0 | CA05 |
| RF05 | Decidir o escopo de `fornecedor_padrao_id` (D02). Se for também por produto revendido, adicionar `produtos.fornecedor_padrao_id` e incluir esses produtos na lista de compras. Caso contrário, corrigir a CAF-000068 para refletir apenas insumos | P1 | CA06 |
| RF06 | Tornar a margem mínima configurável em `configuracoes_sistema` (`ficha_margem_minima_percentual`, padrão 50) e usá-la em `js/admin/products.js:306` e nos relatórios | P1 | CA07 |
| RF07 | Restringir lançamentos de `entrada`, `ajuste` e `perda` a quem tem a permissão `estoque.movimentar` (admin/gerente por padrão). A baixa automática por venda continua via trigger. A implementação da policy fica na CAF-000082 | P1 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A migração de custo não altera o CMV já gravado em `pedido_itens` (histórico preservado) | P0 | CA04 |
| RNF02 | A migration é idempotente e reversível até a remoção definitiva de `custo_unitario_medio` | P0 | CA04 |
| RNF03 | A tela de Estoque carrega até 500 insumos em menos de 2 s | P1 | CA01 |

### Dependências técnicas

- **CAF-000072 (bloqueante):** snapshot de colunas e corpo atual das funções da 032 em produção.
- `supabase/migration_caf_000031_controle_estoque.sql`, `migration_caf_000032_ficha_tecnica.sql`, `migration_caf_000068_lista_compras_fornecedor.sql`.
- `js/db.js:700-840`, `js/admin/estoque.js`, `js/admin/products.js`, `js/admin/relatorios-admin.js:135-230`.
- CAF-000082 (policies), CAF-000086 (teste de contrato).

### Recursos necessários

- Lista atual de insumos e custos para validar a migração com o PO.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado insumos cadastrados, quando o admin abrir a aba Estoque, então cada linha mostra saldo, unidade e custo corretos, sem erro no console nem `undefined`.
- [ ] **CA02:** Dado o formulário de novo insumo, quando o admin salvar nome, unidade "kg" e estoque mínimo, então o registro é criado com `unidade = 'kg'`.
- [ ] **CA03:** Dado um insumo com 10 un a R$ 1,50, quando houver entrada de 20 un a R$ 2,00, então `custo_medio` fica em R$ 1,83 e `quantidade` em 30.
- [ ] **CA04:** Dado produtos com ficha técnica, quando a migração rodar, então `fn_calcular_custo_produto` passa a ler `custo_medio`, retorna o mesmo custo de antes para itens em que as colunas já coincidiam e os `pedido_itens` antigos não mudam.
- [ ] **CA05:** Dado uma entrada com fornecedor e "gerar conta a pagar" marcado, quando registrada, então o movimento grava `fornecedor_id` e `despesa_id` e a despesa aparece no financeiro.
- [ ] **CA06:** Dado insumos (e produtos, se D02 = sim) abaixo do mínimo com fornecedor padrão, quando o admin gerar a lista de compras, então os itens aparecem agrupados pelo fornecedor certo.
- [ ] **CA07:** Dado a margem mínima configurada em 40%, quando um produto tiver margem de 45%, então não aparece alerta. Com margem de 35%, aparece.
- [ ] **CA08 (negativo):** Dado um usuário barista, quando tentar registrar entrada ou perda manual, então a ação é bloqueada na UI e no banco. A baixa por venda continua funcionando.
- [ ] **CA09 (negativo):** Dado uma venda de produto **sem** ficha técnica, quando o pedido for criado, então o pedido é salvo normalmente com `custo_unitario = 0`, sem erro.

## O que a atividade não inclui

- Importação de XML de nota fiscal de fornecedor: motivo: outra iniciativa (gap Saipos).
- Inventário com contagem cega: motivo: P2.
- Policies gerais de RLS: motivo: CAF-000082.

### Considerado para o futuro (P2)

- Custo por lote (PEPS) e alerta de validade por lote.
- Sugestão de compra baseada no consumo médio dos últimos 30 dias.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual das duas colunas de custo tem os valores corretos hoje em produção (`custo_medio` × `custo_unitario_medio`)? | PO/dev | Sim | |
| D02 | Produtos revendidos (ex.: água, refrigerante) também precisam de fornecedor padrão e de lista de compras? | PO | Não | |
| D03 | Gerente também pode lançar perda e ajuste, ou só admin? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Listagem usa colunas reais | unit DOM + mock | CA01 | Mock com `unidade` e `quantidade`; renderizar a aba | Valores exibidos, sem `undefined` |
| CT02 | Cadastro de insumo | unit + mock | CA02 | Salvar o formulário | Payload com `unidade` |
| CT03 | Custo médio ponderado | integração (trigger, Supabase local) | CA03 | 2 entradas | `custo_medio = 1.83` |
| CT04 | Migração de custo | integração | CA04, RNF01 | Popular as duas colunas e rodar a migration | Funções leem `custo_medio`; `pedido_itens` sem mudança |
| CT05 | Entrada com despesa | integração | CA05 | Entrada com fornecedor e despesa | FKs gravadas, despesa criada |
| CT06 | Lista de compras | unit (`js/utils`) | CA06 | Itens abaixo do mínimo | Agrupamento por fornecedor |
| CT07 | Margem configurável | unit | CA07 | Configuração 40%; margens de 45% e 35% | Alerta só para 35% |
| CT08 | Permissão de movimento | integração | CA08 | Inserir como barista | Negado |
| CT09 | Pedido sem ficha | integração | CA09 | Criar pedido de produto sem ficha | Sucesso, custo 0 |
| CT10 | Contrato de colunas | unit (CAF-000086) | CA01, CA02 | Comparar as colunas do front com o fixture | 0 violações |

## URL Complementar

- Documentação técnica: `js/admin/estoque.js:500-600`, `supabase/migration_caf_000031_controle_estoque.sql:56-109`, `supabase/migration_caf_000032_ficha_tecnica.sql:36-128`
- Requisitos originais: CAF-000031, CAF-000032, CAF-000068
- Issue / PR relacionado: CAF-000072, CAF-000082, CAF-000086
