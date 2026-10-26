#!/usr/bin/env node
/**
 * CAF-000092 / CAF-000099 — Test DB Runner
 * Validador e executor de suíte pgTAP para RPCs, Triggers e RLS do Supabase em banco isolado.
 * 
 * Regra Crítica (RNF01 / CA15):
 * Aborta imediatamente com erro se tentar apontar para a URL do Supabase de produção.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const PROD_HOST = 'nyretgvzbnbtiyeioeju.supabase.co';

export function validarAmbienteSeguro(dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '') {
  if (dbUrl && (dbUrl.includes(PROD_HOST) || dbUrl.includes('nyretgvzbnbtiyeioeju'))) {
    throw new Error('testes SQL só rodam em banco local/preview');
  }
  return true;
}

export function listarTestesSql(dir = 'supabase/tests') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.test.sql'))
    .map(f => path.join(dir, f));
}

export function validarEstruturaPgTap(conteudoSql) {
  const temBegin = /BEGIN;/i.test(conteudoSql);
  const temPlan = /plan\s*\(/i.test(conteudoSql);
  const temFinish = /finish\s*\(\s*\)/i.test(conteudoSql);
  const temRollback = /ROLLBACK;/i.test(conteudoSql);
  const temOkTrue = /ok\s*\(\s*true\b/i.test(conteudoSql);

  return {
    valido: temBegin && temPlan && temFinish && temRollback && !temOkTrue,
    temBegin,
    temPlan,
    temFinish,
    temRollback,
    temOkTrue
  };
}

export async function run() {
  console.log('--- CAF-000092 / CAF-000099: Executor de Testes SQL Isolados (pgTAP) ---');
  
  // 1. Trava de Produção (CA15 / RNF01)
  try {
    validarAmbienteSeguro();
    console.log('✓ Trava de segurança: host de produção NÃO detectado.');
  } catch (err) {
    console.error(`❌ ERRO FATAL: ${err.message}`);
    process.exit(1);
  }

  // 2. Coletar arquivos de teste pgTAP
  const testes = listarTestesSql();
  console.log(`✓ Encontrados ${testes.length} arquivos de teste em supabase/tests/`);

  let falhas = 0;
  for (const arq of testes) {
    const conteudo = fs.readFileSync(arq, 'utf8');
    const checagem = validarEstruturaPgTap(conteudo);
    if (!checagem.valido) {
      if (checagem.temOkTrue) {
        console.error(`❌ Arquivo ${arq} contém asserção placeholder ok(true, ...). É obrigatório utilizar asserções pgTAP reais.`);
      } else {
        console.error(`❌ Arquivo ${arq} não possui estrutura pgTAP transacional válida (BEGIN, plan, finish, ROLLBACK).`);
      }
      falhas++;
    } else {
      console.log(`✓ ${path.basename(arq)}: estrutura pgTAP e asserções reais OK`);
    }
  }

  if (falhas > 0) {
    console.error(`❌ Total de falhas em testes SQL: ${falhas}`);
    process.exit(1);
  }

  // 3. Execução em Postgres real (se DATABASE_URL local estiver configurado)
  const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (dbUrl) {
    console.log('\n--- Executando pgTAP no container PostgreSQL local ---');
    for (const arq of testes) {
      try {
        console.log(`-> Executando ${path.basename(arq)}...`);
        const output = execSync(`psql "${dbUrl}" -f "${arq}"`, { encoding: 'utf-8' });
        console.log(output);
      } catch (err) {
        console.error(`❌ Falha ao executar ${arq}: ${err.message}`);
        process.exit(1);
      }
    }
  }

  console.log('✓ Todos os testes SQL pgTAP foram validados com sucesso.');
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
