# [FEAT] Variações de bebida e grupos de opções obrigatórios (tamanho, leite, shots, temperatura) com ficha técnica e "minha favorita"

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Permitir que um produto tenha grupos de opções com regra de escolha (obrigatório/opcional, mínimo/máximo), em que cada opção pode mudar o preço e a receita (ficha técnica): tamanho P/M/G, tipo de leite, shots extras, temperatura. O cliente pode salvar a bebida montada como "minha favorita" e repeti-la com um toque.
- **Problema e evidência:**
  - *Hoje no sistema:* a personalização se resume a `adicionais` opcionais e planos, sem grupo nem obrigatoriedade. `fn_validar_adicionais_item` (`supabase/migration_caf_000075_validacao_adicionais_xss.sql:52-97`) só confere se o adicional é permitido e soma `v_total_adicionais + preco`. Não há "escolha exatamente 1 tamanho". O próprio exemplo de etiqueta do KDS lança leite como adicional (`js/cozinha.js:428`, `{ nome_adicional: 'Leite vegetal' }`). Para mostrar tamanhos, hoje é preciso cadastrar "Cappuccino P", "Cappuccino M" e "Cappuccino G" como produtos separados, o que triplica o catálogo e espalha o menu analytics.
  - A ficha técnica de adicional só **soma** insumos (`supabase/migration_caf_000032_ficha_tecnica.sql:270-300`, laço que insere `saida_venda` para cada linha de `fichas_tecnicas` do adicional). Não existe substituição: trocar leite integral por aveia baixa a aveia **e** o leite integral da receita base, e o CMV fica errado.
  - Já existe uma estrutura de grupos com mínimo e máximo: `combo_grupos` (`supabase/migration_caf_000110_combos_kits.sql:26-32`, `min_escolhas`/`max_escolhas`) e o cálculo `validar_e_calcular_combo` (mesmo arquivo, 120-211). Mas a opção de combo aponta para um **produto** (`combo_grupo_opcoes.produto_item_id`), não para uma variação, e o preço é validado numa RPC à parte chamada pelo front (`js/db.js:2033`).
  - O "favoritos" da CAF-000058 é do **operador** no PDV, não do cliente.
  - *Mercado:* o Square lançou em 2025 os "advanced modifiers", com personalização guiada em etapas. O app da Starbucks salva bebidas favoritas desde 2017. Goomer, Anota AI e Consumer têm personalização por grupos com obrigatoriedade.
- **Impacto de não fazer:** Catálogo inflado e confuso no QR/totem; pedidos sem tamanho ou leite definido (o barista pergunta no balcão, no pico do intervalo); CMV e estoque errados para leites vegetais; o preço de cada opção não aparece de forma padronizada antes da escolha.
- **Para quem é destinado:** Cliente (QR, pedido online, totem), operador do PDV, barista (KDS/etiqueta) e dono (custo e estoque).
- **História de usuário:** Como cliente universitário, quero montar meu latte (G, leite de aveia, +1 shot, gelado) vendo o preço de cada escolha e salvá-lo como favorito, para pedir igual amanhã em dois toques.
- **Como saberemos que deu certo:** 0 pedidos de produto com grupo obrigatório aceitos sem a escolha (validado no servidor); redução de pelo menos 30% no número de produtos ativos de cafés após migrar os tamanhos; diferença zero entre a baixa de estoque esperada e a registrada nos testes de substituição de leite; favorita repetida em até 2 toques.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Tabelas `produto_opcao_grupos` (produto, nome, ordem, `min_escolhas`, `max_escolhas`, tipo de exibição) e `produto_opcoes` (grupo, nome, `preco_delta` ≥ 0, `padrao`, ativo, ordem, disponível), no mesmo formato de `combo_grupos`/`combo_grupo_opcoes` | P0 | CA01 |
| RF02 | Função de servidor única `calcular_item_com_opcoes(produto_id, opcoes)` que valida mínimo/máximo, opção ativa e pertencente ao produto, e devolve o preço unitário; chamada **dentro** de `criar_pedido`, `criar_pedido_cliente`, `criar_pedido_online`, `criar_pedido_totem` e `adicionar_itens_pedido` (o preço enviado pelo front é ignorado) | P0 | CA02, CA03, CA04 |
| RF03 | Tabela `pedido_item_opcoes` (snapshot de grupo, opção, nome e `preco_delta`) gravada com o item | P0 | CA02 |
| RF04 | Ficha técnica por opção: `produto_opcao_insumos` com ação `somar`, `substituir` (troca o insumo X da receita base pelo Y) ou `fator` (multiplica a receita base, ex.: G = 1,5); a baixa de estoque e o `custo_unitario` do item aplicam essas regras | P0 | CA05, CA06 |
| RF05 | Seletor guiado em etapas (um grupo por vez, obrigatórios primeiro, "+ R$ 2,00" ao lado de cada opção e total atualizado) no cardápio QR/online, totem e PDV, compartilhado em `js/utils/opcoes-produto.js` | P0 | CA07, CA08 |
| RF06 | KDS, comanda por estação e etiqueta de copo mostram as opções em linha curta e em destaque as que mudam o preparo (leite, temperatura) | P0 | CA09 |
| RF07 | Admin: editor de grupos e opções na tela de produto, com "copiar grupos de outro produto" e pré-visualização | P1 | CA10 |
| RF08 | "Minha favorita": no cardápio QR/online, salvar a combinação no aparelho (`localStorage`) e, se o cliente estiver identificado, na tabela `cliente_favoritos`; "repetir" revalida no servidor e avisa se uma opção saiu do cardápio | P1 | CA11, CA12 |
| RF09 | Opção esgotada: marcar uma opção como indisponível (ex.: acabou o leite de aveia) sem esgotar o produto | P1 | CA13 |
| RF10 | Combos (CAF-000110) aceitam bebida com opções dentro da escolha do combo | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Preço de cada opção visível antes da escolha e preço exibido = preço cobrado (Lei 10.962/2004 e Decreto 5.903/2006), garantido pelo cálculo no servidor | P0 | CA03, CA07 |
| RNF02 | Montar uma bebida com 4 grupos em no máximo 5 toques no totem e no QR | P1 | CA08 |
| RNF03 | Produto sem grupos continua exatamente como hoje (adicionais planos e meio a meio intactos) | P0 | CA14 |
| RNF04 | Valores em centavos no front com os utilitários de `js/utils/` (sem `toFixed` solto) | P1 | CA02 |

### Dependências técnicas

- `combo_grupos`, `validar_e_calcular_combo` e `js/utils/combos.js` (CAF-000110) como modelo. **Decisão proposta:** tabelas próprias para opções do produto, com o mesmo formato e uma função de validação de grupos compartilhada. Reaproveitar `combo_grupos` exigiria permitir opção sem produto e misturaria preço de combo com preço de variação. Fica registrado na D01.
- Ficha técnica e baixa de estoque (CAF-000032, CAF-000074, lotes PEPS da CAF-000111).
- CAF-000128 (preço calculado no servidor) e CAF-000135 (adicionar itens/repetir rodada): esta SDD segue o mesmo princípio e deve ser feita depois delas.
- CAF-000136 (trigger de combos quebrado no estoque) antes de tocar a baixa por opção.
- Impressão (`js/pedido-print.js:175`, `:751`), KDS (`js/cozinha.js:1384`, `:1708`), PDV (`js/pdv/carrinho.js`), totem (`js/totem.js`), cardápio (`js/cardapio-cliente-pedido.js`).

### Recursos necessários

- Lista real de tamanhos, leites, shots e preços da casa; receita de cada tamanho (ml de leite, g de café) para a ficha técnica.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o admin cadastrando o grupo "Tamanho" (mín. 1, máx. 1) com P, M (+R$ 2,00) e G (+R$ 4,00), quando salva, então o grupo e as opções ficam ligados ao produto na ordem definida.
- [ ] **CA02:** Dado um Latte de R$ 12,00 com M (+2,00) e aveia (+3,00), quando o pedido é criado por qualquer canal, então o item é gravado com R$ 17,00 e as duas opções em `pedido_item_opcoes`.
- [ ] **CA03:** Dado um payload com preço de R$ 12,00 para o mesmo latte com aveia, quando chega ao servidor, então o preço gravado é o calculado (R$ 15,00), não o enviado.
- [ ] **CA04:** Dado um produto com grupo obrigatório, quando o pedido chega sem escolha nesse grupo ou com mais opções que o máximo, então o servidor rejeita com mensagem que cita o grupo.
- [ ] **CA05:** Dado um latte cuja receita base usa 200 ml de leite integral e a opção aveia com ação `substituir`, quando o item é vendido, então o estoque baixa 200 ml de aveia e 0 ml de leite integral.
- [ ] **CA06:** Dado o tamanho G com `fator` 1,5, quando vendido, então todos os insumos da receita base baixam 1,5 vez e o `custo_unitario` do item reflete isso.
- [ ] **CA07:** Dado o seletor aberto no QR, quando o cliente vê as opções, então cada uma mostra o acréscimo ("+ R$ 3,00" ou "sem custo") antes de ser tocada, e o total se atualiza a cada escolha.
- [ ] **CA08:** Dado o totem, quando o cliente tenta avançar sem escolher um grupo obrigatório, então o botão "Adicionar" fica desabilitado e o grupo pendente é indicado.
- [ ] **CA09:** Dado um item com G, aveia e gelado, quando aparece no KDS, na comanda da estação e na etiqueta do copo, então as três opções aparecem e "aveia" e "gelado" ficam em destaque.
- [ ] **CA10:** Dado o editor do admin, quando copio os grupos do Latte para o Cappuccino, então o Cappuccino recebe grupos e opções iguais, com IDs próprios.
- [ ] **CA11:** Dado um cliente que salvou "Meu latte" e volta ao cardápio, quando toca em "repetir", então o item entra no carrinho com as mesmas opções e o preço atual.
- [ ] **CA12:** Dado uma favorita com uma opção que foi desativada, quando o cliente toca em "repetir", então o sistema não adiciona o item e mostra qual opção precisa ser trocada.
- [ ] **CA13:** Dado a opção "aveia" marcada como indisponível, quando o cliente abre o seletor, então ela aparece riscada e não pode ser escolhida; o produto continua à venda.
- [ ] **CA14:** Dado um produto sem grupos, com adicionais ou meio a meio, quando vendido, então preço, baixa de estoque e impressão são idênticos aos de hoje (caso negativo).

## O que a atividade não inclui

- Opção com quantidade fracionada (ex.: "meio shot"): motivo: não usado na casa; o máximo de escolhas cobre shots.
- Preço diferente por canal: motivo: tratado pela CAF-000151 (preço por horário) e fora do pedido atual.
- Migração automática de produtos "P/M/G" já existentes para grupos: motivo: o dono precisa decidir caso a caso; o admin terá o editor e um roteiro manual.
- Fotos por opção: motivo: baixo impacto; aumenta o peso do cardápio.

### Considerado para o futuro (P2)

- Bebida com opções dentro de combos (RF10).
- Sugestão "seu favorito de sempre" no topo do cardápio para cliente identificado (liga com CAF-000150).
- Opção que muda a estação de preparo (ex.: "gelado" vai para a estação de bebidas frias).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Tabelas próprias (proposta) ou generalizar `combo_grupos` para aceitar opção sem produto? | dev | Não | |
| D02 | Os adicionais atuais que são "escolha" (leites) viram opções e saem de `adicionais`? | PO | Não | |
| D03 | Quais tamanhos e preços reais, e a receita de cada um? | PO | Sim (para o piloto) | |
| D04 | A favorita fica só no aparelho ou também no cadastro do cliente (exige consentimento, ver CAF-000132)? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cadastro de grupo e opções | integração (`tests/caf-000143-opcoes-admin.test.js`) | CA01, CA10 | Salvar e copiar grupos via módulo do admin com Supabase simulado | Linhas e ordem corretas |
| CT02 | Preço calculado no servidor | pgTAP (`supabase/tests/opcoes_produto.test.sql`) | CA02, CA03 | Chamar as 5 RPCs de criação com preço adulterado | Preço gravado = calculado |
| CT03 | Grupo obrigatório e máximo | pgTAP | CA04 | Payload sem escolha / com escolhas demais | `RAISE` citando o grupo |
| CT04 | Substituição e fator na ficha | pgTAP | CA05, CA06 | Vender latte aveia G | Movimentos e custo esperados |
| CT05 | Seletor no QR e no totem | unit + DOM (`tests/caf-000143-seletor-opcoes.test.js`) | CA07, CA08, CA13 | Renderizar `js/utils/opcoes-produto.js` com grupos | Preços visíveis; botão bloqueado; opção riscada |
| CT06 | KDS, comanda e etiqueta | unit (`js/pedido-print.js`, renderização do KDS) | CA09 | Item com 3 opções | Opções impressas e destacadas |
| CT07 | Favorita | unit + DOM | CA11, CA12 | Salvar, repetir, desativar opção e repetir | Item igual; depois, aviso |
| CT08 | Regressão sem grupos | pgTAP + suítes existentes | CA14 | Rodar `criar_pedido.test.sql`, `combos_kits.test.sql` | Sem alteração |
| CT09 | Fluxo real | e2e (Playwright) | CA02, CA07 | Montar bebida no QR e conferir no KDS | Pedido com opções e preço certo |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000110_combos_kits.sql`, `supabase/migration_caf_000075_validacao_adicionais_xss.sql`, `supabase/migration_caf_000032_ficha_tecnica.sql`, `js/utils/combos.js`, `js/pdv/carrinho.js`, `js/cardapio-cliente-pedido.js`, `js/totem.js`, `js/cozinha.js`, `js/pedido-print.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000020](CONCLUIDAS/CAF-000020-vinculo-de-adicionais-por-produto.md), [CAF-000032](CONCLUIDAS/CAF-000032-ficha-tecnica-custo-e-lucro.md), [CAF-000058](CONCLUIDAS/CAF-000058-lancamento-rapido-favoritos-e-repetir-rodada.md), [CAF-000075](CONCLUIDAS/CAF-000075-correcao-validacao-adicionais-e-xss-no-pdv.md), [CAF-000110](CONCLUIDAS/CAF-000110-combos-e-kits-promocionais-cardapio-totem-pdv.md), [CAF-000111](CONCLUIDAS/CAF-000111-sugestao-inteligente-compras-lotes-validade-peps-estoque.md); novas: CAF-000128, CAF-000135, CAF-000136, CAF-000150, CAF-000152
- Referências de design: Square "advanced modifiers" (https://community.squareup.com/t5/Product-Updates/Square-Releases-Vol-2-2025-New-tools-for-restaurants/ba-p/820230); favoritas da Starbucks (https://www.androidpolice.com/2017/01/30/mercifully-starbucks-app-now-lets-you-save-your-favorite-drinks/)
- Requisitos originais: Lei 10.962/2004 e Decreto 5.903/2006 (informação de preço)
- Issue / PR relacionado: —
