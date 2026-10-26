import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('CAF-000072: Baseline do schema de produção e reconciliação de migrations', () => {
  const rootDir = process.cwd();
  const snapshotPath = path.join(rootDir, 'supabase/snapshots/producao-2026-10-22-antes.csv');
  const baselineSqlPath = path.join(rootDir, 'supabase/migration_caf_000072_baseline_producao.sql');
  const readmePath = path.join(rootDir, 'supabase/README.md');
  const fixturePath = path.join(rootDir, 'tests/fixtures/schema-snapshot.json');

  describe('CA01 / RF01: Snapshot do catálogo de produção', () => {
    it('o snapshot CSV existe e contém as seções 1 a 9 sem dados pessoais', () => {
      expect(fs.existsSync(snapshotPath)).toBe(true);
      const csv = fs.readFileSync(snapshotPath, 'utf8');
      const lines = csv.split('\n');

      expect(csv).toContain('1_funcao');
      expect(csv).toContain('2_corpo');
      expect(csv).toContain('3_coluna');
      expect(csv).toContain('4_relacao');
      expect(csv).toContain('5_trigger');
      expect(csv).toContain('6_check');
      expect(csv).toContain('7_view');
      expect(csv).toContain('8_policy');
      expect(csv).toContain('9_config');

      // Verifica ausência de dados pessoais ou pedidos específicos
      expect(csv).not.toMatch(/\b(senha|password_hash|cartao_numero|cvv)\b/i);
    });
  });

  describe('CA02, CA03 / RF02: Baseline idempotente de produção', () => {
    it('a baseline cria produto_adicionais_permitidos com PK e RLS idempotente', () => {
      expect(fs.existsSync(baselineSqlPath)).toBe(true);
      const sql = fs.readFileSync(baselineSqlPath, 'utf8');

      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.produto_adicionais_permitidos/i);
      expect(sql).toMatch(/PRIMARY KEY\s*\(produto_id,\s*adicional_id\)/i);
      expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).toMatch(/GRANT SELECT ON public\.produto_adicionais_permitidos/i);
    });

    it('a baseline assegura a coluna custo_unitario_medio em estoque_itens', () => {
      const sql = fs.readFileSync(baselineSqlPath, 'utf8');
      expect(sql).toMatch(/custo_unitario_medio/i);
      expect(sql).toMatch(/ALTER TABLE public\.estoque_itens ADD COLUMN/i);
    });

    it('a baseline suporta pedido_origem_id para pedidos adicionais (RF04 da 084)', () => {
      const sql = fs.readFileSync(baselineSqlPath, 'utf8');
      expect(sql).toMatch(/pedido_origem_id/i);
    });

    it('a baseline define v_adicionais_produto com security_invoker', () => {
      const sql = fs.readFileSync(baselineSqlPath, 'utf8');
      expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.v_adicionais_produto/i);
      expect(sql).toMatch(/security_invoker\s*=\s*true/i);
    });
  });

  describe('CA04, CA05 / RF03, RF04: Documentação e tabela de correspondência', () => {
    it('supabase/README.md estabelece o repositório como única fonte de verdade e detalha ordem', () => {
      expect(fs.existsSync(readmePath)).toBe(true);
      const readme = fs.readFileSync(readmePath, 'utf8');

      expect(readme).toMatch(/fonte de verdade/i);
      expect(readme).toMatch(/Ordem Oficial de Aplicação/i);
      expect(readme).toMatch(/pedidos_schema\.sql/i);
      expect(readme).toMatch(/migration_caf_000072_baseline_producao\.sql/i);
    });

    it('supabase/README.md contém tabela de correspondência de migrations antigas', () => {
      const readme = fs.readFileSync(readmePath, 'utf8');
      expect(readme).toMatch(/migration_caf_000005\.sql.*CAF-000006/i);
      expect(readme).toMatch(/migration_caf_000021_cliente_viagem\.sql.*CAF-000010/i);
      expect(readme).toMatch(/migration_caf_000023_taxa_desconto\.sql.*CAF-000013/i);
      expect(readme).toMatch(/migration_caf_000025_caixa\.sql.*CAF-000015/i);
      expect(readme).toMatch(/migration_caf_000029_tempo_alvo_semaforo\.sql.*CAF-000025/i);
    });
  });

  describe('CA06, CA07 / RF05, RF06: Fixture do schema e integridade', () => {
    it('o snapshot json de schema existe e cataloga RPCs e tabelas essenciais', () => {
      expect(fs.existsSync(fixturePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      expect(json.rpcs).toBeDefined();
      expect(json.rpcs.fechar_conta_mesa).toBeDefined();
      expect(json.rpcs.adicionar_itens_pedido).toBeDefined();
      expect(json.rpcs.cancelar_item).toBeDefined();
      expect(json.tables).toBeDefined();
    });

    it('a baseline não contém comandos destrutivos (DROP TABLE/TRUNCATE/DELETE)', () => {
      const sql = fs.readFileSync(baselineSqlPath, 'utf8');
      expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    });
  });
});
