# [FIX] LGPD e exportações: consentimento, Consent Mode do GA, política de privacidade, canal do titular e injeção em CSV

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-24

## Detalhes da Atividade

- **O que precisa ser feito:** Separar o uso de dados necessário para entregar o pedido do consentimento para marketing, carregar o Google Analytics só depois de o visitante aceitar, publicar uma política de privacidade com canal para o titular pedir cópia ou exclusão dos dados, e tornar seguras as exportações CSV do admin.
- **Problema e evidência:**
  - Pedido online: o checkbox vem marcado e é obrigatório (`js/cardapio-cliente-pedido.js:511` `id="check-lgpd-online" checked required`), o texto fala só em "confirmação do pedido e histórico" (`:512`) e o envio manda sempre `aceita_lgpd: true` (`:1273`). O servidor também assume `true` se o campo faltar (`supabase/migration_caf_000038_pedido_online.sql:203` `COALESCE(..., true)`) e grava o valor em `clientes.aceita_contato` (`:221-231`), que é o filtro das campanhas de WhatsApp (`js/db.js:1069-1070` `query.eq('aceita_contato', true)`). Para cliente existente a regra é `aceita_contato = v_aceita_lgpd OR aceita_contato` (`:231`): uma vez `true`, o pedido nunca desfaz. Ou seja, todo cliente do pedido online entra na base de marketing sem ter escolhido isso.
  - Demais canais (conferido): o cadastro do PDV usa checkbox desmarcado (`pedidos.html:820`, `js/pdv/clientes.js:254`); QR da mesa e totem não gravam `clientes`; a avaliação tem seu próprio `aceita_contato` com padrão `false` (`supabase/migration_caf_000042_avaliacoes.sql:186`). O problema está só no pedido online.
  - Google Analytics carrega em toda visita sem consentimento: `index.html:7-8` e `cardapio.html:7-8` incluem `gtag/js` e `js/gtag-init.js:6` chama `gtag('config', 'G-DWC0E8ZFJ5')` direto. Não há banner, nem Consent Mode, nem página de política de privacidade em nenhum HTML (busca por "privacidade" não encontra página).
  - O titular não tem canal: `anonimizar_cliente` só pode ser chamada por admin (`supabase/migration_caf_000033_cadastro_clientes.sql:407-418`).
  - A tabela `acessos` tem as colunas `ip` e `user_agent` em produção (`tests/fixtures/schema-snapshot.json`), mas nenhuma migration as cria e o único insert grava só `pagina` (`js/db.js:650-652`). São colunas mortas que guardariam dado pessoal sem finalidade.
  - Injeção de fórmula em CSV: a exportação de clientes só troca aspas (`js/admin/clientes-admin.js:1777` `` `"${(c.nome || '').replace(/"/g, '""')}"` ``), e os demais `escapeCSV` (`js/utils/csv-export.js:7-13`, cópias locais em `js/admin/products.js:965-972` e `js/admin/pedidos-admin.js:208`) não neutralizam valores iniciados por `= + - @`, tab ou CR. O nome do cliente vem do pedido público, então qualquer pessoa pode gravar `=HYPERLINK(...)` que vira fórmula no Excel do dono.
  - A checagem de papel da exportação falha aberta: `js/admin/clientes-admin.js:1760` `const role = window.admin?.session?.user?.role || 'admin';`.
- **Impacto de não fazer:** Base de marketing com consentimento inválido (art. 8º da LGPD exige manifestação livre e destacada; consentimento pré-marcado não serve); coleta de dados de navegação sem base legal; titular sem como exercer direitos do art. 18; risco de execução de fórmula no computador do administrador.
- **Para quem é destinado:** Cliente do pedido online e visitante do site (titulares); dono/admin (controlador, que responde pela base e exporta dados).
- **História de usuário:** Como cliente, quero fazer meu pedido sem ser obrigado a aceitar mensagens de marketing e poder pedir meus dados ou a exclusão deles, para confiar na cafeteria.
- **Como saberemos que deu certo:** 0 clientes novos com `aceita_contato = true` sem marcação explícita no pedido online; 0 requisições ao Google Analytics antes de o visitante aceitar (verificável na aba Rede); 100% das exportações CSV com valores perigosos prefixados.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Pedido online sem checkbox obrigatório: texto informativo de que nome e WhatsApp são usados para executar o pedido (base legal: execução de contrato) com link para a política | P0 | CA01 |
| RF02 | Checkbox opcional, desmarcado, "Quero receber novidades e promoções pelo WhatsApp"; o front envia `aceita_marketing` com o valor real | P0 | CA02, CA03 |
| RF03 | `criar_pedido_online` passa a ler `aceita_marketing` com padrão `false`; para cliente existente, só muda `aceita_contato` de `false` para `true` quando a marcação vier explícita, nunca o contrário por omissão (alinhado à CAF-000131) | P0 | CA02, CA03, CA04 |
| RF04 | Consent Mode v2 do GA: `analytics_storage`, `ad_storage`, `ad_user_data` e `ad_personalization` negados por padrão; banner com "Aceitar" e "Recusar" de mesmo peso; escolha guardada e alterável pelo rodapé | P0 | CA05, CA06 |
| RF05 | Página `/privacidade` com controlador, encarregado (nome e contato), dados coletados, finalidade, base legal, retenção, compartilhamento (Supabase, Google) e direitos do titular; link no rodapé de todas as páginas públicas e no checkout | P0 | CA07 |
| RF06 | Canal do titular: formulário na página de privacidade que registra pedido de "cópia dos dados" ou "exclusão" via RPC `solicitar_direito_titular`, com verificação por código enviado ao WhatsApp cadastrado; admin vê a fila e executa (exportar JSON ou `anonimizar_cliente`) | P1 | CA08, CA09 |
| RF07 | Remover as colunas `acessos.ip` e `acessos.user_agent` (após confirmar em produção que estão vazias) | P1 | CA10 |
| RF08 | `escapeCSV` único em `js/utils/csv-export.js` que prefixa `'` em valores iniciados por `=`, `+`, `-`, `@`, tab ou CR, usado por todas as exportações do admin (clientes, produtos, pedidos, itens, estoque, perdas, DRE, despesas, relatórios) | P0 | CA11, CA12 |
| RF09 | Exportação de clientes fail-closed: sem sessão ou sem papel admin, bloqueia | P0 | CA13 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma requisição a `google-analytics.com`/`googletagmanager.com` com `analytics_storage` concedido antes do aceite | P0 | CA05 |
| RNF02 | `solicitar_direito_titular` limitado a 3 pedidos por telefone por dia e sem revelar se o telefone existe na base | P0 | CA09 |
| RNF03 | Banner acessível por teclado, contraste WCAG AA e sem bloquear o conteúdo | P1 | CA06 |
| RNF04 | Banner e página de privacidade sem scripts inline (CSP da CAF-000117) | P0 | CA05, CA07 |

### Dependências técnicas

- `criar_pedido_online` (038), `clientes.aceita_contato`, `anonimizar_cliente` (033), campanhas do CRM (CAF-000041).
- CAF-000126 (guarda NULL-safe em `anonimizar_cliente`, que hoje usa `v_role != 'admin'`) e CAF-000131 (pedidos públicos), que também alteram `criar_pedido_online`: combinar a ordem das migrations.
- CAF-000141 (retenção e expurgo) para os prazos citados na política.

### Recursos necessários

- Nome e contato do encarregado (DPO), razão social/CNPJ do controlador e prazos de retenção definidos pelo dono.
- Texto da política revisado pelo dono (de preferência por assessoria jurídica).

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado o checkout do pedido online, quando o cliente envia sem marcar nada, então o pedido é criado normalmente e a tela mostra o aviso de uso de dados com link para `/privacidade`.
- [x] **CA02:** Dado um telefone novo, quando o pedido é enviado sem marcar "receber novidades", então o cliente é criado com `aceita_contato = false`.
- [x] **CA03:** Dado um telefone novo, quando o cliente marca "receber novidades", então o cliente é criado com `aceita_contato = true`.
- [x] **CA04:** Dado um cliente existente com `aceita_contato = false`, quando chega um payload antigo sem o campo `aceita_marketing` (ou com `aceita_lgpd: true`), então `aceita_contato` continua `false`.
- [x] **CA05:** Dado um visitante novo, quando abre `index.html` ou `cardapio.html` e não responde ao banner, então nenhuma coleta do GA com armazenamento concedido é feita e nenhum cookie `_ga` é criado.
- [x] **CA06:** Dado o banner, quando o visitante clica "Recusar", então o banner some, a escolha persiste ao recarregar e o GA segue negado; quando clica "Aceitar", o consentimento é atualizado para `granted`.
- [x] **CA07:** Dado qualquer página pública, quando procuro no rodapé, então existe link para `/privacidade`, que carrega com os itens do RF05 preenchidos.
- [x] **CA08:** Dado um titular com cadastro, quando pede exclusão e confirma o código recebido, então a solicitação aparece no admin e, ao executar, o cliente fica anonimizado.
- [x] **CA09:** Dado um telefone sem cadastro ou já com 3 pedidos no dia, quando é feita nova solicitação, então a resposta é a mesma mensagem genérica e nenhum dado é revelado (caso negativo).
- [x] **CA10:** Dado o banco migrado, quando consulto `information_schema.columns` de `acessos`, então `ip` e `user_agent` não existem e o registro de visitas continua funcionando.
- [x] **CA11:** Dado um cliente com nome `=HYPERLINK("http://x","clique")`, quando o admin exporta clientes, então a célula sai como `'=HYPERLINK(...)` (texto, sem fórmula).
- [x] **CA12:** Dado um valor negativo legítimo como `-12,50` em coluna numérica de valor, quando exportado, então permanece número (o prefixo só se aplica a colunas de texto livre).
- [x] **CA13:** Dado um usuário sem `role` carregado na sessão (ou barista), quando clica em exportar clientes, então recebe "Acesso restrito" e nenhum arquivo é gerado.

## O que a atividade não inclui

- Gestão de consentimento por finalidade além de marketing e analytics: motivo: hoje só existem essas duas finalidades opcionais.
- Revisão jurídica do texto: motivo: responsabilidade do dono; a SDD entrega estrutura e rascunho.
- Reconsentimento ativo da base existente (campanha pedindo confirmação): motivo: decisão de negócio (D02); a SDD só impede novos registros inválidos.
- Retenção/expurgo automático: motivo: CAF-000141.

### Considerado para o futuro (P2)

- Autoatendimento completo do titular (download do JSON sem passar pelo admin).
- Registro de consentimento com histórico (data, texto aceito, canal) em tabela própria.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Quem é o encarregado (DPO) e qual o e-mail/WhatsApp de contato do titular? | PO | Não | Encarregado LGPD Cafeteria do Teatro · Contato: `privacidade@cafeteriadoteatro.com.br` e WhatsApp institucional |
| D02 | Os clientes que hoje têm `aceita_contato = true` vindos só do pedido online devem ser zerados, mantidos ou reconfirmados? | PO | Não | Manter a base existente sem alterações retroativas, aplicando a exigência de opt-in explícito e desmarcado a partir desta implementação |
| D03 | O código de verificação do titular sai por WhatsApp (custo/integração) ou o pedido é conferido manualmente pelo admin? | PO/dev | Não | Protocolo de solicitação registrado via RPC pública com rate limit (3/dia); o admin visualiza a solicitação no painel para conferência antes de executar anonimização/exportação |
| D04 | Prazos de retenção a declarar na política (pedidos, clientes inativos, avaliações, erros) | PO | Não | 5 anos para pedidos e notas fiscais (obrigação legal fiscal); 2 anos de inatividade para contatos de marketing; 6 meses para métricas e logs |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Checkout sem marcação | integração (harness DOM de `cardapio-cliente-pedido.js`) | CA01, CA02 | Enviar pedido sem marcar | Payload com `aceita_marketing: false`; pedido criado |
| CT02 | Marketing marcado | integração | CA03 | Marcar e enviar | Payload `true` |
| CT03 | RPC sem o campo e cliente existente | pgTAP | CA02, CA04 | Chamar `criar_pedido_online` sem `aceita_marketing` | `aceita_contato` inalterado/false |
| CT04 | Consent Mode padrão | unit (import de `gtag-init.js` com `dataLayer` simulado) | CA05 | Carregar o módulo | Primeiro comando é `consent default denied` |
| CT05 | Banner aceitar/recusar | e2e (Playwright) | CA05, CA06 | Abrir home, inspecionar rede, clicar | Sem coleta antes; escolha persiste |
| CT06 | Página e rodapé | e2e | CA07 | Visitar páginas públicas | Link e seções presentes |
| CT07 | Solicitação do titular | pgTAP (`SET ROLE anon`) | CA08, CA09 | Solicitar, confirmar código, limite e telefone inexistente | Registro criado; mensagens iguais; limite aplicado |
| CT08 | Colunas removidas | pgTAP `hasnt_column` | CA10 | Rodar migration | Colunas ausentes |
| CT09 | `escapeCSV` | unit | CA11, CA12 | Valores com `= + - @ \t \r` e número negativo | Prefixo só em texto |
| CT10 | Exportação usa o utilitário | integração (harness do `clientes-admin.js`) | CA11 | Exportar lista com nome malicioso | CSV com `'=` |
| CT11 | Papel ausente | integração | CA13 | Sessão sem `role` | Toast de acesso restrito; sem download |

## URL Complementar

- Documentação técnica: `js/cardapio-cliente-pedido.js`, `js/gtag-init.js`, `js/utils/csv-export.js`, `js/admin/clientes-admin.js`, `supabase/migration_caf_000038_pedido_online.sql`, `supabase/migration_caf_000033_cadastro_clientes.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000033](CONCLUIDAS/CAF-000033-cadastro-de-clientes.md), [CAF-000038](CONCLUIDAS/CAF-000038-pedido-online-para-retirada.md), [CAF-000041](CONCLUIDAS/CAF-000041-crm-segmentacao-e-tags.md), [CAF-000016](CONCLUIDAS/CAF-000016-exportar-csv.md), [CAF-000117](CONCLUIDAS/CAF-000117-seguranca-front-csp-sri-versoes-cdn-dependabot.md); novas: CAF-000126, CAF-000131, CAF-000141
- Referências de design: Google, "Consent mode overview" (developers.google.com/tag-platform/security/concepts/consent-mode); OWASP, "CSV Injection"
- Requisitos originais: Lei 13.709/2018 (LGPD), arts. 7º, 8º, 18 e 41
- Issue / PR relacionado: —
