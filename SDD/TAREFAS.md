# Tarefas — Rodada de ajustes (Set/2026)

Documento de planejamento com base na análise do código atual. Cada bloco traz o **estado atual**, as **decisões do cliente**, as **tarefas** e os **critérios de aceite**.

---

## Visão geral

| # | Demanda | Onde mexe | Esforço |
|---|---------|-----------|---------|
| 1 | Separar título e imagem no hero | `index.html`, `css/home.css`, `js/hero-carousel.js` | M |
| 2 | Base: RPC de criação de pedido + adicionais | Supabase, `js/db.js`, `js/pedidos.js`, admin | G |
| 3 | Leite vegetal em todos os cafés (+R$ 1,50) | dados | P |
| 4 | Cheddar nos baguetes (+R$ 3,50) | dados | P |
| 5 | Mini cappuccino cortesia (produto liberado por prato) | Supabase, `js/pedidos.js`, admin, relatórios | G |
| 6 | Crepe meio a meio (50% de cada sabor, somados) | Supabase, `js/pedidos.js` | M |
| 7 | Menu de promoções por dia da semana | Supabase, admin, `js/pedidos.js`, `cardapio.html` | G |
| 8 | Observação por item + observação geral | `js/pedidos.js`, `pedidos.html` + correção XSS | P |

**Ordem sugerida:** 1 → 8 → 2 → 3/4 → 6 → 5 → 7.
1 e 8 são independentes. 2 é a base de 3–7 (a RPC é onde preço, cortesia e promo são validados). 5 e 7 são os maiores.

---

## Decisões do cliente (registradas)

| Pergunta | Decisão |
|---|---|
| Faixa do título terá arte própria? | **Não.** Fundo próprio sem arte (cor/textura da identidade). |
| Leite vegetal em quais bebidas? | **Todos os cafés** — categorias `cafes-quentes`, `cafes-especiais`, `cafes-gelados`. |
| Cortesia | **Produto próprio**, lançado depois do prato, para contar quantas cortesias foram dadas. Só pode ser lançada se já houver um prato que a libere — **regra garantida no banco (relacionamento).** |
| Preço do meio a meio | **50% do preço de cada sabor, somados.** |
| Cancelamento de pedido com cortesia | **Cancela a cortesia junto.** |
| Promoções | **Menu de cadastro** de itens em promoção por **dia da semana**, com os tipos: % de desconto, compre X leve Y, 2ª unidade com X% de desconto. |
| Promoções acumulam? | **Não.** Se o item entrar em mais de uma, vale só a de maior desconto. |

---

## 1. Hero — separação entre título e imagem

**Feedback:** título mais acima, em faixa própria; parte de baixo reservada para as artes com as frases. A transição atual de artes + frases foi aprovada e **deve ser mantida**.

**Estado atual**
- `index.html:174-267`: `<section class="hero hero--carousel">` em `100svh`; as artes ficam em `position:absolute; inset:0` (`css/home.css:157-208`) e título, tag, legenda e botões ficam **sobre** a arte (`.hero__content`).
- A legenda (`#carousel-caption`) é trocada por `js/hero-carousel.js:65-84` com fade a partir de `data-caption` / `data-subtitle`.

**Tarefas**
- [ ] 1.1 Reestruturar em duas faixas dentro da mesma `<section>`:
  - **Faixa superior (título):** tag "Galeria de Artes · Cafeteria do Teatro", `<h1>` e botões *Ver Cardápio / Como Chegar*, sobre **fundo sólido/textura** (`--espresso` com leve textura/gradiente e ornamento de cortina/teatro em CSS). Sem imagem.
  - **Faixa inferior (galeria):** carrossel, frame de museu, legenda (frase + sub-frase), setas, dots e barra de progresso.
- [ ] 1.2 Mover `#carousel-caption` para a faixa da galeria (mesmo id/classes, sem mexer no JS).
- [ ] 1.3 `css/home.css`:
  - `.hero--carousel` vira `display:grid; grid-template-rows: auto 1fr` em vez de conteúdo centralizado sobre a imagem.
  - `.hero-carousel` passa a ocupar só a faixa inferior.
  - `.hero__overlay`: remover o escurecimento do topo (existia para leitura do título); manter só gradiente na base para a legenda.
  - Rever `background-position: center 25%` e o Ken Burns para as 8 artes na área menor (sem cortar rostos).
- [ ] 1.4 Mobile (`css/home.css:380-400`, `:1008`): título compacto, arte com `aspect-ratio` próximo do original (ex.: `4/5`) e legenda **abaixo** da arte.
- [ ] 1.5 Swipe e pausa por hover (`js/hero-carousel.js:170-215`) só na faixa da galeria.
- [ ] 1.6 Remover do pré-render (`index.html:83-110`) a variável `--dynamic-hero-bg` / `--hero-blur-bg` se deixar de ser usada no hero (conferir se o admin de "hero" ainda tem utilidade; senão, registrar como item de limpeza).

**Aceite**
- Título legível sem arte por trás; artes aparecem inteiras.
- Crossfade + troca de frase idênticos aos de hoje.
- Sem scroll horizontal em 360px; primeira arte continua pré-carregada.

---

## 2. Base: RPC de criação de pedido + estrutura de adicionais

### 2A. RPC `criar_pedido` (transação única)

**Estado atual:** `js/pedidos.js:436-500` insere `pedidos` e depois `pedido_itens` em duas chamadas. Se a segunda falha, o pedido fica sem itens (há um `alert` de aviso). Preço e total vêm do navegador.

Com adicionais, cortesias, meio a meio e promoções, o cálculo precisa ser **autoritativo no banco**.

- [ ] 2.1 Criar `public.criar_pedido(p_pedido JSONB)` (`SECURITY DEFINER`, valida `get_user_role() IN ('barista','admin')`), que em **uma transação**:
  1. insere o pedido;
  2. insere os itens na ordem recebida, resolvendo referências internas (a cortesia no mesmo pedido aponta para o prato pelo índice no payload);
  3. recalcula preços a partir de `produtos`/`adicionais`, aplica promoções do dia (seção 7) e grava `pedidos.total`;
  4. retorna o pedido com itens.
- [ ] 2.2 Criar `public.adicionar_itens_pedido(p_pedido_id, p_itens JSONB)` para lançar itens **depois** em um pedido/mesa existente (necessário para a cortesia "depois" — seção 5).
- [ ] 2.3 `js/pedidos.js`: trocar os dois inserts por `window.cafeteriaSupabase.rpc('criar_pedido', {...})` (mesmo padrão de `js/admin/usuarios-admin.js:143`).

### 2B. Adicionais

- [ ] 2.4 Migration `supabase/migration_adicionais.sql`:
  ```sql
  CREATE TABLE public.adicionais (
    id TEXT PRIMARY KEY,                 -- 'leite-vegetal', 'cheddar'
    nome TEXT NOT NULL,
    preco NUMERIC(10,2) NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    ordem INT NOT NULL DEFAULT 0
  );

  CREATE TABLE public.adicional_vinculos (
    id BIGSERIAL PRIMARY KEY,
    adicional_id TEXT NOT NULL REFERENCES public.adicionais(id) ON DELETE CASCADE,
    categoria_id TEXT REFERENCES public.categorias(id) ON DELETE CASCADE,
    produto_id   TEXT REFERENCES public.produtos(id)   ON DELETE CASCADE,
    CHECK (num_nonnulls(categoria_id, produto_id) = 1)
  );

  -- Snapshot do que foi escolhido em cada item
  CREATE TABLE public.pedido_item_adicionais (
    id BIGSERIAL PRIMARY KEY,
    pedido_item_id BIGINT NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
    adicional_id TEXT NOT NULL REFERENCES public.adicionais(id),
    nome TEXT NOT NULL,
    preco NUMERIC(10,2) NOT NULL
  );

  ALTER TABLE public.pedido_itens
    ADD COLUMN IF NOT EXISTS preco_base NUMERIC(10,2);
  ```
  - `preco_unitario` = `preco_base` + soma dos adicionais; assim `subtotal` (coluna gerada) continua coerente.
  - A RPC valida que o adicional está vinculado à categoria/produto do item.
  - RLS: `SELECT` público; escrita só `admin` (padrão de `mesas`, `supabase/pedidos_schema.sql:65-74`).
- [ ] 2.5 `js/db.js`: `adicionais.all()` e `adicionaisDoProduto(produto)`.
- [ ] 2.6 Admin: nova aba **Adicionais** (`admin.html` + `js/admin/adicionais.js`) com CRUD e vínculo por categoria/produto.
- [ ] 2.7 `js/pedidos.js` — **modal de montagem do item** ao clicar num produto que tenha adicionais, sabores (meio a meio) ou para inserir obs: checkboxes de adicionais com "+R$ x,xx", campo de observação, quantidade. Produtos simples continuam indo direto ao carrinho.
  - Carrinho: `{ produto, quantidade, adicionais: [], sabores: null, observacoes, origemIndex }`.
  - `addToCart` (linha 312): agrupar só itens com mesmo produto + mesmos adicionais + mesmos sabores + mesma obs.
  - `renderCart` / total: preço base + adicionais − descontos de promo (prévia; o valor final vem da RPC).
- [ ] 2.8 Exibir adicionais em todos os lugares que listam itens: cozinha (`js/cozinha.js:318-330`), impressão (`js/pedido-print.js:~110`), barista (`js/pedidos.js:613`, `:680`), admin (`js/admin/pedidos-admin.js:183`). Incluir `pedido_item_adicionais(*)` nos selects (`js/cozinha.js:256`).

**Aceite**
- Pedido é gravado inteiro ou não é gravado (sem pedido órfão).
- Alterar o preço no navegador (DevTools) não muda o total gravado.

---

## 3. Leite vegetal em todos os cafés (+R$ 1,50)

- [ ] 3.1 Cadastrar `leite-vegetal` — "Leite vegetal", R$ 1,50.
- [ ] 3.2 Vincular às categorias `cafes-quentes`, `cafes-especiais`, `cafes-gelados`.
- [ ] 3.3 Incluir no seed/migration para ficar versionado.

---

## 4. Cheddar nos baguetes (+R$ 3,50)

- [ ] 4.1 Cadastrar `cheddar` — "Adicionar cheddar", R$ 3,50.
- [ ] 4.2 Vincular à categoria `baguetes`.

---

## 5. Mini cappuccino cortesia — produto liberado por prato

**Decisão:** a cortesia é um **produto** (R$ 0,00), lançado **depois** do prato, para ser contabilizado. Só pode ser lançada se existir um prato que a libere, e isso deve ser garantido **por relacionamento no banco**, não só na tela.

### Modelagem

- [ ] 5.1 Cadastrar produto `mini-cappuccino-cortesia` — "Mini Cappuccino (Cortesia)", R$ 0,00, em uma categoria nova `cortesias` (oculta no cardápio público; `categorias.ativo` ou flag `visivel_cardapio`).
- [ ] 5.2 Tabela de regras (quem libera o quê):
  ```sql
  CREATE TABLE public.cortesia_regras (
    id BIGSERIAL PRIMARY KEY,
    produto_cortesia_id TEXT NOT NULL REFERENCES public.produtos(id),
    categoria_liberadora_id TEXT REFERENCES public.categorias(id),
    produto_liberador_id    TEXT REFERENCES public.produtos(id),
    qtd_por_unidade INT NOT NULL DEFAULT 1 CHECK (qtd_por_unidade > 0),
    ativo BOOLEAN NOT NULL DEFAULT true,
    CHECK (num_nonnulls(categoria_liberadora_id, produto_liberador_id) = 1)
  );
  -- Regras iniciais: categorias baguetes, crepes-salgados, crepes-doces → mini-cappuccino-cortesia (1 por unidade)
  ```
- [ ] 5.3 Vínculo do item cortesia com o prato que a liberou:
  ```sql
  ALTER TABLE public.pedido_itens
    ADD COLUMN IF NOT EXISTS cortesia_de_item_id BIGINT
      REFERENCES public.pedido_itens(id) ON DELETE RESTRICT;
  CREATE INDEX IF NOT EXISTS idx_pedido_itens_cortesia_de ON public.pedido_itens(cortesia_de_item_id);
  ```
  - `ON DELETE RESTRICT`: não dá para remover o prato deixando a cortesia "solta".
- [ ] 5.4 Trigger `BEFORE INSERT OR UPDATE` em `pedido_itens` (`validar_cortesia()`):
  - Se o produto é cortesia (aparece em `cortesia_regras.produto_cortesia_id`): exige `cortesia_de_item_id` não nulo.
  - O item de origem precisa: casar com uma regra ativa (produto ou categoria), estar em pedido **da mesma mesa**, com pedido não `cancelado`.
  - O item de origem não pode estar cancelado (`cancelado = false`, ver 5.5).
  - Soma de cortesias **não canceladas** já vinculadas àquele item ≤ `quantidade × qtd_por_unidade` → senão `RAISE EXCEPTION 'Cortesia já utilizada para este prato'`.
  - Se o produto **não** é cortesia, `cortesia_de_item_id` deve ser nulo.
- [ ] 5.5 **Cancelamento em cascata da cortesia** (decisão do cliente):
  - Adicionar cancelamento lógico no item, para não apagar o histórico:
    ```sql
    ALTER TABLE public.pedido_itens
      ADD COLUMN IF NOT EXISTS cancelado BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;
    ```
  - Trigger `AFTER UPDATE OF status ON pedidos` → quando o pedido vira `cancelado`, marca `cancelado = true` em todos os itens dele **e** em todas as cortesias ligadas a esses itens, mesmo que estejam em outro pedido da mesa (lançadas depois).
  - Trigger `AFTER UPDATE OF cancelado ON pedido_itens` → cancelar um prato avulso também cancela as cortesias dele.
  - Quando uma cortesia cancelada estiver num pedido que continua ativo, recalcular `pedidos.total` desse pedido (continua R$ 0,00, mas mantém a regra geral) e notificar a cozinha pelo realtime, que já escuta `pedido_itens`.
  - Cozinha/impressão/barista: item cancelado aparece riscado com a etiqueta "CANCELADO" em vez de sumir.
  - Relatórios e saldo de cortesia contam só itens com `cancelado = false`.
  - A FK `ON DELETE RESTRICT` continua: prato com cortesia não é apagado fisicamente, só cancelado.
- [ ] 5.6 View de apoio `v_cortesias_disponiveis` (itens de prato não cancelados com saldo de cortesia > 0, por mesa, hoje) para a tela consultar.

### PDV (barista)

- [ ] 5.7 No card do produto cortesia e no modal da mesa (`js/pedidos.js:658`), botão **"🎁 Lançar cortesia"** habilitado **somente** quando a mesa tem saldo em `v_cortesias_disponiveis`; mostrar "Disponível: 2 (Baguete de Frango, Crepe de Chester)".
- [ ] 5.8 Ao lançar, escolher o prato de origem (pré-selecionado quando só houver um) e gravar via `adicionar_itens_pedido` / `criar_pedido`.
- [ ] 5.9 Permitir também lançar no mesmo pedido do prato (no carrinho, o item cortesia aparece habilitado quando há um prato liberador no carrinho; referência por índice resolvida na RPC — 2.1).

### Cozinha, impressão e relatório

- [ ] 5.10 Cozinha/impressão: destacar "🎁 CORTESIA — ref. Baguete de Frango".
- [ ] 5.11 Admin (pedidos/métricas — `js/admin/pedidos-admin.js`): card/relatório **"Cortesias concedidas"** por período, com quantidade total e por prato liberador.

**Aceite**
- Tentar inserir a cortesia direto na API sem prato de origem, ou além do saldo, falha no banco.
- 2 baguetes na mesa → permite no máximo 2 cortesias; a 3ª é recusada.
- Relatório mostra a contagem correta de cortesias no período.

---

## 6. Crepe meio a meio — preço conforme os sabores

**Estado atual:** existe `crepe-meio-a-meio` (R$ 29,90 fixo) em `crepes-doces` (`supabase/cardapio_seed_completo.sql:116`); sabores vão por observação.

- [ ] 6.1 Marcar o produto com `produtos.tipo_montagem TEXT` (`'simples'` | `'meio_a_meio'`) em vez de fixar id no código.
- [ ] 6.2 Tabela de metades do item:
  ```sql
  CREATE TABLE public.pedido_item_sabores (
    id BIGSERIAL PRIMARY KEY,
    pedido_item_id BIGINT NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
    lado TEXT NOT NULL CHECK (lado IN ('doce','salgado')),
    produto_id TEXT NOT NULL REFERENCES public.produtos(id),
    nome TEXT NOT NULL,
    preco NUMERIC(10,2) NOT NULL,
    UNIQUE (pedido_item_id, lado)
  );
  ```
- [ ] 6.3 Regra de preço (decisão do cliente): **50% do preço de cada sabor, somados** — `ROUND(preço_doce × 0,5, 2) + ROUND(preço_salgado × 0,5, 2)`.
  - Ex.: Morango 23,90 → 11,95 + Carne de Panela 31,90 → 15,95 = **R$ 27,90**.
  - Cada metade fica gravada em `pedido_item_sabores.preco` já com os 50%, para a comanda e o relatório mostrarem a composição.
  - Sem arredondamento extra para cima: o valor é a soma exata das metades.
  - Calculado na RPC, numa única função SQL `preco_meio_a_meio(doce_id, salgado_id)`; o `preco` cadastrado no produto vira só referência ("a partir de") e não entra na conta.
  - Adicionais (ex.: cheddar, se vinculado) somam por cima do valor das metades.
- [ ] 6.4 Modal do item (2.7): dois selects obrigatórios — "Metade doce" (crepes inteiros de `crepes-doces`, sem mini crepes/panquecas) e "Metade salgada" (`crepes-salgados`), com o preço calculado ao vivo.
- [ ] 6.5 `nome_produto` gravado legível: "Crepe Meio a Meio — ½ Morango / ½ Carne de Panela".
- [ ] 6.6 O meio a meio também libera cortesia (regra por categoria `crepes-doces` já cobre).
- [ ] 6.7 Cardápio público: exibir "Escolha 1 sabor doce + 1 salgado · preço conforme os sabores".

---

## 7. Menu de promoções por dia da semana

**Estado atual:** a tabela `promotions` (`js/db.js:300-355`) é só **banner/barra de campanha** (texto, badge, link, período). Não aplica desconto e não tem vínculo com produto nem dia da semana. Ela continua existindo para o banner; as promoções de preço ficam numa estrutura nova.

### Modelagem

- [ ] 7.1 Migration `supabase/migration_promocoes.sql`:
  ```sql
  CREATE TABLE public.promocoes (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,                       -- 'Terça do Cappuccino'
    descricao TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN (
      'percentual',        -- X% de desconto
      'compre_leve',       -- compre N, leve M (ex.: compre 1 leve 2)
      'segunda_unidade'    -- 2ª unidade com X% de desconto
    )),
    percentual NUMERIC(5,2) CHECK (percentual > 0 AND percentual <= 100), -- percentual e segunda_unidade
    qtd_compra INT CHECK (qtd_compra > 0),   -- compre_leve: N
    qtd_leva   INT CHECK (qtd_leva > qtd_compra), -- compre_leve: M
    dias_semana SMALLINT[] NOT NULL,          -- 0=dom … 6=sáb
    vigencia_inicio DATE,                     -- opcional
    vigencia_fim DATE,
    imagem_url TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    ordem INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (tipo = 'percentual'      AND percentual IS NOT NULL) OR
      (tipo = 'segunda_unidade' AND percentual IS NOT NULL) OR
      (tipo = 'compre_leve'     AND qtd_compra IS NOT NULL AND qtd_leva IS NOT NULL)
    )
  );

  -- Quais produtos/categorias entram na promoção
  CREATE TABLE public.promocao_itens (
    id BIGSERIAL PRIMARY KEY,
    promocao_id BIGINT NOT NULL REFERENCES public.promocoes(id) ON DELETE CASCADE,
    produto_id   TEXT REFERENCES public.produtos(id)   ON DELETE CASCADE,
    categoria_id TEXT REFERENCES public.categorias(id) ON DELETE CASCADE,
    CHECK (num_nonnulls(produto_id, categoria_id) = 1)
  );

  -- Registro do desconto aplicado no item do pedido
  ALTER TABLE public.pedido_itens
    ADD COLUMN IF NOT EXISTS promocao_id BIGINT REFERENCES public.promocoes(id),
    ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) NOT NULL DEFAULT 0;
  ```
  - `subtotal` é coluna gerada (`quantidade * preco_unitario`): recriar como `quantidade * preco_unitario - desconto` (DROP + ADD da coluna gerada na migration) e conferir relatórios que leem `subtotal`.
  - RLS: `SELECT` público; escrita só `admin`.
- [ ] 7.2 Função `promocoes_do_dia(p_data DATE DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)` que retorna promos ativas no dia da semana e dentro da vigência.

### Regras de cálculo (na RPC `criar_pedido`, com prévia no carrinho)

- [ ] 7.3 **Percentual:** `desconto = preco_unitario × qtd × %`.
- [ ] 7.4 **Compre N leve M** (ex.: compre 1 leve 2): a cada M unidades, `M − N` saem grátis → `grátis = floor(qtd / M) × (M − N)`; `desconto = grátis × preco_unitario`. Com 3 unidades em "compre 1 leve 2": 1 grátis.
- [ ] 7.5 **Segunda unidade com X%:** `desconto = floor(qtd / 2) × preco_unitario × %`.
- [ ] 7.6 Promoções não acumulam (decisão do cliente): se um item casar com mais de uma, aplicar **só a de maior desconto em R$** para aquele item; em empate, a de menor `ordem`. Gravar em `pedido_itens.promocao_id` apenas a promo aplicada. Adicionais (leite vegetal, cheddar) **não** entram na base do desconto — só o preço do produto. Cortesias nunca recebem promo.
- [ ] 7.7 O carrinho agrupa unidades do mesmo produto (independente de obs) para contar "compre N / 2ª unidade" — calcular a promo por produto somando as linhas do carrinho.

### Admin

- [ ] 7.8 Nova aba **Promoções** no `admin.html` (`js/admin/promocoes.js`):
  - Lista com nome, tipo, dias (chips Seg…Dom), status, ações.
  - Formulário: nome, descrição, tipo (os campos mudam conforme o tipo), dias da semana (checkboxes), vigência opcional, produtos/categorias (busca com multi-seleção), imagem (reaproveitar upload de `promotions.upsert`, `js/db.js:314`), ativo.
  - Prévia do texto gerado: "Terça — 2ª unidade com 50% em Cappuccinos".
- [ ] 7.9 `js/db.js`: `promocoes.all()`, `promocoes.doDia()`, `promocoes.upsert()`, `promocoes.delete()`.

### PDV e cardápio

- [ ] 7.10 PDV (`js/pedidos.js:230` `renderCategories`): chip **"🔥 Promos de hoje"** filtrando os produtos em promoção; selo "PROMO" nos cards; carrinho mostra linha de desconto por item ("− R$ 6,45 · 2ª unidade 50%").
- [ ] 7.11 Cardápio público (`cardapio.html` / `js/cardapio-dynamic.js`): aba **"Promos"** no topo com *Hoje* (dia atual) e *Na semana* (agenda Seg→Dom). Esconder quando não houver promo ativa.
- [ ] 7.12 Cozinha/impressão/admin de pedidos: mostrar desconto aplicado e total com desconto.

**Aceite**
- Promo de terça só aparece e só aplica às terças (fuso de São Paulo).
- Os três tipos calculam corretamente com 1, 2, 3 e 4 unidades.
- Total gravado no banco = total mostrado no carrinho.

---

## 8. Observação por item e observação geral do pedido

**Estado atual — já existe, mas pouco visível:**
- Banco: `pedido_itens.observacoes` e `pedidos.observacoes`.
- PDV: obs por item via botão ✏️ no carrinho (`js/pedidos.js:331-355`, `pedidos.html:188-200`); obs geral em textarea (`pedidos.html:103-104`).
- Cozinha, impressão e admin já exibem as duas.

**Tarefas**
- [ ] 8.1 Campo "Observação do item" no modal de montagem (2.7), preenchido ao adicionar.
- [ ] 8.2 No carrinho, trocar ✏️ por botão com texto ("+ Obs" / "Editar obs") e sempre mostrar a obs abaixo do item.
- [ ] 8.3 "Observações gerais do pedido" mais visível no carrinho e no drawer mobile.
- [ ] 8.4 (Opcional) Chips rápidos no modal: "Sem açúcar", "Bem quente", "Para viagem", "Sem cebola".
- [ ] 8.5 **Correção de segurança (XSS):** textos do banco são injetados via `innerHTML` sem escape em `js/pedidos.js:389,613,680`, `js/cozinha.js:320,378`, `js/pedido-print.js:115,135`, `js/admin/pedidos-admin.js:183,197`. Criar `escapeHtml()` compartilhado e aplicar a obs, nomes, adicionais, sabores e promoções.

**Aceite**
- Obs do item preenchida sem sair do fluxo de adição.
- `<b>teste</b>` numa obs aparece literal na cozinha e na impressão.

---

## Checklist de testes (antes de publicar)

- [ ] Pedido com: café + leite vegetal, baguete + cheddar, crepe meio a meio, item com obs, obs geral → total no carrinho = `pedidos.total` = cozinha = impressão = admin.
- [ ] Cortesia: sem prato → bloqueada; 2 pratos → no máx. 2 cortesias; lançada depois em outro pedido da mesma mesa → aceita; cancelar o pedido do prato → cortesia vinculada fica cancelada (mesmo em outro pedido) e sai da contagem; relatório conta corretamente.
- [ ] Meio a meio: Morango (23,90) + Carne de Panela (31,90) = R$ 27,90; trocar os sabores atualiza o preço no modal e o valor gravado bate.
- [ ] Item em duas promoções ao mesmo tempo → só a de maior desconto é aplicada e registrada.
- [ ] Promoções: cada tipo com 1–4 unidades; promo fora do dia não aplica; duas promos no mesmo item → aplica a maior.
- [ ] Falha no meio da criação do pedido não deixa pedido sem itens.
- [ ] Realtime da cozinha recebe os novos campos (adicionais, sabores, cortesia, desconto).
- [ ] Hero em 360px, 768px e desktop; seta, dot, teclado e swipe.
- [ ] `npm run build` e conferir o `dist/`.

## Pendências de confirmação

Nenhuma — todas as decisões estão registradas na tabela "Decisões do cliente".
