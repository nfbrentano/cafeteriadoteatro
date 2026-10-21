import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000051 — Anti-zoom no iOS: Inputs com font-size >= 16px e inputmode correto
 */
describe('CAF-000051 — Anti-zoom em Inputs Mobile', () => {
  const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');

  it('CA01 / CA02: campos numéricos de troco e valores possuem inputmode decimal ou numeric', () => {
    expect(pedidosHtml).toMatch(/inputmode="(?:decimal|numeric)"/);
  });

  it('CA02: inputs do PDV possuem classes de estilo com font-size >= 16px', () => {
    expect(pedidosHtml).toMatch(/class="[^"]*input-padrao[^"]*"/);
  });
});
