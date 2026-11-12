# [CHORE] Banco: backup com restauração testada, runner de migrations e rollbacks das migrations 103–113

> **Status:** Concluída
> **Autor:** Claude Code · **Revisor:** Natanael · **Criada em:** 2026-11-10 · **Atualizada em:** 2026-11-12

## Detalhes da Atividade

- **O que precisa ser feito:** Garantir que o banco de produção possa ser recuperado e que toda migration seja aplicada por um comando único, ensaiada antes em banco limpo e com rollback disponível.
- **Problema e evidência:**
  - Não há rotina de backup nem roteiro de restauração no repositório (nenhuma menção a backup/`pg_dump` em `README.md`, `supabase/README.md`, `scripts/` ou `.github/`). O banco concentra vendas, caixa, fiado, estoque e DRE.
  - As migrations são 70+ arquivos SQL soltos em `supabase/`, aplicados à mão. O único script de banco é `scripts/test-db-runner.js` (testes). A tabela `app_migrations` existe desde a CAF-000072, mas o registro depende de cada arquivo lembrar de inserir a própria linha — o commit `2a3d75e` corrige justamente a migration 103 que esqueceu.
  - `supabase/rollback/` só cobre 072–083; as migrations 103, 104, 106, 107, 108, 110, 111, 112 e 113 não têm rollback.
  - `supabase/README.md` lista a ordem oficial só até a 083, enquanto `SDD/INDICE.md` vai até a 113 (duas fontes divergentes).
  - O commit `94d6b99` corrige uma RPC publicada com nomes de coluna que não existiam em produção, sinal de que a migration não foi ensaiada contra o schema real.
- **Impacto de não fazer:** Perda de dados financeiros sem recuperação possível; migration aplicada pela metade ou fora de ordem em produção; correção de emergência sem caminho de volta.
- **Para quem é destinado:** Desenvolvedor e administrador.
- **História de usuário:** Como responsável pelo sistema, quero aplicar migrations com um comando e ter backup restaurável, para publicar mudanças no banco sem risco de perder o histórico da cafeteria.
- **Como saberemos que deu certo:** Restauração completa ensaiada em banco vazio em menos de 30 min; `npm run db:migrate` aplica só o que falta e registra em `app_migrations`; 100% das migrations a partir da 103 com rollback.

## Requisitos da Atividade

### Requisitos funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RF01 | Script `scripts/db-migrate.mjs` lê um manifesto ordenado, compara com `app_migrations`, aplica as pendentes em transação e registra versão, arquivo e checksum | P0 | CA01, CA02 |
| RF02 | Manifesto único (`supabase/migrations.manifest.json`) vira a fonte da ordem; `supabase/README.md` e a seção 3 do `INDICE.md` passam a apontar para ele | P0 | CA03 |
| RF03 | Modo `--dry-run` lista o que seria aplicado sem alterar o banco | P0 | CA04 |
| RF04 | Rollbacks para 103, 104, 106, 107, 108, 110, 111, 112 e 113 em `supabase/rollback/` | P0 | CA05 |
| RF05 | Backup diário automatizado (dump lógico) guardado fora do Supabase, com retenção de 30 dias | P0 | CA06 |
| RF06 | Roteiro `supabase/RESTAURACAO.md` e ensaio de restauração executado e registrado | P0 | CA07 |
| RF07 | CI aplica todas as migrations do manifesto em Postgres limpo e depois roda os rollbacks na ordem inversa | P1 | CA08 |

### Requisitos não-funcionais

| ID | Descrição | Prioridade | CAs |
|----|-----------|------------|-----|
| RNF01 | Credenciais de banco só em secrets (GitHub/ambiente), nunca no repositório | P0 | CA06 |
| RNF02 | O runner recusa aplicar se o checksum de uma migration já registrada mudou | P0 | CA02 |
| RNF03 | O dump de backup é criptografado em repouso | P1 | CA06 |

### Dependências técnicas

- `app_migrations` (CAF-000072) — precisa de coluna `checksum`.
- `scripts/test-db-runner.js` (reaproveitar a conexão e a ordem já usadas nos testes).
- GitHub Actions (agendamento do backup) e um destino de armazenamento.

### Recursos necessários

- String de conexão de produção (somente em secret) e um bucket/armazenamento externo para os dumps.

## Critérios de Aceitação / Entregas

- [x] **CA01:** Dado um banco com migrations até a 112, quando rodo `npm run db:migrate`, então só a 113 é aplicada e registrada em `app_migrations`.
- [x] **CA02:** Dado que o arquivo de uma migration já aplicada foi alterado, quando rodo o runner, então ele aborta com erro citando o arquivo, sem aplicar nada.
- [x] **CA03:** Dado o manifesto, quando comparo com os arquivos `migration_*.sql` do diretório, então todo arquivo está no manifesto ou em uma lista explícita de "históricos/não aplicar".
- [x] **CA04:** Dado `--dry-run`, quando há pendentes, então elas são listadas e o banco permanece inalterado.
- [x] **CA05:** Dado um banco na 113, quando aplico os rollbacks 113→103 e reaplico as migrations, então os testes pgTAP passam.
- [x] **CA06:** Dado o agendamento diário, quando o job roda, então um dump novo aparece no destino e dumps com mais de 30 dias são removidos; nenhuma credencial aparece nos logs.
- [x] **CA07:** Dado um dump de produção, quando sigo `RESTAURACAO.md` em um banco vazio, então as contagens de `pedidos`, `fechamentos` e `clientes` batem com a origem.
- [x] **CA08:** Dado um PR que adiciona migration sem rollback ou fora do manifesto, quando o CI roda, então o job falha.

## O que a atividade não inclui

- Migrar para o formato `supabase/migrations/` da Supabase CLI: motivo: renomear 70+ arquivos quebra o `INDICE.md` e o teste da CAF-000085; o manifesto resolve a ordem sem isso.
- Ambiente de homologação permanente: motivo: custo; o ensaio em Postgres limpo no CI cobre o risco principal.
- Rollbacks das migrations anteriores à 072: motivo: o baseline 072 já é o ponto de partida.

### Considerado para o futuro (P2)

- Projeto Supabase de staging com cópia anonimizada de produção.
- Point-in-time recovery (plano pago da Supabase).

## Dúvidas em aberto

| # | Dúvida | Responsável (PO/dev/design) | Bloqueante? | Resposta |
|---|--------|-----------------------------|-------------|----------|
| D01 | Qual o plano atual da Supabase e ele já inclui backup diário? Se sim, o RF05 vira "backup adicional fora do fornecedor" | PO | Sim | Plano gratuito (Free). O backup diário externo automatizado via GitHub Actions é indispensável para evitar perda de dados por inatividade/falha. |
| D02 | Onde guardar os dumps (Google Drive, S3, R2)? | PO | Sim | Google Drive (via Service Account em secrets do GitHub), com retenção e limpeza automática de 30 dias. |
| D03 | `migrations_todas_consolidadas.sql`, `migration_fase2.sql`, `migration_fase3_final.sql` e `migration_pedidos_v2.sql` entram no manifesto ou na lista de históricos? | dev | Não | Entram na lista explícita de `arquivos_historicos_ignorados` no manifesto `supabase/migrations.manifest.json`. |

## Sugestões de casos de teste

| # | Cenário | Tipo (unit/integração/e2e/manual) | Cobre | Passos | Resultado esperado |
|---|---------|-----------------------------------|-------|--------|--------------------|
| CT01 | Aplica só pendentes | integração (Postgres CI) | CA01 | Banco na 112, rodar runner | 113 aplicada e registrada |
| CT02 | Checksum divergente | integração | CA02 | Alterar arquivo já aplicado | Aborta sem aplicar |
| CT03 | Manifesto completo | unit | CA03 | Comparar diretório × manifesto | Sem arquivos órfãos |
| CT04 | Dry-run | integração | CA04 | Rodar com `--dry-run` | Lista pendentes, banco intacto |
| CT05 | Ida e volta | integração | CA05, CA08 | Aplicar, reverter 113→103, reaplicar | pgTAP verde |
| CT06 | Backup agendado | manual | CA06 | Disparar job manualmente | Dump no destino, logs sem segredo |
| CT07 | Ensaio de restauração | manual | CA07 | Seguir o roteiro | Contagens iguais |

## URL Complementar

- Documentação técnica: `supabase/README.md`, `SDD/INDICE.md` (seção 3), `scripts/test-db-runner.js`
- Protótipo / mockup: —
- Discussões relacionadas: [CAF-000072](CONCLUIDAS/CAF-000072-baseline-schema-producao-e-reconciliacao-migrations.md), [CAF-000098](CONCLUIDAS/CAF-000098-aplicar-migrations-em-producao-e-snapshot-real.md)
- Referências de design: —
- Requisitos originais: [PLANO_EVOLUCAO.md](PLANO_EVOLUCAO.md)
- Issue / PR relacionado: commits `94d6b99`, `2a3d75e`
