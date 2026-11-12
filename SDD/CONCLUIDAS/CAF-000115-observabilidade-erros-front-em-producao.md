# [CHORE] Observabilidade: captura de erros do front em produção e painel de saúde no Admin

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-11

## Detalhes da Atividade

- **O que precisa ser feito:** Registrar automaticamente os erros de JavaScript e as falhas de chamada ao Supabase (RPC/REST) que acontecem nas telas de operação (PDV, KDS, Totem, Admin, Cardápio com pedido) e mostrá-los ao administrador em um painel simples.
- **Problema e evidência:** Não existe nenhuma captura de erro no projeto: a busca por `window.onerror`, `unhandledrejection` e `sentry` em `js/` e nos `.html` não retorna nada. Os dois últimos commits de correção (`94d6b99` — colunas erradas na RPC `obter_dre_gerencial`; `2a3d75e` — registro faltando em `app_migrations`) são defeitos que só apareceram depois de publicados, e hoje o único canal para descobri-los é o operador avisar.
- **Impacto de não fazer:** Um erro no fechamento de conta ou no envio de pedido durante o intervalo do espetáculo passa despercebido até alguém reclamar; não há como saber frequência, tela ou versão afetada.
- **Para quem é destinado:** Administrador (dono) e desenvolvedor.
- **História de usuário:** Como administrador, quero ver os erros que aconteceram nas telas da operação, para corrigir antes que o problema se repita no próximo espetáculo.
- **Como saberemos que deu certo:** 100% dos erros não tratados e das RPCs com falha nas 5 telas de operação ficam registrados com tela, mensagem, versão e horário; o painel mostra os erros das últimas 24h em até 2 cliques.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Módulo `js/utils/error-reporter.js` captura `error` e `unhandledrejection` e envia para a RPC `registrar_erro_cliente` | P0 | CA01, CA02 |
| RF02 | Falhas de RPC/REST passam pelo mesmo registro (ponto único em `js/db.js`) com nome da RPC e código do erro | P0 | CA03 |
| RF03 | Tabela `erros_cliente` (tela, mensagem, stack resumida, versão do app, user agent, usuário se logado, criado_em) com RLS: insert via RPC, select só admin | P0 | CA04 |
| RF04 | Painel no Admin lista erros agrupados por mensagem, com contagem, última ocorrência e filtro por tela/período | P0 | CA05 |
| RF05 | Limite de envio por sessão (anti-enxurrada) e fila local quando offline | P1 | CA06 |
| RF06 | Limpeza automática de registros com mais de 30 dias | P1 | CA07 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | O registro não pode conter dados pessoais (nome, telefone, PIN) nem o corpo de requisições | P0 | CA08 |
| RNF02 | A captura não pode quebrar nem atrasar a tela: falha no envio é silenciosa e o envio é assíncrono | P0 | CA02 |
| RNF03 | Módulo carregado em todas as telas com menos de 3 KB | P1 | — |

### Dependências técnicas

- Nova migration `migration_caf_000115_erros_cliente.sql` (tabela, RPC `SECURITY DEFINER` com `search_path` fixo, policy admin).
- `js/db.js` (ponto único de chamadas), `js/utils/offline-queue.js` (fila), `js/admin/main.js` (nova aba).

### Recursos necessários

- Acesso ao projeto Supabase para aplicar a migration.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado que uma tela de operação está aberta, quando ocorre um erro não tratado, então uma linha é gravada em `erros_cliente` com tela, mensagem e versão.
- [x] **CA02:** Dado que a RPC de registro falha ou está offline, quando ocorre um erro, então a tela continua funcionando e nenhum novo erro é lançado.
- [x] **CA03:** Dado que uma RPC retorna erro, quando `db.js` trata a resposta, então o registro inclui o nome da RPC e o código do erro.
- [x] **CA04:** Dado um usuário anônimo ou barista, quando tenta ler `erros_cliente`, então recebe zero linhas.
- [x] **CA05:** Dado que existem erros nas últimas 24h, quando o admin abre o painel, então vê os erros agrupados com contagem e última ocorrência.
- [x] **CA06:** Dado um erro em laço, quando ele se repete mais de 10 vezes na sessão, então só as 10 primeiras ocorrências são enviadas.
- [x] **CA07:** Dado um registro com mais de 30 dias, quando a rotina de limpeza roda, então ele é removido.
- [x] **CA08:** Dado um erro cuja mensagem contém telefone ou PIN, quando é registrado, então esses valores aparecem mascarados.

## O que a atividade não inclui

- Serviço externo (Sentry e similares): motivo: custo e mais um fornecedor; a tabela própria resolve o volume atual.
- Alertas por WhatsApp/e-mail: motivo: prematuro; primeiro validar o volume real de erros.
- Métricas de performance (Web Vitals): motivo: outra iniciativa.

### Considerado para o futuro (P2)

- Alerta automático quando a taxa de erro de uma tela passar de um limite.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | De onde vem a "versão do app" (hash do build do Vite ou `CACHE_VERSION` do `sw.js`)? Relaciona-se com a CAF-000118 | dev | Não | Definida como fallback unificado `window.APP_VERSION = '1.0.0'` em `js/version.js` / reporter; será automatizada com hash no build na CAF-000118 |
| D02 | Retenção de 30 dias é suficiente? | PO | Não | Sim, suficiente e adequada. Função `limpar_erros_antigos(p_dias INT DEFAULT 30)` implementada na migration |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Erro não tratado é enviado | integração (harness) | CA01 | Carregar página no harness, disparar `ErrorEvent` | RPC chamada com tela e mensagem |
| CT02 | Falha no envio é silenciosa | unit | CA02 | Mock da RPC rejeitando | Nenhuma exceção propagada |
| CT03 | Falha de RPC registrada | integração | CA03 | Mock de RPC com erro em `db.js` | Registro com nome da RPC |
| CT04 | RLS de leitura | pgTAP | CA04 | `SELECT` como anon e barista | 0 linhas |
| CT05 | Agrupamento no painel | integração | CA05 | 3 erros iguais + 1 diferente | 2 grupos, contagem 3 e 1 |
| CT06 | Limite por sessão | unit | CA06 | Disparar 15 erros | 10 envios |
| CT07 | Limpeza de 30 dias | pgTAP | CA07 | Inserir registro antigo e rodar rotina | Registro removido |
| CT08 | Mascaramento | unit | CA08 | Mensagem com telefone | Valor mascarado |

## URL Complementar

- Documentação técnica: `js/db.js`, `js/utils/offline-queue.js`
- Protótipo / mockup: —
- Discussões relacionadas: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Referências de design: —
- Requisitos originais: —
- Issue / PR relacionado: commits `94d6b99`, `2a3d75e`
