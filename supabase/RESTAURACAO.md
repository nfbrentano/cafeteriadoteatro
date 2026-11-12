# Roteiro Oficial de Restauração de Banco de Dados — Cafeteria do Teatro (CAF-000116)

Este documento descreve o procedimento operacional padrão para recuperar o banco de dados da Cafeteria do Teatro a partir de um dump lógico gerado pela rotina automatizada (`scripts/backup-db.mjs`).

---

## 1. Pré-Requisitos

1. **Ferramentas necessárias:**
   - PostgreSQL Client (`psql` e `pg_dump` versão 15 ou superior).
   - `gzip` / `gunzip`.
2. **Arquivo de Backup:**
   - Obtenha o dump mais recente no Google Drive (pasta configurada) ou no diretório `backups/`.
   - Formato padronizado: `cafeteriadoteatro_backup_YYYY-MM-DD_HHMM.sql.gz`.
3. **Credenciais do Banco de Destino:**
   - String de conexão segura para o banco onde o backup será restaurado (ex: banco local de teste ou nova instância Supabase).

---

## 2. Passo a Passo de Restauração em Banco Limpo

### Passo 1: Descompactar o Dump
No terminal, descompacte o arquivo preservando o original:
```bash
gunzip -k cafeteriadoteatro_backup_YYYY-MM-DD_HHMM.sql.gz
# Gera: cafeteriadoteatro_backup_YYYY-MM-DD_HHMM.sql
```

### Passo 2: Criar e Limpar o Banco de Destino
Em ambiente de homologação ou teste local:
```bash
# Conectado ao postgres
dropdb --if-exists -h localhost -U postgres cafeteria_restaurada
createdb -h localhost -U postgres cafeteria_restaurada
```

### Passo 3: Executar a Restauração
Aplique o script SQL completo no banco de destino:
```bash
psql "postgresql://postgres:postgres@localhost:5432/cafeteria_restaurada" \
  -f cafeteriadoteatro_backup_YYYY-MM-DD_HHMM.sql \
  --set ON_ERROR_STOP=on
```

---

## 3. Query de Verificação e Auditoria de Integridade (CA07)

Após a restauração, execute a query abaixo para validar se todas as tabelas essenciais contêm dados coerentes e batem com a origem:

```sql
SELECT
  'pedidos' AS tabela, COUNT(*) AS total_registros FROM public.pedidos
UNION ALL
SELECT
  'fechamentos', COUNT(*) FROM public.fechamentos
UNION ALL
SELECT
  'fechamento_pagamentos', COUNT(*) FROM public.fechamento_pagamentos
UNION ALL
SELECT
  'clientes', COUNT(*) FROM public.clientes
UNION ALL
SELECT
  'produtos', COUNT(*) FROM public.produtos
UNION ALL
SELECT
  'estoque_itens', COUNT(*) FROM public.estoque_itens
UNION ALL
SELECT
  'caixas', COUNT(*) FROM public.caixas
UNION ALL
SELECT
  'app_migrations', COUNT(*) FROM public.app_migrations;
```

### Critério de Sucesso do Ensaio:
- Nenhuma tabela core deve retornar erro de schema inexistente.
- A quantidade de `pedidos`, `fechamentos` e `clientes` deve coincidir exatamente com a contagem da origem no momento do dump.
- A tabela `public.app_migrations` deve listar a versão correspondente da migration em produção.

---

## 4. Restauração de Emergência em Instância Supabase

Se for necessário restaurar uma instância Supabase vazia em caso de desastre:
1. Acesse as configurações de banco no painel do Supabase e obtenha a **Direct Connection String** (porta 5432).
2. Execute o comando de restauração com `ON_ERROR_STOP=off` para ignorar extensões gerenciadas pelo Supabase (`auth`, `extensions`, `vault`):
```bash
psql "$DIRECT_SUPABASE_URL" \
  -f cafeteriadoteatro_backup_YYYY-MM-DD_HHMM.sql
```
3. Rode `npm run db:migrate -- --dry-run` para confirmar que todas as migrations estão em conformidade com o manifesto oficial.

