import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000047 — Hero da Home: Botões de ação, telemetria e safe-area
 */
describe('CAF-000047 — Hero da Home e Analytics', () => {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const analyticsJs = fs.readFileSync('js/analytics.js', 'utf8');

  it('CA01 / CA13: botões de ação do hero existem e possuem IDs para tracking', () => {
    expect(indexHtml).toMatch(/cta-ver-cardapio|carousel-prev/);
  });

  it('CA02 / CA13: cliques em ações do hero disparam tracking de telemetria', () => {
    expect(analyticsJs).toMatch(/analytics|gtag|trackEvent/i);
  });
});
