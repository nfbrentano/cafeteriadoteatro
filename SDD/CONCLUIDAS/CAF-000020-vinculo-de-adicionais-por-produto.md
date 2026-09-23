# CAF-000020 — [Admin] [PDV] [Banco] Vínculo de adicionais por produto

| Área | Prioridade | Esforço | Status |
|---|---|---|---|
| Admin + PDV + banco | 🔴 Alta | M | A fazer |

---

## Detalhes da Atividade

- **O que precisa ser feito:** permitir que o admin escolha, no cadastro, **quais produtos aceitam adicionais** e **quais adicionais** cada produto (ou categoria) oferece. Quando o produto estiver com "Permite adicionais" = `true`, o modal de montagem do barista mostra só os adicionais vinculados a ele. Quando for `false`, o PDV não mostra nenhum adicional para o produto.
- **Por que é necessário:**
  - O banco já tem a tabela `adicional_vinculos` (por produto ou categoria, `supabase/migration_fase2.sql:20`), mas **nada a utiliza**.
  - O PDV carrega todos os adicionais ativos (`loadAdicionais`, `js/pedidos.js:383`) e mostra **todos** para **qualquer produto** no modal de montagem (`js/pedidos.js:619`, comentário "todos disponíveis no momento"). Na prática, o barista consegue lançar "Cheddar" num cappuccino ou "Leite vegetal" num baguete.
  - O modal de adicional no admin tem o campo "Vincular a Categorias/Produtos" só como texto informativo, dizendo que o vínculo "será configurado no DB" (`admin.html:1432`).
  - As RPCs `criar_pedido` e `adicionar_itens_pedido` validam só se o adicional está ativo (`supabase/migration_fase3_final.sql:383`, `:485`), sem checar se ele pertence ao produto.
- **Qual valor será agregado:** o barista vê só as opções que fazem sentido para cada produto, o que deixa o atendimento mais rápido e evita erros de cobrança. O admin passa a configurar tudo pela tela, sem precisar mexer no banco, e o banco garante a regra mesmo se a tela falhar.
- **Para quem é destinado:** administração (cadastro) e baristas (PDV). A cozinha e a impressão se beneficiam indiretamente de comandas sem adicionais incoerentes.

---

## Requisitos da Atividade

### Requisitos funcionais

**Banco**
- [ ] Coluna `produtos.permite_adicionais BOOLEAN NOT NULL DEFAULT false`.
- [ ] Migration de dados: marcar `permite_adicionais = true` nos produtos das categorias que já têm adicional previsto (`cafes-quentes`, `cafes-especiais`, `cafes-gelados`, `baguetes`) e criar os vínculos iniciais:
  - `leite-vegetal` → categorias `cafes-quentes`, `cafes-especiais`, `cafes-gelados` ([TAREFAS.md](TAREFAS.md) seção 3).
  - `cheddar` → categoria `baguetes` ([TAREFAS.md](TAREFAS.md) seção 4).
- [ ] View `v_adicionais_produto (produto_id, adicional_id, nome, preco, ordem)` que resolve os vínculos diretos por produto **e** os herdados da categoria, sem duplicar, só com adicionais ativos e produtos com `permite_adicionais = true`.
- [ ] `criar_pedido` e `adicionar_itens_pedido` recusam o item com `RAISE EXCEPTION 'Adicional % não permitido para o produto %'` quando o adicional não estiver em `v_adicionais_produto` para aquele produto.
- [ ] Índices em `adicional_vinculos(produto_id)` e `adicional_vinculos(categoria_id)`.

**Admin — cadastro de adicional** (`admin.html:1411`, `js/admin/adicionais-admin.js`)
- [ ] Substituir o texto informativo por dois campos de múltipla seleção com busca: **Categorias** e **Produtos**.
- [ ] Salvar usando `db.adicionais.upsertVinculos` (`js/db.js:270`), que já existe.
- [ ] Coluna "Vinculado a" na lista de adicionais (ex.: "3 categorias · 2 produtos").

**Admin — cadastro de produto** (`js/admin/products.js`)
- [ ] Toggle **"Permite adicionais"**.
- [ ] Com o toggle ligado: lista de adicionais com checkbox para vínculo direto ao produto, e lista **somente leitura** dos adicionais herdados da categoria ("via categoria Cafés quentes").
- [ ] Com o toggle desligado: esconder a lista; os vínculos diretos são mantidos no banco, mas ficam sem efeito.
- [ ] Aviso quando o toggle estiver ligado sem nenhum adicional vinculado ("Nenhum adicional disponível para este produto").

**PDV — barista** (`js/pedidos.js`)
- [ ] Carregar `v_adicionais_produto` junto com os adicionais e montar um mapa `produto_id → adicionais[]`.
- [ ] `openMontagemModal`: mostrar só os adicionais do produto; se o produto não permitir adicionais, esconder a seção inteira (sem a mensagem "Sem adicionais disponíveis").
- [ ] Manter no modal a observação, os chips rápidos e os sabores do meio a meio, que não dependem dos adicionais.
- [ ] Mensagem de erro amigável (toast) caso a RPC recuse um adicional, por exemplo quando o vínculo foi alterado com o carrinho aberto.

**Realtime**
- [ ] Alterações em `adicional_vinculos` ou em `produtos.permite_adicionais` atualizam o PDV aberto, ou pelo menos na próxima abertura do modal.

### Requisitos não funcionais
- [ ] **Segurança:** só `admin` altera vínculos e `permite_adicionais` (RLS existente em `adicional_vinculos`; conferir a política de `produtos`). A validação no banco é obrigatória, porque a regra da tela sozinha não basta ([TAREFAS.md](TAREFAS.md) aceite da seção 2).
- [ ] **Desempenho:** uma única consulta extra no carregamento do PDV; abrir o modal não faz requisição.
- [ ] **Compatibilidade:** pedidos antigos com adicionais continuam sendo exibidos normalmente na cozinha, na impressão e no admin, porque `pedido_item_adicionais` é um snapshot.
- [ ] **Segurança (XSS):** nomes de adicionais exibidos com `window.escapeHtml`, inclusive no `data-nome` do checkbox (`js/pedidos.js:624`).
- [ ] **Mobile:** campos de múltipla seleção no admin utilizáveis em 360 px.

### Dependências técnicas
- Tabelas `adicionais` e `adicional_vinculos` (`supabase/migration_fase2.sql`).
- RPCs `criar_pedido` e `adicionar_itens_pedido` (`supabase/migration_fase3_final.sql:311`, `:438`).
- Funções `db.adicionais.vinculos()` e `db.adicionais.upsertVinculos()` (`js/db.js:238`, `:270`).
- Verificar conflito com alterações em andamento em `admin.html` e `js/admin/categories.js` (CAF-000006/estações).

### Recursos necessários
- Acesso ao Supabase para rodar a migration.
- Validação com o cliente da lista inicial de produtos e adicionais.

---

## Critérios de Aceitação / Entregas

- [ ] **Dado que** o Cappuccino tem "Permite adicionais" ligado e a categoria `cafes-quentes` está vinculada ao Leite vegetal, **quando** o barista toca no Cappuccino, **então** o modal mostra só "Leite vegetal (+ R$ 1,50)".
- [ ] **Dado que** o Baguete de Frango permite adicionais e o Cheddar está vinculado a `baguetes`, **quando** o barista abre o modal, **então** aparece só "Cheddar (+ R$ 3,50)", e não o Leite vegetal.
- [ ] **Dado que** o Suco de Laranja está com "Permite adicionais" desligado, **quando** o barista toca no produto, **então** o modal não mostra a seção de adicionais.
- [ ] **Dado que** o produto permite adicionais mas o admin o desliga, **quando** o barista abre o modal em seguida, **então** os adicionais deixam de aparecer para esse produto.
- [ ] **Dado que** alguém envia pela API um pedido com Cheddar num Cappuccino, **quando** a RPC `criar_pedido` processa, **então** o pedido é recusado inteiro com a mensagem de adicional não permitido.
- [ ] **Dado que** o admin vincula o Chantilly ao produto "Mocha" diretamente, **quando** salva, **então** o Mocha passa a mostrar Chantilly além do Leite vegetal herdado da categoria.
- [ ] **Dado que** um adicional está vinculado ao produto e também à categoria dele, **quando** o barista abre o modal, **então** o adicional aparece uma única vez.
- [ ] **Dado que** existem pedidos antigos com adicionais, **quando** um vínculo é removido, **então** esses pedidos continuam mostrando os adicionais na cozinha, na impressão e no admin.

---

## O que a atividade não inclui

- Adicionais obrigatórios ou com limite de quantidade (ex.: "escolha 1 molho").
- Grupos de adicionais (ex.: "Tipo de leite: integral / desnatado / vegetal") com escolha única.
- Adicional com preço diferente por produto (o preço continua único em `adicionais.preco`).
- Exibição dos adicionais no cardápio público.
- Mudança nas regras de promoção: os adicionais continuam fora da base do desconto ([TAREFAS.md](TAREFAS.md) 7.6).

---

## Sugestões de casos de teste

| # | Cenário | Passos | Resultado esperado |
|---|---------|--------|--------------------|
| 1 | Herança por categoria | Vincular Leite vegetal a `cafes-quentes` → abrir Cappuccino no PDV | Só Leite vegetal |
| 2 | Vínculo direto | Vincular Chantilly ao Mocha → abrir Mocha | Chantilly + herdados da categoria |
| 3 | Sem duplicar | Vincular o mesmo adicional ao produto e à categoria | Aparece uma vez |
| 4 | Toggle desligado | Desligar "Permite adicionais" | Seção de adicionais escondida |
| 5 | Toggle ligado sem vínculo | Ligar sem vincular nada | Aviso no admin; PDV sem seção de adicionais |
| 6 | Adicional inativo | Inativar Cheddar | Some de todos os baguetes |
| 7 | Validação no banco | RPC com Cheddar no Cappuccino | Exceção; pedido não gravado |
| 8 | Adicionar itens depois | `adicionar_itens_pedido` com adicional não permitido | Exceção |
| 9 | Carrinho desatualizado | Item com adicional no carrinho → admin remove vínculo → enviar | Toast de erro; nada gravado |
| 10 | Histórico | Remover vínculo com pedidos antigos | Pedidos antigos inalterados |
| 11 | Permissão | Barista tenta inserir em `adicional_vinculos` via API | Recusado pela RLS |
| 12 | Meio a meio | Crepe meio a meio com adicional vinculado a `crepes-doces` | Sabores + adicional; preço = metades + adicional |
| 13 | Total | Café R$ 8,00 + Leite vegetal | Carrinho e `pedidos.total` = R$ 9,50 |
| 14 | XSS | Adicional com nome `<b>x</b>` | Texto literal no PDV e na cozinha |

---

## URL Complementar

- Requisito original: [TAREFAS.md](TAREFAS.md) · seções 2B (2.4, 2.6, 2.7), 3 e 4
- Índice de features: [FEATURES_PENDENTES.md](FEATURES_PENDENTES.md)
- Código:
  - PDV: `js/pedidos.js:383` (`loadAdicionais`), `js/pedidos.js:586` (`openMontagemModal`), `js/pedidos.js:619`
  - Admin: `admin.html:1411` (modal de adicional), `js/admin/adicionais-admin.js`, `js/admin/products.js`
  - Dados: `js/db.js:238` (`vinculos`), `js/db.js:270` (`upsertVinculos`)
- Schema: `supabase/migration_fase2.sql:6` (`adicionais`), `:20` (`adicional_vinculos`); `supabase/migration_fase3_final.sql:383`, `:485` (validação atual dos adicionais nas RPCs)
