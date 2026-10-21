# [FIX] CAF-000073 — Correção do fechamento de conta da mesa (RPC, cancelados, idempotência e divisão)

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer o fechamento de conta (CAF-000002, 012 e 013) funcionar de ponta a ponta e com segurança: alinhar os parâmetros entre front e RPC, calcular o total sem pedidos cancelados, impedir fechamento duplicado, dividir a conta sem perder ou sobrar centavos e gravar no fechamento o cupom e a campanha aplicados.
- **Problema e evidência:**
  - Em `js/pedidos.js:4870-4877`, o front chama `rpc('fechar_conta_mesa', { p_mesa_codigo, p_pagamentos, p_subtotal, p_desconto, p_desconto_motivo, p_taxa_servico })`.
  - A única assinatura versionada (`supabase/migration_caf_000023_taxa_desconto.sql:86-92`) é `(p_mesa_codigo, p_pagamentos, p_taxa_servico, p_desconto_manual, p_desconto_motivo)`. Ela não tem `p_subtotal` e chama o desconto de `p_desconto_manual`.
  - O PostgREST resolve a função pelos nomes dos parâmetros. Se produção estiver igual ao repositório, todo fechamento retorna `PGRST202`. Como a assinatura real de produção não pôde ser lida, a confirmação depende da CAF-000072.
  - O total soma `pedidos.total` filtrando só `status_pagamento != 'pago'` (`migration_caf_000023_taxa_desconto.sql:127-131`), então **pedidos com `status = 'cancelado'` entram na conta**.
  - Não há `SELECT … FOR UPDATE` nem chave de idempotência. A única proteção contra toque duplo é o botão desabilitado no front, o que permite dois fechamentos da mesma mesa em dois aparelhos.
  - A divisão igualitária (`js/pedidos.js:4360-4365`) calcula a sobra em ponto flutuante (`aPagar - valorBase * num`), o que gera valores como `33.340000000000003`.
  - Depois do fechamento, `cupom_codigo` e `campanha_id` não são gravados. O uso do cupom é registrado à parte, sem `pedido_id` (`js/pedidos.js:4881-4887`).
- **Impacto de não fazer:** A operação de caixa para (a mesa não fecha) ou fecha com valor errado. Um fechamento duplicado infla o caixa, e os relatórios de cupom ficam sem rastreabilidade.
- **Para quem é destinado:** Barista ou caixa que fecha a mesa no PDV; gestor que confere o caixa.
- **História de usuário:** Como caixa, quero fechar a conta da mesa com desconto, taxa de serviço e divisão entre pessoas, para receber o valor certo uma única vez.
- **Como saberemos que deu certo:**
  - 0 erros `PGRST202` de `fechar_conta_mesa` nos logs do Supabase durante 7 dias.
  - 0 fechamentos duplicados por mesa (consulta em `fechamento_pedidos`).
  - Soma das partes igual ao total em 100% dos testes de divisão.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Definir uma assinatura única para `fechar_conta_mesa`, com os parâmetros `p_mesa_codigo`, `p_pagamentos`, `p_taxa_servico`, `p_desconto_manual`, `p_desconto_motivo`, `p_idempotency_key UUID`, `p_cupom_codigo TEXT DEFAULT NULL` e `p_campanha_id BIGINT DEFAULT NULL`. Remover as sobrecargas antigas e ajustar `js/pedidos.js:4870`. O subtotal é calculado no servidor, nunca recebido do cliente | P0 | CA01, CA06 |
| RF02 | Calcular o total apenas com pedidos da mesa em que `status <> 'cancelado'` e `status_pagamento` é nulo ou diferente de `'pago'`. Os itens cancelados continuam saindo do total via `recalcular_total_pedido` (`migration_caf_000004.sql`). Há um teste de regressão garantindo isso | P0 | CA02 |
| RF03 | Travar os pedidos da mesa com `SELECT … FOR UPDATE` dentro da RPC. Se não houver pedido pendente, retornar erro de negócio "Mesa sem pedidos em aberto" | P0 | CA03 |
| RF04 | Idempotência: guardar `idempotency_key` em `fechamentos` com índice único. Uma repetição com a mesma chave devolve o fechamento já criado, sem duplicar | P0 | CA03 |
| RF05 | Validar no servidor que a soma de `p_pagamentos` é maior ou igual ao total final (subtotal + taxa − desconto), com tolerância de R$ 0,01, e que o desconto não excede o subtotal | P0 | CA04 |
| RF06 | Divisão igualitária em centavos inteiros: `base = floor(totalCentavos / n)`; as primeiras `totalCentavos % n` partes recebem +1 centavo. Extrair para `js/utils/divisao-conta.js` | P0 | CA05 |
| RF07 | Gravar `cupom_codigo` e `campanha_id` em `fechamentos` e nos `pedidos` fechados. Registrar o uso do cupom dentro da mesma transação, vinculado ao fechamento (as regras de uso e segurança do cupom ficam na CAF-000077) | P1 | CA06 |
| RF08 | Exibir no PDV uma mensagem de erro amigável quando a RPC falhar, mantendo o modal aberto e os valores digitados | P1 | CA07 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A RPC é atômica: falha em qualquer etapa desfaz tudo (fechamento, pagamentos, vínculo de pedidos, cupom) | P0 | CA03, CA04 |
| RNF02 | Fechamento de uma mesa com até 20 pedidos responde em menos de 1 s | P1 | CA01 |
| RNF03 | Apenas usuários com permissão `pdv.fechar_conta` executam a RPC. O desconto exige `pdv.desconto` ou aprovação de supervisor, validada no servidor | P0 | CA08 |

### Dependências técnicas

- **CAF-000072 (bloqueante):** assinatura real de `fechar_conta_mesa` em produção.
- `supabase/migration_caf_000023_taxa_desconto.sql`, tabelas `fechamentos`, `fechamento_pagamentos` e `fechamento_pedidos`.
- `js/pedidos.js:4127-4290` (desconto e cupom) e `:4355-4375` (divisão).
- CAF-000077 (cupons) e CAF-000076 (cashback, que roda depois do fechamento).
- Testes de integração: CAF-000087 (cobertura de testes do PDV, mesas e conta) e CAF-000092 (testes SQL das RPCs).

### Recursos necessários

- Supabase local ou staging para os testes da RPC.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado uma mesa com 2 pedidos pendentes de R$ 30,00 e R$ 20,00, quando o caixa fechar com Pix de R$ 50,00, então a RPC retorna sucesso, cria 1 registro em `fechamentos` e os 2 pedidos ficam com `status_pagamento = 'pago'`.
- [ ] **CA02:** Dado uma mesa com um pedido de R$ 30,00 e um pedido **cancelado** de R$ 15,00, quando a conta for aberta e fechada, então o total exibido e o gravado são R$ 30,00.
- [ ] **CA03:** Dado dois aparelhos fechando a mesma mesa ao mesmo tempo, ou o mesmo aparelho reenviando com a mesma `idempotency_key`, quando as RPCs executarem, então existe exatamente 1 fechamento e a segunda chamada devolve o mesmo `fechamento_id` ou o erro "Mesa sem pedidos em aberto".
- [ ] **CA04:** Dado total de R$ 50,00, quando os pagamentos somarem R$ 49,00 ou o desconto for maior que o subtotal, então a RPC recusa com mensagem clara e nada é gravado.
- [ ] **CA05:** Dado total de R$ 100,00 dividido por 3, quando o caixa gerar as partes, então os valores são R$ 33,34, R$ 33,33 e R$ 33,33, e a soma é exatamente R$ 100,00 (sem dízimas de ponto flutuante).
- [ ] **CA06:** Dado um cupom válido aplicado no fechamento, quando a conta fechar, então `fechamentos.cupom_codigo` e `campanha_id` ficam preenchidos e o uso do cupom é registrado uma única vez, vinculado ao fechamento.
- [ ] **CA07:** Dado uma falha de rede ou de RPC, quando o caixa confirmar, então aparece um toast de erro, o modal continua aberto com os pagamentos digitados e nenhum pedido muda de status.
- [ ] **CA08 (negativo):** Dado um usuário com papel `cozinha` ou anônimo, quando chamar `fechar_conta_mesa` direto pela API, então recebe erro de permissão.

## O que a atividade não inclui

- Integração TEF ou maquininha: motivo: outra iniciativa (gap Saipos).
- Reabertura de conta fechada: motivo: pertence ao caixa (CAF-000015) e à SDD de pendências funcionais.
- Cashback no fechamento: motivo: tratado na CAF-000076.

### Considerado para o futuro (P2)

- Divisão por item (cada pessoa paga o que consumiu), que a assinatura nova não deve impedir.
- Emissão de NFC-e no fechamento.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual é a assinatura atual de `fechar_conta_mesa` em produção? Os fechamentos estão funcionando hoje? (Ver contagem recente em `fechamentos`) | dev/PO | Sim | |
| D02 | A taxa de serviço incide sobre o subtotal antes ou depois do desconto? | PO | Sim | |
| D03 | Na divisão igualitária, o centavo extra vai para a primeira parte (proposta) ou para a última? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Fechamento simples | integração (RPC + mock/Supabase local) | CA01 | Criar 2 pedidos e chamar a RPC com Pix | 1 fechamento, pedidos pagos |
| CT02 | Pedido cancelado fora do total | integração | CA02 | Mesa com 1 pedido cancelado e 1 ativo | Total só do ativo |
| CT03 | Concorrência e idempotência | integração | CA03 | 2 chamadas paralelas e depois repetição com a mesma chave | 1 fechamento só |
| CT04 | Pagamento insuficiente e desconto excessivo | integração | CA04 | Chamar com soma menor e com desconto maior que o subtotal | Erro, nada gravado |
| CT05 | Divisão em centavos | unit (`js/utils/divisao-conta.js`) | CA05 | 100/3, 10/3, 0,01/2, 50/1 | Soma exata; diferença máxima de 1 centavo entre as partes |
| CT06 | Cupom persistido | integração | CA06 | Fechar com cupom | Colunas preenchidas e 1 uso registrado |
| CT07 | Erro mantém modal | unit DOM (happy-dom) | CA07 | Mock da RPC retornando erro | Toast de erro e modal aberto |
| CT08 | Permissão | integração | CA08 | Chamar como anon e como cozinha | Erro de permissão |
| CT09 | Contrato de parâmetros | unit (CAF-000086) | CA01 | Comparar os parâmetros do front com o fixture de schema | 0 violações |

## URL Complementar

- Documentação técnica: `js/pedidos.js:4840-4940`, `supabase/migration_caf_000023_taxa_desconto.sql:86-110`
- Requisitos originais: CAF-000002, CAF-000012, CAF-000013, CAF-000061
- Issue / PR relacionado: CAF-000072, CAF-000076, CAF-000077, CAF-000086 e SDD de testes do PDV de mesa
