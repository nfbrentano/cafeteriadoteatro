#!/usr/bin/env node
/**
 * scripts/db-migrate.mjs
 * CAF-000116 — Runner Determinístico de Migrations
 * 
 * - Lê a ordem canônica de supabase/migrations.manifest.json
 * - Valida checksums SHA-256 de migrations já aplicadas (aborta se houver divergência)
 * - Aplica apenas migrations pendentes de forma transacional (BEGIN / COMMIT)
 * - Registra versão, arquivo, checksum e data em public.app_migrations
 * - Suporta modo --dry-run e --check
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

export const MANIFEST_PATH = path.resolve('supabase/migrations.manifest.json');
export const SQL_DIR = path.resolve('supabase');

/**
 * Calcula o hash SHA-256 de uma string ou buffer
 * @param {string|Buffer} content
 * @returns {string}
 */
export function calcularChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Lê e parseia o manifesto oficial de migrations
 * @param {string} [customPath]
 * @returns {Object}
 */
export function carregarManifesto(customPath = MANIFEST_PATH) {
  if (!fs.existsSync(customPath)) {
    throw new Error(`Manifesto de migrations não encontrado: ${customPath}`);
  }
  return JSON.parse(fs.readFileSync(customPath, 'utf-8'));
}

/**
 * Valida a integridade do diretório supabase contra o manifesto (CA03)
 * Garante que 100% dos arquivos .sql estejam mapeados como ativos ou ignorados.
 * @param {Object} manifest
 * @param {string} [sqlDir]
 * @returns {{ valido: boolean, orfaos: string[], totalSql: number }}
 */
export function validarIntegridadeDiretorio(manifest, sqlDir = SQL_DIR) {
  const arquivosReais = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const conhecidos = new Set([
    ...(manifest.migrations || []).map(m => m.arquivo),
    ...(manifest.arquivos_historicos_ignorados || []),
    ...(manifest.arquivos_manutencao_ignorados || [])
  ]);

  const orfaos = arquivosReais.filter(f => !conhecidos.has(f));

  return {
    valido: orfaos.length === 0,
    orfaos,
    totalSql: arquivosReais.length
  };
}

/**
 * Compara as migrations do manifesto com o estado registrado no banco
 * @param {Array} migrationsManifesto Lista ordenada de migrations do manifesto
 * @param {Array|Map} migrationsBanco Registros atuais de app_migrations
 * @returns {{ pendentes: Array, divergencias: Array, aplicadas: Array }}
 */
export function calcularDiferencasMigracao(migrationsManifesto = [], migrationsBanco = []) {
  // Converte migrationsBanco para Maps: por arquivo (estritamente unívoco) e por versão (legado/fallback)
  const porArquivo = new Map();
  const porVersao = new Map();

  const registrar = (item) => {
    if (!item) return;
    if (item.arquivo) {
      porArquivo.set(item.arquivo, item);
    }
    if (item.versao !== undefined && item.versao !== null) {
      porVersao.set(String(item.versao), item);
    }
  };

  if (Array.isArray(migrationsBanco)) {
    for (const m of migrationsBanco) registrar(m);
  } else if (migrationsBanco instanceof Map) {
    for (const [k, v] of migrationsBanco.entries()) {
      if (typeof v === 'object' && v !== null) {
        registrar(v);
      } else {
        registrar({ versao: k });
      }
    }
  }

  const pendentes = [];
  const divergencias = [];
  const aplicadas = [];

  for (const m of migrationsManifesto) {
    // Busca primária por nome de arquivo (evita conflitos entre arquivos que compartilham mesmo número de versão)
    // Fallback por versão para compatibilidade com registros legados
    const registroBanco = (m.arquivo && porArquivo.get(m.arquivo)) || porVersao.get(String(m.versao));

    if (!registroBanco) {
      pendentes.push(m);
    } else {
      aplicadas.push(m);
      // Se o banco tem checksum registrado, valida integridade
      if (registroBanco.checksum && registroBanco.checksum !== m.checksum) {
        divergencias.push({
          versao: m.versao,
          arquivo: m.arquivo,
          checksumManifesto: m.checksum,
          checksumBanco: registroBanco.checksum
        });
      }
    }
  }

  return { pendentes, divergencias, aplicadas };
}

/**
 * Prepara o script SQL de atualização de schema de app_migrations
 * @returns {string}
 */
export function getSqlSetupAppMigrations() {
  return `
    CREATE TABLE IF NOT EXISTS public.app_migrations (
      versao TEXT PRIMARY KEY,
      arquivo TEXT NOT NULL,
      checksum TEXT,
      aplicada_em TIMESTAMPTZ DEFAULT timezone('utc', now()),
      aplicada_por TEXT DEFAULT current_user
    );
    ALTER TABLE public.app_migrations ADD COLUMN IF NOT EXISTS checksum TEXT;
  `;
}

/**
 * Executa as migrations pendentes de forma determinística
 * @param {Object} options
 * @returns {Promise<{ executadas: number, dryRun: boolean }>}
 */
export async function rodarMigrations(options = {}) {
  const isDryRun = Boolean(options.dryRun);
  const manifest = options.manifest || carregarManifesto(options.manifestPath);
  const sqlDir = options.sqlDir || SQL_DIR;

  console.log(`\n=== Runner de Migrations (CAF-000116) ===`);
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (Simulação)' : 'EXECUÇÃO REAL'}`);

  // 1. Validação de integridade do diretório (CA03)
  const integridade = validarIntegridadeDiretorio(manifest, sqlDir);
  if (!integridade.valido) {
    throw new Error(`[CAF-000116] Arquivos SQL órfãos no diretório supabase/: ${integridade.orfaos.join(', ')}. Adicione-os ao manifesto ou à lista de ignorados.`);
  }
  console.log(`✓ Integridade do catálogo: ${integridade.totalSql} arquivos mapeados sem órfãos.`);

  // 2. Consulta de migrations registradas no banco
  let migrationsBanco = options.migrationsBanco || [];
  const dbUrl = options.dbUrl || process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!options.migrationsBanco && dbUrl) {
    try {
      // Garante a tabela e busca histórico via psql
      execSync(`psql "${dbUrl}" -c "${getSqlSetupAppMigrations().replace(/\n/g, ' ')}"`, { stdio: 'pipe' });
      const rawJson = execSync(
        `psql "${dbUrl}" -t -A -c "SELECT json_agg(m) FROM public.app_migrations m;"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      if (rawJson && rawJson !== '') {
        migrationsBanco = JSON.parse(rawJson);
      }
    } catch (err) {
      console.warn(`[db-migrate] Aviso ao consultar app_migrations via psql: ${err.message}`);
    }
  }

  // 3. Comparação de estado e validação de checksum (CA01 / CA02)
  const { pendentes, divergencias, aplicadas } = calcularDiferencasMigracao(manifest.migrations, migrationsBanco);

  if (divergencias.length > 0) {
    const msg = divergencias
      .map(d => `• Versão ${d.versao} (${d.arquivo}): checksum esperado ${d.checksumBanco}, atual no repositório ${d.checksumManifesto}`)
      .join('\n');
    throw new Error(`[CAF-000116 / CA02] Violação de integridade: migration já aplicada em produção foi alterada no Git!\n${msg}\nAbortando para proteger o banco de dados.`);
  }

  console.log(`✓ Migrations já aplicadas: ${aplicadas.length}`);
  console.log(`✓ Migrations pendentes: ${pendentes.length}`);

  if (pendentes.length === 0) {
    console.log('✅ O banco de dados já está totalmente atualizado.');
    return { executadas: 0, dryRun: isDryRun };
  }

  // 4. Se for dry-run, apenas lista as pendências e encerra (CA04)
  if (isDryRun) {
    console.log('\n--- Migrations que seriam aplicadas (--dry-run) ---');
    pendentes.forEach((p, idx) => {
      console.log(` [${idx + 1}/${pendentes.length}] Versão ${p.versao}: ${p.arquivo} (${p.checksum.slice(0, 12)}...)`);
    });
    console.log('\n[Dry-Run] Nenhuma alteração foi realizada no banco.');
    return { executadas: 0, dryRun: true, pendentes };
  }

  // 5. Execução real das migrations pendentes
  if (!dbUrl) {
    throw new Error('[CAF-000116] DATABASE_URL não informada para execução real das migrations.');
  }

  let executadas = 0;
  for (const m of pendentes) {
    const filePath = path.join(sqlDir, m.arquivo);
    console.log(`-> Aplicando versão ${m.versao}: ${m.arquivo}...`);

    const sqlContent = fs.readFileSync(filePath, 'utf-8');
    const checksum = calcularChecksum(sqlContent);

    const sqlScript = `
      BEGIN;
      ${sqlContent}
      INSERT INTO public.app_migrations (versao, arquivo, checksum, aplicada_em, aplicada_por)
      VALUES ('${m.versao}', '${m.arquivo}', '${checksum}', timezone('utc', now()), current_user)
      ON CONFLICT (versao) DO UPDATE
        SET checksum = EXCLUDED.checksum,
            aplicada_em = EXCLUDED.aplicada_em;
      COMMIT;
    `;

    try {
      execSync(`psql "${dbUrl}" -c "${sqlScript.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
      executadas++;
      console.log(`   ✓ Versão ${m.versao} aplicada e registrada.`);
    } catch (err) {
      console.error(`❌ Falha crítica ao aplicar migration ${m.arquivo}: ${err.message}`);
      throw err;
    }
  }

  console.log(`\n🎉 Sucesso: ${executadas} migration(s) aplicada(s) com êxito!`);
  return { executadas, dryRun: false };
}

// Execução CLI direta
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/db-migrate.mjs')) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const checkOnly = args.includes('--check');

  rodarMigrations({ dryRun: dryRun || checkOnly })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\n❌ ERRO NO RUNNER DE MIGRATIONS:\n${err.message}\n`);
      process.exit(1);
    });
}
