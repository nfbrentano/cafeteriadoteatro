# Plano de evolução (CAF-000115 a CAF-000125)

> Origem: leitura do repositório em 2026-11-10 (código, migrations, testes, CI e SDDs 001–114).
> **CAF-000115 a CAF-000119** estão **Concluídas** (em `SDD/CONCLUIDAS/`). As demais SDDs (`CAF-000120` a `CAF-000125`) permanecem em **Rascunho**, aguardando revisão.

## Leitura geral

O produto está funcionalmente maduro: PDV, KDS, Totem, pedido do cliente, estoque com lotes, financeiro com DRE, CRM e permissões já existem, com 118 SDDs concluídas e testes de front e de banco no CI. O que falta agora é menos "mais uma tela" e mais **sustentação**: saber quando algo quebra, conseguir recuperar o banco, impedir que código de terceiros rode nas telas de caixa e reduzir o custo de mexer em arquivos de 5–6 mil linhas. Do lado de produto, as duas lacunas grandes são as que as análises anteriores deixaram de fora de propósito: **confirmação automática de Pix** e **NFC-e**.

## O que precisa melhorar

| Ordem | SDD | Status | Tipo | Tema | Evidência principal | Esforço | Depende de |
|-------|-----|--------|------|------|---------------------|---------|------------|
| 1 | [CAF-000116](CONCLUIDAS/CAF-000116-backup-restauracao-e-runner-de-migrations.md) | Concluída | CHORE | Backup restaurável, runner de migrations e rollbacks 103–113 | Sem rotina de backup; rollbacks só até a 083; migration 103 esqueceu o registro (`2a3d75e`) | M | — |
| 2 | [CAF-000115](CONCLUIDAS/CAF-000115-observabilidade-erros-front-em-producao.md) | Concluída | CHORE | Captura de erros do front e painel no Admin | Nenhum `onerror`/`unhandledrejection`; defeito de RPC só visto em produção (`94d6b99`) | P | — |
| 3 | [CAF-000117](CONCLUIDAS/CAF-000117-seguranca-front-csp-sri-versoes-cdn-dependabot.md) | Concluída | FIX | CSP, SRI e versões fixas de CDN, Dependabot | `supabase-js@2` e `chart.js` sem versão fixa, 0 `integrity`, 0 CSP | M | — |
| 4 | [CAF-000118](CONCLUIDAS/CAF-000118-pwa-service-worker-precache-e-versionamento.md) | Concluída | FIX | Service worker gerado no build | Precache manual sem Totem, Retirada, Admin e `js/utils/`; versão `v15` manual | P | — |
| 5 | [CAF-000122](CAF-000122-higiene-do-repositorio-ci-e-readme.md) | Rascunho | CHORE | Higiene do repositório, Node do CI, README | 54 MB de `images_backup` publicados; `supabase/.temp` versionado; CI em Node 20 | P | — |
| 6 | [CAF-000119](CONCLUIDAS/CAF-000119-qualidade-eslint-e-cobertura-real-no-ci.md) | Concluída | CHORE | ESLint e cobertura real com piso no CI | Sem lint; relatório de cobertura com 20% e 23 arquivos em 0% | M | — |
| 7 | [CAF-000120](CAF-000120-testes-e2e-fluxos-criticos-navegador-real.md) | Rascunho | CHORE | E2E em navegador real com banco local | Front testado com mock e banco isolado; nada testa os dois juntos | M | 116 |
| 8 | [CAF-000121](CAF-000121-modularizacao-pdv-e-admin.md) | Rascunho | REFACTOR | Modularizar `pedidos.js` (6.381 linhas) e `admin.html` (5.087) | Toda feature recente toca os mesmos dois arquivos | G | 119, 120 |

## O que seria importante ter

| Ordem | SDD | Tipo | Tema | Por que | Esforço | Depende de |
|-------|-----|------|------|---------|---------|------------|
| 9 | [CAF-000123](CAF-000123-pix-dinamico-com-confirmacao-automatica.md) | FEAT | Pix dinâmico com confirmação automática | Hoje o barista confere o Pix no app do banco; o totem não se sustenta sozinho | G | 115; decisão de PSP |
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
