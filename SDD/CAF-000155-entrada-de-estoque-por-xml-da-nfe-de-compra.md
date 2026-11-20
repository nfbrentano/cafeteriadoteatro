# [FEAT] Entrada de estoque por XML da NF-e de compra

> **Status:** Rascunho
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-20 · **Atualizada em:** 2026-11-20

## Detalhes da Atividade

- **O que precisa ser feito:** Permitir enviar no admin o arquivo XML da NF-e de compra. O sistema identifica o fornecedor pelo CNPJ, lista os itens da nota e liga cada um a um insumo do estoque (de-para memorizado por fornecedor), converte a unidade (ex.: caixa com 12 litros → 12 L), traz custo, lote e validade quando a nota informa, e com uma confirmação grava a entrada PEPS de todos os itens e a conta a pagar, numa única transação.
- **Problema e evidência:**
  - *Hoje no sistema:* a entrada de estoque é feita item a item num modal (`js/admin/estoque.js:514`, `openMovimentoModal`). Uma nota com 15 itens exige 15 lançamentos manuais, digitando quantidade, custo, lote e validade.
  - A conta a pagar da compra é criada pelo navegador numa chamada separada, antes do movimento, e um erro nela é só registrado no console (`js/admin/estoque.js:648-690`: `insert` em `despesas` e depois `criarMovimento`; `catch (fErr) { console.warn(...) }`). Pode haver entrada sem despesa ou despesa sem entrada.
  - A base já está pronta para receber os dados: `fornecedores.documento` (CNPJ), `estoque_itens.codigo_barras`, `estoque_movimentos` com `lote_codigo`, `validade`, `fornecedor_id` e `despesa_id`, `despesas.documento`, e o trigger que cria o lote PEPS na entrada (`supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql:63-114`, `fn_estoque_criar_lote_entrada`).
  - A importação de XML foi deixada de fora na CAF-000068 (`SDD/CONCLUIDAS/CAF-000068-lista-compras-fornecedor-e-entrada-estoque-financeiro.md:55`, porque muitos fornecedores locais não emitem NF-e) e listada como P2 na CAF-000111 (`SDD/CONCLUIDAS/CAF-000111-sugestao-inteligente-compras-lotes-validade-peps-estoque.md:82`). Os fornecedores maiores (laticínios, distribuidoras de café, embalagens) emitem NF-e e mandam o XML por e-mail.
  - *Mercado:* importar o XML da NF-e de compra é recurso padrão em ERPs brasileiros, como a importação em massa do Alterdata e a entrada de estoque do Tablet Cloud.
- **Impacto de não fazer:** Tempo de digitação e erros de custo, lote e validade; custo médio e CMV distorcidos (CAF-000032/113); PEPS com validade errada; contas a pagar perdidas.
- **Para quem é destinado:** Dono/gerente que recebe mercadoria.
- **História de usuário:** Como gerente, quero enviar o XML da nota do laticínio e confirmar em uma tela, para dar entrada nos 15 itens com lote, validade e conta a pagar sem digitar nada.
- **Como saberemos que deu certo:** Nota de 15 itens com de-para já memorizado lançada em até 1 minuto; 0 entradas sem despesa (ou o inverso) na importação; segunda nota do mesmo fornecedor com 100% dos itens já ligados automaticamente.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Upload de XML (NF-e modelo 55, layout 4.00) no admin; leitura no navegador (`DOMParser`) de emitente (CNPJ, razão social), número/série, chave de acesso, data, itens (`cProd`, `xProd`, `cEAN`, `uCom`, `qCom`, `vUnCom`, `vProd`), lotes (`rastro`: `nLote`, `dVal`), duplicatas (`dup`: vencimento e valor) e total | P0 | CA01, CA02 |
| RF02 | Fornecedor pelo CNPJ: existente é vinculado; inexistente é pré-cadastrado com razão social e CNPJ após confirmação | P0 | CA03 |
| RF03 | De-para `fornecedor_produto_mapa` (fornecedor, código do produto no fornecedor, EAN, `estoque_item_id`, fator de conversão, unidade): aplicado automaticamente e memorizado na confirmação; sugestão por EAN (`codigo_barras`) ou nome parecido quando não houver mapa | P0 | CA04, CA05 |
| RF04 | Conversão de unidade: quantidade no estoque = `qCom × fator`; custo unitário = `vProd ÷ (qCom × fator)` (rateando desconto, frete e outras despesas da nota se o admin escolher) | P0 | CA06 |
| RF05 | Itens da nota que não são estoque (ex.: material de limpeza) podem ser marcados como "não estocar" e vão só para a despesa | P1 | CA07 |
| RF06 | RPC `importar_nfe_compra(payload)` única e transacional: grava as entradas (com lote e validade), a(s) despesa(s) por duplicata (ou uma à vista), e o registro `nfe_compras` (chave de acesso única); tudo ou nada | P0 | CA08, CA09 |
| RF07 | Recusa de nota já importada (mesma chave de acesso) e de XML que não é NF-e ou cujo destinatário não é o CNPJ da cafeteria | P0 | CA10, CA11 |
| RF08 | Estorno de importação (com motivo e permissão), que gera saídas de ajuste e cancela as despesas ainda não pagas | P1 | CA12 |
| RF09 | Download automático das notas emitidas contra o CNPJ (Distribuição DF-e da SEFAZ com certificado A1) | P2 | — |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | XML lido sem executar nada externo (sem DTD/entidades externas); tamanho máximo de 1 MB; textos escapados ao exibir | P0 | CA02 |
| RNF02 | Importação só com permissões existentes `admin.estoque` e `admin.financeiro`; RPC sem `anon` (pgTAP com `has_function_privilege`) | P0 | CA13 |
| RNF03 | Valores em centavos e quantidades com até 3 casas; soma das despesas = total da nota (diferença 0) | P0 | CA06, CA08 |
| RNF04 | Arquivo XML guardado no Storage privado, vinculado à importação, por 5 anos (prazo fiscal) | P1 | CA08 |

### Dependências técnicas

- Estoque, lotes e PEPS (CAF-000031, CAF-000111); contas a pagar (CAF-000035, CAF-000068, CAF-000078); fornecedores.
- CAF-000136 (saldo incremental com lock e PEPS no estorno) antes desta.
- CAF-000127 (policies de estoque e financeiro) para as novas tabelas seguirem o padrão corrigido.
- Telas: `js/admin/estoque.js`, `js/admin/financeiro-admin.js`, `js/utils/stock-purchase.js`.

### Recursos necessários

- 5 a 10 XMLs reais de fornecedores atuais (com e sem `rastro`) para fixtures de teste, sem dados pessoais.

## Critérios de Aceitação / Entregas

- [ ] **CA01:** Dado um XML válido de 15 itens, quando envio no admin, então vejo emitente, número, data, total e os 15 itens com quantidade, unidade e valor.
- [ ] **CA02:** Dado um arquivo que não é NF-e, com DTD externo ou maior que 1 MB, quando envio, então é recusado com mensagem clara e nada é lido de fora.
- [ ] **CA03:** Dado um CNPJ emitente que não está cadastrado, quando confirmo, então o fornecedor é criado com razão social e CNPJ e vinculado à nota.
- [ ] **CA04:** Dado a primeira nota do fornecedor, quando ligo "LEITE INT 1L CX12" ao insumo "Leite integral (L)" com fator 12, então o mapa fica salvo para esse fornecedor e código.
- [ ] **CA05:** Dado uma segunda nota do mesmo fornecedor com esse código, quando envio, então o item já aparece ligado com fator 12, sem ação minha.
- [ ] **CA06:** Dado 3 caixas a R$ 60,00 cada (`vProd` R$ 180,00) com fator 12, quando confirmo, então a entrada é de 36 L a R$ 5,00/L.
- [ ] **CA07:** Dado um item marcado como "não estocar", quando confirmo, então ele entra só no valor da despesa e não gera movimento de estoque.
- [ ] **CA08:** Dado uma nota com 2 duplicatas (R$ 300,00 em 15 dias e R$ 300,00 em 30 dias), quando confirmo, então são criadas 2 despesas com esses vencimentos, todas as entradas com lote/validade do `rastro` e um registro da importação com o XML anexado.
- [ ] **CA09:** Dado uma falha no meio da gravação (ex.: insumo desativado), quando confirmo, então nada é gravado (nem entrada, nem despesa) e a tela mostra o item com problema.
- [ ] **CA10:** Dado uma nota já importada, quando envio de novo, então é recusada e mostra quando e por quem foi importada.
- [ ] **CA11:** Dado uma NF-e cujo destinatário é outro CNPJ, quando envio, então é recusada (caso negativo).
- [ ] **CA12:** Dado uma importação estornada com motivo, quando confirmo, então os saldos voltam ao valor anterior e as despesas não pagas ficam canceladas.
- [ ] **CA13:** Dado um usuário anônimo ou um barista sem permissão, quando chama `importar_nfe_compra`, então recebe erro de permissão.

## O que a atividade não inclui

- Manifestação do destinatário e download automático na SEFAZ: motivo: exige certificado A1 e serviço no servidor; P2.
- Cálculo de créditos de ICMS/PIS/COFINS: motivo: escrituração fiscal é do contador.
- Notas de serviço (NFS-e) e cupons de mercado: motivo: layouts diferentes e sem itens de estoque padronizados.

### Considerado para o futuro (P2)

- Distribuição DF-e com certificado A1 (RF09) e caixa de entrada de notas pendentes.
- Leitura da chave de acesso por câmera (DANFE) para buscar o XML.

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | CNPJ da cafeteria para validar o destinatário (pode haver mais de um?) | PO | Não | |
| D02 | Frete e descontos da nota entram no custo do insumo ou vão para despesa separada? | PO/contador | Não | |
| D03 | Quais fornecedores emitem NF-e hoje (para priorizar fixtures)? | PO | Não | |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Parser de NF-e | unit (`tests/caf-000155-xml-nfe.test.js`, `js/utils/nfe-parser.js` com fixtures anonimizadas) | CA01, CA02 | Ler XML válido, inválido, com DTD | Dados certos; recusas |
| CT02 | Fornecedor por CNPJ | integração (admin com Supabase simulado) | CA03 | CNPJ novo | Fornecedor criado |
| CT03 | De-para | pgTAP (`supabase/tests/nfe_compras.test.sql`) + unit | CA04, CA05 | Duas notas do mesmo fornecedor | Mapa aplicado |
| CT04 | Conversão e custo | unit | CA06 | 3 × R$ 60, fator 12 | 36 L a R$ 5,00 |
| CT05 | Não estocar | pgTAP | CA07 | Item marcado | Só despesa |
| CT06 | Gravação completa | pgTAP | CA08 | Nota com 2 duplicatas e `rastro` | Despesas, lotes e registro |
| CT07 | Tudo ou nada | pgTAP | CA09 | Insumo desativado no meio | Nada gravado |
| CT08 | Duplicada e destinatário | pgTAP + unit | CA10, CA11 | Reenviar; outro CNPJ | Recusas |
| CT09 | Estorno | pgTAP | CA12 | Estornar importação | Saldos e despesas revertidos |
| CT10 | Permissões | pgTAP (`SET ROLE anon`, claims, `has_function_privilege`) | CA13 | Chamar RPC | Negado |

## URL Complementar

- Documentação técnica: `js/admin/estoque.js`, `js/utils/stock-purchase.js`, `supabase/migration_caf_000111_lotes_validade_peps_sugestao_compras.sql`, `supabase/migration_caf_000068_lista_compras_fornecedor.sql`, `supabase/migration_caf_000035_financeiro_despesas.sql`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000031](CONCLUIDAS/CAF-000031-controle-de-estoque.md), [CAF-000035](CONCLUIDAS/CAF-000035-contas-a-pagar-e-fluxo-de-caixa.md), [CAF-000068](CONCLUIDAS/CAF-000068-lista-compras-fornecedor-e-entrada-estoque-financeiro.md), [CAF-000078](CONCLUIDAS/CAF-000078-financeiro-despesas-contrato-front-banco.md), [CAF-000111](CONCLUIDAS/CAF-000111-sugestao-inteligente-compras-lotes-validade-peps-estoque.md); novas: CAF-000127, CAF-000136
- Referências de design: Alterdata (https://ajuda.alterdata.com.br/bimerbase/estoque/importacao-em-massa-de-xmls-de-nf-es-de-compra); Tablet Cloud (https://ajuda.tabletcloud.com.br/retaguarda/modulo-estoque/como-registrar-uma-entrada-de-estoque)
- Requisitos originais: Manual de Orientação do Contribuinte da NF-e (layout 4.00)
- Issue / PR relacionado: —
