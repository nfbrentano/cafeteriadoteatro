# [FIX] CAF-000083 — Pendências funcionais de operação e caixa (conta do cliente, reabertura de caixa, intervalo, etiquetas, totem e tempo-alvo)

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Completar os requisitos que ficaram parciais em SDDs marcadas como concluídas e que afetam o fechamento do dia e a operação no salão: conta do cliente no caixa (CAF-000034), reabertura de caixa e alerta de mesas (CAF-000015), horário do pedido de intervalo no PDV (CAF-000062), etiqueta de itens lançados depois (CAF-000043), expiração dos pedidos do totem (CAF-000040) e padrão global de tempo-alvo (CAF-000025).
- **Problema e evidência:**
  - **Conta do cliente fora do caixa (CAF-000034):**
    - Depósitos e recebimentos lançados em `js/admin/clientes-admin.js:983-1045` vão para `cliente_conta_movimentos`, mas o cálculo do caixa (`fn_calcular_totais_caixa_interno`, `supabase/migration_caf_000044_caixa_fix.sql:143`) e `js/admin/caixa-admin.js` não leem essa tabela. Um depósito de R$ 100 em Pix não aparece no caixa do dia e o caixa cego acusa sobra.
    - O select de formas do fechamento de mesa (`pedidos.html:656-662`) não tem `conta_cliente`. A opção existe só no lançamento de pedido (`pedidos.html:248`, `js/pedidos.js:2693-2706`).
    - Não há comprovante de depósito para o cliente.
  - **Caixa (CAF-000015):** o alerta de mesas abertas no fechamento (`js/admin/caixa-admin.js:476-477`) mostra só a quantidade, sem listar as mesas. Não existe reabertura de caixa fechado pelo admin. O índice `uk_caixa_aberto` (`migration_caf_000025_caixa.sql:17`) permite um único caixa aberto, mas não há fluxo para corrigir um fechamento errado.
  - **Intervalo no PDV (CAF-000062, CA05):**
    - O pedido de intervalo lançado no PDV recebe só `is_intervalo` e o marcador `[🎭 Intervalo]` na observação (`js/pedidos.js:2687-2745`), sem horário de retirada.
    - O cardápio público envia `horario_retirada` (`js/cardapio-cliente-pedido.js:1183, 1240`), coluna que **não existe em produção**: a sondagem de 2026-10-20 retornou 42703.
    - Já existe `pedidos.retirada_em TIMESTAMPTZ` (`migration_caf_000038_pedido_online.sql:12`), usada pelo pedido online e pelo KDS para segurar pedidos agendados.
  - **Etiqueta de itens lançados depois (CAF-000043):** a trava de etiqueta é por pedido + estação (`js/cozinha.js:477-492`, chamando `requisitarTravaImpressao(pedido.id, 'cozinha', 'etiqueta', ...)`). Itens adicionados ao pedido depois da primeira impressão (CAF-000024) não geram etiqueta automática.
  - **Expiração do totem (CAF-000040):** `expirar_pedidos_totem_vencidos()` (`migration_caf_000040_totem.sql:83`) só roda quando um totem envia heartbeat (`:198`). Com todos os totens desligados, pedidos não pagos ficam pendentes indefinidamente e sujam o PDV e o KDS.
  - **Tempo-alvo (CAF-000025):** `categorias.tempo_alvo_min` foi criado com `DEFAULT 15` (`migration_caf_000029_tempo_alvo_semaforo.sql:7`). Como o KDS só usa o padrão global quando o valor é `NULL` (`js/cozinha.js:641`), o `tempo_alvo_padrao_min` configurado no admin nunca vale para categorias novas.
- **Impacto de não fazer:** caixa do dia não fecha com a conta do cliente (o caixa cego acusa diferença falsa), não há como corrigir um fechamento errado, o pedido de intervalo feito no balcão não é segurado até o intervalo, itens adicionados saem sem etiqueta, pedidos fantasma do totem e semáforo do KDS com meta errada.
- **Para quem é destinado:** gerente/caixa (fechamento do dia), barista e cozinha (KDS e etiquetas) e o dono (configuração).
- **História de usuário:** Como gerente, quero que tudo o que entra no caixa (inclusive créditos de clientes) apareça no fechamento e que eu possa reabrir um caixa fechado errado com justificativa, para que o caixa cego reflita a realidade.
- **Como saberemos que deu certo:** em um dia de teste com 1 depósito em Pix de R$ 100, 1 fechamento de mesa pago com conta do cliente e 1 pedido de intervalo no PDV, a diferença do caixa cego é R$ 0,00 e o pedido de intervalo só aparece no KDS na antecedência configurada.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Incluir no cálculo do caixa do dia (`fn_calcular_totais_caixa_interno` e o resumo em `caixa-admin.js`) os depósitos e recebimentos de `cliente_conta_movimentos` feitos durante o caixa aberto, separados por forma de pagamento e mostrados numa linha própria ("Créditos/recebimentos de clientes"). | P0 | CA01 |
| RF02 | Adicionar a forma `conta_cliente` ao fechamento de mesa (`#fechar-conta-forma`). Ela exige um cliente vinculado, debita via `lancar_movimento_conta` respeitando limite e saldo, e **não** entra como dinheiro no caixa. | P0 | CA02, CA03 |
| RF03 | Gerar comprovante de depósito ou recebimento (impressão térmica e compartilhamento via WhatsApp, reaproveitando `js/utils/receipt-formatter.js` da CAF-000066) com saldo anterior, valor e saldo novo. | P1 | CA04 |
| RF04 | No fechamento de caixa, listar as mesas e pedidos não pagos (código da mesa, valor e há quanto tempo estão abertos), com link para o PDV, no lugar de só a contagem. | P0 | CA05 |
| RF05 | Permitir ao admin reabrir o último caixa fechado do dia com motivo obrigatório. Só é possível se não houver outro caixa aberto, a ação é registrada no log de auditoria (CAF-000019) e o caixa volta a calcular. | P0 | CA06, CA07 |
| RF06 | Pedido de intervalo no PDV: gravar `retirada_em` com o horário de intervalo do espetáculo de hoje (`espetaculo_horario_intervalo`, fuso de São Paulo). Unificar o cardápio público para usar `retirada_em` no lugar de `horario_retirada`, ou criar a coluna (decisão D01). | P0 | CA08, CA09 |
| RF07 | Etiqueta de itens lançados depois: imprimir automaticamente etiquetas só dos itens novos (por `pedido_item_id`) quando o pedido já teve etiqueta impressa. A trava passa a considerar o lote de itens, sem reimprimir os antigos. | P1 | CA10 |
| RF08 | Agendar `expirar_pedidos_totem_vencidos()` via `pg_cron` a cada 5 minutos, mantendo também a chamada no heartbeat. | P1 | CA11 |
| RF09 | Trocar o `DEFAULT 15` de `categorias.tempo_alvo_min` por `NULL` e limpar as categorias que ficaram com 15 por causa do default (decisão D03), para que o padrão global de `site_settings.tempo_alvo_padrao_min` passe a valer. | P1 | CA12 |
| RF10 | Criar a migration `supabase/migration_caf_000083_pendencias_operacao.sql`, idempotente e aplicada depois da CAF-000072. | P0 | CA01–CA12 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Movimentos de conta do cliente e a reabertura de caixa são transacionais (com `FOR UPDATE` no caixa e na conta). Duplo clique não duplica lançamento. | P0 | CA02, CA06 |
| RNF02 | Horários calculados e gravados em `America/Sao_Paulo` e armazenados como `TIMESTAMPTZ` correto (sem o padrão `timezone('America/Sao_Paulo', now())` em coluna timestamptz). | P0 | CA08 |
| RNF03 | Reabrir caixa é permitido só ao cargo admin, com validação no servidor. | P0 | CA07 |

### Dependências técnicas

- **CAF-000072** (reconciliação de schema), que precisa ser aplicada antes, principalmente para `retirada_em`/`horario_retirada` e `fn_calcular_totais_caixa_interno` (a 044 sobrescreve a 039).
- CAF-000073 — correção do fechamento de conta (`fechar_conta_mesa`), porque o RF02 altera o mesmo fluxo.
- CAF-000019 (log de auditoria), CAF-000034 (`lancar_movimento_conta`, `cliente_conta_movimentos`) e CAF-000066 (`receipt-formatter`).
- Extensão `pg_cron` habilitada no Supabase (RF08).

### Recursos necessários

- Acesso ao Supabase de produção (pg_cron e migration).
- Impressora térmica de teste, para o comprovante e as etiquetas.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um caixa aberto e um depósito de R$ 100 em Pix na conta de um cliente, quando o gerente abrir o resumo do caixa, então aparece R$ 100 em Pix na linha "Créditos/recebimentos de clientes" e o total esperado de Pix inclui esse valor.
- [ ] **CA02:** Dado um cliente com R$ 50 de saldo vinculado à mesa, quando o garçom fechar uma conta de R$ 30 com a forma "Conta do Cliente", então o saldo passa a R$ 20, a mesa é fechada e o valor não entra como dinheiro no caixa.
- [ ] **CA03 (negativo):** Dado uma mesa sem cliente vinculado, ou um cliente sem saldo nem limite suficiente, quando o garçom escolher "Conta do Cliente", então o sistema bloqueia o lançamento com mensagem clara e nada é debitado.
- [ ] **CA04:** Dado um depósito registrado, quando o gerente clicar em "Comprovante", então é gerado um texto com saldo anterior, valor e saldo novo, que pode ser impresso ou enviado por WhatsApp.
- [ ] **CA05:** Dado 2 mesas abertas no fechamento, quando o gerente abrir o fechamento, então vê a lista com a mesa, o valor e o tempo aberto de cada uma, e pode navegar até o PDV.
- [ ] **CA06:** Dado um caixa fechado hoje e nenhum outro aberto, quando o admin reabrir com o motivo "contagem errada", então o caixa volta a "aberto", o log de auditoria registra quem, quando e o motivo, e um novo fechamento recalcula os totais.
- [ ] **CA07 (negativo):** Dado um usuário gerente sem cargo admin, ou já existindo outro caixa aberto, quando ele tentar reabrir, então a ação é recusada pelo servidor.
- [ ] **CA08:** Dado um espetáculo hoje com intervalo às 21:30, quando o barista lançar no PDV um pedido marcado como "Intervalo", então o pedido é salvo com `retirada_em` = hoje 21:30 (horário de São Paulo) e só aparece no KDS dentro da antecedência configurada.
- [ ] **CA09:** Dado um cliente reservando para o intervalo pelo cardápio público, quando ele finalizar o pedido, então o insert não falha por coluna inexistente e o pedido fica com o mesmo `retirada_em` do fluxo do PDV.
- [ ] **CA10:** Dado um pedido com 2 bebidas cujas etiquetas já foram impressas, quando 1 bebida nova for adicionada, então sai automaticamente 1 etiqueta só da bebida nova, sem reimprimir as anteriores.
- [ ] **CA11:** Dado um pedido do totem não pago há mais tempo que `totem_expiracao_pagamento_min` e nenhum totem ligado, quando passarem 5 minutos, então o pedido fica como expirado ou cancelado e some do PDV e do KDS.
- [ ] **CA12:** Dado o padrão global de 10 min e uma categoria nova sem tempo-alvo definido, quando um pedido dessa categoria entrar no KDS, então o semáforo usa 10 min. Categorias com valor explícito mantêm o seu valor.

## O que a atividade não inclui

- Bugs da RPC `fechar_conta_mesa` (parâmetros, cancelados, lock): motivo: tratado na CAF-000073. Esta SDD só acrescenta a forma `conta_cliente`.
- Taxas de maquininha no caixa (a 044 sobrescreveu a 039): motivo: tratado na CAF-000079.
- ESC/POS direto para as etiquetas: motivo: complexo demais agora. Continua a impressão pelo navegador.

### Considerado para o futuro (P2)

- Reabertura de caixas de dias anteriores com recálculo do relatório.
- Cobrança automática do fiado vencido por WhatsApp.
- Antecedência do KDS por estação para pedidos agendados (gap da CAF-000038).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Usar `retirada_em` (que já existe) para o intervalo e remover `horario_retirada` do front, ou criar `horario_retirada`? Recomendação: usar `retirada_em`. Confirmar com o diagnóstico (seção 3) que não existe outra coluna em produção. | Dev/PO | Sim | |
| D02 | Créditos de clientes entram no total do caixa cego (dinheiro físico) ou só em linha informativa? | PO | Sim | |
| D03 | Alguma categoria tem 15 min definidos de propósito, e por isso não deve ser zerada pelo RF09? | PO | Não | |
| D04 | O plano do Supabase em produção tem `pg_cron` disponível? | Dev | Não | |

## Sugestões de casos de teste

Os testes ficam em `tests/caf-000083-pendencias-operacao.test.js` e importam o código real. Quando a lógica estiver presa em `js/pedidos.js` ou `js/admin/caixa-admin.js`, ela deve ser extraída para `js/utils/` (por exemplo `caixa-totais.js`, `intervalo.js`, `etiquetas-pendentes.js`) e testada com `tests/helpers/supabase-mock.js`.

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Totais do caixa com depósito | Unit | CA01 | Montar movimentos de pedidos e de conta do cliente e chamar o agregador do resumo. | Pix inclui os R$ 100 numa linha separada. |
| CT02 | Fechamento com conta do cliente | Integração (mock) | CA02 | Mockar o saldo de R$ 50 e fechar R$ 30 com `conta_cliente`. | RPC chamada com a forma `conta_cliente`; saldo de R$ 20. |
| CT03 | Sem cliente ou saldo | Unit | CA03 | Validar o pagamento sem `cliente_id` e com saldo insuficiente. | Retorna erro e nenhuma RPC é chamada. |
| CT04 | Texto do comprovante | Unit | CA04 | Formatar um depósito com saldos conhecidos. | O texto contém os três valores em BRL. |
| CT05 | Lista de mesas abertas | Unit (happy-dom) | CA05 | Renderizar o alerta com 2 mesas. | 2 linhas com mesa, valor e tempo. |
| CT06 | Reabrir caixa | Manual (SQL) + unit | CA06 | Reabrir como admin e conferir o log. | Status aberto e log gravado. |
| CT07 | Reabrir negado | Manual | CA07 | Tentar como gerente e com outro caixa aberto. | Recusado nos dois casos. |
| CT08 | `retirada_em` do intervalo | Unit | CA08 | Calcular para o intervalo 21:30 com o relógio mockado às 19h. | ISO de hoje às 21:30 −03:00. |
| CT09 | Payload do cardápio | Unit | CA09 | Gerar o payload do checkout de intervalo. | Usa `retirada_em` e não contém `horario_retirada`. |
| CT10 | Etiquetas só de itens novos | Unit | CA10 | Pedido com itens impressos + 1 novo. | Lista de etiquetas com 1 item. |
| CT11 | Cron do totem | Manual | CA11 | Pedido vencido com totem desligado; aguardar 5 min. | Pedido expirado. |
| CT12 | Tempo-alvo com padrão global | Unit | CA12 | Categoria `null` com padrão 10; categoria com 5. | 10 e 5. |

## URL Complementar

- Documentação técnica: `supabase/diagnostico_schema_producao.sql` (seções 3 e 5); Supabase `pg_cron`.
- Discussões relacionadas: auditoria de SDDs de 2026-10-20.
- Requisitos originais: CAF-000015, CAF-000025, CAF-000034, CAF-000040, CAF-000043 e CAF-000062.
- Issue / PR relacionado: depende da CAF-000072.
