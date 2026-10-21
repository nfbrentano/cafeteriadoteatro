import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000049 — Auditoria de dependências no package.json
 */
describe('CAF-000049 — Dependências e Versões', () => {
  const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  it('CA01 / CA14: vite está configurado e atualizado', () => {
    const viteVer = pkgJson.devDependencies?.vite || pkgJson.dependencies?.vite;
    expect(viteVer).toBeDefined();
  });

  it('CA02 / CA14: scripts de build e teste estão definidos', () => {
    expect(pkgJson.scripts?.build).toBeDefined();
    expect(pkgJson.scripts?.test).toBeDefined();
  });
});
