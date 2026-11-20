# [FIX] Pedido do intervalo e "adicionar itens" descartados pelo servidor; repetir rodada; promoção por categoria

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer o servidor gravar os campos que o PDV já envia para pedidos "para o intervalo" e pedidos adicionais; corrigir o "repetir rodada" para meio a meio e cortesias; e alinhar a prévia de promoção do carrinho ao cálculo do servidor.
- **Problema e evidência:**
  - **Campos descartados:** o PDV monta o payload com `is_intervalo`, `retirada_em`, `pedido_origem_id` e `is_adicional` (`js/pdv/carrinho.js:788-810`). O `criar_pedido(p_payload)` vigente (`supabase/migration_caf_000034_conta_cliente.sql:259`; conferido no `supabase/migrations.manifest.json` que nenhuma migration posterior o redefine) insere só `mesa_codigo, observacoes, forma_pagamento, status_pagamento, criado_por, criado_por_nome, total, cliente_nome, cliente_id, para_viagem, client_id, prioridade, prioridade_motivo` (`:328-336`). As colunas existem em produção (`retirada_em`, `is_intervalo`, `pedido_origem_id` em `tests/fixtures/schema-snapshot.json`; FK em `supabase/migration_caf_000072_baseline_producao.sql:63`), mas ficam nulas. Não existe coluna `is_adicional`.
  - **Efeito no intervalo:** o KDS só segura pedidos com `retirada_em` (`js/cozinha.js:497-504`). Sem o campo, o pedido "para o intervalo" feito no balcão às 20h50 vai direto para a fila e o café é feito ~40 min antes de ser retirado.
  - **Efeito no adicional:** o selo "➕ ADICIONAL" depende de `pedido_origem_id` (`js/cozinha.js:1553-1555`, `js/pedido-print.js:133`) e nunca aparece. Além disso o front manda o número visível em vez do id: `js/pdv/mesas.js:857` `ultimoPedido.numero_pedido || ultimoPedido.id`, que quebraria a FK `pedidos(id)` ou apontaria para outro pedido.
  - **SDDs fechadas sem o critério:** `SDD/CONCLUIDAS/CAF-000083-*.md:73` (CA08, intervalo no PDV) e `SDD/CONCLUIDAS/CAF-000084-*.md:72` (CA05, selo de adicional) estão `- [ ]`, mas ambas constam como "Concluída" no `SDD/INDICE.md:94-95`.
  - **Repetir rodada:** `js/pdv/mesas.js:892-914` copia os itens com `sabores: null` e não olha `cortesia_de_item_id`. As consultas do PDV nem carregam `pedido_item_sabores` (`js/pdv/realtime.js:361-366`). Resultado: item meio a meio é recusado pelo servidor ("Produto meio a meio requer array de sabores", `supabase/migration_caf_000034_conta_cliente.sql:352-353`) depois que o carrinho já foi limpo, e a cortesia da rodada anterior volta como item cobrado.
  - **Promoção por categoria:** a prévia agrupa por categoria e fixa `precoBase` no primeiro item do grupo (`js/pdv/carrinho.js:574-580`), aplicando `g.qtd * g.precoBase` (`:595-603`). O servidor (`aplicar_promocoes_pedido`, definida só em `supabase/migration_fase3_final.sql:245`) agrupa por produto. Ex.: promoção "leve 3 pague 2" na categoria Salgados com 2 coxinhas (R$ 8) e 1 empada (R$ 10): a prévia mostra R$ 8 de desconto, o servidor dá R$ 0. O barista informa um valor e o fechamento cobra outro.
- **Impacto de não fazer:** Produto feito cedo demais e servido frio no intervalo; cozinha sem saber que o pedido é complemento de outro; rodada repetida que falha no pico ou cobra cortesia; divergência de valor entre o que o cliente ouviu e o que paga.
- **Para quem é destinado:** Barista do balcão, cozinha/bar e cliente do intervalo do espetáculo.
- **História de usuário:** Como barista, quero que o pedido marcado "para o intervalo" só chegue à cozinha na hora certa e que o adicional apareça ligado ao pedido original, para entregar tudo quente e junto.
- **Como saberemos que deu certo:** 100% dos pedidos de intervalo do PDV com `retirada_em` preenchido; selo de adicional visível no KDS e na comanda; 0 falhas de "repetir rodada" com meio a meio; prévia de promoção igual ao total do servidor em 100% dos casos de teste.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | `criar_pedido` grava `retirada_em` (validado: futuro e no mesmo dia operacional) e `is_intervalo` | P0 | CA01, CA02, CA03 |
| RF02 | `criar_pedido` grava `pedido_origem_id` quando o id existe, é da mesma mesa e não está cancelado; caso contrário recusa | P0 | CA04, CA05 |
| RF03 | PDV envia `ultimoPedido.id` como `pedido_origem_id`; `is_adicional` deixa de ser enviado (derivado de `pedido_origem_id`) | P0 | CA04 |
| RF04 | KDS e comanda mostram "ADICIONAL — Mesa X (ref. #numero_pedido do original)" com mesa escapada | P1 | CA06 |
| RF05 | Repetir rodada carrega `pedido_item_sabores` e copia os sabores; itens com `cortesia_de_item_id` são ignorados | P0 | CA07, CA08 |
| RF06 | Prévia de promoção no carrinho usa a mesma regra do servidor (RPC somente leitura `simular_promocoes(p_itens)` ou cálculo por produto idêntico ao SQL) | P1 | CA09, CA10 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | `criar_pedido` aceita payload antigo (sem os novos campos) sem erro | P0 | CA03 |
| RNF02 | Prévia de promoção responde em < 500 ms; se a RPC falhar, o carrinho mostra "desconto calculado no envio" em vez de valor errado | P1 | CA10 |
| RNF03 | Horários gravados como `TIMESTAMPTZ` correto em `America/Sao_Paulo` (regra da CAF-000080) | P0 | CA01 |

### Dependências técnicas

- `criar_pedido` (034), `adicionar_itens_pedido`, `aplicar_promocoes_pedido`; KDS (`isPedidoLiberadoParaKds`), `pedido-print.js`.
- CAF-000134 (SLA de agendados a partir de `retirada_em`): sem ela, o pedido do intervalo entra no KDS já "atrasado".
- CAF-000128 e CAF-000131 também alteram RPCs de pedido: combinar ordem das migrations.
- CAF-000138: `aplicar_promocoes_pedido` só existe em arquivo histórico fora do manifesto; trazer para uma migration versionada.

### Recursos necessários

- Configuração de espetáculo de teste (`espetaculo_horario_intervalo`) no ambiente local.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado espetáculo hoje com intervalo às 21h30, quando o barista lança às 20h50 um pedido marcado "Intervalo", então o pedido é gravado com `is_intervalo = true` e `retirada_em` = hoje 21h30 −03:00.
- [ ] **CA02:** Dado esse pedido e antecedência de 20 min, quando são 20h55, então ele não aparece no KDS; às 21h10, aparece.
- [ ] **CA03:** Dado um payload sem `retirada_em` e `is_intervalo`, quando enviado, então o pedido é criado como hoje (campos nulos/falsos).
- [ ] **CA04:** Dado o pedido #120 (id 4567) da Mesa 5, quando o barista usa "Adicionar itens", então o novo pedido grava `pedido_origem_id = 4567`.
- [ ] **CA05:** Dado um `pedido_origem_id` de outra mesa, inexistente ou cancelado, quando enviado, então a RPC recusa com mensagem clara (caso negativo).
- [ ] **CA06:** Dado o adicional do CA04, quando aparece no KDS e na comanda, então ambos mostram "ADICIONAL — Mesa 5 (ref. #120)".
- [ ] **CA07:** Dado uma rodada anterior com 1 crepe meio a meio, quando o barista toca "Repetir rodada" e envia, então o pedido é aceito com os mesmos dois sabores.
- [ ] **CA08:** Dado uma rodada anterior com 1 café e 1 café cortesia, quando repetida, então o carrinho tem só 1 café cobrado.
- [ ] **CA09:** Dado promoção "leve 3 pague 2" na categoria Salgados e carrinho com 2 coxinhas e 1 empada, quando o carrinho é exibido, então a prévia de desconto é igual à calculada pelo servidor ao gravar.
- [ ] **CA10:** Dado a RPC de prévia indisponível, quando o carrinho é exibido, então não aparece valor de desconto, só o aviso "desconto calculado no envio".

## O que a atividade não inclui

- Mudar a regra de promoção por categoria (somar a categoria inteira no servidor): motivo: decisão de negócio (D01); aqui só se alinha a prévia à regra vigente.
- Capacidade por janela do intervalo: motivo: CAF-000146.
- Reescrever o cálculo do carrinho em centavos: motivo: CAF-000137.

### Considerado para o futuro (P2)

- Agrupar no KDS o adicional sob o card do pedido original.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Promoção por categoria deve somar itens diferentes da categoria (2 coxinhas + 1 empada contam como 3)? Hoje o servidor não soma | PO | Não | |
| D02 | Pedido do intervalo lançado depois do horário do intervalo deve ser recusado ou ir direto para a fila? (sugestão: ir direto, sem `retirada_em`) | PO | Não | |
| D03 | Reabrir CAF-000083 CA08 e CAF-000084 CA05 no índice como "Concluída com ressalvas → CAF-000135"? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Grava intervalo | pgTAP | CA01, CA03 | `criar_pedido` com e sem os campos | Colunas preenchidas / nulas |
| CT02 | Retenção no KDS | unit (relógio fixo, `isPedidoLiberadoParaKds`) | CA02 | Avaliar às 20h55 e 21h10 | Oculto / visível |
| CT03 | Origem válida | pgTAP | CA04 | Criar adicional com id da mesma mesa | FK gravada |
| CT04 | Origem inválida | pgTAP | CA05 | Outra mesa, inexistente, cancelado | Exceção nos três |
| CT05 | Payload do PDV | integração (harness `mesas.js` + `carrinho.js`) | CA04 | "Adicionar itens" e enviar | Payload com `id`, não `numero_pedido` |
| CT06 | Selo | integração (DOM `cozinha.js` e `pedido-print.js`) | CA06 | Renderizar pedido com origem | Texto com número do original; mesa escapada |
| CT07 | Repetir meio a meio | integração | CA07 | Repetir rodada com sabores | Payload com `sabores` de 2 itens |
| CT08 | Repetir cortesia | integração | CA08 | Repetir rodada com cortesia | Cortesia ausente |
| CT09 | Prévia = servidor | pgTAP + unit | CA09 | Mesmo carrinho nos dois cálculos | Valores iguais |
| CT10 | Prévia indisponível | integração | CA10 | RPC simulada com erro | Aviso, sem valor |
| CT11 | Noite de espetáculo | manual | CA01, CA02, CA06 | Lançar intervalo e adicional | Comportamento visto no KDS |

## URL Complementar

- Documentação técnica: `js/pdv/carrinho.js`, `js/pdv/mesas.js`, `js/cozinha.js`, `js/pedido-print.js`, `supabase/migration_caf_000034_conta_cliente.sql`, `supabase/migration_fase3_final.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000005](CONCLUIDAS/CAF-000005-adicionar-itens-a-um-pedido-ja-enviado.md), [CAF-000058](CONCLUIDAS/CAF-000058-lancamento-rapido-favoritos-e-repetir-rodada.md), [CAF-000062](CONCLUIDAS/CAF-000062-modo-dia-de-espetaculo-reserva-intervalo.md), [CAF-000080](CONCLUIDAS/CAF-000080-fuso-horario-e-corte-do-dia-operacional.md), [CAF-000083](CONCLUIDAS/CAF-000083-pendencias-funcionais-operacao-e-caixa.md), [CAF-000084](CONCLUIDAS/CAF-000084-pendencias-ux-kds-e-cardapio.md); novas: CAF-000128, CAF-000131, CAF-000134, CAF-000137, CAF-000138, CAF-000146
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
