# [FEAT] Taxa de serviço/gorjeta conforme Lei 13.419/2017: rateio entre a equipe e relatório para a folha

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Tratar a taxa de serviço e a gorjeta espontânea como dinheiro da equipe: separar do faturamento da casa, apurar por período, descontar a retenção prevista em norma coletiva, ratear entre os colaboradores pelo critério definido (pontos ou horas) e gerar o relatório que o contador usa na folha. Opcionalmente, sugerir gorjeta no pagamento.
- **Problema e evidência:**
  - *Hoje no sistema:* a taxa de serviço é configurada em `site_settings` (`js/admin/settings.js:233-234`, `taxa_servico_ativa` e `taxa_servico_percentual`), aplicada no PDV (`js/pdv/sessao.js:621-623`) e gravada só como número em `fechamentos.taxa_servico` (`supabase/migration_caf_000112_fechamento_parcial_mesa.sql:409` soma a taxa ao `v_total_a_pagar`; `:437` grava). Nenhum relatório, RPC ou tela soma `fechamentos.taxa_servico` (busca no repositório: só aparece em fechamento, recibo e configuração).
  - O DRE (CAF-000113) monta a receita bruta a partir de `pedidos.total` (`supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql:76-87`), então a taxa **não** entra como receita. Isso está certo. Mas as taxas de cartão são calculadas sobre o valor pago inteiro, gorjeta incluída (mesmo arquivo, `:94-111`), e o caixa soma `fechamento_pagamentos.valor` com a gorjeta dentro (`supabase/migration_caf_000108_integridade_transferencia_fechamento_caixa.sql:366-378`). O dinheiro da equipe se mistura ao da casa na conferência.
  - Não há gorjeta em pedido de balcão, totem ou online, nem cadastro de quem tem direito ao rateio.
  - *Lei:* pela Lei 13.419/2017 (CLT art. 457 §3º), a taxa de serviço cobrada é gorjeta e não constitui receita do empregador. O critério de rateio é definido em convenção/acordo coletivo ou, na falta deles, em assembleia. A retenção de até 20% (Simples Nacional) ou 33% (demais regimes) só vale se a norma coletiva prever. Os valores devem ser anotados na CTPS e no contracheque, o que exige um relatório de rateio por colaborador para a folha.
  - *Mercado:* o Square faz rateio (tip pooling) por horas trabalhadas. Segundo a Toast, a Kaldi's Coffee viu as gorjetas "mais que dobrarem" depois de sugerir valores no display.
- **Impacto de não fazer:** Risco trabalhista (gorjeta sem rateio documentado nem anotação em folha); caixa e conferência com dinheiro de terceiros; taxa de cartão da parte da gorjeta absorvida sem critério; equipe sem transparência sobre quanto recebeu.
- **Para quem é destinado:** Dono/gerente (apuração e folha), contador, colaboradores (transparência), cliente (gorjeta opcional).
- **História de usuário:** Como dono, quero fechar o mês com o total de gorjetas, a retenção legal e quanto cabe a cada colaborador, para repassar ao contador sem planilha paralela.
- **Como saberemos que deu certo:** Soma do rateio + retenção = total de gorjetas do período, com diferença de R$ 0,00; relatório mensal exportado em até 3 cliques; caixa mostra gorjeta separada da venda em 100% dos fechamentos com taxa.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Livro de gorjetas `gorjeta_lancamentos` (origem: fechamento de mesa, pedido de balcão/totem/online; tipo: taxa de serviço ou espontânea; valor; forma; data no fuso de SP), alimentado no servidor pelas RPCs de fechamento | P0 | CA01, CA02 |
| RF02 | Caixa e conferência (CAF-000044/079) exibem "gorjetas" separadas das vendas por forma de pagamento | P0 | CA03 |
| RF03 | Configuração da regra: regime (Simples/demais), percentual de retenção (0 a 20% ou 0 a 33%, travado pelo regime), se a retenção está prevista em norma coletiva (sem previsão, retenção = 0), critério (pontos por cargo, horas ou partes iguais) | P0 | CA04, CA05 |
| RF04 | Apuração por período (`apurar_rateio_gorjetas(inicio, fim)`) com participantes, pontos/horas, valor de cada um e arredondamento sem sobra perdida (o centavo restante vai para o maior valor, registrado) | P0 | CA06, CA07 |
| RF05 | Fechar o período: grava `gorjeta_rateios` e `gorjeta_rateio_itens` imutáveis, com quem fechou; lançamentos do período ficam bloqueados para edição | P0 | CA08 |
| RF06 | Relatório para a folha (tela e CSV seguro contra injeção, ver CAF-000132): colaborador, cargo, critério, base, valor bruto, retenção e período | P0 | CA09 |
| RF07 | Gorjeta espontânea opcional no fechamento do PDV (valores sugeridos 0/5/10% e "outro") e, quando existir, no display do cliente (CAF-000145) | P1 | CA10 |
| RF08 | Taxa de cartão proporcional da gorjeta: mostrar quanto foi e permitir (se a norma coletiva prever) descontá-la da base | P1 | CA11 |
| RF09 | Horas por colaborador vindas da escala (CAF-000154) quando o critério for horas; até lá, digitadas na apuração | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Apuração, fechamento e relatório só para cargos com a permissão nova `admin.gorjetas` (pgTAP com `SET ROLE anon` e `has_function_privilege`) | P0 | CA12 |
| RNF02 | Centavos inteiros em toda a conta; soma das partes = total exato | P0 | CA07 |
| RNF03 | Colaborador vê só o próprio valor (P1); valores dos colegas não são expostos por RLS | P1 | CA12 |
| RNF04 | Taxa de serviço continua fora da receita do DRE (sem regressão) | P0 | CA13 |

### Dependências técnicas

- `fechar_conta_mesa` e `registrar_pagamento_parcial_mesa` (CAF-000112), RPCs de pedido de balcão; caixa (CAF-000044, CAF-000079, CAF-000108); DRE (CAF-000113); cargos e permissões (CAF-000036).
- CAF-000128 (limites e sinais de valores no servidor) e CAF-000129 (fonte única do saldo da mesa) antes de alterar o fechamento.
- CAF-000154 (escala) para o critério por horas; CAF-000145 para gorjeta sugerida no display.

### Recursos necessários

- Regime tributário da empresa, convenção/acordo coletivo vigente (ou ata de assembleia) e validação do contador sobre o formato do relatório.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado uma mesa de R$ 100,00 fechada com 10% de taxa, quando o fechamento termina, então existe um lançamento de gorjeta de R$ 10,00 do tipo taxa de serviço ligado ao fechamento.
- [ ] **CA02:** Dado um fechamento parcial em duas partes com taxa, quando as duas partes são pagas, então a soma dos lançamentos de gorjeta é igual à taxa total, sem duplicar.
- [ ] **CA03:** Dado um caixa com R$ 500,00 em vendas e R$ 40,00 de gorjetas em dinheiro, quando abro a conferência, então vejo as duas linhas separadas e o total esperado da gaveta é R$ 540,00.
- [ ] **CA04:** Dado o regime "Simples" e retenção prevista em norma coletiva, quando informo 25%, então o sistema recusa e informa o limite de 20%.
- [ ] **CA05:** Dado "retenção prevista em norma coletiva" desmarcado, quando apuro o período, então a retenção é R$ 0,00 mesmo que um percentual esteja salvo.
- [ ] **CA06:** Dado R$ 1.000,00 de gorjetas, retenção de 20% e três colaboradores com 2, 1 e 1 pontos, quando apuro, então os valores são R$ 400,00, R$ 200,00 e R$ 200,00, com R$ 200,00 retidos.
- [ ] **CA07:** Dado R$ 100,00 entre três pessoas com partes iguais, quando apuro, então os valores somam exatamente R$ 100,00 (33,34 + 33,33 + 33,33) e o centavo extra fica registrado.
- [ ] **CA08:** Dado um período fechado, quando alguém tenta estornar ou editar uma gorjeta desse período, então a operação é recusada e indica o fechamento.
- [ ] **CA09:** Dado um período fechado, quando exporto o relatório da folha, então o CSV traz uma linha por colaborador com bruto, retenção e líquido, e células que começam com `=`, `+`, `-` ou `@` saem neutralizadas.
- [ ] **CA10:** Dado o PDV no fechamento, quando o cliente escolhe gorjeta de 10% sobre R$ 50,00, então R$ 5,00 entra como gorjeta espontânea e não altera o valor dos itens.
- [ ] **CA11:** Dado R$ 10,00 de gorjeta paga no crédito com taxa de 3%, quando vejo a apuração, então aparece R$ 0,30 de taxa proporcional, descontada da base só se a opção estiver ligada.
- [ ] **CA12:** Dado um usuário anônimo ou um barista sem `admin.gorjetas`, quando chama a apuração ou lê `gorjeta_rateio_itens` de outro colaborador, então recebe erro de permissão e nenhuma linha (caso negativo).
- [ ] **CA13:** Dado o DRE do mês com R$ 2.000,00 de taxas de serviço, quando é gerado, então a receita bruta não inclui esses R$ 2.000,00.

## O que a atividade não inclui

- Cálculo de encargos (INSS/FGTS) sobre a gorjeta e geração de eSocial: motivo: é papel da folha/contador; entregamos a base.
- Pagamento da gorjeta aos colaboradores pelo sistema: motivo: o repasse é feito na folha.
- Gorjeta por mesa para um garçom específico: motivo: o critério legal é coletivo; pode ser critério futuro se a norma prever.

### Considerado para o futuro (P2)

- Horas vindas da escala (RF09).
- Extrato do colaborador no celular com o histórico de rateios.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Regime tributário da empresa (Simples ou outro)? Define o teto de retenção | PO/contador | Sim | |
| D02 | Existe convenção/acordo coletivo com critério de rateio e retenção? Senão, quando será a assembleia? | PO | Sim | |
| D03 | Critério: pontos por cargo, horas ou partes iguais? Quem entra (cozinha, bar, caixa)? | PO | Sim | |
| D04 | A taxa de cartão da parte da gorjeta pode ser descontada da base? | contador | Não | |
| D05 | Período de apuração: mensal (folha) ou quinzenal? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Lançamento no fechamento total e parcial | pgTAP (`supabase/tests/gorjetas.test.sql`) | CA01, CA02 | Fechar mesa com taxa; fechar em 2 partes | Lançamentos corretos e únicos |
| CT02 | Caixa separado | pgTAP + unit (`js/utils/caixa-calculos.js`) | CA03 | Vendas e gorjetas em dinheiro | Linhas separadas; total da gaveta |
| CT03 | Limites de retenção | unit (`tests/caf-000144-rateio-gorjetas.test.js`) + pgTAP | CA04, CA05 | Simples 25%; norma desmarcada | Recusa; retenção 0 |
| CT04 | Rateio por pontos e arredondamento | unit (função em `js/utils/rateio-gorjetas.js`) + pgTAP | CA06, CA07 | Casos 2/1/1 e 3 partes iguais | Valores e soma exatos |
| CT05 | Período fechado | pgTAP | CA08 | Estornar após fechamento | Erro |
| CT06 | CSV da folha | unit (`js/utils/csv-export.js`) | CA09 | Nome com `=CMD()` | Célula neutralizada |
| CT07 | Gorjeta espontânea no PDV | integração (harness de `js/pdv/fechamento.js`) | CA10 | Escolher 10% | Gorjeta separada dos itens |
| CT08 | Taxa proporcional | unit | CA11 | Gorjeta no crédito | R$ 0,30 calculado |
| CT09 | Permissões | pgTAP (`SET ROLE anon`, claims de barista, `has_function_privilege`) | CA12 | Chamar RPC e ler tabela | Negado |
| CT10 | DRE sem regressão | pgTAP (`dre_gerencial_metas.test.sql`) | CA13 | Fechamentos com taxa | Receita sem a taxa |

## URL Complementar

- Documentação técnica: `js/admin/settings.js`, `js/pdv/sessao.js`, `js/pdv/fechamento.js`, `supabase/migration_caf_000112_fechamento_parcial_mesa.sql`, `supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql`, `supabase/migration_caf_000108_integridade_transferencia_fechamento_caixa.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000013](CONCLUIDAS/CAF-000013-taxa-de-servico-e-desconto-manual.md), [CAF-000036](CONCLUIDAS/CAF-000036-permissoes-por-cargo-e-desempenho.md), [CAF-000044](CONCLUIDAS/CAF-000044-fechamento-de-caixa-cego-e-correcoes.md), [CAF-000112](CONCLUIDAS/CAF-000112-fechamento-parcial-conta-mesa-pagamento-por-item-comanda-individual.md), [CAF-000113](CONCLUIDAS/CAF-000113-painel-executivo-dre-metas-turno-conciliacao-taxas.md); novas: CAF-000128, CAF-000129, CAF-000132, CAF-000145, CAF-000154
- Referências de design: Toast/Kaldi's Coffee (https://d22ee908voahmo.cloudfront.net/blog/kaldis-coffee); Square tip pooling (https://squareup.com/help/us/en/article/7654-get-started-with-tip-pooling-for-team-management)
- Requisitos originais: Lei 13.419/2017 (https://planalto.gov.br/ccivil_03/_Ato2015-2018/2017/Lei/L13419.htm); Guia Trabalhista, gorjetas e rateio (https://www.guiatrabalhista.com.br/tematicas/Gorjetas-incorporacao-rateio.htm)
- Issue / PR relacionado: —
