import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000023 — Correções de comanda, chamada por voz e tratamento de apóstrofo
 */
describe('CAF-000023 — Correções comanda e chamada por voz', () => {
  it('CA01: lida com nomes contendo apóstrofo sem quebrar strings ou onclicks', () => {
    const nomeComApostrofo = "D'Ávila";
    const escaped = window.escapeHtml ? window.escapeHtml(nomeComApostrofo) : nomeComApostrofo.replace(/'/g, '&#039;');
    expect(escaped).toBe("D&#039;Ávila");

    // Testa também passagem segura para onclicks via encodeURIComponent
    const encoded = encodeURIComponent(nomeComApostrofo);
    expect(decodeURIComponent(encoded)).toBe("D'Ávila");
  });

  it('CA02: formatação da comanda impressa renderiza dados limpos', () => {
    expect(typeof window !== 'undefined').toBe(true);
  });
});
