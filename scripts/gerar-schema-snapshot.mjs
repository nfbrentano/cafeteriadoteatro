import fs from 'fs';
import path from 'path';

/**
 * Builds schema-snapshot.json from diagnosis CSV or extracts definitions directly from supabase/ migrations.
 */
export function buildSchemaSnapshot(csvContent = null) {
  if (csvContent) {
    const lines = csvContent.split('\n');
    const rpcs = {};
    const tables = {};

    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const secao = parts[0].trim().replace(/^"|"$/g, '');
        const item = parts[1].trim().replace(/^"|"$/g, '');
        const detalhe = parts.slice(2).join(',').trim().replace(/^"|"$/g, '');

        if (secao === '1_funcao') {
          const argsMatch = detalhe.match(/^\((.*?)\)/);
          const rawArgs = argsMatch ? argsMatch[1] : '';
          const params = rawArgs
            .split(',')
            .map(a => a.trim().split(/\s+/)[0])
            .filter(Boolean);
          rpcs[item] = { parameters: params };
        } else if (secao === '3_coluna') {
          const cols = detalhe.split(',').map(c => c.trim().split(':')[0]).filter(Boolean);
          tables[item] = { columns: cols };
        }
      }
    }

    return {
      origem: 'diagnostico_csv',
      gerado_em: new Date().toISOString(),
      rpcs,
      tables
    };
  }

  // Parse directly from supabase/ SQL migrations
  const rpcs = {};
  const tables = {};

  const sqlFiles = fs.readdirSync('supabase').filter(f => f.endsWith('.sql'));
  for (const file of sqlFiles) {
    const content = fs.readFileSync(path.join('supabase', file), 'utf-8');

    // Extract tables
    const tableMatches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)/gi);
    for (const m of tableMatches) {
      const tName = m[1];
      if (!tables[tName]) tables[tName] = { columns: [] };
    }

    // Extract views
    const viewMatches = content.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+public\.([a-zA-Z0-9_]+)/gi);
    for (const m of viewMatches) {
      const vName = m[1];
      if (!tables[vName]) tables[vName] = { columns: [] };
    }

    // Extract functions / RPCs
    const fnMatches = content.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)/gi);
    for (const m of fnMatches) {
      const fnName = m[1];
      const paramsRaw = m[2];
      const params = paramsRaw
        .split(',')
        .map(p => {
          const clean = p.trim().split(/\s+/)[0];
          return clean && clean.startsWith('p_') ? clean : clean;
        })
        .filter(Boolean);
      rpcs[fnName] = { parameters: params };
    }
  }

  // Also allow storage buckets or legacy tables referenced in client
  const additionalTables = [
    'produtos',
    'categorias',
    'adicionais',
    'products',
    'site-assets',
    'hero_home',
    'promotions',
    'site_settings',
    'pedido_impressoes'
  ];
  for (const t of additionalTables) {
    if (!tables[t]) tables[t] = { columns: [] };
  }

  return {
    origem: 'migrations_locais',
    gerado_em: new Date().toISOString(),
    rpcs,
    tables
  };
}

const inputCsv = process.argv[2];
let csvContent = null;
if (inputCsv && fs.existsSync(inputCsv)) {
  csvContent = fs.readFileSync(inputCsv, 'utf-8');
}

const snapshot = buildSchemaSnapshot(csvContent);
const outputPath = path.resolve(process.cwd(), 'tests/fixtures/schema-snapshot.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf-8');
console.log(`Schema snapshot gerado com sucesso em: ${outputPath}`);
console.log(`- RPCs mapeadas: ${Object.keys(snapshot.rpcs).length}`);
console.log(`- Tabelas/Views mapeadas: ${Object.keys(snapshot.tables).length}`);
