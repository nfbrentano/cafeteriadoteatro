import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * CAF-000085 — Saneamento da documentação das SDDs
 * Validação de status, critérios de aceitação, IDs únicos e rastreabilidade de testes.
 */

function walkSddFiles(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      files = files.concat(walkSddFiles(full));
    } else if (f.startsWith('CAF-') && f.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

export function validateSddDocument(content, { filename = 'CAF-000099-mock.md', existingTestFiles = [] } = {}) {
  const errors = [];
  const lines = content.split('\n');

  // Check title
  const titleIdx = lines.findIndex(l => l.startsWith('# '));
  if (titleIdx === -1) {
    errors.push('Falta título # [TAG] ...');
    return { valid: false, errors };
  }

  // Check status line immediately after title
  let nextIdx = titleIdx + 1;
  while (nextIdx < lines.length && lines[nextIdx].trim() === '') {
    nextIdx++;
  }
  const statusLine = lines[nextIdx];
  if (!statusLine || !statusLine.startsWith('> **Status:**')) {
    errors.push(`Primeira linha após título deve ser '> **Status:**', encontrado: '${statusLine}'`);
  }

  const validStatuses = [
    'Rascunho',
    'Em revisão',
    'Aprovada',
    'Em andamento',
    'Concluída',
    'Concluída com ressalvas'
  ];
  const statusValue = statusLine ? statusLine.replace('> **Status:**', '').trim() : '';
  if (!validStatuses.includes(statusValue)) {
    errors.push(`Status inválido: '${statusValue}'. Esperado um de: ${validStatuses.join(', ')}`);
  }

  // Check ressalvas if status is 'Concluída com ressalvas'
  if (statusValue === 'Concluída com ressalvas') {
    const hasRessalva = lines.some(l => l.startsWith('> **Ressalvas:**') && /CAF-\d+/.test(l));
    if (!hasRessalva) {
      errors.push("Status 'Concluída com ressalvas' exige linha '> **Ressalvas:** ... → CAF-0000NN'");
    }
  }

  // Check CAs if status is 'Concluída'
  const caIdx = content.indexOf('## Critérios de Aceitação');
  if (statusValue === 'Concluída' && caIdx !== -1) {
    const nextSec = content.indexOf('## ', caIdx + 10);
    const endIdx = nextSec !== -1 ? nextSec : content.length;
    const caSection = content.slice(caIdx, endIdx);
    const openCAs = (caSection.match(/- \[ \] /g) || []).length;
    if (openCAs > 0) {
      errors.push(`SDD Concluída possui ${openCAs} critérios de aceitação pendentes (- [ ])`);
    }
  }

  // For SDDs >= CAF-000061 in CONCLUIDAS, require automated test file
  const idMatch = filename.match(/CAF-(\d+)/);
  if (idMatch) {
    const num = parseInt(idMatch[1], 10);
    if (num >= 61 && (statusValue === 'Concluída' || statusValue === 'Concluída com ressalvas')) {
      const numStr = String(num).padStart(6, '0');
      const hasTest = existingTestFiles.some(t => t.includes(numStr) || t.includes(`caf-${numStr}`));
      if (!hasTest) {
        errors.push(`SDD CAF-${numStr} concluída exige arquivo de teste tests/caf-${numStr}-*.test.js`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

describe('CAF-000085: Saneamento da Documentação das SDDs', () => {
  const allSddPaths = walkSddFiles('SDD');
  const existingTestFiles = fs.readdirSync('tests').filter(f => f.endsWith('.test.js'));

  it('CA01 / RF01: todo arquivo SDD/**/CAF-*.md possui cabeçalho de status padronizado após o título', () => {
    const failures = [];
    for (const p of allSddPaths) {
      const content = fs.readFileSync(p, 'utf8');
      const lines = content.split('\n');
      const titleIdx = lines.findIndex(l => l.startsWith('# '));
      expect(titleIdx, `${p} deve ter título # `).toBeGreaterThanOrEqual(0);

      let nextIdx = titleIdx + 1;
      while (nextIdx < lines.length && lines[nextIdx].trim() === '') nextIdx++;
      const statusLine = lines[nextIdx] || '';
      if (!statusLine.startsWith('> **Status:**')) {
        failures.push({ file: p, line: statusLine });
      }
    }
    expect(failures).toEqual([]);
  });

  it('CA02 / RF02: SDDs 001 a 017, 020a, 020b, 021, 064 a 067, 070 e 071 têm todos os CAs avaliados (0 pendentes)', () => {
    const targetSDDs = [
      'CAF-000001', 'CAF-000002', 'CAF-000003', 'CAF-000004', 'CAF-000005',
      'CAF-000006', 'CAF-000007', 'CAF-000008', 'CAF-000009', 'CAF-000010',
      'CAF-000011', 'CAF-000012', 'CAF-000013', 'CAF-000014', 'CAF-000015',
      'CAF-000016', 'CAF-000017', 'CAF-000020A', 'CAF-000020-vinculo', 'CAF-000021',
      'CAF-000064', 'CAF-000065', 'CAF-000066', 'CAF-000067', 'CAF-000070', 'CAF-000071'
    ];

    for (const prefix of targetSDDs) {
      const file = fs.readdirSync('SDD/CONCLUIDAS').find(f => f.startsWith(prefix));
      expect(file, `SDD ${prefix} deve existir em CONCLUIDAS`).toBeTruthy();
      const content = fs.readFileSync(path.join('SDD/CONCLUIDAS', file), 'utf8');
      const caIdx = content.indexOf('## Critérios de Aceitação');
      expect(caIdx, `${file} deve ter seção de Critérios de Aceitação`).toBeGreaterThanOrEqual(0);

      const nextSec = content.indexOf('## ', caIdx + 10);
      const endIdx = nextSec !== -1 ? nextSec : content.length;
      const caSection = content.slice(caIdx, endIdx);
      const openCAs = (caSection.match(/- \[ \] /g) || []).length;
      const closedCAs = (caSection.match(/- \[x\] /g) || []).length;

      expect(openCAs, `${file} não deve ter CAs sem avaliação`).toBe(0);
      expect(closedCAs, `${file} deve ter CAs avaliados`).toBeGreaterThan(0);
    }
  });

  it('CA03 / RF03: CAF-000063 tem status Concluída com ressalvas e cita CAF-000076', () => {
    const file = fs.readdirSync('SDD/CONCLUIDAS').find(f => f.startsWith('CAF-000063'));
    const content = fs.readFileSync(path.join('SDD/CONCLUIDAS', file), 'utf8');
    expect(content).toMatch(/> \*\*Status:\*\* Concluída com ressalvas/);
    expect(content).toMatch(/> \*\*Ressalvas:\*\*.*CAF-000076/);
  });

  it('CA04 / RF04: não existem IDs duplicados em SDD/', () => {
    const idMap = new Map();
    for (const p of allSddPaths) {
      const base = path.basename(p);
      const match = base.match(/(CAF-\d+[A-Za-z]?)/);
      if (match) {
        const id = match[1].toUpperCase();
        if (idMap.has(id)) {
          idMap.get(id).push(p);
        } else {
          idMap.set(id, [p]);
        }
      }
    }

    const duplicates = [];
    for (const [id, paths] of idMap.entries()) {
      if (paths.length > 1) {
        duplicates.push({ id, paths });
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('CA05 / RF06 & RF07: SDD/INDICE.md existe, mapeia todas as SDDs e as 11 migrations divergentes têm comentário', () => {
    expect(fs.existsSync('SDD/INDICE.md')).toBe(true);
    const indiceContent = fs.readFileSync('SDD/INDICE.md', 'utf8');

    for (const p of allSddPaths) {
      const base = path.basename(p);
      const match = base.match(/(CAF-\d+[A-Za-z]?)/);
      if (match) {
        expect(indiceContent).toContain(`**${match[1]}**`);
      }
    }

    const divergentMigrations = [
      { file: 'supabase/migration_caf_000005.sql', sdd: 'CAF-000006' },
      { file: 'supabase/migration_caf_000006_estacoes.sql', sdd: 'CAF-000007' },
      { file: 'supabase/migration_caf_000021_cliente_viagem.sql', sdd: 'CAF-000010' },
      { file: 'supabase/migration_caf_000022_transferir_mesa.sql', sdd: 'CAF-000011' },
      { file: 'supabase/migration_caf_000023_taxa_desconto.sql', sdd: 'CAF-000013' },
      { file: 'supabase/migration_caf_000024_relatorios.sql', sdd: 'CAF-000014' },
      { file: 'supabase/migration_caf_000025_caixa.sql', sdd: 'CAF-000015' },
      { file: 'supabase/migration_caf_000026_idempotencia.sql', sdd: 'CAF-000018' },
      { file: 'supabase/migration_caf_000027_conclusao_estacao.sql', sdd: 'CAF-000022' },
      { file: 'supabase/migration_caf_000028_itens_lancados_depois.sql', sdd: 'CAF-000024' },
      { file: 'supabase/migration_caf_000029_tempo_alvo_semaforo.sql', sdd: 'CAF-000025' }
    ];

    for (const m of divergentMigrations) {
      const migContent = fs.readFileSync(m.file, 'utf8');
      expect(migContent).toMatch(new RegExp(`^-- Implementa: ${m.sdd}`));
      expect(indiceContent).toContain(m.file);
    }
  });

  it('CA06 / RF08: FEATURES_PENDENTES.md, TAREFAS.md e MELHORIAS_UX.md têm itens entregues marcados [x]', () => {
    const feat = fs.readFileSync('SDD/CONCLUIDAS/FEATURES_PENDENTES.md', 'utf8');
    const tarefas = fs.readFileSync('SDD/CONCLUIDAS/TAREFAS.md', 'utf8');
    const ux = fs.readFileSync('SDD/CONCLUIDAS/MELHORIAS_UX.md', 'utf8');

    // Section 1 in FEATURES_PENDENTES should have [x]
    expect(feat).toMatch(/- \[x\] Adicionar .*?entregue.*? ao/);
    // TAREFAS should have 0 [ ]
    expect((tarefas.match(/- \[ \] /g) || []).length).toBe(0);
    // MELHORIAS_UX should have iOS zoom marked [x]
    expect(ux).toMatch(/- \[x\] Aplicar em `css\/pedidos\.css`/);
    // and only genuine pending open
    expect(ux).toMatch(/- \[ \] Botão "🔄 Atualizar": trocar por pull-to-refresh/);
  });

  it('CA07 / RF09: GEMINI.md e MODELO_ATIVIDADE.md exigem CAs marcados e importação de código real', () => {
    const gemini = fs.readFileSync('GEMINI.md', 'utf8');
    const modelo = fs.readFileSync('SDD/MODELO_ATIVIDADE.md', 'utf8');

    expect(gemini).toMatch(/todos os CAs marcados com `\[x\]`/i);
    expect(gemini).toMatch(/importe código real da aplicação/i);
    expect(modelo).toMatch(/Concluída com ressalvas/);
  });

  describe('CA08 / RF10: Gate negativo de validação de SDDs', () => {
    it('validador rejeita SDD com status Concluída que possui CAs [ ] pendentes', () => {
      const mockContent = `# [FEAT] CAF-000099 — Mock
> **Status:** Concluída
> **Autor:** Dev · **Criada em:** 2026-10-21

## Critérios de Aceitação / Entregas
- [ ] **CA01:** Algo pendente
`;
      const res = validateSddDocument(mockContent, {
        filename: 'CAF-000099-mock.md',
        existingTestFiles: ['caf-000099-mock.test.js']
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('critérios de aceitação pendentes'))).toBe(true);
    });

    it('validador rejeita SDD >= CAF-000061 em CONCLUIDAS sem arquivo de teste', () => {
      const mockContent = `# [FEAT] CAF-000099 — Mock
> **Status:** Concluída
> **Autor:** Dev · **Criada em:** 2026-10-21

## Critérios de Aceitação / Entregas
- [x] **CA01:** Algo concluído
`;
      const res = validateSddDocument(mockContent, {
        filename: 'CAF-000099-mock.md',
        existingTestFiles: [] // no test file
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('exige arquivo de teste'))).toBe(true);
    });

    it('todas as SDDs >= CAF-000061 atualmente em CONCLUIDAS são válidas segundo as regras', () => {
      const concluidasFiles = fs.readdirSync('SDD/CONCLUIDAS').filter(f => f.startsWith('CAF-') && f.endsWith('.md'));
      for (const f of concluidasFiles) {
        const idMatch = f.match(/CAF-(\d+)/);
        if (!idMatch) continue;
        const num = parseInt(idMatch[1], 10);
        if (num >= 61) {
          const content = fs.readFileSync(path.join('SDD/CONCLUIDAS', f), 'utf8');
          const res = validateSddDocument(content, {
            filename: f,
            existingTestFiles
          });
          expect(res.errors, `Erros em ${f}`).toEqual([]);
          expect(res.valid, `${f} deve ser válida`).toBe(true);
        }
      }
    });
  });
});
