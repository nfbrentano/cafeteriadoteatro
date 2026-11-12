import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  calcularChecksum,
  carregarManifesto,
  validarIntegridadeDiretorio,
  calcularDiferencasMigracao,
  rodarMigrations,
  getSqlSetupAppMigrations,
  MANIFEST_PATH,
  SQL_DIR
} from '../scripts/db-migrate.mjs';
import {
  mascararConnectionString,
  gerarNomeArquivoBackup,
  filtrarDumpsAntigos,
  RETENCAO_DIAS
} from '../scripts/backup-db.mjs';

describe('CAF-000116: Banco — Backup, Restauração, Runner de Migrations e Rollbacks 103–115', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Integridade do Manifesto e Catálogo de Migrations (CA03)', () => {
    it('CA03: 100% dos arquivos .sql em supabase/ estão mapeados no manifesto ou em listas de ignorados', () => {
      const manifest = carregarManifesto();
      const resultado = validarIntegridadeDiretorio(manifest);

      expect(resultado.valido, `Arquivos órfãos encontrados: ${resultado.orfaos.join(', ')}`).toBe(true);
      expect(resultado.orfaos).toHaveLength(0);
      expect(resultado.totalSql).toBeGreaterThanOrEqual(70);
    });

    it('CA03: detecta e reprova qualquer arquivo .sql não mapeado adicionado ao diretório', () => {
      const manifest = carregarManifesto();
      const manifestComOrfao = {
        ...manifest,
        migrations: manifest.migrations.slice(1) // remove o primeiro arquivo
      };

      const resultado = validarIntegridadeDiretorio(manifestComOrfao);
      expect(resultado.valido).toBe(false);
      expect(resultado.orfaos).toContain('pedidos_schema.sql');
    });

    it('CA03: arquivos históricos legados estão explicitamente catalogados em arquivos_historicos_ignorados', () => {
      const manifest = carregarManifesto();
      const historicos = manifest.arquivos_historicos_ignorados || [];

      expect(historicos).toContain('migration_fase2.sql');
      expect(historicos).toContain('migration_fase3_final.sql');
      expect(historicos).toContain('migration_pedidos_v2.sql');
      expect(historicos).toContain('migrations_todas_consolidadas.sql');
    });
  });

  describe('2. Identificação e Aplicação de Migrations Pendentes (CA01)', () => {
    it('CA01: dado banco com migrations até a 112, identifica exatamente as pendentes subsequentes (113 e 115)', () => {
      const manifest = carregarManifesto();

      // Simula banco contendo todas as migrations até a 112
      const bancoMock = manifest.migrations
        .filter(m => m.versao !== '113' && m.versao !== '115')
        .map(m => ({
          versao: m.versao,
          arquivo: m.arquivo,
          checksum: m.checksum,
          aplicada_em: '2026-11-01T12:00:00Z'
        }));

      const { pendentes, divergencias, aplicadas } = calcularDiferencasMigracao(manifest.migrations, bancoMock);

      expect(divergencias).toHaveLength(0);
      expect(aplicadas.length).toBe(manifest.migrations.length - 2);
      expect(pendentes).toHaveLength(2);

      const versoesPendentes = pendentes.map(p => p.versao);
      expect(versoesPendentes).toContain('113');
      expect(versoesPendentes).toContain('115');
    });

    it('CA01: script de setup de app_migrations inclui a coluna checksum', () => {
      const sql = getSqlSetupAppMigrations();
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS checksum TEXT');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.app_migrations');
    });
  });

  describe('3. Detecção de Checksum Divergente e Proteção Contra Alteração Retroativa (CA02 / RNF02)', () => {
    it('CA02: identifica divergência quando uma migration já aplicada teve seu conteúdo alterado', () => {
      const manifest = carregarManifesto();

      // Simula que a migration 103 foi gravada no banco com outro hash
      const bancoMock = [
        {
          versao: '103',
          arquivo: 'migration_caf_000103_totem_animacao_fundo.sql',
          checksum: 'hash_antigo_adulterado_12345'
        }
      ];

      const { divergencias } = calcularDiferencasMigracao(manifest.migrations, bancoMock);

      expect(divergencias.length).toBeGreaterThan(0);
      const div103 = divergencias.find(d => d.versao === '103');
      expect(div103).toBeDefined();
      expect(div103.arquivo).toBe('migration_caf_000103_totem_animacao_fundo.sql');
      expect(div103.checksumBanco).toBe('hash_antigo_adulterado_12345');
    });

    it('CA02: rodarMigrations aborta com exceção descritiva quando detecta checksum adulterado', async () => {
      const manifest = carregarManifesto();
      const bancoComAlteracao = [
        {
          versao: '110',
          arquivo: 'migration_caf_000110_combos_kits.sql',
          checksum: 'checksum_falso_quebrado'
        }
      ];

      await expect(rodarMigrations({
        manifest,
        migrationsBanco: bancoComAlteracao
      })).rejects.toThrow(/Violação de integridade: migration já aplicada em produção foi alterada no Git/i);
    });
  });

  describe('4. Modo Simulação / Dry-Run (CA04)', () => {
    it('CA04: no modo dry-run lista as pendentes sem executar nenhuma instrução no banco', async () => {
      const manifest = carregarManifesto();

      // Simula banco com apenas pedidos_schema.sql
      const bancoMock = [
        { versao: '000', arquivo: 'pedidos_schema.sql', checksum: manifest.migrations[0].checksum }
      ];

      const resultado = await rodarMigrations({
        dryRun: true,
        manifest,
        migrationsBanco: bancoMock
      });

      expect(resultado.dryRun).toBe(true);
      expect(resultado.executadas).toBe(0);
      expect(resultado.pendentes.length).toBe(manifest.migrations.length - 1);
    });
  });

  describe('5. Cobertura Completa de Rollbacks das Migrations 103 a 115 (CA05)', () => {
    const versoesObrigatorias = ['103', '104', '106', '107', '108', '110', '111', '112', '113', '115'];

    versoesObrigatorias.forEach(versao => {
      it(`CA05: rollback da migration ${versao} existe em supabase/rollback/ com estrutura transacional válida`, () => {
        const rollbackFile1 = path.resolve(`supabase/rollback/rollback_caf_${versao}.sql`);
        const rollbackFile2 = path.resolve(`supabase/rollback/rollback_caf_${versao.padStart(6, '0')}.sql`);
        const rollbackFile3 = path.resolve(`supabase/rollback/rollback_caf_${versao.padStart(3, '0')}.sql`);

        const existe = fs.existsSync(rollbackFile1) || fs.existsSync(rollbackFile2) || fs.existsSync(rollbackFile3);
        expect(existe, `Rollback para a migration ${versao} não encontrado!`).toBe(true);

        const arqValido = [rollbackFile1, rollbackFile2, rollbackFile3].find(f => fs.existsSync(f));
        const conteudo = fs.readFileSync(arqValido, 'utf-8');

        // Valida estrutura transacional
        expect(conteudo).toMatch(/BEGIN;/i);
        expect(conteudo).toMatch(/DELETE\s+FROM\s+public\.app_migrations\s+WHERE\s+versao/i);
        expect(conteudo).toMatch(/COMMIT;/i);
      });
    });
  });

  describe('6. Rotina de Backup, Mascaramento de Secrets e Retenção 30d (CA06 / RNF01)', () => {
    it('CA06 / RNF01: mascararConnectionString oculta senha em URLs de conexão do Postgres', () => {
      const rawUrl = 'postgresql://postgres:minhaSenhaSecreta123@db.nyretgvzbnbtiyeioeju.supabase.co:5432/postgres';
      const mascarada = mascararConnectionString(rawUrl);

      expect(mascarada).not.toContain('minhaSenhaSecreta123');
      expect(mascarada).toContain('********');
      expect(mascarada).toContain('postgres');
      expect(mascarada).toContain('db.nyretgvzbnbtiyeioeju.supabase.co');
    });

    it('CA06: gerarNomeArquivoBackup gera padrão cronológico com timestamp', () => {
      const dataRef = new Date('2026-11-12T03:30:00Z');
      const nome = gerarNomeArquivoBackup(dataRef);

      expect(nome).toBe('cafeteriadoteatro_backup_2026-11-12_0330.sql.gz');
    });

    it('CA06: filtrarDumpsAntigos seleciona apenas arquivos com mais de 30 dias para remoção', () => {
      const dataAtual = new Date('2026-11-12T00:00:00Z');

      const dumps = [
        { name: 'backup_2026-11-10.sql.gz', createdTime: '2026-11-10T00:00:00Z' }, // 2 dias (mantém)
        { name: 'backup_2026-10-25.sql.gz', createdTime: '2026-10-25T00:00:00Z' }, // 18 dias (mantém)
        { name: 'backup_2026-10-14.sql.gz', createdTime: '2026-10-14T00:00:00Z' }, // 29 dias (mantém)
        { name: 'backup_2026-10-10.sql.gz', createdTime: '2026-10-10T00:00:00Z' }, // 33 dias (remove)
        { name: 'backup_2026-09-01.sql.gz', createdTime: '2026-09-01T00:00:00Z' }  // 72 dias (remove)
      ];

      const paraRemover = filtrarDumpsAntigos(dumps, RETENCAO_DIAS, dataAtual);

      expect(paraRemover).toHaveLength(2);
      expect(paraRemover.map(f => f.name)).toEqual([
        'backup_2026-10-10.sql.gz',
        'backup_2026-09-01.sql.gz'
      ]);
    });

    it('CA06: workflow .github/workflows/backup-diario.yml existe e possui agendamento cron diário', () => {
      const wfPath = path.resolve('.github/workflows/backup-diario.yml');
      expect(fs.existsSync(wfPath)).toBe(true);

      const content = fs.readFileSync(wfPath, 'utf-8');
      expect(content).toContain('cron:');
      expect(content).toContain('scripts/backup-db.mjs');
      expect(content).toContain('secrets.SUPABASE_DB_URL');
      expect(content).toContain('secrets.GDRIVE_SERVICE_ACCOUNT_KEY');
    });
  });

  describe('7. Roteiro e Query de Verificação da Restauração (CA07)', () => {
    it('CA07: supabase/RESTAURACAO.md documenta o passo a passo e contém a query de integridade', () => {
      const docPath = path.resolve('supabase/RESTAURACAO.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf-8');
      expect(content).toContain('gunzip');
      expect(content).toContain('psql');
      expect(content).toContain('public.pedidos');
      expect(content).toContain('public.fechamentos');
      expect(content).toContain('public.clientes');
      expect(content).toContain('public.app_migrations');
    });
  });

  describe('8. Configuração de Scripts e Dependências (CA08)', () => {
    it('CA08: package.json inclui o comando oficial db:migrate', () => {
      const pkgPath = path.resolve('package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.scripts['db:migrate']).toBe('node scripts/db-migrate.mjs');
    });

    it('CA08: README.md e INDICE.md apontam para supabase/migrations.manifest.json', () => {
      const readme = fs.readFileSync(path.resolve('supabase/README.md'), 'utf-8');
      const indice = fs.readFileSync(path.resolve('SDD/INDICE.md'), 'utf-8');

      expect(readme).toContain('migrations.manifest.json');
      expect(indice).toContain('migrations.manifest.json');
    });
  });
});

