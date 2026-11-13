import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXCLUDED_FILES = [
  'js/libs/',
  'js/vendor/',
  'js/curtain.js',
  'js/pix-brcode.js'
];

export function normalizarCaminhoArquivo(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/js/');
  if (idx !== -1) {
    return normalized.slice(idx + 1);
  }
  if (normalized.startsWith('js/')) {
    return normalized;
  }
  return normalized;
}

function isArquivoExcluido(relPath) {
  return EXCLUDED_FILES.some(prefix => relPath.startsWith(prefix));
}

export function verificarArquivosSemCobertura(summary) {
  if (!summary || typeof summary !== 'object') {
    return [];
  }

  const semCobertura = [];
  for (const [rawPath, metrics] of Object.entries(summary)) {
    if (rawPath === 'total' || !metrics || !metrics.lines) continue;
    const arquivo = normalizarCaminhoArquivo(rawPath);
    if (!arquivo.startsWith('js/') || isArquivoExcluido(arquivo)) continue;

    const totalLines = Number(metrics.lines.total || 0);
    const pct = Number(metrics.lines.pct ?? 0);
    if (totalLines > 0 && pct === 0) {
      semCobertura.push({ arquivo, linesPct: pct, totalLines });
    }
  }

  return semCobertura.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

function calcularMetricasGrupo(entries) {
  const soma = {
    lines: { total: 0, covered: 0 },
    statements: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 }
  };

  for (const metrics of entries) {
    for (const key of Object.keys(soma)) {
      if (metrics[key]) {
        soma[key].total += Number(metrics[key].total || 0);
        soma[key].covered += Number(metrics[key].covered || 0);
      }
    }
  }

  const pct = (m) => (m.total > 0 ? Number(((m.covered / m.total) * 100).toFixed(2)) : 100);
  return {
    lines: pct(soma.lines),
    statements: pct(soma.statements),
    functions: pct(soma.functions),
    branches: pct(soma.branches),
    filesCount: entries.length
  };
}

export function gerarMarkdownResumoCobertura(summary) {
  if (!summary || typeof summary !== 'object') {
    return '## Resumo de Cobertura\n\nNenhum dado de cobertura disponível.\n';
  }

  const total = summary.total || {};
  const grupos = {
    'js/utils/**': [],
    'js/admin/**': [],
    'js/*.js (telas/núcleo)': []
  };

  for (const [rawPath, metrics] of Object.entries(summary)) {
    if (rawPath === 'total' || !metrics) continue;
    const rel = normalizarCaminhoArquivo(rawPath);
    if (!rel.startsWith('js/') || isArquivoExcluido(rel)) continue;

    if (rel.startsWith('js/utils/')) {
      grupos['js/utils/**'].push(metrics);
    } else if (rel.startsWith('js/admin/')) {
      grupos['js/admin/**'].push(metrics);
    } else if (!rel.slice(3).includes('/')) {
      grupos['js/*.js (telas/núcleo)'].push(metrics);
    }
  }

  const lines = [
    '## Resumo de Cobertura de Testes (V8)',
    '',
    '| Escopo | Arquivos | Linhas (%) | Statements (%) | Funções (%) | Branches (%) |',
    '|--------|----------|------------|----------------|-------------|--------------|',
    `| **Total** | ${Object.keys(summary).filter(k => k !== 'total').length} | ${Number(total.lines?.pct ?? 0).toFixed(2)}% | ${Number(total.statements?.pct ?? 0).toFixed(2)}% | ${Number(total.functions?.pct ?? 0).toFixed(2)}% | ${Number(total.branches?.pct ?? 0).toFixed(2)}% |`
  ];

  for (const [nome, entries] of Object.entries(grupos)) {
    const m = calcularMetricasGrupo(entries);
    lines.push(`| \`${nome}\` | ${m.filesCount} | ${m.lines.toFixed(2)}% | ${m.statements.toFixed(2)}% | ${m.functions.toFixed(2)}% | ${m.branches.toFixed(2)}% |`);
  }

  const zerados = verificarArquivosSemCobertura(summary);
  if (zerados.length > 0) {
    lines.push('', `### Arquivos com 0% de linhas (${zerados.length})`, '');
    for (const item of zerados) {
      lines.push(`- \`${item.arquivo}\` (${item.totalLines} linhas)`);
    }
  } else {
    lines.push('', 'Nenhum arquivo de `js/` (fora das exclusões) está com 0% de cobertura.');
  }

  lines.push('');
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const summaryPath = inputIdx !== -1 && args[inputIdx + 1]
    ? path.resolve(process.cwd(), args[inputIdx + 1])
    : path.resolve(process.cwd(), process.env.COVERAGE_SUMMARY_PATH || 'coverage/coverage-summary.json');

  if (!fs.existsSync(summaryPath)) {
    console.error(`[coverage-summary-md] Arquivo não encontrado: ${summaryPath}`);
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  const markdown = gerarMarkdownResumoCobertura(summary);
  console.log(markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }

  const zerados = verificarArquivosSemCobertura(summary);
  if (zerados.length > 0) {
    console.error(`[coverage-summary-md] Falha: ${zerados.length} arquivo(s) com 0% de linhas: ${zerados.map(z => z.arquivo).join(', ')}`);
    process.exit(1);
  }
}
