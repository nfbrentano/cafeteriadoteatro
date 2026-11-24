# [FIX] Regressões em produção: avaliação pós-pedido quebrada, anti-spam do QR e fuso horário

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-24

## Detalhes da Atividade

- **O que precisa ser feito:** Fazer a página de avaliação e a aba Avaliações do admin voltarem a funcionar, liberar a mesa para o segundo pedido pelo QR depois de 30 segundos (e não 3 horas) e parar de gravar horários deslocados em 3 horas no banco.
- **Problema e evidência:**
  1. **Avaliação sempre "Serviço indisponível".** `js/avaliar.js:156` faz `const sb = window.supabaseClient;` e, se vazio, mostra "Serviço indisponível" (`:157-159`); o envio usa `window.supabaseClient.rpc('registrar_avaliacao', ...)` (`:231`). O admin faz o mesmo (`js/admin/avaliacoes-admin.js:34` e `:80`, `if (!sb) return;`). Mas `js/supabase-client.js:20` só define `window.cafeteriaSupabase`; nada no código de produção atribui `window.supabaseClient`. Os testes passam porque o harness cria o alias (`tests/helpers/page-harness.js:111`, `window.supabaseClient = mockSupabase;`), e o e2e (`e2e/fluxos-criticos.spec.js`) não abre `avaliar.html`. A CAF-000042 está como concluída. Mesmo com o cliente certo, a aba do admin ainda falharia: a consulta pede `pedidos(id, numero_pedido, mesa_codigo, cliente_nome, valor_total, created_at)` (`js/admin/avaliacoes-admin.js:42`), mas a coluna em produção é `total` (`tests/fixtures/schema-snapshot.json`); o PostgREST recusa a consulta inteira.
  2. **Mesa bloqueada por ~3 h depois do 1º pedido pelo QR.** `criar_pedido_cliente` compara `(timezone('America/Sao_Paulo', now()) - v_ultimo_pedido_em) < INTERVAL '30 seconds'` (`supabase/migration_caf_000037_qr_pedidos_cliente.sql:187`). Desde a CAF-000080, `pedidos.created_at` tem default `now()` (`supabase/migration_caf_000080_fuso_horario.sql:52`). `timezone('America/Sao_Paulo', now())` devolve a hora de parede de SP sem fuso, que a sessão (UTC) reinterpreta como UTC: a diferença fica perto de −3 h, sempre menor que 30 s. O e2e contorna o problema recuando `created_at` em 4 h (`e2e/fluxos-criticos.spec.js:478-482`). O mesmo padrão está em `chamar_atendente_mesa` (`supabase/migration_caf_000082_seguranca.sql:100`): um chamado pendente com mais de 60 s nunca gera novo alerta por ~3 h.
  3. **Horários gravados 3 h "no passado" após a CAF-000080.** A 080 corrigiu só os defaults de `pedidos`, `pedido_itens`, `mesa_chamados` e `cardapio_eventos_diarios` (`080:47-80`). Continuam gravando `timezone('America/Sao_Paulo', now())` em colunas `timestamptz`, entre outros:
     - `estoque_lotes.created_at/updated_at` (`migration_caf_000111_lotes_validade_peps_sugestao_compras.sql:17-18`), criação/baixa de lote (`111:92-93`, `:152`, `:209`, `:234`) e o filtro de 30 dias de `obter_consumo_estoque_30d` (`111:267`);
     - `estoque_movimentos.created_at` default (`migration_caf_000031_controle_estoque.sql:36`) e inserts de movimento (`031:170`, `:209`, `:245`; `migration_caf_000032_ficha_tecnica.sql:169`, `:184`);
     - `v_now` de impressão/itens lançados depois (`migration_caf_000028_itens_lancados_depois.sql:107`, `:265`);
     - auditoria de pedidos e prioridade (`migration_caf_000104_correcao_prioridade_pedidos.sql:50-109`, `:141`);
     - `receber_pedido_totem` (`migration_caf_000040_totem.sql:518`), aprovar/recusar/atender QR (`037:469`, `:502-503`, `:518`), não retirado (`migration_caf_000038_pedido_online.sql:555-556`);
     - defaults de `autorizacoes_pin_log` (`migration_caf_000036_cargos_permissoes.sql:264`) e `campanha_usos` (`migration_caf_000077_cupons_uso_unico.sql:13`).
     Efeitos: relatórios e logs com horário errado; lotes criados por caminhos diferentes podem ficar fora de ordem no PEPS quando entram com menos de 3 h de diferença; janela de 30 dias do consumo médio deslocada.
- **Impacto de não fazer:** Nenhuma avaliação de cliente é recebida (feature paga pela CAF-000042 sem uso); mesa que pede pelo QR não consegue pedir de novo no mesmo espetáculo; auditoria, estoque e relatórios com horários errados.
- **Para quem é destinado:** Cliente (avaliação e pedido pelo QR), barista (chamados de mesa) e dono (relatórios, estoque, auditoria).
- **História de usuário:** Como cliente na mesa, quero fazer um segundo pedido pelo QR minutos depois do primeiro, para não precisar chamar o garçom.
- **Como saberemos que deu certo:** Avaliação enviada pelo link chega à aba do admin; segundo pedido pelo QR aceito 31 s depois do primeiro; 0 funções ou defaults vigentes gravando `timezone('America/Sao_Paulo', now())` em `timestamptz`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | `js/avaliar.js` e `js/admin/avaliacoes-admin.js` passam a usar `window.cafeteriaSupabase`, e a consulta do admin troca `valor_total` por `total` (coberta pelo teste de contrato front × schema da CAF-000086) | P0 | CA01, CA02 |
| RF02 | O harness de testes deixa de criar `window.supabaseClient` por padrão (testes que dependem dele passam a declarar o alias explicitamente) e uma regra de lint proíbe `window.supabaseClient` sem fallback para `cafeteriaSupabase` | P0 | CA03 |
| RF03 | Cenário e2e que abre `avaliar.html?token=...` de um pedido entregue, envia a avaliação e confere na aba do admin | P0 | CA01, CA02 |
| RF04 | `criar_pedido_cliente` e `chamar_atendente_mesa` comparam com `now()` | P0 | CA04, CA05, CA06 |
| RF05 | Remover o recuo de 4 h do e2e (`e2e/fluxos-criticos.spec.js:478-482`) e esperar a janela real (ou usar relógio controlado) | P0 | CA04 |
| RF06 | Trocar `timezone('America/Sao_Paulo', now())` por `now()` em todo default e gravação `timestamptz` das versões vigentes, levantadas pelo catálogo (`pg_proc.prosrc` e `pg_attrdef`), não só pelos arquivos | P0 | CA07 |
| RF07 | Uso permitido apenas para obter data/hora local de SP (`::date`, `::time`, `to_char`); teste no catálogo falha se aparecer fora desses casos | P1 | CA08 |
| RF08 | Relatório (somente leitura) das linhas gravadas com deslocamento nas tabelas afetadas, para decisão do dono | P1 | CA09 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | 0 erros no console em `avaliar.html` e na aba Avaliações | P0 | CA01, CA02 |
| RNF02 | O teste pgTAP do anti-spam roda em sessão com `TimeZone = 'UTC'` (igual ao Supabase) | P0 | CA04 |
| RNF03 | Migration com rollback em `supabase/rollback/` | P1 | CA07 |

### Dependências técnicas

- `js/supabase-client.js`, `js/avaliar.js`, `js/admin/avaliacoes-admin.js`, `tests/helpers/page-harness.js`, `e2e/fluxos-criticos.spec.js`, migrations 028, 031, 032, 036, 037, 038, 040, 077, 082, 104, 111.
- CAF-000137 unifica o cliente Supabase (esta SDD só corrige os pontos quebrados); CAF-000139 cuida dos KPIs no fuso de SP; CAF-000136 trata o PEPS no estorno.

### Recursos necessários

- Link de avaliação real (pedido entregue) em homologação para o teste manual.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um pedido entregue com token de avaliação, quando o cliente abre `avaliar.html?token=...` em produção, então a avaliação carrega e o envio grava em `avaliacoes`.
- [x] **CA02:** Dado avaliações recebidas nos últimos 30 dias, quando o admin abre a aba Avaliações, então as notas e comentários aparecem.
- [x] **CA03:** Dado o harness sem o alias `supabaseClient`, quando a suíte roda, então os testes de avaliação passam usando `cafeteriaSupabase`; e um código novo com `window.supabaseClient` sem fallback falha no lint.
- [x] **CA04:** Dado um pedido pelo QR na mesa 3, quando o segundo pedido é enviado 31 s depois, então é aceito; quando é enviado 10 s depois, então é recusado com a mensagem de aguardar.
- [x] **CA05:** Dado um chamado pendente há 61 s, quando a mesa chama de novo, então um novo chamado é registrado; dado um chamado pendente há 20 s, então a resposta é "repetido".
- [x] **CA06:** Dado sessão do banco em UTC, quando os testes de CA04 e CA05 rodam, então o resultado é o mesmo que com sessão em `America/Sao_Paulo`.
- [x] **CA07:** Dado a migration aplicada, quando crio um lote, um movimento de estoque, um log de auditoria e uma autorização por PIN, então `now() - created_at` de cada registro é menor que 5 s.
- [x] **CA08:** Dado o catálogo do banco, quando o teste de varredura roda, então nenhuma função ou default vigente usa `timezone('America/Sao_Paulo', now())` fora de conversões para data/hora local.
- [x] **CA09:** Dado o relatório de deslocamento, quando executado, então lista por tabela a quantidade de linhas afetadas sem alterar nenhum dado.

## O que a atividade não inclui

- Corrigir os horários históricos já gravados: motivo: decisão do dono a partir do relatório (D01).
- Unificar o cliente Supabase em todo o front: motivo: CAF-000137.
- KPIs e filtros de dashboard no fuso de SP: motivo: CAF-000139.
- Novas perguntas ou fluxo de avaliação: motivo: fora do escopo de correção.

### Considerado para o futuro (P2)

- Relógio de banco controlável nos testes (função `agora()` substituível) para testes de janela sem espera.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Corrigir (+3 h) os horários já gravados em lotes, movimentos e logs, ou apenas anotar a data de corte? | PO | Não | Anotada a data de corte (2026-11-24) com a aplicação da migration 130 e disponibilizado relatório de auditoria somente leitura via `fn_relatorio_deslocamento_fuso()` para conferência sem modificação retroativa destrutiva. |
| D02 | Os links de avaliação enviados enquanto a página estava quebrada devem ser reenviados aos clientes? | PO | Não | Não é necessário reenvio massivo; os links existentes que ainda estiverem dentro do prazo de 48h passarão a funcionar imediatamente. |
| D03 | A janela de 30 s entre pedidos pelo QR continua adequada no intervalo do espetáculo? | PO | Não | Sim, 30 segundos é adequado para proteção anti-spam sem impedir pedidos adicionais legítimos do cliente durante o intervalo. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Avaliação no navegador | e2e (Playwright) | CA01, CA02 | Entregar pedido, abrir link, enviar nota, abrir aba do admin | Avaliação visível |
| CT02 | Página sem alias | integração (harness sem `supabaseClient`) | CA01, CA03 | Carregar `avaliar.js` e `avaliacoes-admin.js` | Sem "Serviço indisponível"; RPC chamada |
| CT03 | Lint do alias | unit (ESLint com a regra) | CA03 | Arquivo de exemplo com `window.supabaseClient` | Erro de lint |
| CT04 | Anti-spam do QR | pgTAP (`SET TIME ZONE 'UTC'`) | CA04, CA06 | Pedido com `created_at = now() - 31s` e `now() - 10s` | Aceita / recusa |
| CT05 | Chamado de mesa | pgTAP | CA05, CA06 | Chamado pendente a 61 s e 20 s | Novo / repetido |
| CT06 | Gravações com `now()` | pgTAP | CA07 | Criar lote, movimento, log, autorização | Diferença < 5 s |
| CT07 | Varredura do catálogo | pgTAP | CA08 | Consultar `pg_proc.prosrc` e `pg_attrdef` | 0 ocorrências proibidas |
| CT08 | Relatório | pgTAP | CA09 | Rodar a função de relatório | Contagens sem alteração |
| CT09 | e2e sem atalho | e2e | CA04 | Remover o `UPDATE ... - interval '4 hours'` | Fluxo passa |

## URL Complementar

- Documentação técnica: `js/avaliar.js`, `js/admin/avaliacoes-admin.js`, `js/supabase-client.js`, `tests/helpers/page-harness.js`, `e2e/fluxos-criticos.spec.js`, `supabase/migration_caf_000037_qr_pedidos_cliente.sql`, `supabase/migration_caf_000080_fuso_horario.sql`, `supabase/migration_caf_000082_seguranca.sql`, `supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000042](CONCLUIDAS/CAF-000042-avaliacao-do-pedido-pelo-cliente.md), [CAF-000080](CONCLUIDAS/CAF-000080-fuso-horario-e-corte-do-dia-operacional.md), [CAF-000037](CONCLUIDAS/CAF-000037-qr-code-na-mesa-e-pedido-pelo-cliente.md), [CAF-000111](CONCLUIDAS/CAF-000111-sugestao-inteligente-compras-lotes-validade-peps-estoque.md), [CAF-000120](CONCLUIDAS/CAF-000120-testes-e2e-fluxos-criticos-navegador-real.md); novas: CAF-000136, CAF-000137, CAF-000138, CAF-000139
- Referências de design: —
- Requisitos originais: auditoria por leitura de 2026-11-20
- Issue / PR relacionado: —
