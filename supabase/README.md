# Gestão de Banco de Dados e Migrations — Cafeteria do Teatro

## 1. Fonte de Verdade

O repositório Git é a **única fonte de verdade** para a estrutura e o código do banco de dados (tabelas, colunas, views, funções RPC, triggers e policies RLS).
- **Regra inegociável:** É expressamente proibido alterar o banco de produção via interface gráfica ou SQL manual sem versionar a respectiva migration no diretório `supabase/`.
- Toda nova alteração de schema deve ser associada a uma SDD (ex: `migration_caf_<NNNNNN>_<slug>.sql`).

## 2. Ordem Oficial de Aplicação das Migrations

A ordem oficial, cronológica e auditada de todas as migrations ativas está definida no arquivo de manifesto canônico:
👉 **[`supabase/migrations.manifest.json`](migrations.manifest.json)** (CAF-000116).

Para aplicar as migrations de forma determinística e com validação de checksum:
```bash
# Simular aplicação sem alterar o banco
npm run db:migrate -- --dry-run

# Executar aplicação em ambiente com DATABASE_URL configurada
npm run db:migrate
```

A sequência compreende:
1. `pedidos_schema.sql` (schema base inicial do sistema)
2. `migration_CAF-000001.sql` até `migration_caf_000044_caixa_fix.sql`
3. `migration_caf_000061_cupons_desconto.sql` até `migration_caf_000069_menu_analytics.sql`
4. `migration_caf_000072_baseline_producao.sql` (reconciliação baseline de produção)
5. Migrations 073 a 083 (estabilização operacional)
6. Migrations 103 a 115 (novas funcionalidades, combos, PEPS, DRE e observabilidade)

Para instruções completas de backup e recuperação de desastres, consulte **[`supabase/RESTAURACAO.md`](RESTAURACAO.md)**.

## 3. Papel de `migrations_todas_consolidadas.sql`

O arquivo `migrations_todas_consolidadas.sql` é um artefato de histórico de consolidação gerado em fases anteriores do projeto. Ele não substitui o fluxo modular de migrations sequenciais versionadas.

## 4. Tabela de Correspondência entre Migrations Antigas e SDDs

| Arquivo de Migration | SDD Correspondente | Assunto / Tema |
|---|---|---|
| `migration_caf_000005.sql` | CAF-000006 | Produto esgotado |
| `migration_caf_000006_estacoes.sql` | CAF-000007 | Estação bar × cozinha |
| `migration_caf_000021_cliente_viagem.sql` | CAF-000010 | Cliente em pedidos para viagem |
| `migration_caf_000022_transferir_mesa.sql` | CAF-000011 | Transferência de mesa |
| `migration_caf_000023_taxa_desconto.sql` | CAF-000013 | Taxa de serviço e desconto |
| `migration_caf_000024_relatorios.sql` | CAF-000014 | Relatórios de vendas e admin |
| `migration_caf_000025_caixa.sql` | CAF-000015 | Controle de abertura e fechamento de caixa |
| `migration_caf_000026_idempotencia.sql` | CAF-000018 | Idempotência no fechamento |
| `migration_caf_000027_conclusao_estacao.sql` | CAF-000022 | Conclusão individual de estação KDS |
| `migration_caf_000028_itens_lancados_depois.sql` | CAF-000024 | Itens lançados depois em pedido em andamento |
| `migration_caf_000029_tempo_alvo_semaforo.sql` | CAF-000025 | Tempo alvo e semáforo KDS |

## 5. Resolução da Função `fn_calcular_totais_caixa_interno`

As divergências históricas entre a migration 039 (que considerava taxas) e a 044 (sem taxas) foram resolvidas de forma definitiva na **CAF-000079** (`migration_caf_000079_pix_admin_taxas_caixa.sql`) e **CAF-000083** (`migration_caf_000083_pendencias_operacao.sql`), garantindo:
- Separação entre taxa da maquininha (custo financeiro) e taxa de serviço (gorjeta).
- Inclusão correta de depósitos e recebimentos de conta de clientes nos totais esperados de dinheiro e Pix.
