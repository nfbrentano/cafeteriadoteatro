# [FEAT] Alergênicos e restrições alimentares no cardápio, totem, PDV e KDS

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Registrar de forma estruturada os alergênicos (glúten, leite/lactose, ovo, amendoim, castanhas, soja etc.) e as restrições (vegano, sem lactose, sem glúten) de cada produto, preferencialmente derivados da ficha técnica. Mostrar selos no cardápio, no totem, no PDV, no KDS e na etiqueta, permitir que o cliente filtre e exibir aviso de possível contaminação cruzada.
- **Problema e evidência:**
  - *Hoje no sistema:* não há campo de alergênico nem de restrição. O snapshot de produção não traz nenhuma coluna nesse sentido em `produtos`, `categorias`, `estoque_itens` ou `adicionais` (`tests/fixtures/schema-snapshot.json`), e a busca por "alerg", "glúten" e "lactose" no código não encontra tratamento em `js/`.
  - A informação existe só como texto livre: a categoria "Sem Lactose & Sem Glúten" com a descrição "linha Cheiro Verde segura para celíacos" (`supabase/cardapio_seed_completo.sql:24`) e "(Sem Lactose)" no nome dos produtos (`:232-241`). Não dá para filtrar, não aparece no KDS e não alerta quando o cliente escolhe leite comum como adicional.
  - A ficha técnica liga produtos e adicionais a insumos (`fichas_tecnicas`, CAF-000032), o que permite derivar os alergênicos do produto a partir dos insumos, inclusive das opções de leite da CAF-000143.
  - *Mercado:* a Toast mostra alergênicos no PDV, no KDS, no pedido online e no totem, com aviso de contaminação cruzada; o Square marca preferências alimentares.
  - *Regras:* a RDC Anvisa 727/2022, que consolidou a RDC 26/2015, trata da rotulagem de alimentos **embalados** (vale para itens embalados revendidos, não para o preparo na hora). Alguns estados exigem informar glúten/lactose em cardápios: CE (Lei 17.899/2022), MA, PA (Lei 10.654/2024) e RN. Não verificamos norma específica no RS nem em Lajeado (ver D01).
- **Impacto de não fazer:** Risco à saúde de clientes alérgicos e celíacos; o barista recebe a pergunta no balcão e responde de memória; nenhum aviso no KDS quando o cliente pede "sem lactose"; exposição jurídica se houver incidente.
- **Para quem é destinado:** Cliente com alergia ou restrição; barista/cozinha (preparo); dono (cadastro).
- **História de usuário:** Como cliente celíaco, quero filtrar o cardápio por "sem glúten" e ver o aviso de contaminação cruzada, para pedir com segurança sem depender da memória do atendente.
- **Como saberemos que deu certo:** 100% dos produtos ativos com alergênicos revisados (campo "revisado em" preenchido); filtro funcionando em QR, online e totem; 0 itens com alergênico derivado da ficha técnica divergente do exibido.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Catálogo fixo de alergênicos (`alergenicos`: código, nome, ícone) e de restrições (vegano, vegetariano, sem lactose, sem glúten) | P0 | CA01 |
| RF02 | Vínculo insumo → alergênico (`estoque_item_alergenicos`) e produto → alergênico manual (`produto_alergenicos`, com tipo "contém" ou "pode conter") | P0 | CA01, CA02 |
| RF03 | View `v_produto_alergenicos` = alergênicos da ficha técnica do produto ∪ manuais; o admin vê a origem e confirma com "revisado em/por" | P0 | CA02, CA03 |
| RF04 | Selos com ícone + texto no cardápio QR/online, no totem e no PDV; detalhe do produto com lista completa e aviso padrão de contaminação cruzada configurável | P0 | CA04, CA05 |
| RF05 | Filtro "sem X" no QR/online/totem, que esconde itens que contêm ou podem conter o alergênico escolhido; a escolha fica salva no aparelho | P0 | CA06 |
| RF06 | Ao escolher adicional ou opção (CAF-000143) que adiciona alergênico (ex.: leite comum), o total de alergênicos do item é recalculado e exibido | P1 | CA07 |
| RF07 | KDS, comanda e etiqueta: campo "alergia do cliente" no pedido (seleção, não texto livre) e destaque vermelho no item; o filtro do cliente no QR é enviado junto | P0 | CA08, CA09 |
| RF08 | Relatório no admin: produtos sem revisão e produtos cujo cálculo pela ficha mudou desde a última revisão | P1 | CA10 |
| RF09 | Informação nutricional e rótulo para itens embalados de produção própria | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Produto sem revisão não exibe "não contém"; exibe "informação de alergênicos não disponível, pergunte ao atendente" | P0 | CA03 |
| RNF02 | Selos acessíveis: ícone + texto, contraste WCAG AA, lidos por leitor de tela (ver CAF-000125) | P0 | CA04 |
| RNF03 | Alteração em insumo, ficha ou vínculo grava auditoria (quem/quando) | P1 | CA10 |
| RNF04 | Catálogo público com alergênicos continua com LCP ≤ 2,5 s no 4G (dados embutidos na mesma consulta do catálogo) | P1 | CA04 |

### Dependências técnicas

- Ficha técnica e insumos (CAF-000031, CAF-000032, CAF-000074); opções de produto (CAF-000143, opcional).
- CAF-000142 (escape de HTML do catálogo) antes de exibir novos textos; CAF-000125 (acessibilidade).
- Telas: `js/cardapio-dynamic.js`, `js/cardapio-cliente-pedido.js`, `js/totem.js`, `js/pdv/catalogo.js`, `js/cozinha.js`, `js/pedido-print.js`, `js/admin/products.js`, `js/admin/estoque.js`.

### Recursos necessários

- Levantamento dos insumos com fornecedores (rótulos) e revisão por responsável técnico ou nutricionista, se houver.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o insumo "Farinha de trigo" marcado com glúten, quando ele entra na ficha técnica do croissant, então o croissant passa a ter glúten como "contém", com origem "ficha técnica".
- [ ] **CA02:** Dado um produto revendido sem ficha técnica, quando o admin marca manualmente "pode conter amendoim", então o selo aparece como "pode conter".
- [ ] **CA03:** Dado um produto nunca revisado, quando o cliente abre o detalhe, então vê "informação de alergênicos não disponível" e não vê nenhum selo de "sem" (caso negativo).
- [ ] **CA04:** Dado um produto revisado com glúten e leite, quando aparece no QR, no totem e no PDV, então mostra os dois selos com texto legível.
- [ ] **CA05:** Dado o detalhe de qualquer produto revisado, quando o cliente abre, então vê o aviso de contaminação cruzada configurado pelo dono.
- [ ] **CA06:** Dado o filtro "sem glúten" ativo no QR, quando o cliente navega, então itens que contêm ou podem conter glúten somem; ao reabrir o cardápio no mesmo aparelho, o filtro continua ativo.
- [ ] **CA07:** Dado um latte com leite de aveia (sem lactose), quando o cliente troca para leite integral, então o item passa a mostrar "contém leite".
- [ ] **CA08:** Dado um pedido com "alergia: amendoim" informada, quando chega ao KDS, à comanda e à etiqueta, então o pedido e os itens aparecem com destaque vermelho e a palavra "ALERGIA: amendoim".
- [ ] **CA09:** Dado um cliente com filtro "sem lactose" que envia um pedido pelo QR, quando o pedido chega ao KDS, então a restrição vai junto, sem o cliente digitar nada.
- [ ] **CA10:** Dado um insumo com alergênico novo adicionado à ficha de um produto já revisado, quando o admin abre o relatório, então o produto aparece como "revisão necessária".

## O que a atividade não inclui

- Tabela nutricional completa (calorias, macros): motivo: exige análise técnica; fora do foco de cafeteria.
- Garantia de ausência de contaminação cruzada: motivo: a cozinha é compartilhada; o sistema só informa.
- Rótulo de embalados segundo a RDC 727/2022: motivo: aplica-se a produtos embalados na ausência do consumidor; avaliar se houver venda de embalados próprios (P2).

### Considerado para o futuro (P2)

- Informação nutricional e rótulo de embalados próprios (RF09).
- Perfil de restrições salvo no cadastro do cliente (exige consentimento para dado sensível de saúde, LGPD art. 11).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Existe lei estadual (RS) ou municipal (Lajeado) obrigando informar glúten/lactose em cardápio? Não verificado | PO/jurídico | Não (a feature vale de qualquer forma) | |
| D02 | Quem revisa e assina os alergênicos (dono, nutricionista)? | PO | Sim (para publicar os selos) | |
| D03 | Lista de alergênicos: a lista completa do anexo da RDC Anvisa ou uma lista reduzida para a cafeteria? | PO | Não | |
| D04 | Texto padrão do aviso de contaminação cruzada | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Derivação pela ficha | pgTAP (`supabase/tests/alergenicos.test.sql`) | CA01, CA02 | Insumo com glúten na ficha; marcação manual | View correta com origem |
| CT02 | Produto não revisado | unit (`tests/caf-000152-alergenicos.test.js`, `js/utils/alergenicos.js`) | CA03 | Renderizar detalhe | Aviso "não disponível" |
| CT03 | Selos e aviso | DOM (QR, totem, PDV) | CA04, CA05 | Renderizar produto revisado | Selos e aviso |
| CT04 | Filtro persistente | DOM + `localStorage` simulado | CA06 | Ativar filtro e recarregar | Itens filtrados |
| CT05 | Recalculo por opção | unit | CA07 | Trocar leite | "contém leite" |
| CT06 | KDS, comanda e etiqueta | unit (`js/pedido-print.js`, render do KDS) | CA08, CA09 | Pedido com alergia | Destaque e texto |
| CT07 | Revisão necessária | pgTAP | CA10 | Alterar ficha após revisão | Produto listado |
| CT08 | Fluxo real | e2e (Playwright) | CA06, CA08 | Filtrar no QR, pedir, ver no KDS | Restrição no KDS |

## URL Complementar

- Documentação técnica: `supabase/cardapio_seed_completo.sql`, `supabase/migration_caf_000032_ficha_tecnica.sql`, `js/cardapio-dynamic.js`, `js/cozinha.js`, `js/pedido-print.js`, `js/admin/products.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000031](CONCLUIDAS/CAF-000031-controle-de-estoque.md), [CAF-000032](CONCLUIDAS/CAF-000032-ficha-tecnica-custo-e-lucro.md), [CAF-000043](CONCLUIDAS/CAF-000043-etiqueta-de-copo-e-embalagem.md), [CAF-000125](CAF-000125-acessibilidade-totem-e-cardapio-do-cliente.md); novas: CAF-000142, CAF-000143, CAF-000150
- Referências de design: Toast alergênicos no PDV e KDS (https://support.toasttab.com/en/article/Manage-Allergens-on-POS-and-KDS)
- Requisitos originais: RDC Anvisa 727/2022 (https://www.demarest.com.br/anvisa-altera-a-regulamentacao-de-alimentos/); leis estaduais CE 17.899/2022 e PA 10.654/2024
- Issue / PR relacionado: —
