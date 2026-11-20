# [FEAT] Escala da equipe por turno/espetáculo

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Montar no admin a escala semanal da equipe (quem trabalha, em que turno e em que estação), com sugestão de quantas pessoas escalar por faixa de horário, a partir do histórico de vendas por hora e da agenda de espetáculos. Cada colaborador vê a própria escala no celular e pode pedir troca de turno, que o gerente aprova. O ponto eletrônico **não** será construído; se for exigido, integraremos um fornecedor certificado.
- **Problema e evidência:**
  - *Hoje no sistema:* não existe escala. O snapshot de produção não tem nenhuma tabela de turnos ou escalas (`tests/fixtures/schema-snapshot.json`: `perfis` guarda só nome, cargo, PIN e ativo). A escala é feita fora do sistema.
  - Os dados para dimensionar a equipe já existem. O relatório do admin agrupa pedidos por hora do dia (`supabase/migration_caf_000039_pix_taxas.sql:581`, `EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Sao_Paulo')) AS hora`). A CAF-000113 tem metas por dia normal e por dia de espetáculo (`supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql:16-17`) e `obter_meta_progresso_dia` (`:334`). O dia de espetáculo é configurado em `espetaculo_*` (CAF-000062). O desempenho por operador existe em `get_relatorio_desempenho_operadores` (`supabase/migration_caf_000036_cargos_permissoes.sql:397`).
  - O rateio de gorjeta por horas (CAF-000144) e a capacidade por janela (CAF-000146) precisam saber quem estava trabalhando.
  - *Mercado:* o Square Shifts é gratuito até 5 pessoas e tem troca de turno; a TouchBistro oferece previsão de mão de obra.
  - *Regras:* o controle de ponto é obrigatório para estabelecimentos com mais de 20 empregados (CLT art. 74, §2º), e a Portaria MTP 671/2021 define requisitos técnicos para sistemas de ponto (REP-C/REP-A/REP-P, certificação, arquivos fiscais). Construir ponto próprio está fora do escopo.
- **Impacto de não fazer:** Equipe subdimensionada no intervalo de espetáculo lotado e ociosa em tardes fracas; trocas combinadas por mensagem sem registro; rateio de gorjeta por horas sem base confiável.
- **Para quem é destinado:** Gerente/dono (monta e aprova), colaboradores (consultam e pedem troca).
- **História de usuário:** Como gerente, quero ver quantas pessoas preciso em cada faixa do sábado com espetáculo e montar a escala em poucos minutos, para não faltar barista no intervalo.
- **Como saberemos que deu certo:** Escala da semana montada em até 15 minutos; 100% das trocas registradas no sistema; diferença entre pessoas escaladas e sugeridas visível por faixa; horas escaladas exportáveis para o rateio da CAF-000144.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Tabelas `turnos_modelo` (nome, início, fim, estação) e `escala_turnos` (data, colaborador `perfis.id`, início, fim, estação, status: planejado/publicado/trocado/cancelado, observação) | P0 | CA01 |
| RF02 | Tela de escala semanal no admin (grade dia × colaborador), com cópia da semana anterior, que publica a semana para a equipe | P0 | CA01, CA02 |
| RF03 | Validações: sem sobreposição de turnos do mesmo colaborador; alerta de descanso entre jornadas < 11 h e de jornada diária acima do limite configurado | P0 | CA03, CA04 |
| RF04 | Sugestão de equipe por faixa de 1 h: média de pedidos por hora das últimas 8 semanas para o mesmo dia da semana, separada por dia normal e dia de espetáculo, ÷ pedidos por pessoa/hora configurável; destaque das faixas abaixo da sugestão | P1 | CA05, CA06 |
| RF05 | Agenda de espetáculos (data, horário, intervalo) cadastrada na tela da escala, que alimenta a sugestão e o modo espetáculo (CAF-000062) | P1 | CA06 |
| RF06 | Colaborador vê a própria escala no celular (rota protegida no PDV) e pede troca indicando um colega; o colega aceita e o gerente aprova; tudo registrado | P1 | CA07, CA08 |
| RF07 | Exportação das horas escaladas por colaborador e período (CSV seguro) para o rateio por horas (CAF-000144) e para a folha | P1 | CA09 |
| RF08 | Integração com fornecedor de ponto certificado (importar marcações para comparar escalado × realizado) | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Colaborador lê só a própria escala e a escala publicada da equipe (nomes e horários), sem dados pessoais; edição só com permissão `admin.escala` (RLS + pgTAP) | P0 | CA10 |
| RNF02 | Horários no fuso de SP; turno que cruza a meia-noite é calculado corretamente | P0 | CA04 |
| RNF03 | Tela da escala carrega uma semana com 20 colaboradores em < 1 s | P1 | CA01 |
| RNF04 | Escala não interfere no login nem no PIN dos operadores (é informativa, não bloqueia acesso) | P0 | CA11 |

### Dependências técnicas

- `perfis`, `cargos` e permissões (CAF-000036, CAF-000081); relatórios por hora (`get_admin_reports`); metas e dia de espetáculo (CAF-000113, CAF-000062).
- CAF-000126/127 (autorização NULL-safe e dados sensíveis de `perfis`) antes de criar novas leituras de `perfis` pela equipe.
- Consumidores: CAF-000144 (rateio por horas) e CAF-000146 (capacidade).

### Recursos necessários

- Jornada contratual de cada colaborador e regras do acordo coletivo (limites de jornada); média de pedidos por pessoa/hora observada.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado o gerente na tela de escala, quando cria turnos para 6 colaboradores na semana e publica, então a grade mostra todos os turnos e o status muda para "publicado".
- [ ] **CA02:** Dado a semana anterior publicada, quando o gerente usa "copiar semana anterior", então os mesmos turnos são criados como "planejado" nas datas da nova semana.
- [ ] **CA03:** Dado um colaborador já escalado das 14h às 20h, quando o gerente tenta outro turno das 19h às 23h no mesmo dia, então o sistema bloqueia por sobreposição.
- [ ] **CA04:** Dado um turno que termina às 00:30 e outro que começa às 8:00 do mesmo dia, quando o gerente salva, então aparece o alerta de descanso inferior a 11 h (sem bloquear).
- [ ] **CA05:** Dado 8 sábados com média de 30 pedidos entre 21h e 22h e 15 pedidos por pessoa/hora, quando o gerente abre a escala de sábado, então a sugestão para 21h–22h é de 2 pessoas.
- [ ] **CA06:** Dado um sábado com espetáculo na agenda, quando a sugestão é calculada, então usa o histórico de dias de espetáculo e não o de sábados comuns.
- [ ] **CA07:** Dado um colaborador logado no celular, quando abre "Minha escala", então vê só os próprios turnos da semana publicada.
- [ ] **CA08:** Dado um pedido de troca aceito pelo colega, quando o gerente aprova, então o turno muda de dono, o status vira "trocado" e o histórico registra quem pediu, aceitou e aprovou.
- [ ] **CA09:** Dado um mês com turnos publicados, quando o gerente exporta as horas, então o CSV traz horas por colaborador iguais à soma dos turnos (descontando cancelados).
- [ ] **CA10:** Dado um barista sem `admin.escala`, quando tenta criar ou editar turno pela API, então recebe erro de permissão; dado um usuário anônimo, quando lê `escala_turnos`, então não recebe nenhuma linha.
- [ ] **CA11:** Dado um operador sem turno escalado hoje, quando faz login no PDV, então entra normalmente (caso negativo: a escala não bloqueia).

## O que a atividade não inclui

- Ponto eletrônico (registro de entrada/saída): motivo: a Portaria MTP 671/2021 exige certificação e requisitos técnicos; integrar com fornecedor certificado se necessário (P2).
- Cálculo de folha, horas extras e banco de horas: motivo: atribuição do contador/sistema de folha.
- Previsão de demanda com clima ou eventos externos: motivo: prematuro; o histórico por dia da semana e espetáculo basta.

### Considerado para o futuro (P2)

- Integração com fornecedor de ponto certificado (RF08) e comparação escalado × realizado.
- Aviso por push (CAF-000147) quando a escala é publicada ou uma troca é aprovada.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Quantos empregados há hoje? Acima de 20, o ponto é obrigatório e precisa de fornecedor | PO | Não (para a escala) | |
| D02 | Limites de jornada e descanso do acordo coletivo vigente | PO/contador | Não | |
| D03 | Pedidos por pessoa/hora de referência para a sugestão | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Criar, publicar e copiar semana | integração (`tests/caf-000154-escala.test.js`, admin com Supabase simulado) | CA01, CA02 | Criar e copiar | Turnos corretos |
| CT02 | Sobreposição | pgTAP (`supabase/tests/escala.test.sql`, constraint de exclusão) | CA03 | Inserir sobreposto | Erro |
| CT03 | Descanso e meia-noite | unit (`js/utils/escala-regras.js`) | CA04 | Turno até 00:30 | Alerta |
| CT04 | Sugestão de equipe | unit + pgTAP (RPC de média por hora) | CA05, CA06 | Histórico simulado normal e espetáculo | 2 pessoas; base correta |
| CT05 | Minha escala | DOM + pgTAP (RLS por `auth.uid()`) | CA07 | Logar como colaborador | Só os próprios turnos |
| CT06 | Troca de turno | pgTAP | CA08 | Pedir, aceitar, aprovar | Dono e histórico |
| CT07 | Exportação de horas | unit (`js/utils/csv-export.js`) | CA09 | Mês com cancelados | Horas exatas |
| CT08 | Permissões | pgTAP (`SET ROLE anon`, claims de barista, `has_function_privilege`) | CA10 | Ler e editar | Negado |
| CT09 | Login sem escala | e2e (Playwright) | CA11 | Logar sem turno | Acesso normal |

## URL Complementar

- Documentação técnica: `supabase/migration_caf_000039_pix_taxas.sql` (`get_admin_reports`), `supabase/migration_caf_000113_dre_gerencial_recebiveis_metas.sql`, `supabase/migration_caf_000036_cargos_permissoes.sql`, `js/admin/usuarios-admin.js`, `js/admin/relatorios-admin.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000036](CONCLUIDAS/CAF-000036-permissoes-por-cargo-e-desempenho.md), [CAF-000062](CONCLUIDAS/CAF-000062-modo-dia-de-espetaculo-reserva-intervalo.md), [CAF-000113](CONCLUIDAS/CAF-000113-painel-executivo-dre-metas-turno-conciliacao-taxas.md), [CAF-000014](CONCLUIDAS/CAF-000014-relatorios-no-admin.md); novas: CAF-000126, CAF-000127, CAF-000144, CAF-000146, CAF-000147
- Referências de design: TouchBistro, guia do produto 2026 (https://www.touchbistro.com/wp-content/uploads/2024/09/US-TouchBistro-Product-Guide-2026.pdf); Square Shifts
- Requisitos originais: CLT art. 74, §2º; Portaria MTP 671/2021
- Issue / PR relacionado: —
