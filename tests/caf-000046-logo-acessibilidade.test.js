import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000046 — Logo em WebP e H1 acessível (sr-only)
 */
describe('CAF-000046 — Logo e Acessibilidade', () => {
  const indexHtml = fs.readFileSync('index.html', 'utf8');

  it('CA01 / CA02: utiliza logo no formato moderno e leve .webp', () => {
    expect(indexHtml).toMatch(/logo-cafeteria-do-teatro.*\.webp/i);
  });

  it('CA02 / CA02: possui título h1 acessível (sr-only / visually-hidden) para leitores de tela', () => {
    expect(indexHtml).toMatch(/<h1[^>]*class="[^"]*(?:sr-only|visually-hidden)[^"]*"[^>]*>/i);
  });
});
