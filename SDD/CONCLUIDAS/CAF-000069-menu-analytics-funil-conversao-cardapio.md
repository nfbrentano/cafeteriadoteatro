# [FEAT] CAF-000069 — Menu Analytics: Funil de Conversão do Cardápio Digital e Desempenho de Produtos

> **Status:** Concluída
> **Autor:** Antigravity · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Implementar o rastreamento de **Funil do Cardápio Digital (`Menu Analytics`)** no `cardapio.html` e `totem.html` (tanto enviando eventos estruturados de e-commerce para o Google Analytics 4 via `js/analytics.js` quanto registrando contadores agregados diários no Supabase) e exibir um painel de **Funil & Conversão do Cardápio** na aba Relatórios do `admin.html`.
- **Problema e evidência:** Conforme destacado em `ANALISE_CONCORRENTES_GESTAO.md` (seção *Analytics de Cardápio / Funil de Conversão*), plataformas como Goomer e Abrahão mostram quais produtos são muito visualizados no cardápio digital mas pouco adicionados à sacola (indicando preço percebido alto, foto pouco atrativa ou descrição confusa) e em qual etapa do autoatendimento os clientes desistem. Hoje o `js/analytics.js` só dispara `page_view` genérico.
- **Impacto de não fazer:** O gestor sabe apenas o que foi vendido, mas não sabe quantos clientes abriram o QR Code da mesa ou o link da bio e desistiram antes de enviar o pedido, nem quais produtos despertam curiosidade mas não convertem em venda.
- **Para quem é destinado:** Gestor da cafeteria (`admin.html`).
- **História de usuário:** Como gestor da cafeteria, quero visualizar o funil de conversão do cardápio digital (Visitas → Visualização de Produto → Adição à Sacola → Checkout → Pedido Enviado) e a taxa de conversão por produto, para otimizar fotos, descrições e preços do cardápio.
- **Como saberemos que deu certo:** Eventos do funil são disparados sem bloquear a UI (`non-blocking`), e a aba Relatórios do Admin exibe o funil de conversão do período e a matriz de produtos (Visualizações vs. Adições à Sacola vs. Pedidos).

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Criar tabela leve `cardapio_eventos_diarios` (agregada por `data`, `canal` [`mesa`, `retirada`, `totem`, `vitrine`], `tipo_evento` [`sessao_cardapio`, `view_item`, `add_to_cart`, `begin_checkout`, `purchase`] e `produto_id` opcional) + RPC `registrar_evento_cardapio` com `UPSERT` atômico de contador | P0 | CA01, CA02 |
| RF02 | Atualizar `js/analytics.js`, `js/cardapio.js` e `js/totem.js` para disparar simultaneamente os eventos padrão do GA4 (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`) e o contador agregado no Supabase (com debounce/fire-and-forget sem atrasar a navegação) | P0 | CA01 |
| RF03 | Na aba Relatórios do `admin.html`, adicionar sub-aba ou seção **"📊 Funil do Cardápio"**, exibindo: (1) Gráfico/barras do funil de conversão por etapa e por canal (QR Mesa, Retirada Online, Totem), e (2) Tabela de Desempenho de Produtos no Cardápio (Cliques no modal, Adições à sacola, Taxa de Conversão `%` e diagnóstico automático ex.: *"🔥 Alta conversão"* ou *"👀 Muito visto, pouco comprado"*) | P0 | CA03, CA04 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | O envio de telemetria nunca deve bloquear a thread principal nem exibir erro ao cliente caso o usuário esteja offline ou com bloqueador de anúncios (`try/catch` silencioso em background) | P0 | CA01 |
| RNF02 | Armazenamento enxuto: ao agregar por `(data, canal, tipo_evento, produto_id)` em vez de gravar uma linha bruta por clique, o banco cresce apenas algumas dezenas de linhas por dia | P0 | CA02 |

### Dependências técnicas

- `js/analytics.js`, `js/cardapio.js`, `js/totem.js` e `js/admin/relatorios.js` (`admin.html`).

### Recursos necessários

- Migration SQL para a tabela `cardapio_eventos_diarios` e RPC `registrar_evento_cardapio`.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que o cliente navega em `cardapio.html` ou `totem.html`, quando abrir a página, clicar nos detalhes de um produto, adicioná-lo à sacola, abrir o modal de envio e confirmar o pedido, então os eventos correspondentes devem ser enviados ao GA4 (`gtag`) e contabilizados via RPC sem impactar a fluidez da interface.
- [x] **CA02:** Dado que múltiplos clientes visualizam o mesmo produto no mesmo dia e canal, quando os eventos forem registrados no banco, então o contador na linha `(data, canal, 'view_item', produto_id)` deve ser incrementado via `UPSERT`, mantendo a tabela compacta.
- [x] **CA03:** Dado que o gestor abre `admin.html` → Relatórios → Funil do Cardápio e seleciona um período, quando os dados carregarem, então deve visualizar as taxas de passagem entre as etapas (`Sessões → Visualizações de Item → Adições à Sacola → Checkouts → Pedidos Concluídos`).
- [x] **CA04:** Dado que um produto teve muitas aberturas de modal (`view_item`) mas poucas adições à sacola (`add_to_cart`), quando o gestor visualizar a tabela de produtos do funil, então o sistema deve destacar a baixa conversão para ajudar na revisão de foto/preço/descrição.

## O que a atividade não inclui

- Gravação de tela ou mapa de calor (heatmap) de ponteiro do mouse: motivo: ferramentas pesadas de terceiros prejudicam a performance no 4G; o funil de eventos por produto entrega 90% do valor de negócio sem custo de performance.

### Considerado para o futuro (P2)

- Teste A/B de fotos ou descrições de produtos no cardápio digital.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| — | Sem dúvidas bloqueantes | — | Não | — |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Disparo de eventos no cardápio e totem | Manual / Integração | CA01, CA02 | Abrir produto, adicionar à sacola e finalizar pedido em `cardapio.html` | Contadores incrementados em `cardapio_eventos_diarios` |
| CT02 | Visualização do funil no Admin | Manual | CA03, CA04 | Abrir Admin → Relatórios → Funil do Cardápio | Exibe barras do funil com percentuais e ranking de conversão por produto |
| CT03 | Resiliência a falha de rede na telemetria | Unit / Manual | RNF01 | Simular falha na RPC de analytics durante uso do cardápio | Carrinho e pedido funcionam normalmente sem erro visível |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/ANALISE_CONCORRENTES_GESTAO.md` (seção *Oportunidades extras de baixo esforço → Analytics de cardápio*)
