# Plano de correções e cobertura de testes (CAF-000072 a CAF-000092)

> Origem: auditoria das SDDs CAF-000001 a CAF-000071 contra o código e o banco de produção (2026-10-20).
> **Status das SDDs:** "Rascunho" = depende do resultado de `supabase/diagnostico_schema_producao.sql`; "Em revisão" = pronta para revisão do PO.

## Pré-requisito

Rodar `supabase/diagnostico_schema_producao.sql` no SQL Editor de produção (só faz SELECT no catálogo) e anexar o CSV à CAF-000072. Ele confirma as assinaturas das RPCs (`fechar_conta_mesa`, `adicionar_itens_pedido`, `cancelar_item`, `processar_cashback_pedido`, `registrar_uso_cupom`), que não puderam ser verificadas pela API pública.

## Ordem de execução

| Onda | SDD | Tipo | Tema | Depende de | Status |
|------|-----|------|------|------------|--------|
| 0 | [CAF-000072](CAF-000072-baseline-schema-producao-e-reconciliacao-migrations.md) | CHORE | Baseline do schema de produção e reconciliação das migrations | diagnóstico | Rascunho |
| 0 | [CAF-000086](CAF-000086-infraestrutura-de-testes-e-contrato-front-schema.md) | CHORE | Infra de testes, coverage e teste de contrato front ↔ schema | 072 (snapshot) | Em revisão |
| 1 — bloqueia operação | [CAF-000073](CAF-000073-correcao-fechamento-de-conta-da-mesa.md) | FIX | Fechamento de conta da mesa (002/012/013) | 072 | Rascunho |
| 1 | [CAF-000075](CAF-000075-correcao-validacao-adicionais-e-xss-no-pdv.md) | FIX | Validação de adicionais (fonte única) e XSS (020b) | 072 | Rascunho |
| 1 | [CAF-000076](CAF-000076-correcao-cashback-fidelidade.md) | FIX | Cashback: carrinho público quebrado, PDV, estorno (063) | 072 | Em revisão |
| 1 | [CAF-000074](CAF-000074-correcao-estoque-ficha-tecnica-e-lista-de-compras.md) | FIX | Estoque, ficha técnica e lista de compras (031/032/068) | 072 | Rascunho |
| 1 | [CAF-000078](CAF-000078-financeiro-despesas-contrato-front-banco.md) | FIX | Financeiro: despesas front ↔ banco (035) | 072 | Em revisão |
| 1 | [CAF-000079](CAF-000079-pix-no-admin-e-taxas-no-fechamento-de-caixa.md) | FIX | Pix no admin e taxas no caixa (039/044) | 072 | Rascunho |
| 2 — segurança | [CAF-000081](CAF-000081-seguranca-pin-permissoes-por-cargo-e-rls-operacional.md) | FIX | PIN, permissões por cargo e RLS operacional (036/001/004/011) | 072 | Rascunho |
| 2 | [CAF-000082](CAF-000082-seguranca-rpcs-policies-e-views-expostas.md) | FIX | RPCs/policies abertas a anon e views com dados pessoais | 072, 076, 077 | Rascunho |
| 2 | [CAF-000077](CAF-000077-cupons-uso-unico-por-pedido-e-rastreio-no-fechamento.md) | FIX | Cupons: uso único por pedido e rastreio no fechamento (061) | 073 | Rascunho |
| 2 | [CAF-000080](CAF-000080-fuso-horario-e-corte-do-dia-operacional.md) | FIX | Fuso horário, corte do dia e filtro do PDV (003/014/016/017/027) | 073 | Rascunho |
| 3 — pendências | [CAF-000083](CAF-000083-pendencias-funcionais-operacao-e-caixa.md) | FIX | Operação e caixa (034/015/062/043/040/025) | 073, 079 | Rascunho |
| 3 | [CAF-000084](CAF-000084-pendencias-ux-kds-e-cardapio.md) | FIX | UX, KDS e cardápio (056/065/062/005/024/010/067/021/047) | — | Em revisão |
| 3 | [CAF-000085](CAF-000085-saneamento-documentacao-das-sdds.md) | DOCS | Saneamento de status/CAs, ID duplicado, `SDD/INDICE.md` | — | Em revisão |
| Contínua | [CAF-000087](CAF-000087-cobertura-de-testes-pdv-mesas-e-conta.md) | CHORE | Testes: PDV, mesas e conta | 086 | Em revisão |
| Contínua | [CAF-000088](CAF-000088-cobertura-de-testes-kds-e-producao.md) | CHORE | Testes: KDS e produção | 086 | Em revisão |
| Contínua | [CAF-000089](CAF-000089-cobertura-de-testes-gestao-e-admin.md) | CHORE | Testes: gestão e admin | 086 | Em revisão |
| Contínua | [CAF-000090](CAF-000090-cobertura-testes-canais-do-cliente.md) | CHORE | Testes: canais do cliente (cardápio, QR, online, totem) | 086 | Em revisão |
| Contínua | [CAF-000091](CAF-000091-cobertura-testes-mobile-site-e-ux.md) | CHORE | Testes: mobile, site e UX | 086 | Em revisão |
| Contínua | [CAF-000092](CAF-000092-testes-sql-rpcs-triggers-e-policies.md) | CHORE | Testes SQL (pgTAP) de RPCs, triggers e policies | 072 | Em revisão |

## Regras combinadas entre as SDDs

- Toda SDD de correção entrega `tests/caf-0000NN-*.test.js` testando o código real da aplicação (não só utilitários), conforme `GEMINI.md`.
- As SDDs de cobertura (087–092) podem ser escritas antes das correções: os cenários que falham por bug conhecido entram como `it.fails('[CAF-0000NN] …')` apontando para a SDD de correção, e viram testes normais quando ela é entregue.
- O teste de contrato da CAF-000086 impede que o front volte a chamar RPC, parâmetro ou coluna inexistente (a classe de bug de 073, 074, 078 e 079).
- Nenhum teste roda contra o banco de produção.

## Fora deste plano (paridade com a Saipos)

NFC-e, integração iFood/marketplaces, TEF/SmartPOS, delivery próprio, importação de XML de nota do fornecedor, comanda/cartão de consumo e multi-loja. Devem virar SDDs próprias depois da Onda 1.
