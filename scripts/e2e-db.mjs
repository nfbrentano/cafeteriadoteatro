#!/usr/bin/env node
/**
 * scripts/e2e-db.mjs
 * CAF-000120 — Banco PostgreSQL isolado (PGlite WASM) para Testes E2E e Integração.
 *
 * Responsabilidades:
 * - Impedir qualquer apontamento para o banco de produção (RNF01 / CA01)
 * - Provisionar schemas auth/storage e tabelas pré-manifesto (00_bootstrap.sql)
 * - Executar 100% das migrations canônicas de supabase/migrations.manifest.json
 * - Aplicar seed sintético mínimo (01_seed.sql) sem dados de produção (RNF03)
 * - Suportar execução transacional com claims JWT reais via set_config(..., true)
 */

import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import {
  carregarManifesto,
  calcularChecksum,
  getSqlSetupAppMigrations,
  SQL_DIR
} from './db-migrate.mjs';

export const PROD_PROJECT_REF = 'nyretgvzbnbtiyeioeju';
export const DEFAULT_BOOTSTRAP_PATH = path.resolve(SQL_DIR, 'e2e/00_bootstrap.sql');
export const DEFAULT_SEED_PATH = path.resolve(SQL_DIR, 'e2e/01_seed.sql');

export function validarAmbienteSeguroE2E(env = process.env) {
  const candidates = [
    env.TEST_DATABASE_URL,
    env.DATABASE_URL,
    env.SUPABASE_DB_URL,
    env.E2E_DATABASE_URL
  ].filter(Boolean);

  for (const val of candidates) {
    if (String(val).includes(PROD_PROJECT_REF)) {
      throw new Error(
        `[CAF-000120][SEGURANÇA] Conexão apontando para produção (${PROD_PROJECT_REF}) bloqueada nos testes E2E.`
      );
    }
  }
  return true;
}

export function getOrderedE2EMigrationEntries(manifest) {
  const manifestList = Array.isArray(manifest?.migrations) ? manifest.migrations : [];
  const ordered = [];
  let insertedLegacyPreReqs = false;

  for (const entry of manifestList) {
    ordered.push({ ...entry, isManifest: true });
    if (!insertedLegacyPreReqs && entry.arquivo === 'migration_CAF-000001.sql') {
      ordered.push(
        { versao: 'pre_fase2', arquivo: 'migration_fase2.sql', isManifest: false },
        { versao: 'pre_fase3', arquivo: 'migration_fase3_final.sql', isManifest: false }
      );
      insertedLegacyPreReqs = true;
    }
  }

  return ordered;
}

function readSqlNormalized(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function normalizeSqlForE2E(arquivo, sql) {
  let out = sql.replace(/NOTIFY\s+pgrst,\s*reload_schema\s*;/gi, "NOTIFY pgrst, 'reload schema';");
  if (arquivo === 'migration_caf_000034_conta_cliente.sql') {
    out = out
      .replace(/fechamento_id BIGINT REFERENCES public\.fechamentos_caixa\(id\) ON DELETE SET NULL,/g, 'fechamento_id BIGINT,')
      .replace(
        /CREATE OR REPLACE FUNCTION public\.buscar_clientes_pdv\(/g,
        'DROP FUNCTION IF EXISTS public.buscar_clientes_pdv(TEXT, INT);\nCREATE OR REPLACE FUNCTION public.buscar_clientes_pdv('
      );
  }
  if (arquivo === 'migration_caf_000072_baseline_producao.sql') {
    out = out
      .replace(/produto_id BIGINT NOT NULL REFERENCES public\.produtos\(id\)/g, 'produto_id TEXT NOT NULL REFERENCES public.produtos(id)')
      .replace(/adicional_id BIGINT NOT NULL REFERENCES public\.adicionais\(id\)/g, 'adicional_id TEXT NOT NULL REFERENCES public.adicionais(id)');
  }
  return out;
}

async function applyAllSqlToInstance(pg, options = {}) {
  const sqlDir = options.sqlDir || SQL_DIR;
  const bootstrapPath = options.bootstrapPath || DEFAULT_BOOTSTRAP_PATH;
  const seedPath = options.seedPath || DEFAULT_SEED_PATH;
  const manifest = options.manifest || carregarManifesto(options.manifestPath);

  await pg.exec(readSqlNormalized(bootstrapPath));
  await pg.exec(getSqlSetupAppMigrations());

  const orderedEntries = getOrderedE2EMigrationEntries(manifest);
  const appliedFiles = [];
  const appliedManifestFiles = [];

  for (const entry of orderedEntries) {
    const filePath = path.resolve(sqlDir, entry.arquivo);
    if (!fs.existsSync(filePath)) {
      throw new Error(`[CAF-000120] Arquivo de migration ausente: ${filePath}`);
    }

    const sql = readSqlNormalized(filePath);
    const execSql = normalizeSqlForE2E(entry.arquivo, sql);
    try {
      await pg.exec(execSql);
      if (entry.arquivo === 'pedidos_schema.sql') {
        await pg.exec('ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pronto_em TIMESTAMPTZ;');
      }
    } catch (err) {
      throw new Error(
        `[CAF-000120] Falha ao aplicar migration ${entry.arquivo} (${entry.versao}): ${err.message}`,
        { cause: err }
      );
    }

    appliedFiles.push(entry.arquivo);
    if (entry.isManifest) {
      appliedManifestFiles.push(entry.arquivo);
      const checksum = entry.checksum || calcularChecksum(sql);
      await pg.query(
        `INSERT INTO public.app_migrations (versao, arquivo, checksum)
         VALUES ($1, $2, $3)
         ON CONFLICT (versao) DO UPDATE SET
           arquivo = EXCLUDED.arquivo,
           checksum = EXCLUDED.checksum`,
        [String(entry.versao), entry.arquivo, checksum]
      );
    }
  }

  await pg.exec(readSqlNormalized(seedPath));

  return {
    appliedFiles,
    appliedManifestFiles,
    manifestTotal: manifest.migrations.length
  };
}

export async function createE2EDatabase(options = {}) {
  validarAmbienteSeguroE2E(options.env || process.env);

  let pg = await PGlite.create({
    extensions: { pgcrypto },
    ...(options.dataDir ? { dataDir: options.dataDir } : {})
  });

  const migrationStats = await applyAllSqlToInstance(pg, options);
  const cleanSnapshot = options.enableSnapshotReset === false ? null : await pg.dumpDataDir('none');

  return {
    get client() {
      return pg;
    },
    migrationStats,
    async query(sql, params = []) {
      return pg.query(sql, params);
    },
    async exec(sql) {
      return pg.exec(sql);
    },
    async withJwtClaims(claims, fn) {
      const sub = claims?.sub ? String(claims.sub) : '';
      const role = claims?.role ? String(claims.role) : sub ? 'authenticated' : 'anon';
      const claimsJson = JSON.stringify({
        sub: sub || undefined,
        role,
        email: claims?.email || undefined,
        aud: 'authenticated',
        ...(claims?.extra || {})
      });

      return pg.transaction(async (tx) => {
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub]);
        await tx.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [role]);
        await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claimsJson]);
        if (options.usePgRoles !== false && (role === 'anon' || role === 'authenticated' || role === 'service_role')) {
          await tx.exec(`SET LOCAL ROLE ${role}`);
        }
        return fn(tx);
      });
    },
    async getAppliedMigrationsCount() {
      const { rows } = await pg.query('SELECT COUNT(*)::int AS total FROM public.app_migrations');
      return rows[0]?.total || 0;
    },
    getAppliedMigrationFiles() {
      return [...migrationStats.appliedManifestFiles];
    },
    async reset() {
      if (cleanSnapshot) {
        await pg.close();
        pg = await PGlite.create({
          extensions: { pgcrypto },
          loadDataDir: cleanSnapshot
        });
        return;
      }
      await pg.close();
      pg = await PGlite.create({ extensions: { pgcrypto } });
      await applyAllSqlToInstance(pg, options);
    },
    async close() {
      if (pg) {
        await pg.close();
      }
    }
  };
}
