# [FIX] CAF-000079 — Pix no admin (salvar/testar) e taxas por forma de pagamento no fechamento de caixa

> **Status:** Rascunho
> **Autor:** Claude (auditoria 2026-10-20) · **Revisor:** Natanael · **Criada em:** 2026-10-20 · **Atualizada em:** 2026-10-20

## Detalhes da Atividade

- **O que precisa ser feito:** Corrigir a aba de configurações Pix do admin, onde salvar mostra erro e "Testar Pix" quebra. Garantir também que o fechamento de caixa (CAF-000044) volte a exibir taxas e valor líquido por forma de pagamento, como a CAF-000039 especificou.
- **Problema e evidência:**
  1. **Salvar Pix mostra erro, embora tenha salvo.** Depois do `upsert` em `configuracoes_sistema`, o código chama `window.cafeteriaPix.getPixConfig(true)` (`js/admin/settings.js:592-593`). Essa função não existe: o módulo exporta `obterConfigPix` e `atualizarCacheConfigPix` (`js/pix-brcode.js:372-380`). O `TypeError` cai no `catch` e o admin vê "Não foi possível salvar configurações Pix", mesmo com o upsert concluído. O cache do Pix também não é renovado.
  2. **"Testar Pix" quebra.** O código chama `window.cafeteriaPix.gerarPayload({ chave, nomeRecebedor, cidade, valor, txid })` (`js/admin/settings.js:618-624`). A função real é `gerarPayloadPix({ chave, recebedor, cidade, valor, txid })` (`js/pix-brcode.js:114`), com o parâmetro `recebedor`, não `nomeRecebedor`. Ela devolve um objeto `{ ok, payload, erro, ... }`, não uma string. O código ainda passa o retorno direto para `gerarQrSvg(brCode, 4)` (`settings.js:625`). O botão lança `TypeError` e não mostra QR nem mensagem.
  3. **Taxas sumiram do fechamento de caixa.** As duas migrations definem `public.fn_calcular_totais_caixa_interno(p_caixa_id UUID)`:
     - `migration_caf_000039_pix_taxas.sql:249` inclui `total_taxas` e `total_liquido` por forma de pagamento.
     - `migration_caf_000044_caixa_fix.sql:143` não inclui esses campos.
     Aplicadas em ordem numérica, a 044 sobrescreve a 039. A tela (`js/admin/caixa-admin.js:196-214`) cai no fallback `total_taxas ?? 0`, então a coluna Taxa aparece zerada e o Líquido fica igual ao Bruto (`caixa-admin.js:320-327`). Qual versão está em produção depende da ordem real de aplicação, que precisa ser confirmada (D01).
  4. Depósitos e recebimentos da conta do cliente (fiado/créditos, CAF-000034) também não entram no caixa. Isso é tratado na **CAF-000083** e só é citado aqui porque altera a mesma função de totais.
- **Impacto de não fazer:** O gestor acha que a configuração Pix não salvou e repete a operação. Ele também não consegue validar o QR antes de usar no balcão. No caixa, a diferença entre o recebido e o líquido das maquininhas fica invisível e distorce a conferência e o fluxo de caixa.
- **Para quem é destinado:** Admin/gestor (configurações e fechamento de caixa).
- **História de usuário:** Como gestor, quero salvar e testar minha chave Pix e ver no fechamento de caixa quanto as taxas de cada forma de pagamento descontaram, para conferir o líquido que de fato entra na conta.
- **Como saberemos que deu certo:** Salvar Pix mostra sucesso sem erro no console. "Testar Pix" exibe um QR cujo BR Code passa na validação de CRC16. O fechamento de um caixa com vendas em cartão mostra Taxa > 0 e Líquido = Bruto − Taxa por forma, batendo com `SUM(taxa_valor)` de `fechamento_pagamentos`.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Em `settings.js`, substituir `getPixConfig(true)` por `obterConfigPix(true)` (ou `atualizarCacheConfigPix` com os valores salvos). Mostrar sucesso apenas se o upsert não retornou erro; falha de cache não pode virar erro de salvamento | P0 | CA01 |
| RF02 | Em `settings.js`, usar `gerarPayloadPix({ chave, recebedor, cidade, valor: 1, txid: 'TESTE01' })`. Tratar `ok === false` com toast exibindo `erro` e passar `res.payload` para `gerarQrSvg` | P0 | CA02, CA03 |
| RF03 | Criar migration que redefine `fn_calcular_totais_caixa_interno` unindo as correções da 044 (cálculo cego/real) aos campos `total_taxas` e `total_liquido` por forma da 039, e que seja a última definição aplicada | P0 | CA04 |
| RF04 | A função de totais deve usar a taxa congelada no momento do pagamento (`fechamento_pagamentos.taxa_valor`/`valor_liquido`, `pedidos.taxa_pagamento_valor`), não a taxa atual da tabela `formas_pagamento_taxas` | P0 | CA05 |
| RF05 | A pré-visualização do teste exibe também o BR Code copiável e informa a chave normalizada (CPF/telefone/e-mail/EVP) | P1 | CA02 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Nenhuma chamada a método inexistente de `window.cafeteriaPix`, garantida por teste que compara os métodos usados em `js/**` com as chaves exportadas | P0 | CA06 |
| RNF02 | Migration idempotente (`CREATE OR REPLACE`), com nome numerado após a 044 e sem depender da ordem de aplicação manual | P0 | CA04 |
| RNF03 | O fechamento de caixa continua cego para o operador (CAF-000044): taxas e líquido só aparecem para quem tem permissão de ver o resultado | P0 | CA07 |

### Dependências técnicas

- **CAF-000072**: baseline do schema de produção (qual versão de `fn_calcular_totais_caixa_interno` está ativa: seção `2_corpo` do diagnóstico, termo `taxa`).
- **CAF-000083**: entrada de depósitos/recebimentos de conta do cliente no caixa (mesma função de totais; implementar em sequência para evitar conflito).
- `js/admin/settings.js` (≈560-640), `js/pix-brcode.js`, `js/admin/caixa-admin.js`, `supabase/migration_caf_000039_pix_taxas.sql`, `supabase/migration_caf_000044_caixa_fix.sql`.

### Recursos necessários

- Chave Pix real da cafeteria (ou chave de teste) para validar o QR em um app bancário.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dada uma chave Pix válida, quando clico em Salvar, então vejo "Configurações Pix salvas com sucesso!", não há erro no console e a próxima geração de QR no PDV usa os dados novos sem recarregar a página.
- [ ] **CA02:** Dada a chave preenchida, quando clico em "Testar Pix", então aparece o QR de R$ 1,00 e o BR Code. O CRC16 dos últimos 4 caracteres confere com `crc16CCITT` do restante.
- [ ] **CA03:** Dada uma chave inválida (ex.: CPF com dígito errado), quando clico em "Testar Pix", então aparece o toast de erro retornado por `gerarPayloadPix` e nenhum QR é exibido.
- [ ] **CA04:** Dado um caixa com R$ 100 em crédito (taxa 3%) e R$ 50 em Pix (taxa 0%), quando o admin vê o resultado do fechamento, então Crédito mostra Taxa R$ 3,00 e Líquido R$ 97,00, e Pix mostra Taxa R$ 0,00 e Líquido R$ 50,00.
- [ ] **CA05:** Dado que a taxa do crédito mudou de 3% para 4% depois das vendas, quando reabro o resultado do mesmo caixa, então a taxa continua R$ 3,00 (histórico congelado).
- [ ] **CA06:** Dado o código-fonte, quando roda o teste de contrato do módulo Pix, então nenhum arquivo chama `cafeteriaPix.<método>` que não esteja exportado.
- [ ] **CA07 (negativo):** Dado um operador sem permissão de ver o resultado, quando fecha o caixa cego, então não vê totais, taxas nem líquido antes de informar a contagem.

## O que a atividade não inclui

- Pix dinâmico com confirmação automática de pagamento (PSP/webhook): motivo: nova integração (gap de paridade), com SDD própria.
- Depósitos da conta do cliente no caixa: motivo: tratado na CAF-000083.

### Considerado para o futuro (P2)

- Conciliação das taxas com o extrato da adquirente.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual versão de `fn_calcular_totais_caixa_interno` está ativa em produção, a da 039 (com taxas) ou a da 044? (diagnóstico, seção 2) | dev | Sim | |
| D02 | As taxas por forma devem aparecer também no relatório de vendas (CAF-000014) ou só no caixa? | PO | Não | |

## Sugestões de casos de teste

Arquivo obrigatório: `tests/caf-000079-pix-admin-e-taxas-caixa.test.js`. Ele carrega `js/pix-brcode.js` e o trecho de configurações de `js/admin/settings.js` reais em `happy-dom`, simula os cliques em Salvar e Testar e verifica toasts e DOM. Também testa o parser de totais de `js/admin/caixa-admin.js` com o retorno da RPC. Os casos SQL (CA04, CA05) ficam em `supabase/tests/caf-000079.sql`.

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Salvar Pix | integração (DOM + mock) | CA01 | Preencher campos e clicar em Salvar | Toast de sucesso; `obterConfigPix(true)` chamado |
| CT02 | Testar Pix válido | integração (DOM) | CA02 | Clicar em Testar com chave válida | SVG renderizado; CRC confere |
| CT03 | Testar Pix inválido | integração (DOM) | CA03 | Chave inválida | Toast de erro; sem SVG |
| CT04 | Taxas e líquido no caixa | manual (SQL) + integração | CA04 | Inserir vendas de teste e chamar a função; renderizar o retorno no caixa-admin | Valores por forma corretos |
| CT05 | Taxa congelada | manual (SQL) | CA05 | Alterar a taxa e recalcular | Valor histórico mantido |
| CT06 | Contrato do módulo Pix | unit | CA06 | Varrer `js/**` por `cafeteriaPix.\w+` e comparar com os exports | Nenhum método inexistente |
| CT07 | Caixa cego | integração | CA07 | Renderizar fechamento como operador | Totais ocultos |

## URL Complementar

- Documentação técnica: `SDD/CONCLUIDAS/CAF-000039-pix-qr-code-e-taxas-de-pagamento.md`, `SDD/CONCLUIDAS/CAF-000044-fechamento-de-caixa-cego-e-correcoes.md`, `supabase/diagnostico_schema_producao.sql`
- Protótipo / mockup: N/A
- Discussões relacionadas: auditoria de SDDs concluídas (2026-10-20)
- Referências de design: N/A
- Requisitos originais: CAF-000039, CAF-000044
- Issue / PR relacionado: —
