import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('CAF-000098: Rodar as migrations 072–083 em produção', () => {
  const rootDir = process.cwd();
  const snapshotRealAntes = path.join(rootDir, 'supabase/snapshots/producao-2026-10-22-antes.csv');
  const snapshotFicticio = path.join(rootDir, 'supabase/snapshots/producao-2026-10-21.csv');

  const migrationNumbers = [
    '072', '073', '074', '075', '076', '077',
    '078', '079', '080', '081', '082', '083'
  ];

  const migrationFiles = {
    '072': 'migration_caf_000072_baseline_producao.sql',
    '073': 'migration_caf_000073_fechamento_conta_mesa.sql',
    '074': 'migration_caf_000074_correcao_estoque_ficha_tecnica.sql',
    '075': 'migration_caf_000075_validacao_adicionais_xss.sql',
    '076': 'migration_caf_000076_correcao_cashback.sql',
    '077': 'migration_caf_000077_cupons_uso_unico.sql',
    '078': 'migration_caf_000078_financeiro_despesas.sql',
    '079': 'migration_caf_000079_pix_admin_taxas_caixa.sql',
    '080': 'migration_caf_000080_fuso_horario.sql',
    '081': 'migration_caf_000081_seguranca_pin_rls.sql',
    '082': 'migration_caf_000082_seguranca.sql',
    '083': 'migration_caf_000083_pendencias_operacao.sql'
  };

  describe('CA01 / RF01: Diagnóstico Real de Produção e Remoção do Fictício', () => {
    it('o snapshot real de produção existe e o arquivo fictício foi excluído', () => {
      expect(fs.existsSync(snapshotRealAntes)).toBe(true);
      expect(fs.existsSync(snapshotFicticio)).toBe(false);

      const content = fs.readFileSync(snapshotRealAntes, 'utf8');
      expect(content).toContain('1_funcao');
      expect(content).toContain('3_coluna');
      expect(content).toContain('9_config');

      // Colunas reais de produção presentes
      expect(content).toContain('created_at:timestamp with time zone');
      expect(content).toContain('pago_em:date');

      // Colunas fictícias do arquivo antigo removidas
      expect(content).not.toContain('pedidos.criado_em');
      expect(content).not.toContain('fechamentos.pagamentos');
      expect(content).not.toContain('estoque_itens.unidade_medida');
    });
  });

  describe('CA03 / RF03: Correção de Bloqueios B1 a B9 nas Migrations 072 a 083', () => {
    it('B1 (072 / 075): 072 tolera view existente e 075 migra dados se for tabela antes da view', () => {
      const sql072 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['072']), 'utf8');
      const sql075 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['075']), 'utf8');

      expect(sql072).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_class.*produto_adicionais_permitidos/is);
      expect(sql075).toMatch(/RENAME TO produto_adicionais_permitidos_legado/);
      expect(sql075).toMatch(/CREATE OR REPLACE VIEW public\.produto_adicionais_permitidos/);
    });

    it('B2 (073 / 077): remove assinaturas antigas de fechar_conta_mesa e padroniza idempotency_key TEXT', () => {
      const sql073 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['073']), 'utf8');
      const sql077 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['077']), 'utf8');

      for (const sql of [sql073, sql077]) {
        expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.fechar_conta_mesa\(TEXT,\s*JSONB\);/i);
        expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.fechar_conta_mesa\(TEXT,\s*JSONB,\s*NUMERIC,\s*NUMERIC,\s*TEXT\);/i);
        expect(sql).toMatch(/p_idempotency_key TEXT/);
        expect(sql).not.toMatch(/FROM public\.fechamentos_caixa/i);
        expect(sql).not.toMatch(/INSERT INTO public\.fechamentos_caixa/i);
        expect(sql).toMatch(/INSERT INTO public\.fechamentos/i);
      }
    });

    it('B3 (081): transferir_mesa mantém parâmetros p_origem/p_destino, mesa_codigo e DROP da void', () => {
      const sql081 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['081']), 'utf8');

      expect(sql081).toMatch(/DROP FUNCTION IF EXISTS public\.transferir_mesa\(TEXT,\s*TEXT\);/);
      expect(sql081).toMatch(/CREATE OR REPLACE FUNCTION public\.transferir_mesa\(\s*p_origem TEXT,\s*p_destino TEXT\s*\)/);
      expect(sql081).toMatch(/SET mesa_codigo = TRIM\(p_destino\)/);
      expect(sql081).toMatch(/WHERE mesa_codigo = TRIM\(p_origem\)/);
    });

    it('B4 (081): remove sobrecarga de 4 parâmetros de validar_pin_autorizacao', () => {
      const sql081 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['081']), 'utf8');

      expect(sql081).toMatch(/DROP FUNCTION IF EXISTS public\.validar_pin_autorizacao\(TEXT,\s*TEXT,\s*TEXT,\s*JSONB\);/);
      expect(sql081).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_pin_autorizacao\(/);
    });

    it('B5 (082): não recria registrar_uso_cupom(bigint, numeric) e protege a de 2 bigints', () => {
      const sql082 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['082']), 'utf8');

      expect(sql082).toMatch(/DROP FUNCTION IF EXISTS public\.registrar_uso_cupom\(BIGINT,\s*NUMERIC\);/);
      expect(sql082).toMatch(/REVOKE EXECUTE ON FUNCTION public\.registrar_uso_cupom\(BIGINT,\s*BIGINT\) FROM anon/);
      expect(sql082).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_uso_cupom\(BIGINT,\s*BIGINT\) TO authenticated/);
    });

    it('B6 (080 / 082): executa DROP VIEW IF EXISTS v_painel_retirada antes de recriar com menos colunas', () => {
      const sql080 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['080']), 'utf8');
      const sql082 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['082']), 'utf8');

      expect(sql080).toMatch(/DROP VIEW IF EXISTS public\.v_painel_retirada;\s*CREATE OR REPLACE VIEW public\.v_painel_retirada/is);
      expect(sql082).toMatch(/DROP VIEW IF EXISTS public\.v_painel_retirada;\s*CREATE OR REPLACE VIEW public\.v_painel_retirada/is);
    });

    it('B7 (079 / 083): fn_calcular_totais_caixa_interno na 083 preserva total_taxas e total_liquido', () => {
      const sql083 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['083']), 'utf8');

      expect(sql083).toMatch(/'total_taxas',\s*v_total_taxas/);
      expect(sql083).toMatch(/'total_liquido',\s*v_total_liquido/);
      expect(sql083).toMatch(/'total_depositos_clientes',\s*v_total_depositos_clientes/);
    });

    it('B8: migrations usam ADD COLUMN IF NOT EXISTS nas alterações de tabela', () => {
      for (const num of ['072', '073', '074', '078', '083']) {
        const sql = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles[num]), 'utf8');
        const addColumns = [...sql.matchAll(/ALTER TABLE\s+public\.\w+\s+ADD COLUMN\s+([^;\n]+)/gi)];
        for (const m of addColumns) {
          expect(m[1]).toMatch(/IF NOT EXISTS/i);
        }
      }
    });

    it('B9: todas as 12 migrations (072 a 083) estão envoltas em transação BEGIN ... COMMIT', () => {
      for (const num of migrationNumbers) {
        const sql = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles[num]), 'utf8').trim();
        expect(sql.startsWith('BEGIN;'), `Migration ${num} deve iniciar com BEGIN;`).toBe(true);
        expect(sql.endsWith('COMMIT;'), `Migration ${num} deve terminar com COMMIT;`).toBe(true);
      }
    });
  });

  describe('CA04 / RF04: Tabela de Controle app_migrations', () => {
    it('migration 072 cria app_migrations e todas as migrations 072 a 083 inserem seu registro', () => {
      const sql072 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['072']), 'utf8');
      expect(sql072).toMatch(/CREATE TABLE IF NOT EXISTS public\.app_migrations\s*\(\s*versao TEXT PRIMARY KEY/is);

      for (const num of migrationNumbers) {
        const sql = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles[num]), 'utf8');
        expect(sql).toMatch(new RegExp(`INSERT INTO public\\.app_migrations \\(versao, arquivo\\)\\s*VALUES \\('${num}', '${migrationFiles[num]}'\\)`, 'i'));
        expect(sql).toMatch(/ON CONFLICT \(versao\) DO NOTHING/i);
      }
    });
  });

  describe('CA08 / RF08: Scripts de Rollback Individuais', () => {
    it('todas as 12 migrations possuem arquivo de rollback em supabase/rollback/', () => {
      const rollbackDir = path.join(rootDir, 'supabase/rollback');
      expect(fs.existsSync(rollbackDir)).toBe(true);

      for (const num of migrationNumbers) {
        const rollbackFile = path.join(rollbackDir, `rollback_caf_000${num}.sql`);
        expect(fs.existsSync(rollbackFile), `Rollback para 000${num} deve existir`).toBe(true);
        const sql = fs.readFileSync(rollbackFile, 'utf8').trim();
        expect(sql.startsWith('BEGIN;')).toBe(true);
        expect(sql.endsWith('COMMIT;')).toBe(true);
        expect(sql).toMatch(new RegExp(`DELETE FROM public\\.app_migrations WHERE versao = '${num}';`));
      }
    });
  });

  describe('CA12 (Negativo): RPCs críticas não concedem acesso a usuários anônimos', () => {
    it('fechar_conta_mesa, processar_cashback_pedido, registrar_uso_cupom e transferir_mesa revogam anon', () => {
      const sql073 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['073']), 'utf8');
      const sql077 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['077']), 'utf8');
      const sql081 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['081']), 'utf8');
      const sql082 = fs.readFileSync(path.join(rootDir, 'supabase', migrationFiles['082']), 'utf8');

      expect(sql073).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fechar_conta_mesa.*FROM anon/i);
      expect(sql077).toMatch(/REVOKE EXECUTE ON FUNCTION public\.registrar_uso_cupom.*FROM anon/i);
      expect(sql081).toMatch(/REVOKE EXECUTE ON FUNCTION public\.transferir_mesa FROM anon/i);
      expect(sql082).toMatch(/REVOKE EXECUTE ON FUNCTION public\.processar_cashback_pedido.*FROM anon/i);
    });
  });

  describe('CA07 / CA09: Snapshot Real Depois e Catálogo Pós-Janela', () => {
    it('o snapshot pós-janela existe e reflete a aplicação das migrations 072 a 083', () => {
      const snapshotRealDepois = path.join(rootDir, 'supabase/snapshots/producao-2026-10-22-depois.csv');
      expect(fs.existsSync(snapshotRealDepois)).toBe(true);

      const content = fs.readFileSync(snapshotRealDepois, 'utf8');
      // Contém novas colunas criadas nas tabelas monitoradas
      expect(content).toContain('idempotency_key');
      expect(content).toContain('pedido_origem_id');
      expect(content).toContain('documento:text');

      // Anon sem permissão de execução nas RPCs críticas pós-082
      expect(content).toMatch(/fechar_conta_mesa.*anon_exec=f/);
      expect(content).toMatch(/transferir_mesa.*anon_exec=f/);
    });
  });
});



