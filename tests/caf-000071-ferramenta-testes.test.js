import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * CAF-000071 — Implementação de Ferramenta de Testes Automatizados
 */
describe('CAF-000071: Ferramenta de Testes Automatizados', () => {
  it('CA01 / RF01: package.json possui scripts test, test:watch e test:coverage', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.test).toContain('vitest');
    expect(pkg.scripts['test:watch']).toBeDefined();
    expect(pkg.scripts['test:coverage']).toBeDefined();
    expect(pkg.devDependencies.vitest).toBeDefined();
  });

  it('CA02 / RF02: arquitetura de testes possui setup e helpers de mock isolados', () => {
    expect(fs.existsSync('tests/setup.js')).toBe(true);
    expect(fs.existsSync('tests/helpers/page-harness.js')).toBe(true);
  });

  it('CA03 / RF03: GEMINI.md exige testes funcionais automatizados e 100% de sucesso', () => {
    const gemini = fs.readFileSync('GEMINI.md', 'utf8');
    expect(gemini).toMatch(/Testes Funcionais Automatizados Obrigatórios/i);
    expect(gemini).toMatch(/npm test.*npm run build/i);
  });

  it('CA04 / RF04: suíte core-flows.test.js valida fluxos críticos do sistema', () => {
    expect(fs.existsSync('tests/core-flows.test.js')).toBe(true);
    const coreFlows = fs.readFileSync('tests/core-flows.test.js', 'utf8');
    expect(coreFlows).toMatch(/describe|test/);
  });

  it('CA05 / RF05: .github/workflows/deploy.yml inclui etapa de testes antes do build', () => {
    expect(fs.existsSync('.github/workflows/deploy.yml')).toBe(true);
    const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
    expect(workflow).toMatch(/npm test/);
    const testPos = workflow.indexOf('npm test');
    const buildPos = workflow.indexOf('npm run build');
    expect(testPos).toBeLessThan(buildPos);
  });
});
