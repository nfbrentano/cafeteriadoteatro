# [FEAT] Sugestão de itens (upsell) no QR, pedido online e PDV

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-25 · **Data de Conclusão:** 2026-11-25

## Detalhes da Atividade

- **O que precisa ser feito:** Levar as sugestões de itens que hoje só existem no totem ("vai um pão de queijo com o café?") para o cardápio do QR da mesa, o pedido online e o PDV, com um único motor de regras, e medir quantas sugestões são vistas e aceitas. Incluir a sugestão "transforme em combo" quando o carrinho já tem os itens de um combo mais barato.
- **Problema e evidência:**
  - *Hoje no sistema:* só o totem sugere. Ele carrega `totem_sugestoes` (`js/totem.js:400`) e decide dentro do próprio arquivo, em `obterSugestoesParaCarrinho` (`js/totem.js:820-853`). Primeiro aplica as regras do admin (gatilho por categoria ou produto). Se sobrar espaço, usa um "fallback" que pega qualquer produto de outra categoria, sem olhar popularidade, margem ou estoque. A configuração no admin é rotulada como do totem (`js/admin/settings.js:1134-1182`).
  - O cardápio do QR/online (`js/cardapio-cliente-pedido.js`) e o PDV (`js/pdv/*`) não têm sugestão de itens (a única "sugestão" no PDV é a busca de clientes, `js/pdv/clientes.js:76`).
  - O menu analytics (CAF-000069) registra só `sessao_cardapio`, `view_item`, `add_to_cart`, `begin_checkout` e `purchase` (`supabase/migration_caf_000069_menu_analytics.sql:7-8`). Não é possível saber quantas sugestões foram exibidas nem aceitas.
  - A sugestão de upgrade para combo está listada como P2 na CAF-000110 (seção "Considerado para o futuro", linha 70).
  - *Mercado:* a ToastIQ lançou "Menu Upsells" em maio de 2025; o totem do Square e o Goomer sugerem adicionais e combos; a me&u diz que as sugestões aumentam o ticket em "até 30%" (alegação do fornecedor).
- **Impacto de não fazer:** Ticket médio menor nos canais que mais crescem (QR e online); o operador do PDV no pico não lembra de oferecer; o dono não sabe se as sugestões do totem funcionam.
- **Para quem é destinado:** Cliente no QR/online; operador do PDV; dono (regras e resultado).
- **História de usuário:** Como dono, quero que todos os canais sugiram o acompanhamento certo para cada bebida e ver quantas sugestões viraram venda, para aumentar o ticket sem incomodar o cliente.
- **Como saberemos que deu certo:** Taxa de aceitação (aceitas ÷ exibidas) visível por canal e por regra no admin; aumento do ticket médio do QR/online comparando 4 semanas antes e depois (meta inicial: +5%, a validar); 0 sugestões de produto esgotado ou indisponível.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Extrair o motor de `js/totem.js:820-853` para `js/utils/sugestoes.js` (função pura: carrinho, regras, catálogo, contexto → até N sugestões), usado por totem, QR/online e PDV | P0 | CA01, CA02 |
| RF02 | Regras ganham canal (`totem`, `mesa`, `retirada`, `pdv` ou todos) e prioridade; a tabela `totem_sugestoes` é renomeada para `sugestoes_regras` com migração dos dados (view de compatibilidade durante a transição) | P0 | CA03 |
| RF03 | Filtro obrigatório: nunca sugerir item esgotado, inativo, já no carrinho, fora do horário (CAF-000151) ou com alergênico que o cliente filtrou (CAF-000152) | P0 | CA04 |
| RF04 | QR/online: bloco "Combina com seu pedido" no carrinho, com no máximo 3 itens, adicionar em 1 toque e fechar sem insistir na mesma sessão | P0 | CA05, CA06 |
| RF05 | PDV: faixa discreta acima do total com até 2 sugestões, que o operador toca para adicionar; não abre modal nem bloqueia o envio | P1 | CA07 |
| RF06 | Eventos novos no menu analytics: `sugestao_exibida` e `sugestao_aceita` por produto, canal e regra; painel de aceitação no admin | P0 | CA08 |
| RF07 | Fallback por dados em vez de "qualquer item de outra categoria": produtos mais vendidos junto com os do carrinho nos últimos 30 dias (pares de itens no mesmo pedido), calculado por RPC agregada | P1 | CA09 |
| RF08 | Sugestão "transforme em combo": se o carrinho contém os itens de um combo (CAF-000110) e o combo sai mais barato, oferecer a troca mostrando a economia | P1 | CA10 |
| RF09 | Sugestão personalizada pelo histórico do cliente identificado | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Cálculo das sugestões no cliente em < 20 ms com 300 produtos e 50 regras | P1 | CA02 |
| RNF02 | Preço exibido na sugestão = preço cobrado (o servidor recalcula, ver CAF-000128) | P0 | CA05 |
| RNF03 | Eventos agregados por dia, sem dado pessoal (mesmo padrão da CAF-000069) | P0 | CA08 |
| RNF04 | Acessível: bloco com título, botões com rótulo "Adicionar [produto] por R$ X" (WCAG AA, ver CAF-000125) | P1 | CA05 |

### Dependências técnicas

- `totem_sugestoes` e o admin (`js/admin/settings.js`); menu analytics (CAF-000069, `js/utils/menu-analytics.js`); combos (CAF-000110, `js/utils/combos.js`).
- CAF-000128 (preço no servidor), CAF-000151 (horário) e CAF-000152 (alergênicos) para os filtros, que podem chegar depois (o filtro fica preparado).
- CAF-000137 (módulos de `js/utils/` no PDV) para usar o motor no PDV sem cópia.

### Recursos necessários

- Lista inicial de pares (bebida → acompanhamento) definida pelo dono.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o motor extraído, quando o totem é usado com as mesmas regras de hoje, então as sugestões são as mesmas de antes (sem regressão).
- [x] **CA02:** Dado um carrinho com Cappuccino e a regra "café → pão de queijo", quando o motor roda, então sugere pão de queijo em menos de 20 ms.
- [x] **CA03:** Dado uma regra marcada só para `mesa`, quando o cliente usa o totem, então ela não aparece; no QR da mesa, aparece.
- [x] **CA04:** Dado o pão de queijo esgotado, quando a regra o indicaria, então ele não é sugerido em nenhum canal.
- [x] **CA05:** Dado o carrinho no QR com um latte, quando o cliente abre o carrinho, então vê até 3 sugestões com preço e adiciona uma com 1 toque.
- [x] **CA06:** Dado o cliente que fechou o bloco de sugestões, quando volta ao carrinho na mesma sessão, então o bloco não reaparece (caso negativo).
- [x] **CA07:** Dado o operador no PDV com um cappuccino lançado, quando olha o rodapé, então vê até 2 sugestões e consegue enviar o pedido sem interagir com elas.
- [x] **CA08:** Dado 10 exibições e 3 aceites de uma regra no QR, quando o dono abre o painel, então vê 30% de aceitação para aquela regra e canal.
- [x] **CA09:** Dado nenhuma regra para o produto do carrinho e um histórico em que 40% dos pedidos com espresso têm brownie, quando o motor roda, então sugere brownie.
- [x] **CA10:** Dado um carrinho com Cappuccino (R$ 12) + Pão de queijo (R$ 9) e um combo dos dois por R$ 18, quando o cliente vê a sugestão, então aparece "Leve como combo e economize R$ 3,00"; ao aceitar, os itens viram o combo.

## O que a atividade não inclui

- Recomendação com aprendizado de máquina: motivo: volume de dados pequeno; regras + pares mais vendidos bastam.
- Sugestões no display do cliente (CAF-000145): motivo: o display é só leitura nesta fase.
- Testes A/B automáticos entre regras: motivo: prematuro; o painel de aceitação permite comparar manualmente.

### Considerado para o futuro (P2)

- Sugestão personalizada pelo histórico do cliente (RF09).
- Sugestão de variação mais cara ("leve o G por + R$ 2"), depois da CAF-000143.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | No PDV, a faixa de sugestões incomoda no pico? Ligar só fora do intervalo? | PO | Não | Faixa passiva e não obstrutiva no rodapé do catálogo, sem modais ou travamentos de atalhos. |
| D02 | Pares mais vendidos devem priorizar margem (CAF-000032) além de frequência? | PO | Não | Priorizar frequência de coocorrência nos últimos 30 dias na RPC de fallback para máxima agilidade e simplicidade. |
| D03 | Limite de sugestões por canal (3 no QR, 2 no PDV) | design | Não | Confirmado: até 3 no Totem e QR/Online; até 2 no PDV. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Regressão do totem | unit (`tests/caf-000150-sugestoes.test.js`, `js/utils/sugestoes.js` com as regras atuais) | CA01 | Comparar com o resultado antigo | Iguais |
| CT02 | Regra simples e desempenho | unit | CA02 | 300 produtos, 50 regras | Sugestão certa < 20 ms |
| CT03 | Canal | unit | CA03 | Regra só `mesa` | Filtrada no totem |
| CT04 | Esgotado | unit + pgTAP (view de regras) | CA04 | Produto indisponível | Não sugerido |
| CT05 | Bloco no QR | DOM (`js/cardapio-cliente-pedido.js`) | CA05, CA06 | Abrir, adicionar, fechar, reabrir | Comportamento esperado |
| CT06 | Faixa no PDV | integração (harness do PDV) | CA07 | Enviar sem tocar | Pedido enviado |
| CT07 | Eventos e painel | pgTAP (`registrar_evento_cardapio` com tipos novos) + DOM | CA08 | 10 exibidas, 3 aceitas | 30% |
| CT08 | Pares mais vendidos | pgTAP (RPC agregada) | CA09 | Histórico simulado | Brownie |
| CT09 | Upgrade para combo | unit (`js/utils/combos.js` + motor) | CA10 | Carrinho com os 2 itens | Economia de R$ 3,00 |
| CT10 | Fluxo real | e2e (Playwright, QR) | CA05 | Adicionar sugestão e enviar | Pedido com o item |

## URL Complementar

- Documentação técnica: `js/totem.js`, `js/admin/settings.js`, `js/cardapio-cliente-pedido.js`, `js/utils/menu-analytics.js`, `js/utils/combos.js`, `supabase/migration_caf_000040_totem.sql`, `supabase/migration_caf_000069_menu_analytics.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000040](CONCLUIDAS/CAF-000040-totem-de-autoatendimento-no-balcao.md), [CAF-000069](CONCLUIDAS/CAF-000069-menu-analytics-funil-conversao-cardapio.md), [CAF-000110](CONCLUIDAS/CAF-000110-combos-e-kits-promocionais-cardapio-totem-pdv.md), [CAF-000032](CONCLUIDAS/CAF-000032-ficha-tecnica-custo-e-lucro.md), [CAF-000125](CAF-000125-acessibilidade-totem-e-cardapio-do-cliente.md); novas: CAF-000128, CAF-000137, CAF-000143, CAF-000151, CAF-000152
- Referências de design: ToastIQ Menu Upsells (https://www.businesswire.com/news/home/20250501039656/en)
- Requisitos originais: —
- Issue / PR relacionado: —
