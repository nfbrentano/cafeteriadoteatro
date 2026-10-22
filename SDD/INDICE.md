# Índice Geral de SDDs — Cafeteria do Teatro

Este documento é o inventário oficial de todas as Especificações e Demandas de Desenvolvimento (SDDs) do sistema Cafeteria do Teatro, mapeando status, migrations, arquivos de testes e dependências de correção.

---

## 1. Mapeamento de SDDs

| ID | Título | Status | Migration(s) | Teste(s) | Correção / Ressalva |
|---|---|---|---|---|---|
| **CAF-000001** | [PDV] [Banco] Status "entregue" persistido no banco | Concluída | `migration_CAF-000001.sql` | — | — |
| **CAF-000002** | [PDV] [Banco] Fechamento de conta da mesa | Concluída com ressalvas | `migration_caf_000002.sql` | — | CAF-000073 |
| **CAF-000003** | [PDV] Limitar pedidos ativos carregados no PDV | Concluída | `migration_caf_000003.sql` | — | — |
| **CAF-000004** | [PDV] [Cozinha] Cancelar item individual | Concluída | `migration_caf_000004.sql` | — | — |
| **CAF-000005** | [PDV] Adicionar itens a um pedido já enviado | Concluída | `migration_caf_000005.sql` | — | — |
| **CAF-000006** | [PDV] [Admin] [Cardápio] Produto esgotado | Concluída | `migration_caf_000005.sql`<br>`migration_caf_000006_estacoes.sql` | — | — |
| **CAF-000007** | [Cozinha] [Banco] Separação por estação (bar × cozinha) | Concluída | `migration_caf_000006_estacoes.sql` | — | — |
| **CAF-000008** | [Cozinha] Marcar item a item como pronto | Concluída | `migration_caf_000008_pronto.sql` | — | — |
| **CAF-000009** | [Cozinha] Realtime da cozinha também em `pedido_itens` | Concluída | — | — | — |
| **CAF-000010** | [PDV] [Cozinha] [Impressão] Nome do cliente e pedido para viagem | Concluída | `migration_caf_000021_cliente_viagem.sql` | — | — |
| **CAF-000011** | [PDV] [Banco] Transferir e juntar mesas | Concluída | `migration_caf_000022_transferir_mesa.sql` | — | — |
| **CAF-000012** | [PDV] Dividir conta | Concluída com ressalvas | — | — | CAF-000073 |
| **CAF-000013** | [PDV] [Banco] Taxa de serviço e desconto manual | Concluída com ressalvas | `migration_caf_000023_taxa_desconto.sql` | — | CAF-000073 |
| **CAF-000014** | [Admin] Relatórios de vendas, cortesias e preparo | Concluída | `migration_caf_000024_relatorios.sql` | — | — |
| **CAF-000015** | [Admin] Fechamento de caixa do dia | Concluída com ressalvas | `migration_caf_000025_caixa.sql` | — | CAF-000079, CAF-000083 |
| **CAF-000016** | [Admin] Exportar pedidos em CSV | Concluída | — | — | — |
| **CAF-000017** | [Cardápio] Aba "Promos" no cardápio público | Concluída | — | — | — |
| **CAF-000018** | [PDV] [Cozinha] Tolerância a queda de internet | Concluída | `migration_caf_000026_idempotencia.sql` | — | — |
| **CAF-000019** | [Banco] [Admin] Log de auditoria dos pedidos | Concluída | `migration_caf_000019_log_auditoria.sql` | — | — |
| **CAF-000020** | [Admin] [PDV] [Banco] Vínculo de adicionais por produto | Concluída com ressalvas | `migration_caf_000020_vinculo_adicionais.sql` | — | CAF-000075, CAF-000072 |
| **CAF-000020A** | [UI] Menu Flutuante do WhatsApp | Concluída | — | — | — |
| **CAF-000021** | [Bug] [Home] Mapa do Google Maps não carrega na página inicial | Concluída | `migration_caf_000021_cliente_viagem.sql` | — | — |
| **CAF-000022** | [Bug] [Cozinha] Conclusão independente por estação (bar × cozinha) | Concluída | `migration_caf_000022_transferir_mesa.sql`<br>`migration_caf_000027_conclusao_estacao.sql` | — | — |
| **CAF-000023** | [Bug] [Cozinha] Comanda automática sem meio a meio, voz sem nome do cliente e botão "Chamar" quebrando com apóstrofo | Concluída | `migration_caf_000023_taxa_desconto.sql` | — | — |
| **CAF-000024** | [Cozinha] [PDV] Itens lançados depois do envio voltam para a fila, com destaque e comanda complementar | Concluída com ressalvas | `migration_caf_000024_relatorios.sql`<br>`migration_caf_000028_itens_lancados_depois.sql` | — | CAF-000084 |
| **CAF-000025** | [Cozinha] [Admin] Tempo alvo de preparo por categoria/produto e semáforo no KDS | Concluída com ressalvas | `migration_caf_000025_caixa.sql`<br>`migration_caf_000029_tempo_alvo_semaforo.sql` | — | CAF-000084 |
| **CAF-000026** | [Cozinha] Visão consolidada de produção (totais por produto) | Concluída | `migration_caf_000026_idempotencia.sql` | — | — |
| **CAF-000027** | [Salão] [Cozinha] Painel de senhas / TV de retirada para o cliente | Concluída com ressalvas | `migration_caf_000027_conclusao_estacao.sql`<br>`migration_caf_000027_painel_retirada.sql` | — | CAF-000084 |
| **CAF-000028** | [Cozinha] [Impressão] Tela responsável pela impressão e comanda por estação (sem impressão duplicada) | Concluída com ressalvas | `migration_caf_000028_itens_lancados_depois.sql`<br>`migration_caf_000028_tela_impressora.sql` | — | CAF-000082, CAF-000084 |
| **CAF-000029** | [Cozinha] [PDV] Prioridade de pedido e operação do KDS por teclado (bump bar) | Concluída | `migration_caf_000029_prioridade_teclado.sql`<br>`migration_caf_000029_tempo_alvo_semaforo.sql` | — | — |
| **CAF-000030** | [Cozinha] [Performance] Atualização incremental do KDS e coluna "Prontos" enxuta | Concluída | — | — | — |
| **CAF-000031** | [Admin] [Estoque] Controle de estoque de produtos e insumos com baixa automática na venda | Concluída com ressalvas | `migration_caf_000031_controle_estoque.sql` | — | CAF-000074 |
| **CAF-000032** | [Admin] [Estoque] Ficha técnica, custo do produto e relatório de lucro (CMV) | Concluída com ressalvas | `migration_caf_000032_ficha_tecnica.sql` | — | CAF-000074 |
| **CAF-000033** | [PDV] [Admin] Cadastro de clientes com histórico de consumo | Concluída | `migration_caf_000033_cadastro_clientes.sql` | — | — |
| **CAF-000034** | [PDV] [Financeiro] Conta do cliente: fiado (pós-pago) e créditos pré-pagos | Concluída com ressalvas | `migration_caf_000034_conta_cliente.sql` | — | CAF-000076, CAF-000083 |
| **CAF-000035** | [Admin] [Financeiro] Contas a pagar, despesas e fluxo de caixa | Concluída com ressalvas | `migration_caf_000035_financeiro_despesas.sql` | — | CAF-000078 |
| **CAF-000036** | [Admin] [Segurança] Permissões por cargo e relatório de desempenho por operador | Concluída com ressalvas | `migration_caf_000036_cargos_permissoes.sql` | — | CAF-000081 |
| **CAF-000037** | [Cardápio] [PDV] QR Code por mesa e pedido feito pelo cliente (com aprovação do barista) | Concluída com ressalvas | `migration_caf_000037_qr_pedidos_cliente.sql` | — | CAF-000081, CAF-000082 |
| **CAF-000038** | [Cardápio] [PDV] Pedido online para retirada e encomendas pelo link (WhatsApp / Instagram) | Concluída | `migration_caf_000038_pedido_online.sql` | — | — |
| **CAF-000039** | [PDV] [Financeiro] Pix com QR Code no fechamento e taxas por forma de pagamento | Concluída com ressalvas | `migration_caf_000039_pix_taxas.sql` | — | CAF-000079 |
| **CAF-000040** | [Salão] [Cardápio] Totem / tablet de autoatendimento no balcão | Concluída | `migration_caf_000040_totem.sql` | — | — |
| **CAF-000041** | [Admin] [Marketing] CRM: segmentação automática de clientes, tags e listas para campanha | Concluída com ressalvas | `migration_caf_000041_crm_campanhas.sql` | — | CAF-000081, CAF-000082 |
| **CAF-000042** | [Cardápio] [Admin] Avaliação do pedido e do atendimento pelo cliente | Concluída | `migration_caf_000042_avaliacoes.sql` | — | — |
| **CAF-000043** | [Cozinha] [Impressão] Etiqueta por item para copo e embalagem (nome do cliente e personalização) | Concluída | `migration_caf_000043_etiquetas.sql` | — | — |
| **CAF-000044** | [Bug] [Caixa] Fechamento de caixa cego e correção do contrato entre tela e banco | Concluída com ressalvas | `migration_caf_000044_caixa_fix.sql` | — | CAF-000079, CAF-000083 |
| **CAF-000045** | Exportação Completa de Produtos para Planilha (Excel e CSV) | Concluída | — | — | — |
| **CAF-000046** | Limpeza do hero da home e logo na navbar | Concluída | — | — | — |
| **CAF-000047** | Melhoria dos botões do hero da home | Concluída | — | — | — |
| **CAF-000048** | Carrossel Hero Desktop: Galeria de Artes com Cards Verticais Lado a Lado | Concluída | — | — | — |
| **CAF-000049** | Atualização de Dependências (sharp e vite) | Concluída | — | — | — |
| **CAF-000050** | Remover botão de cardápio do início do site | Concluída | — | — | — |
| **CAF-000051** | [PDV] [Mobile] Correções de formulário mobile: anti-zoom no iOS e teclados semânticos | Concluída | — | — | — |
| **CAF-000052** | [PDV] [Mobile] Seleção e visualização de mesas em grade no celular | Concluída | — | — | — |
| **CAF-000053** | [PDV] [Mobile] Aviso sonoro, tátil e notificação de pedido pronto no celular | Concluída | — | — | — |
| **CAF-000054** | [PDV] [Mobile] Fechamento de conta em etapas adaptado para telas mobile | Concluída | — | — | — |
| **CAF-000055** | [PDV] [Mobile] Barra de navegação inferior (bottom nav) e alvos de toque no celular | Concluída | — | — | — |
| **CAF-000056** | [PDV] [Mobile] Diálogos próprios (bottom sheets e toasts com desfazer) substituindo alert/confirm | Concluída | — | — | — |
| **CAF-000057** | [PDV] [Mobile] Confiabilidade móvel: carrinho salvo em rascunho e faixa de offline clara | Concluída | — | — | — |
| **CAF-000058** | [PDV] [Mobile] Lançamento rápido: favoritos, contador direto no card e repetir rodada | Concluída | — | — | — |
| **CAF-000059** | [PDV] [Mobile] Operação ágil de salão: filtro Meus Pedidos, troco rápido e envio otimista | Concluída | — | — | — |
| **CAF-000060** | Seleção Automática de "Sem Mesa" e Liberação de Envio ao Marcar "Para Viagem / Balcão" | Concluída | — | — | — |
| **CAF-000061** | Validação e Aplicação de Cupons de Desconto no Autoatendimento e PDV | Concluída com ressalvas | `migration_caf_000061_cupons_desconto.sql` | `caf-000061-cupons.test.js` | CAF-000077 |
| **CAF-000062** | Modo "Dia de Espetáculo" e Reserva Antecipada para o Intervalo | Concluída | `migration_caf_000062_dia_de_espetaculo.sql` | `caf-000062-espetaculo.test.js` | — |
| **CAF-000063** | Programa de Fidelidade e Cashback Automático na Carteira do Cliente | Concluída com ressalvas | `migration_caf_000063_cashback_fidelidade.sql` | `caf-000063-cashback.test.js` | CAF-000076 |
| **CAF-000064** | Tela Sempre Ligada (`Screen Wake Lock API`) nas Telas de Operação | Concluída | — | `caf-000064-wake-lock.test.js` | — |
| **CAF-000065** | Busca Inteligente Tolerante a Acentos, Erros de Digitação e Códigos Curtos | Concluída | — | `caf-000065-smart-search.test.js` | — |
| **CAF-000066** | Compartilhamento de Comprovante Digital via WhatsApp e Web Share API | Concluída | — | `caf-000066-receipt-share.test.js` | — |
| **CAF-000067** | Gesto de Deslizar (`Swipe`) para Entregar Pedido e Ditado por Voz na Observação | Concluída | — | `caf-000067-voice-swipe.test.js` | — |
| **CAF-000068** | Lista de Compras por Fornecedor e Entrada de Estoque Integrada ao Contas a Pagar | Concluída | `migration_caf_000068_lista_compras_fornecedor.sql` | `caf-000068-compras-estoque.test.js` | — |
| **CAF-000069** | Menu Analytics: Funil de Conversão do Cardápio Digital e Desempenho de Produtos | Concluída | `migration_caf_000069_menu_analytics.sql` | `caf-000069-menu-analytics.test.js` | — |
| **CAF-000070** | Performance e UX Mobile da Home e Cardápio Público (Maps Facade, Auto-scroll de Categorias e Swipe no Hero) | Concluída | — | `caf-000070-performance-ux.test.js` | — |
| **CAF-000071** | Implementação de Ferramenta de Testes Automatizados e Regra Obrigatória de Testes Funcionais por Feature | Concluída | — | — | — |
| **CAF-000072** | Baseline do schema de produção e reconciliação com as migrations | Rascunho | `migration_caf_000072_baseline_producao.sql` | `caf-000072-baseline-producao.test.js` | — |
| **CAF-000073** | Correção do fechamento de conta da mesa (RPC, cancelados, idempotência e divisão) | Rascunho | `migration_caf_000073_fechamento_conta_mesa.sql` | `caf-000073-fechamento-mesa.test.js` | — |
| **CAF-000074** | Correção de estoque, ficha técnica (CMV) e lista de compras | Rascunho | `migration_caf_000074_correcao_estoque_ficha_tecnica.sql` | `caf-000074-estoque-cmv.test.js` | — |
| **CAF-000075** | Fonte única de vínculo de adicionais, revalidação no servidor e XSS no PDV | Rascunho | `migration_caf_000075_validacao_adicionais_xss.sql` | `caf-000075-adicionais-xss.test.js` | — |
| **CAF-000076** | Correção do cashback: carrinho quebrado, crédito no PDV, estorno e RPC segura | Em revisão | `migration_caf_000076_correcao_cashback.sql` | `caf-000076-cashback-fix.test.js` | — |
| **CAF-000077** | Cupons: uso único por pedido, RPC protegida e rastreio do cupom no fechamento do PDV | Rascunho | `migration_caf_000077_cupons_uso_unico.sql` | `caf-000077-cupons-uso-por-pedido.test.js` | — |
| **CAF-000078** | Financeiro: alinhar cadastro, baixa e listagem de despesas ao schema real | Em revisão | `migration_caf_000078_financeiro_despesas.sql` | `caf-000078-financeiro-despesas.test.js` | — |
| **CAF-000079** | Pix no admin (salvar/testar) e taxas por forma de pagamento no fechamento de caixa | Rascunho | `migration_caf_000079_pix_admin_taxas_caixa.sql` | `caf-000079-pix-admin-e-taxas-caixa.test.js` | — |
| **CAF-000080** | Fuso horário consistente (America/Sao_Paulo) e corte do dia operacional | Rascunho | `migration_caf_000080_fuso_horario.sql` | `caf-000080-fuso-horario.test.js` | — |
| **CAF-000081** | Segurança: PIN com bloqueio, permissões por cargo efetivas no banco e RLS das operações do PDV/KDS | Rascunho | `migration_caf_000081_seguranca_pin_rls.sql` | `caf-000081-seguranca-pin-permissoes.test.js` | — |
| **CAF-000082** | Segurança: RPCs, policies e views expostas a anônimos e a qualquer autenticado | Rascunho | `migration_caf_000082_seguranca.sql` | `caf-000082-seguranca.test.js` | — |
| **CAF-000083** | Pendências funcionais de operação e caixa (conta do cliente, reabertura de caixa, intervalo, etiquetas, totem e tempo-alvo) | Rascunho | `migration_caf_000083_pendencias_operacao.sql` | `caf-000083-pendencias-operacao.test.js` | — |
| **CAF-000084** | Pendências de UX, KDS e cardápio (diálogos nativos, busca, banner do espetáculo, destaque de adicionais, desfazer e mapa) | Em revisão | — | `caf-000084-pendencias-ux.test.js` | — |
| **CAF-000085** | Saneamento da documentação das SDDs (status, critérios de aceitação, IDs e rastreabilidade) | Em revisão | — | — | — |
| **CAF-000086** | Infraestrutura de Testes, Cobertura e Teste de Contrato Front ↔ Schema | Em revisão | — | — | — |
| **CAF-000087** | Cobertura de Testes: PDV, Mesas e Fechamento de Conta (SDDs 001–005, 010–013, 016, 018, 019) | Em revisão | — | — | — |
| **CAF-000088** | Cobertura de Testes: KDS, Estações e Produção (SDDs 006–009, 022–030, 043) | Em revisão | — | — | — |
| **CAF-000089** | Cobertura de Testes: Gestão e Admin (Relatórios, Caixa, Estoque, Ficha Técnica, Clientes, Financeiro, Permissões, Pix, CRM, Exportação e Compras) | Em revisão | — | — | — |
| **CAF-000090** | Cobertura de Testes dos Canais do Cliente (Cardápio, QR na Mesa, Pedido Online, Totem e Avaliação) | Em revisão | — | — | — |
| **CAF-000091** | Cobertura de Testes de Mobile, Site Institucional e UX do PDV | Em revisão | — | — | — |
| **CAF-000092** | Testes SQL Automatizados das RPCs, Triggers e Policies (pgTAP em Banco Isolado) | Em revisão | — | — | — |
| **CAF-000093** | Cobertura de Testes: Camada de Dados, Cache Local e Fila Offline (`db.js` e `pedidos.js`) | Concluída | — | `caf-000093-camada-dados-cache-offline.test.js` | — |
| **CAF-000094** | Cobertura de Testes: Fechamento de Caixa e Financeiro (`caixa-admin.js` e `financeiro-admin.js`) | Concluída | — | `caf-000094-caixa-financeiro.test.js` | — |
| **CAF-000095** | Cobertura de Testes: PDV do Balcão e Totem de Autoatendimento (`pedidos.js` e `totem.js`) | Concluída | — | `caf-000095-pdv-balcao-totem.test.js` | — |
| **CAF-000096** | Cobertura de Testes: KDS da Cozinha, Bar e Impressão Térmica (`cozinha.js` e `pedido-print.js`) | Concluída | — | `caf-000096-kds-impressao.test.js` | — |
| **CAF-000097** | Cobertura de Testes: Gestão de Clientes, Fiado e Produtos (`clientes-admin.js` e `products.js`) | Concluída | — | `caf-000097-clientes-produtos.test.js` | — |

---

## 2. Migrations com Numeração Divergente da SDD (Mapeadas)

As seguintes 11 migrations foram criadas com nomenclatura histórica anterior à padronização. Para preservar a segurança do histórico e evitar riscos de reaplicação em produção, **elas não foram renomeadas**, mas receberam no topo o comentário oficial `-- Implementa: CAF-0000NN` e estão mapeadas abaixo:

| Arquivo de Migration | SDD Correspondente | Assunto / Tema |
|---|---|---|
| `supabase/migration_caf_000005.sql` | CAF-000006 | Produto esgotado |
| `supabase/migration_caf_000006_estacoes.sql` | CAF-000007 | Estação bar × cozinha |
| `supabase/migration_caf_000021_cliente_viagem.sql` | CAF-000010 | Cliente em pedidos para viagem |
| `supabase/migration_caf_000022_transferir_mesa.sql` | CAF-000011 | Transferência de mesa |
| `supabase/migration_caf_000023_taxa_desconto.sql` | CAF-000013 | Taxa de serviço e desconto manual |
| `supabase/migration_caf_000024_relatorios.sql` | CAF-000014 | Relatórios de vendas e admin |
| `supabase/migration_caf_000025_caixa.sql` | CAF-000015 | Controle de abertura e fechamento de caixa |
| `supabase/migration_caf_000026_idempotencia.sql` | CAF-000018 | Idempotência e tolerância a queda de conexão |
| `supabase/migration_caf_000027_conclusao_estacao.sql` | CAF-000022 | Conclusão individual de estação KDS |
| `supabase/migration_caf_000028_itens_lancados_depois.sql` | CAF-000024 | Itens lançados depois em pedido em andamento |
| `supabase/migration_caf_000029_tempo_alvo_semaforo.sql` | CAF-000025 | Tempo alvo e semáforo KDS |

---

## 3. Ordem Oficial de Aplicação das Migrations

A ordem sequencial auditada para instanciar um ambiente limpo ou aplicar em produção é:

1. `pedidos_schema.sql` (schema base inicial do sistema)
2. `migration_CAF-000001.sql` até `migration_caf_000044_caixa_fix.sql`
3. `migration_caf_000061_cupons_desconto.sql` até `migration_caf_000069_menu_analytics.sql`
4. `migration_caf_000072_baseline_producao.sql` (reconciliação baseline de produção)
5. Migrations de correções e estabilização sequenciais:
   - `migration_caf_000073_fechamento_conta_mesa.sql`
   - `migration_caf_000074_correcao_estoque_ficha_tecnica.sql`
   - `migration_caf_000075_validacao_adicionais_xss.sql`
   - `migration_caf_000076_correcao_cashback.sql`
   - `migration_caf_000077_cupons_uso_unico.sql`
   - `migration_caf_000078_financeiro_despesas.sql`
   - `migration_caf_000079_pix_admin_taxas_caixa.sql`
   - `migration_caf_000080_fuso_horario.sql`
   - `migration_caf_000081_seguranca_pin_rls.sql`
   - `migration_caf_000082_seguranca.sql`
   - `migration_caf_000083_pendencias_operacao.sql`
