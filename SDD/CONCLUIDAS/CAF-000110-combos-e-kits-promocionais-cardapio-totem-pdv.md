# [FEAT] Combos e Kits Configuráveis no Cardápio Digital, Totem e PDV com Separação Automática por Estação no KDS

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-29 · **Atualizada em:** 2026-11-04

## Detalhes da Atividade

- **O que precisa ser feito:**
  Implementar o suporte completo a **Combos e Kits Promocionais** (ex.: *"Combo Intervalo Teatro: 1 Bebida Quente + 1 Salgado + 1 Doce por R$ 34,90"* ou *"Combo Casal Espetáculo"*) no Admin, Cardápio Digital, Totem de Autoatendimento, PDV e KDS:
  1. **Modelagem e Admin (`combo_grupos` e `combo_grupo_opcoes`):** Permitir cadastrar no Admin um produto do tipo `combo` (`tipo_montagem = 'combo'`), definindo etapas/grupos de escolha (ex.: Passo 1: "Escolha sua Bebida", Passo 2: "Escolha seu Salgado", Passo 3: "Escolha sua Sobremesa"), com quantidade mínima/máxima por grupo e eventual acréscimo de preço para itens premium.
  2. **Experiência de Escolha Guiada (PDV, Cardápio e Totem):** Ao selecionar um Combo, abrir o modal de montagem passo a passo, validando que o cliente/barista selecionou os itens obrigatórios de cada etapa e bloqueando opções cujos produtos-base estejam esgotados (`disponivel = false`).
  3. **Roteamento Inteligente por Estação no KDS (Bar × Cozinha) e Baixa de Estoque:** Quando um combo é vendido, os itens escolhidos devem ser gravados/explodidos de forma que a bebida do combo apareça na estação **Bar** e o salgado/lanche apareça na estação **Cozinha**, e o gatilho de estoque dê baixa automática na ficha técnica de cada produto componente escolhido.
- **Problema e evidência:**
  Hoje o sistema possui promoções do tipo `% de desconto`, `compre X leve Y` e `2ª unidade` (`promocoes`), além de montagem `meio_a_meio`, mas não permite criar um **Combo fechado com escolha guiada entre categorias/produtos** que divida automaticamente os itens entre o Bar (cafés/bebidas) e a Cozinha (salgados/doces) e baixe o estoque real de cada item escolhido. Em dias de espetáculo no Teatro Univates, combos prontos de intervalo são o maior acelerador de fila e ticket médio.
- **Impacto de não fazer:**
  Perda de oportunidade de aumento do ticket médio no Totem/Cardápio e lentidão na fila do intervalo do teatro (onde o cliente precisa escolher itens avulsos em várias categorias em vez de tocar em 1 Combo pronto).
- **Para quem é destinado:**
  Clientes do Teatro Univates (Totem e Cardápio Digital), baristas no PDV, equipe de Bar/Cozinha no KDS e administração.
- **História de usuário:**
  Como cliente no intervalo do espetáculo ou barista no balcão, quero escolher um Combo com etapas simples (ex.: bebida + salgado + doce) por um preço fechado vantajoso, para fazer meu pedido em poucos segundos enquanto o Bar e a Cozinha recebem cada item na sua respectiva estação.
- **Como saberemos que deu certo:**
  1. Cadastro de um Combo no Admin com 2 ou mais etapas e produtos selecionáveis.
  2. Montagem do Combo no PDV, Cardápio e Totem impedindo avanço sem preencher as escolhas obrigatórias e ocultando/desabilitando itens esgotados.
  3. No KDS, os componentes de bebida aparecem no filtro Bar e os de comida no filtro Cozinha, e o estoque/CMV baixa a ficha técnica de cada componente.
  4. 100% dos testes passando em `npm test`, `npm run test:db` e `npm run build`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar tabelas `combo_grupos` (id, produto_combo_id, nome, ordem, min_escolhas, max_escolhas) e `combo_grupo_opcoes` (id, grupo_id, produto_item_id, preco_adicional, ativo) com RLS habilitado (leitura pública, escrita admin) e expandir `tipo_montagem` em `produtos` para aceitar `'combo'` | P0 | CA01 |
| RF02 | Disponibilizar interface no Admin (`products.js`) para configurar os grupos e opções de um produto quando `tipo_montagem = 'combo'` | P0 | CA01 |
| RF03 | Implementar o seletor guiado de etapas do Combo no PDV (`pedidos.js`), Cardápio (`cardapio-cliente-pedido.js`) e Totem (`totem.js`), validando limites `min_escolhas`/`max_escolhas` e bloqueando opções com `produto.disponivel = false` | P0 | CA02, CA03 |
| RF04 | Atualizar as RPCs de criação de pedido (`criar_pedido`, `criar_pedido_cliente`, `criar_pedido_online`, `criar_pedido_totem`, `adicionar_itens_pedido`) para validar as escolhas do combo no servidor, somar eventuais `preco_adicional` e persistir os itens componentes vinculados para roteamento de estação (Bar × Cozinha) e baixa de ficha técnica/estoque | P0 | CA04, CA05 |
| RF05 | Exibir nas comandas impressas, etiquetas e cards do KDS a indicação clara dos itens pertencentes ao combo | P1 | CA05 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Validação server-side estrita: o preço do combo e os adicionais de opção devem ser calculados no banco de dados pelas RPCs, ignorando preços manipulados no payload do cliente | P0 | CA03, CA04 |
| RNF02 | Montagem do combo no Totem e Mobile em até 3 toques por grupo, com botões de pelo menos `48px` de altura | P0 | CA02 |

### Dependências técnicas

- `supabase/migration_fase3_final.sql` (`produtos.tipo_montagem`)
- `supabase/migration_caf_000032_ficha_tecnica.sql` (baixa de estoque e cálculo de CMV)
- `js/admin/products.js`, `js/pedidos.js`, `js/cardapio-cliente-pedido.js`, `js/totem.js`, `js/cozinha.js`

### Recursos necessários

- N/A.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o painel Admin de Produtos, quando o administrador criar um produto com `tipo_montagem = 'combo'`, então consegue adicionar grupos (ex.: "Bebida" min 1 / max 1, "Salgado" min 1 / max 1) e vincular produtos existentes a cada grupo com preço adicional opcional.
- [x] **CA02:** Dado um Combo configurado com 2 grupos obrigatórios, quando o cliente ou barista abrir o Combo no Cardápio, Totem ou PDV e tentar adicionar ao carrinho tendo selecionado apenas 1 grupo, então o botão de confirmar permanece bloqueado/sinaliza a etapa pendente até que todas as escolhas obrigatórias sejam feitas.
- [x] **CA03:** Dado que um dos produtos integrantes de uma opção do Combo está marcado como esgotado (`disponivel = false`), quando o modal do Combo for aberto ou submetido à RPC no banco, então a opção esgotada aparece desabilitada na tela e é rejeitada caso enviada via API.
- [x] **CA04:** Dado um Combo com preço base R$ 29,90 onde o cliente escolhe uma opção com acréscimo de R$ 3,00, quando adicionado ao carrinho e enviado ao banco, então o valor unitário registrado é R$ 32,90.
- [x] **CA05:** Dado um Combo contendo "1 Cappuccino (estação Bar)" e "1 Croissant (estação Cozinha)", quando o pedido entrar no KDS e no controle de estoque, então o Bar visualiza o Cappuccino, a Cozinha visualiza o Croissant e as fichas técnicas de ambos os produtos sofrem baixa automática no estoque.

## O que a atividade não inclui

- Combos aninhados (um combo dentro de outro combo): motivo: complexidade desnecessária para a operação da cafeteria.

### Considerado para o futuro (P2)

- Sugestão automática de upgrade para Combo ("Por mais R$ 6,00 transforme seu Cappuccino + Pão de Queijo no Combo Completo com Brownie!").

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Se todos os itens de um grupo obrigatório do combo estiverem esgotados, o combo inteiro deve ficar indisponível? | PO/dev | Não | Sim, se um grupo obrigatório não tiver ao menos `min_escolhas` opções disponíveis, o combo é exibido como indisponível. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cadastro e leitura de grupos e opções de combo | unit / integração | CA01 | Criar combo com 2 grupos no Admin e carregar no catálogo | Grupos e opções persistidos e carregados com RLS ativo |
| CT02 | Validação de escolhas obrigatórias e item esgotado | integração (Happy DOM) | CA02, CA03 | Tentar confirmar combo incompleto; tentar selecionar opção esgotada | Bloqueio visual e validação server-side na RPC |
| CT03 | Cálculo de preço com acréscimo e separação Bar × Cozinha | pgTAP / integração | CA04, CA05 | Enviar pedido com combo (Cappuccino + Croissant) | Total calculado corretamente, estações separadas no KDS e baixa nas 2 fichas técnicas |

## URL Complementar

- Referências no projeto: `supabase/migration_fase3_final.sql`, `js/pedidos.js`, `js/totem.js`
