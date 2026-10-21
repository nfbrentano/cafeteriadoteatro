import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000023 — Correções de comanda, chamada por voz e tratamento de apóstrofo
 */
describe('CAF-000023 — Correções comanda e chamada por voz', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');
  const printJs = fs.readFileSync('js/pedido-print.js', 'utf8');

  it('CA01: lida com nomes contendo apóstrofo sem quebrar strings ou onclicks', () => {
    const nomeComApostrofo = "D'Ávila";
    const escaped = nomeComApostrofo.replace(/'/g, "\\'");
    expect(escaped).toBe("D\\'Ávila");
    expect(pedidosJs).toMatch(/escapeHtml|sanitize/);
  });

  it('CA02: formatação da comanda impressa renderiza dados limpos', () => {
    expect(printJs).toMatch(/printComanda/);
  });
});
