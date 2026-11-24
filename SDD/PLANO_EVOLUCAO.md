# Plano de evolução (CAF-000126 a CAF-000157)

> Origem: auditoria do repositório em 2026-11-20 (banco, PDV/KDS, canais do cliente, admin e CI) e pesquisa de mercado de softwares para cafeteria ([ANALISE_MERCADO_CAFETERIAS_2026-11.md](ANALISE_MERCADO_CAFETERIAS_2026-11.md)). Todas as SDDs abaixo estão em **Rascunho**, aguardando revisão. O plano anterior (115–125) está mais abaixo, em "Histórico".

## Leitura geral

A base funcional é ampla e a suíte passa (948 testes, build ok). A auditoria, porém, encontrou um padrão: **várias garantias que as SDDs dão como concluídas não valem em produção**:
- As checagens de cargo no banco aceitam usuário sem cargo, inclusive anônimo.
- O pgTAP do CI nunca executa uma asserção.
- Os módulos `js/utils` testados não são os que as telas usam.
- O harness cria um alias (`supabaseClient`) que produção não tem.

Por isso a ordem abaixo põe **segurança e dinheiro antes de qualquer feature nova**, e trata a confiabilidade dos testes (138) cedo, para que as correções não voltem.

## Correções e melhorias

| Ordem | SDD | Onda | Tipo | Tema | Evidência principal | Esforço | Depende de |
|---|---|---|---|---|---|---|---|
| 1 | [CAF-000126](CAF-000126-autorizacao-null-safe-e-revogacao-de-anon-nas-rpcs-security-definer.md) | 0 | FIX | Autorização NULL-safe e revogação de `anon` nas RPCs | Guards `v_role NOT IN (...)` deixam passar `NULL`; `admin_create_user` aberta a anon; snapshot com `anon_exec=t` | M | — |
| 2 | [CAF-000127](CAF-000127-pin-hash-com-bcrypt-e-policies-de-leitura-restritas.md) | 0 | FIX | `pin_hash` com bcrypt e leitura restrita de financeiro/caixa/estoque | `perfis` legível por qualquer autenticado (SHA-256 com sal fixo); `fechamentos`, `caixa_movimentos`, lotes legíveis por anon | M | 126 |
| 3 | [CAF-000130](CAF-000130-regressoes-avaliacao-anti-spam-do-qr-e-fuso-horario.md) | 0 | FIX | Regressões: avaliação, anti-spam do QR e fuso | `window.supabaseClient` nunca definido; mesa bloqueada ~3h após 1º pedido QR; horários gravados 3h atrás | P | — |
| 4 | [CAF-000128](CAF-000128-integridade-monetaria-no-servidor.md) | 0 | FIX | Integridade monetária no servidor | Taxa de serviço/pagamento/quantidade negativos aceitos; desconto por PIN recusado pelo servidor | M | 126 |
| 5 | [CAF-000129](CAF-000129-saldo-da-mesa-fonte-unica-e-debitos-do-cliente-atomicos.md) | 1 | FIX | Saldo da mesa com fonte única; fiado e cashback atômicos | Front e servidor calculam saldo diferente após parcial; fiado debitado fora da transação | M | 128 |
| 6 | [CAF-000131](CAF-000131-pedidos-publicos-cupom-no-servidor-horario-e-protecao-contra-abuso.md) | 1 | FIX | Pedidos públicos: cupom no servidor, horário e abuso | Cupom só visual; pedido aceito com loja fechada; telefone alheio altera cadastro | M | 126, 130 |
| 7 | [CAF-000133](CONCLUIDAS/CAF-000133-pdv-envio-sem-perda-totem-cancelamento-observacoes-toasts-fila-offline.md) | 1 | FIX | PDV: envio sem perda, totem, cancelamento, observações, toasts, fila offline | Carrinho limpo antes da rede; fallback do totem com update direto; erros exibidos como info | M | 128 |
| 8 | [CAF-000135](CAF-000135-pedido-do-intervalo-e-adicionar-itens-gravados-pelo-servidor.md) | 1 | FIX | Pedido do intervalo e "adicionar itens" gravados pelo servidor | `criar_pedido` descarta `retirada_em` e `pedido_origem_id`; café do intervalo feito 40 min antes | P | 138 (promoções) |
| 9 | [CAF-000134](CAF-000134-kds-fila-de-impressao-trava-por-estacao-ressincronizacao-sla-e-voz.md) | 1 | FIX | KDS: fila de impressão, trava por estação, reconnect, SLA, voz | Iframe único sobrescreve comandas; sem ressincronização ao reconectar | M | — |
| 10 | [CAF-000138](CAF-000138-banco-reconstruivel-pelo-manifesto-e2e-fiel-e-checagens-no-deploy.md) | 2 | CHORE | Banco reconstruível, E2E fiel e pgTAP que roda | pgTAP nunca executa asserção no CI (psql sem `ON_ERROR_STOP`, sem extensão); manifesto não recria produção | G | 126 |
| 11 | [CAF-000136](CAF-000136-estoque-combos-peps-no-estorno-e-saldo-incremental.md) | 2 | FIX | Estoque: trigger de combos, PEPS no estorno, saldo com lock | Trigger de combo aponta para tabelas/colunas inexistentes; estorno não devolve ao lote | M | 138 |
| 12 | [CAF-000132](CAF-000132-lgpd-consentimento-privacidade-e-exportacoes-seguras.md) | 2 | FIX | LGPD: consentimento, GA, privacidade, titular, CSV | Opt-in de marketing pré-marcado; GA sem consentimento; injeção de fórmula no CSV | M | 131 |
| 13 | [CAF-000142](CAF-000142-seguranca-das-paginas-publicas-escape-do-catalogo-links-csp-e-chave-pix.md) | 2 | FIX | Segurança das páginas públicas e chave Pix | HTML do catálogo sem escape; jsDelivr inteiro na CSP; celular lido como CPF | P | — |
| 14 | [CAF-000139](CAF-000139-desempenho-realtime-filtrado-paginacao-do-admin-e-kpis-no-fuso-de-sp.md) | 2 | FIX | Realtime filtrado, paginação do admin, KPIs no fuso | Admin refaz ~9 consultas e redesenha a cada pedido; listas cortadas em 1000 linhas | M | — |
| 15 | [CAF-000137](CAF-000137-pdv-kds-usando-modulos-utils-em-centavos-e-cliente-supabase-unico.md) | 3 | REFACTOR | PDV/KDS usando `js/utils` em centavos; cliente Supabase único | Módulos testados não rodam em produção; PDV calcula dinheiro em float | G | 129, 133 |
| 16 | [CAF-000140](CAF-000140-web-precache-por-perfil-manifests-separados-lcp-e-seo-do-cardapio.md) | 3 | FIX | Precache por perfil, manifests, LCP e SEO | SW baixa 4,25 MB de telas internas para o visitante; pdf.js em toda visita | M | — |
| 17 | [CAF-000141](CAF-000141-retencao-e-telemetria-expurgo-agendado-limites-e-avisos-de-build.md) | 3 | CHORE | Retenção, telemetria, avisos de lint/build | Tabelas de erros/acessos sem expurgo; PDV conta como visita; 19 warnings | P | 126 |

**Por que nesta ordem**
- **Onda 0:** são exploráveis hoje só com a chave pública do site (126, 127) ou estão quebradas em produção (130), e mexem em dinheiro sem autorização (128). A 126 deve começar por uma **verificação somente leitura em produção** (`has_function_privilege('anon', ...)`), descrita na própria SDD.
- **Onda 1:** cobrança em dobro, pedidos perdidos e comandas que não saem no intervalo.
- **Onda 2:** a 138 faz os testes de banco valerem de fato; sem ela, as correções das ondas 0 e 1 não ficam protegidas contra regressão.
- **Onda 3:** a refatoração (137) só depois que o comportamento correto estiver especificado e testado.

## Novas funcionalidades (mercado)

| Ordem | SDD | Tema | Esforço | Depende de | Decisão do dono |
|---|---|---|---|---|---|
| 1 | [CAF-000143](CAF-000143-variacoes-de-bebida-e-grupos-de-opcoes-obrigatorios.md) | Variações de bebida e grupos de opções | G | 128, 135, 136 | Tamanhos, preços e receitas do piloto |
| 2 | [CAF-000144](CAF-000144-gorjeta-rateio-da-taxa-de-servico-e-relatorio-para-folha.md) | Taxa de serviço/gorjeta (Lei 13.419) com rateio | M | 128, 129 | Regime, acordo coletivo, critério |
| 3 | [CAF-000146](CAF-000146-capacidade-por-janela-do-intervalo-e-tempo-estimado-dinamico.md) | Capacidade por janela do intervalo | M | 131, 135 | Capacidade por estação |
| 4 | [CAF-000152](CAF-000152-alergenicos-e-restricoes-alimentares.md) | Alergênicos | P | 142 | Responsável técnico; norma RS |
| 5 | [CAF-000151](CAF-000151-cardapio-e-preco-por-horario-e-cardapio-expresso-do-intervalo.md) | Cardápio e preço por horário | P | 128, 135 | Lista de itens expressos |
| 6 | [CAF-000150](CAF-000150-sugestao-de-itens-upsell-no-qr-online-e-pdv.md) | Upsell no QR, online e PDV | P | 128, 137 | — |
| 7 | [CAF-000147](CAF-000147-aviso-de-pedido-pronto-por-web-push.md) | Push de pedido pronto (PWA) | M | 123, 132, 140 | — |
| 8 | [CAF-000145](CAF-000145-display-do-cliente-no-caixa.md) | Display do cliente no caixa | M | 132, 140 | Hardware |
| 9 | [CAF-000149](CAF-000149-fidelidade-com-niveis-sobre-o-cashback.md) | Fidelidade com níveis | M | 129, 132 | Faixas e janela |
| 10 | [CAF-000148](CAF-000148-vale-presente-digital.md) | Vale-presente digital | M | 129 (123 p/ online) | Fiscal e validade |
| 11 | [CAF-000155](CAF-000155-entrada-de-estoque-por-xml-da-nfe-de-compra.md) | Entrada por XML da NF-e | M | 136, 127 | — |
| 12 | [CAF-000153](CAF-000153-voucher-ingresso-mais-consumo-com-a-bilheteria.md) | Voucher ingresso + consumo | M | 148, 146 | Plataforma de bilheteria |
| 13 | [CAF-000154](CAF-000154-escala-da-equipe-por-turno-e-espetaculo.md) | Escala da equipe | M | 126, 127 | — |
| 14 | [CAF-000156](CAF-000156-assinatura-clube-do-cafe-com-pix-automatico.md) | Assinatura com Pix Automático | M/G | 123 | PSP, planos |
| 15 | [CAF-000157](CAF-000157-maquininha-integrada-ao-pdv-tef-smart-pos.md) | Maquininha integrada | M/G | 123, 128, 129, 133 | Adquirente e API |

Detalhes, matriz por concorrente e notas regulatórias em [ANALISE_MERCADO_CAFETERIAS_2026-11.md](ANALISE_MERCADO_CAFETERIAS_2026-11.md). Recomendação: nenhuma feature antes da Onda 0. A 143 (variações) e a 144 (gorjeta, que é obrigação legal) são as primeiras depois da Onda 1.

## Decisões que só o dono pode tomar

| SDD | Decisão |
|-----|---------|
| 126 | Desligar o cadastro público no Supabase Auth; conferir se existe usuário admin desconhecido |
| 127 | Quando redefinir os PINs da equipe |
| 129 | Regra da taxa de serviço em pagamento parcial |
| 131 | Horário de domingo |
| 132 | Encarregado (DPO) e canal do titular; o que fazer com os opt-ins já gravados |
| 138 | Quem cria a role somente leitura e o secret do CI |
| 144 | Regime tributário, acordo/convenção coletiva e critério de rateio |
| 153 / 156 / 157 | Plataforma de ingressos, PSP com Pix Automático, adquirente da maquininha |

## Limites desta análise

- Feita sobre o repositório e o snapshot de produção (`tests/fixtures/schema-snapshot.json`, `supabase/snapshots/`). Não houve acesso ao banco de produção, ao painel da Supabase nem às telas rodando: achados que dependem da configuração de produção (publicação realtime, schema do pgcrypto, signup público) estão marcados como dúvida nas SDDs.
- Nenhum achado de segurança foi testado contra produção.
- A pesquisa de mercado usa material público dos fornecedores; números citados são deles.

---

# Histórico

# Plano de evolução (CAF-000115 a CAF-000125)

> Origem: leitura do repositório em 2026-11-10 (código, migrations, testes, CI e SDDs 001–114).
> **CAF-000115 a CAF-000123** estão **Concluídas** (em `SDD/CONCLUIDAS/`). As demais SDDs (`CAF-000124` e `CAF-000125`) permanecem em **Rascunho**, aguardando revisão.

## Leitura geral

O produto está funcionalmente maduro: PDV, KDS, Totem, pedido do cliente, estoque com lotes, financeiro com DRE, CRM e permissões já existem, com 118 SDDs concluídas e testes de front e de banco no CI. O que falta agora é menos "mais uma tela" e mais **sustentação**: saber quando algo quebra, conseguir recuperar o banco, impedir que código de terceiros rode nas telas de caixa e reduzir o custo de mexer em arquivos de 5–6 mil linhas. Do lado de produto, as duas lacunas grandes são as que as análises anteriores deixaram de fora de propósito: **confirmação automática de Pix** e **NFC-e**.

## O que precisa melhorar

| Ordem | SDD | Status | Tipo | Tema | Evidência principal | Esforço | Depende de |
|-------|-----|--------|------|------|---------------------|---------|------------|
| 1 | [CAF-000116](CONCLUIDAS/CAF-000116-backup-restauracao-e-runner-de-migrations.md) | Concluída | CHORE | Backup restaurável, runner de migrations e rollbacks 103–113 | Sem rotina de backup; rollbacks só até a 083; migration 103 esqueceu o registro (`2a3d75e`) | M | — |
| 2 | [CAF-000115](CONCLUIDAS/CAF-000115-observabilidade-erros-front-em-producao.md) | Concluída | CHORE | Captura de erros do front e painel no Admin | Nenhum `onerror`/`unhandledrejection`; defeito de RPC só visto em produção (`94d6b99`) | P | — |
| 3 | [CAF-000117](CONCLUIDAS/CAF-000117-seguranca-front-csp-sri-versoes-cdn-dependabot.md) | Concluída | FIX | CSP, SRI e versões fixas de CDN, Dependabot | `supabase-js@2` e `chart.js` sem versão fixa, 0 `integrity`, 0 CSP | M | — |
| 4 | [CAF-000118](CONCLUIDAS/CAF-000118-pwa-service-worker-precache-e-versionamento.md) | Concluída | FIX | Service worker gerado no build | Precache manual sem Totem, Retirada, Admin e `js/utils/`; versão `v15` manual | P | — |
| 5 | [CAF-000122](CONCLUIDAS/CAF-000122-higiene-do-repositorio-ci-e-readme.md) | Concluída | CHORE | Higiene do repositório, Node do CI, README | 54 MB de `images_backup` publicados; `supabase/.temp` versionado; CI em Node 20 | P | — |
| 6 | [CAF-000119](CONCLUIDAS/CAF-000119-qualidade-eslint-e-cobertura-real-no-ci.md) | Concluída | CHORE | ESLint e cobertura real com piso no CI | Sem lint; relatório de cobertura com 20% e 23 arquivos em 0% | M | — |
| 7 | [CAF-000120](CONCLUIDAS/CAF-000120-testes-e2e-fluxos-criticos-navegador-real.md) | Concluída | CHORE | E2E em navegador real com banco local | Front testado com mock e banco isolado; nada testa os dois juntos | M | 116 |
| 8 | [CAF-000121](CONCLUIDAS/CAF-000121-modularizacao-pdv-e-admin.md) | Concluída | REFACTOR | Modularizar `pedidos.js` (6.381 linhas) e `admin.html` (5.087) | Toda feature recente toca os mesmos dois arquivos | G | 119, 120 |

## O que seria importante ter

| Ordem | SDD | Tipo | Tema | Por que | Esforço | Depende de |
|-------|-----|------|------|---------|---------|------------|
| 9 | [CAF-000123](CONCLUIDAS/CAF-000123-pix-dinamico-com-confirmacao-automatica.md) | Concluída | FEAT | Pix dinâmico com confirmação automática | Hoje o barista confere o Pix no app do banco; o totem não se sustenta sozinho | G | 115; decisão de PSP |
| 10 | [CAF-000124](CAF-000124-emissao-de-nfce-no-fechamento.md) | FEAT | NFC-e no fechamento da conta | Cupom atual é não fiscal; nota exige outro sistema | G | 116; contador, provedor e certificado |
| 11 | [CAF-000125](CAF-000125-acessibilidade-totem-e-cardapio-do-cliente.md) | UI | Acessibilidade do Totem e do cardápio do cliente | Telas públicas com pouca semântica; público do teatro inclui idosos e baixa visão | M | — |

## Por que nesta ordem

- **116 e 115 primeiro**: são baratas e protegem tudo o que já existe (dados e visibilidade). A 123 e a 124 colocam dinheiro e documento fiscal em fluxo automático; não devem entrar sem backup e sem registro de erros.
- **117 e 118** fecham riscos que crescem a cada deploy e não dependem de nada.
- **119 → 120 → 121**: a modularização só é segura com lint, cobertura confiável e e2e como rede.
- **123 e 124** dependem de decisões externas (PSP, contador, provedor fiscal). Vale abrir essas conversas já, em paralelo às ondas técnicas.
- **125** é independente e pode entrar em qualquer janela.

## Decisões que só o dono pode tomar (bloqueiam aprovação)

| SDD | Decisão |
|-----|---------|
| 116 | Plano atual da Supabase (já inclui backup?) e onde guardar os dumps |
| 122 | Os originais de `assets/images_backup` existem fora do repositório? |
| 123 | Qual PSP; totem exige pagamento antes de produzir? |
| 124 | Regime tributário, provedor fiscal, certificado A1 e quando a nota é emitida |

## Avaliado e deixado de fora

- **iFood/marketplaces e entrega própria**: fora por decisão do cliente já registrada na análise de concorrentes.
- **TEF/maquininha integrada**: exige hardware e homologação; reavaliar depois da 123.
- **LGPD**: já há consentimento no cadastro e no pedido online, opt-out e anonimização no Admin (`pedidos.html`, `js/cardapio-cliente-pedido.js`, `js/admin/clientes-admin.js`); não foi encontrada lacuna que justifique SDD própria nesta leitura.
- **Framework de front / TypeScript**: custo alto sem ganho para a operação; a 121 resolve o acoplamento com módulos ES.

## Limites desta análise

- Feita só sobre o repositório. Não houve acesso ao banco de produção, ao painel da Supabase, ao GitHub (alertas de CodeQL/Dependabot) nem às telas rodando.
- O número de cobertura vem do relatório salvo em `coverage/` (2026-10-26), não de uma execução nova.
- A evidência da 125 é contagem de atributos, não auditoria; a auditoria é o primeiro requisito da própria SDD.
