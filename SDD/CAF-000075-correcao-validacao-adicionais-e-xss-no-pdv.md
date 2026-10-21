# [FIX] CAF-000075 — Fonte única de vínculo de adicionais, revalidação no servidor e XSS no PDV

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Usar uma única fonte de verdade para "quais adicionais cada produto aceita", revalidar essa regra no servidor em **todas** as RPCs que criam ou alteram pedidos, e eliminar a interpolação de HTML sem escape no modal de montagem e nos `onclick` do PDV.
- **Problema e evidência:**
  - **Duas fontes de vínculo divergentes:**
    - O admin grava em `adicional_vinculos`, por produto ou categoria (`js/db.js:222-289`).
    - O PDV e o cardápio leem a view `v_adicionais_produto`, derivada de `adicional_vinculos` (`js/pedidos.js:1202`, `js/cardapio-cliente-pedido.js:200`).
    - O totem lê `produto_adicionais_permitidos` (`js/totem.js:296`). Essa tabela existe só em produção e não está em nenhuma migration (ver CAF-000072).
    - As RPCs `criar_pedido_cliente` (`migration_caf_000037_qr_pedidos_cliente.sql:260-272`), `criar_pedido_online` (`migration_caf_000038_pedido_online.sql:370-380`), `criar_pedido_totem` (`migration_caf_000040_totem.sql:395-405`) e `adicionar_itens_pedido` (`migration_caf_000027_conclusao_estacao.sql:238`, `migration_caf_000028_itens_lancados_depois.sql:163`) também validam contra `produto_adicionais_permitidos`.
    - Consequência: o vínculo configurado no admin não vale para totem, QR, pedido online e adição de itens.
  - **Regra permissiva:** essas RPCs só recusam um adicional quando o produto tem **algum** vínculo (`COUNT(*) > 0 AND NOT permitido`). Um produto sem vínculos aceita qualquer adicional, inclusive quando `permite_adicionais = false`.
  - **Regressão no `criar_pedido`:** a validação via `v_adicionais_produto` existia em `migration_caf_000020_vinculo_adicionais.sql:134` e `:247`, mas as redefinições posteriores de `criar_pedido` (migrations 021, 026, 027, 029, 033, 034) não a mantêm. O CA da 020b ("API com Cheddar no Cappuccino é recusada") não vale mais.
  - **XSS no modal de montagem:** `js/pedidos.js:1922-1923` interpola `ad.nome` sem `escapeHtml` em `data-nome` e no label. Um adicional cadastrado com `<img src=x onerror=...>` executa script no aparelho do barista.
  - **`onclick` com texto interpolado:**
    - `js/pedidos.js:3765` usa `'${currentSelectedMesaParaConta.mesaCodigo}'` dentro de um atributo `onclick`. Um código de mesa com apóstrofo quebra o botão ou injeta JS.
    - `js/pedidos.js:4624` usa `escapeHtml` dentro de um literal JS em `onclick`. Isso escapa para HTML, mas não para string JS: um nome com `'` quebra o handler.
- **Impacto de não fazer:** Pedidos com adicionais indevidos e preço errado em totem, QR e online; configuração do admin ineficaz; possível execução de script no PDV (sequestro de sessão do barista); botões de cancelar item e QR Pix quebrando com certos nomes.
- **Para quem é destinado:** Admin que configura o cardápio; cliente (totem/QR/online); barista no PDV.
- **História de usuário:** Como admin, quero que o adicional que vinculei a um produto seja o único aceito em todos os canais, para não vender combinações erradas nem cobrar preço indevido.
- **Como saberemos que deu certo:**
  - 100% das RPCs de criação e alteração de pedido recusam adicional não vinculado (teste por RPC).
  - 0 interpolações de dados de banco em `innerHTML` ou `onclick` sem escape nos arquivos tocados (verificação por teste/lint).

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Definir `adicional_vinculos` + `v_adicionais_produto` como **única** fonte. Migrar o conteúdo de `produto_adicionais_permitidos` para `adicional_vinculos` (só o que faltar) e, no fim, substituí-la por uma view de compatibilidade ou removê-la | P0 | CA01, CA02 |
| RF02 | Criar a função `fn_validar_adicionais_item(p_produto_id TEXT, p_adicionais JSONB) RETURNS NUMERIC` (retorna o total dos adicionais), que recusa quando o produto tem `permite_adicionais = false` e recebeu adicional, ou quando o adicional não está em `v_adicionais_produto` para o produto, ou está inativo | P0 | CA03, CA04 |
| RF03 | Chamar `fn_validar_adicionais_item` em `criar_pedido`, `adicionar_itens_pedido`, `criar_pedido_cliente`, `criar_pedido_online` e `criar_pedido_totem`. O preço do adicional vem sempre do banco | P0 | CA03, CA05 |
| RF04 | `js/totem.js:296` passa a ler `v_adicionais_produto` | P0 | CA02 |
| RF05 | Escapar `ad.nome` (atributo e texto) em `js/pedidos.js:1920-1925` com `window.escapeHtml` | P0 | CA06 |
| RF06 | Trocar `onclick` com strings interpoladas (`js/pedidos.js:3765`, `:4624` e outros encontrados por busca de `onclick="window.` com `${`) por `data-*` + `addEventListener`, ou por delegação de eventos | P0 | CA07 |
| RF07 | Mensagem de erro amigável nos canais (PDV, totem, QR, online) quando o servidor recusar um adicional, indicando item e adicional | P1 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | A validação de adicionais não aumenta em mais de 50 ms o tempo de `criar_pedido` com 10 itens | P1 | CA03 |
| RNF02 | Nenhum dado vindo do banco ou do usuário é interpolado em HTML sem `escapeHtml` nem em handler inline nos arquivos alterados | P0 | CA06, CA07 |
| RNF03 | A migração de vínculos é idempotente e não remove vínculo existente em `adicional_vinculos` | P0 | CA01 |

### Dependências técnicas

- **CAF-000072 (bloqueante):** DDL e conteúdo atuais de `produto_adicionais_permitidos` e corpo atual de cada RPC em produção.
- `supabase/migration_caf_000020_vinculo_adicionais.sql`, 027, 028, 037, 038 e 040.
- `js/pedidos.js`, `js/totem.js`, `js/cardapio-cliente-pedido.js`, `js/db.js`.
- CAF-000086 (contrato) e a SDD de testes de canais do cliente.

### Recursos necessários

- Lista de vínculos esperados (produto/categoria × adicional), validada pelo PO.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado os vínculos atuais nas duas tabelas, quando a migração rodar, então todo par de `produto_adicionais_permitidos` passa a existir em `v_adicionais_produto` e nenhum vínculo de `adicional_vinculos` é perdido.
- [ ] **CA02:** Dado que o admin vincula "Leite vegetal" à categoria Cafés quentes, quando o cliente abrir o Cappuccino no totem, no QR e no pedido online, então "Leite vegetal" aparece nos três canais.
- [ ] **CA03:** Dado um Cappuccino sem vínculo com Cheddar, quando qualquer uma das 5 RPCs receber Cheddar nesse item, então a RPC recusa com "Adicional não permitido" e nada é gravado.
- [ ] **CA04:** Dado um produto com `permite_adicionais = false` e **sem** nenhum vínculo, quando uma RPC receber qualquer adicional, então recusa (não pode haver mais aceite permissivo).
- [ ] **CA05:** Dado um payload com preço de adicional adulterado (ex.: R$ 0,01), quando o pedido for criado, então o preço gravado é o do banco.
- [ ] **CA06:** Dado um adicional com nome `<img src=x onerror=alert(1)>`, quando o barista abrir o modal de montagem, então o texto aparece literal e nenhum script executa.
- [ ] **CA07:** Dado uma mesa com código `Mesa D'Ávila` ou uma parte chamada `João's`, quando o barista clicar em "Cancelar item" ou "QR Pix", então a ação executa com os valores corretos, sem erro de JS.
- [ ] **CA08:** Dado que o servidor recusou um adicional, quando a resposta chegar ao canal, então aparece mensagem com o item e o adicional, e o carrinho continua intacto.

## O que a atividade não inclui

- Limite de quantidade por adicional (ex.: máximo 2 shots): motivo: nova regra de negócio, P2.
- Content-Security-Policy no site: motivo: iniciativa de segurança mais ampla (CAF-000082/P2).

### Considerado para o futuro (P2)

- Grupos de adicionais com mínimo e máximo (ex.: "escolha 1 leite").
- CSP sem `unsafe-inline` depois de eliminar todos os handlers inline.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | `produto_adicionais_permitidos` tem vínculos que **não** estão em `adicional_vinculos`? Quem os mantém hoje? | dev/PO | Sim | |
| D02 | Produto com `permite_adicionais = true` e sem vínculo deve aceitar nenhum adicional (proposta) ou todos? | PO | Sim | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Migração de vínculos | integração (Supabase local) | CA01 | Popular as duas fontes e rodar a migration | União sem perdas |
| CT02 | Canais leem a mesma fonte | unit + mock | CA02 | Mock de `v_adicionais_produto`; renderizar totem, QR e online | Mesmo conjunto de adicionais |
| CT03 | Recusa por RPC | integração | CA03 | Chamar as 5 RPCs com adicional não vinculado | 5 recusas |
| CT04 | Sem vínculo e não permite | integração | CA04 | Produto sem vínculo + adicional | Recusa |
| CT05 | Preço adulterado | integração | CA05 | Payload com preço R$ 0,01 | Preço do banco |
| CT06 | XSS no modal | unit DOM (happy-dom) | CA06 | Adicional com payload HTML; abrir o modal | Texto literal; nenhum `<img>` criado |
| CT07 | Apóstrofo em onclick | unit DOM | CA07 | Mesa e parte com `'`; clicar nos botões | Handler recebe os valores corretos |
| CT08 | Erro amigável | unit DOM | CA08 | Mock de RPC com erro de adicional | Mensagem com item e adicional |

## URL Complementar

- Documentação técnica: `js/pedidos.js:1900-1930, 3760-3770, 4620-4626`; `js/totem.js:290-300`; migrations 020, 027, 028, 037, 038, 040
- Requisitos originais: CAF-000020 (vínculo de adicionais), CAF-000023 (apóstrofo)
- Issue / PR relacionado: CAF-000072, CAF-000082, CAF-000086
