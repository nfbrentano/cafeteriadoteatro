# [FEAT] Fidelidade com níveis sobre o cashback

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Criar níveis de fidelidade (ex.: Plateia, Camarote, Coxia) definidos pelo gasto do cliente em uma janela móvel (ex.: últimos 180 dias ou a temporada do teatro). Cada nível tem seu próprio percentual de cashback e benefícios, como bebida de aniversário. O nível aparece para o operador, no comprovante e no display do cliente.
- **Problema e evidência:**
  - *Hoje no sistema:* o cashback é um percentual único para todos. `processar_cashback_pedido` lê `cashback_percentual` (padrão 5) e `cashback_valor_minimo` (padrão 10) de `configuracoes_sistema` e calcula `v_cashback := ROUND((v_valor_base * v_percentual) / 100.0, 2)` (`supabase/migration_caf_000076_correcao_cashback.sql:115-131`). O crédito entra na carteira do cliente como depósito com `forma_pagamento = 'cashback'` (mesmo arquivo, `:11`).
  - O CRM tem segmentos RFV (`v_clientes_rfv.segmento_rfv`, CAF-000041), mas eles servem para campanhas, não para dar benefício. O cliente não sabe em que segmento está e não tem meta a alcançar.
  - `clientes.data_nascimento` existe e é editada no admin (`js/admin/clientes-admin.js:776`), mas nenhum benefício usa a data.
  - *Mercado:* o Square permite até 6 níveis de fidelidade e, segundo o próprio Square, clientes inscritos gastam em média 43% mais. A Starbucks reorganizou o programa em Green/Gold/Reserve em março de 2026; o Gold exige 500 estrelas no ano.
- **Impacto de não fazer:** O cliente frequente (universitário diário, assinante de temporada do teatro) recebe o mesmo que o eventual; não há motivo concreto para concentrar o consumo na cafeteria; aniversário passa sem contato.
- **Para quem é destinado:** Cliente cadastrado; operador (vê o nível e aplica benefícios); dono (configura níveis e acompanha custo).
- **História de usuário:** Como estudante que toma café todo dia na cafeteria, quero subir de nível e ganhar mais cashback e uma bebida no aniversário, para sentir que minha frequência é reconhecida.
- **Como saberemos que deu certo:** Custo total do programa (cashback + benefícios) ≤ percentual do faturamento definido pelo dono (sugestão: 4%), visível no painel; aumento da frequência média de clientes cadastrados em 3 meses, comparado ao trimestre anterior; 0 cashback calculado com nível errado nos testes.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Tabela `fidelidade_niveis` (nome, ordem, gasto mínimo na janela, percentual de cashback, cor/ícone, benefícios) com 2 a 6 níveis; o primeiro nível tem gasto mínimo 0 | P0 | CA01, CA02 |
| RF02 | Configuração da janela de qualificação: dias móveis (padrão 180) ou datas da temporada | P0 | CA03 |
| RF03 | `fn_nivel_cliente(cliente_id)` calcula o nível pelo gasto pago na janela, excluindo cancelados, estornos, vale-presente (CAF-000148) e o próprio cashback usado | P0 | CA03, CA04 |
| RF04 | `processar_cashback_pedido` usa o percentual do nível do cliente no momento do pagamento e grava o nível no movimento (rastreio) | P0 | CA05 |
| RF05 | Regra de queda: o cliente só desce de nível na revisão periódica (ex.: mensal), não no dia seguinte a uma compra que saiu da janela | P1 | CA06 |
| RF06 | Benefício de aniversário: no mês de nascimento, um item configurado (ex.: bebida até R$ 15,00) com 100% de desconto, uma vez por ano, aplicado pelo operador com registro | P1 | CA07, CA08 |
| RF07 | Nível e "faltam R$ X para o próximo nível" no PDV (ficha do cliente), no comprovante digital (CAF-000066) e no display do cliente (CAF-000145) | P1 | CA09 |
| RF08 | Painel do programa no admin: clientes por nível, cashback por nível, custo do programa sobre o faturamento | P1 | CA10 |
| RF09 | Consulta do próprio nível pelo cliente no cardápio, com verificação por código enviado ao celular | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Cálculo do nível em < 50 ms por cliente (índice em pedidos por `cliente_id` e data) | P1 | CA05 |
| RNF02 | Só participa quem tem cadastro com consentimento registrado (LGPD; ver CAF-000132); cliente anonimizado sai do programa | P0 | CA11 |
| RNF03 | Configuração de níveis e benefícios só por cargo com permissão `admin.fidelidade`; alterações vão para o log de auditoria | P0 | CA12 |
| RNF04 | Mudança de configuração não altera cashback já creditado | P0 | CA05 |

### Dependências técnicas

- Cashback (CAF-000063, CAF-000076); carteira do cliente (CAF-000034); CRM/RFV (CAF-000041); cadastro (CAF-000033).
- CAF-000129 (créditos do cliente atômicos e idempotentes) antes de mexer em `processar_cashback_pedido`.
- CAF-000132 (consentimento) e CAF-000145 (display) para a exibição ao cliente.
- Telas: `js/pdv/clientes.js`, `js/admin/clientes-admin.js`, configuração em `js/admin/settings.js`.

### Recursos necessários

- Nomes, faixas e percentuais definidos pelo dono; projeção de custo feita com os dados atuais de clientes.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o admin, quando cria os níveis Plateia (R$ 0, 3%), Camarote (R$ 300, 5%) e Coxia (R$ 800, 8%), então eles ficam salvos em ordem.
- [ ] **CA02:** Dado um cadastro de níveis sem nenhum com gasto mínimo 0 ou com faixas fora de ordem, quando salvo, então o sistema recusa e explica o motivo.
- [ ] **CA03:** Dado a janela de 180 dias e um cliente que gastou R$ 350,00 nesse período, quando o nível é calculado, então ele está em Camarote.
- [ ] **CA04:** Dado o mesmo cliente com um pedido de R$ 100,00 cancelado dentro da janela, quando o nível é calculado, então o pedido cancelado não conta.
- [ ] **CA05:** Dado um cliente Camarote pagando R$ 40,00, quando o cashback é processado, então credita R$ 2,00 (5%) e o movimento registra o nível "Camarote"; se depois o admin mudar Camarote para 6%, esse crédito continua R$ 2,00.
- [ ] **CA06:** Dado um cliente Camarote cujo gasto na janela caiu para R$ 250,00, quando ainda não houve a revisão mensal, então continua Camarote; depois da revisão, desce para Plateia.
- [ ] **CA07:** Dado um cliente no mês do aniversário, quando o operador aplica o benefício, então a bebida configurada sai com 100% de desconto e o benefício fica marcado como usado no ano.
- [ ] **CA08:** Dado um cliente que já usou o benefício de aniversário este ano, quando o operador tenta aplicar de novo, então é recusado (caso negativo).
- [ ] **CA09:** Dado um cliente Camarote com R$ 650,00 na janela, quando o operador abre a ficha ou o comprovante é gerado, então aparece "Camarote · faltam R$ 150,00 para Coxia".
- [ ] **CA10:** Dado o painel do programa, quando o dono escolhe o mês, então vê clientes por nível, cashback por nível e custo total sobre o faturamento.
- [ ] **CA11:** Dado um cliente anonimizado, quando paga um pedido, então não recebe nível, cashback nem benefício.
- [ ] **CA12:** Dado um barista sem `admin.fidelidade`, quando tenta alterar um nível pela API, então recebe erro de permissão e nada muda.

## O que a atividade não inclui

- Pontos/estrelas como moeda separada: motivo: o cashback em reais já é a moeda do programa e é mais simples para o cliente.
- App próprio de fidelidade: motivo: o cardápio web e o comprovante digital bastam neste momento.
- Benefícios com parceiros (desconto no ingresso): motivo: depende de acordo com a bilheteria (CAF-000153).

### Considerado para o futuro (P2)

- Consulta do próprio nível com verificação por código (RF09).
- Desafios temporários ("5 cafés nesta semana = cashback dobrado"), ligados às campanhas do CRM.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Nomes, faixas e percentuais dos níveis; custo máximo aceitável do programa | PO | Sim | |
| D02 | Janela móvel de dias ou temporada do teatro (datas)? | PO | Sim | |
| D03 | Benefício de aniversário: qual item e limite de valor? | PO | Não | |
| D04 | Assinantes do clube (CAF-000156) entram direto num nível? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Cadastro e validação de níveis | unit (`tests/caf-000149-fidelidade-niveis.test.js`, `js/utils/fidelidade.js`) + pgTAP | CA01, CA02 | Salvar faixas válidas e inválidas | Aceito/recusado |
| CT02 | Cálculo de nível | pgTAP (`supabase/tests/fidelidade_niveis.test.sql`) | CA03, CA04 | Pedidos pagos e cancelados na janela | Nível correto |
| CT03 | Cashback por nível e imutabilidade | pgTAP (`cashback.test.sql` ampliado) | CA05 | Pagar; mudar percentual | R$ 2,00 mantido |
| CT04 | Revisão periódica | pgTAP (relógio controlado) | CA06 | Antes e depois da revisão | Mantém e depois desce |
| CT05 | Aniversário | pgTAP + integração | CA07, CA08 | Aplicar duas vezes | Uma vez só |
| CT06 | Exibição | unit + DOM (ficha do PDV e `js/utils/receipt-formatter.js`) | CA09 | Cliente com R$ 650 | Texto correto |
| CT07 | Painel | integração (admin com Supabase simulado) | CA10 | Abrir mês | Totais coerentes |
| CT08 | LGPD e permissão | pgTAP (cliente anonimizado; claims de barista) | CA11, CA12 | Pagar; alterar nível | Sem benefício; negado |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000063_cashback_fidelidade.sql`, `supabase/migration_caf_000076_correcao_cashback.sql`, `supabase/migration_caf_000041_crm_campanhas.sql`, `js/utils/cashback.js`, `js/pdv/clientes.js`, `js/admin/clientes-admin.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000033](CONCLUIDAS/CAF-000033-cadastro-de-clientes.md), [CAF-000034](CONCLUIDAS/CAF-000034-conta-do-cliente-fiado-e-creditos.md), [CAF-000041](CONCLUIDAS/CAF-000041-crm-segmentacao-e-tags.md), [CAF-000063](CONCLUIDAS/CAF-000063-cashback-fidelidade-automatico-carteira-cliente.md), [CAF-000076](CONCLUIDAS/CAF-000076-correcao-cashback-fidelidade.md), [CAF-000066](CONCLUIDAS/CAF-000066-comprovante-digital-whatsapp-e-web-share.md); novas: CAF-000129, CAF-000132, CAF-000145, CAF-000148, CAF-000156
- Referências de design: Square níveis de fidelidade (https://squareup.com/help/us/en/article/8077-create-square-loyalty-tiers) e dado de gasto (https://square.com/ca/en/software/loyalty); Starbucks Green/Gold/Reserve (https://www.restaurantdive.com/news/starbucks-rewards-points-tiers-green-gold-reserve/810753)
- Requisitos originais: LGPD (Lei 13.709/2018)
- Issue / PR relacionado: —
