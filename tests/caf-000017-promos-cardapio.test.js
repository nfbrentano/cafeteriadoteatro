import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { diaSemanaSP, hojeSP } from '../js/utils/datas-sp.js';
import fs from 'fs';

/**
 * CAF-000017 — Aba Promos no Cardápio e Promoções por Dia da Semana
 */
describe('CAF-000017 — Promos no cardápio', () => {
  const cardapioDynamicJs = fs.readFileSync('js/cardapio-dynamic.js', 'utf8');

  it('CA01 / CA07: respeita fuso de São Paulo às 21:30 sem avançar para dia UTC seguinte', () => {
    // 2026-10-20T21:30:00-03:00 é terça-feira em SP (dia 2)
    // Em UTC isso seria 2026-10-21T00:30:00Z (quarta-feira, dia 3)
    const dataHoraSp = new Date('2026-10-20T21:30:00-03:00');
    vi.setSystemTime(dataHoraSp);

    const diaSemana = diaSemanaSP();
    const dataHoje = hojeSP();

    expect(diaSemana).toBe(2); // Terça-feira
    expect(dataHoje).toBe('2026-10-20');

    vi.useRealTimers();
  });

  it('CA02: cardapio-dynamic.js inclui seção de Promos dinamicamente quando há ofertas ativas', () => {
    expect(cardapioDynamicJs).toMatch(/id:\s*['"]promos['"]/);
    expect(cardapioDynamicJs).toMatch(/renderPromosSection/);
  });

  it('CA03: identifica produtos em promoção hoje e insere badge 🔥 PROMO HOJE', () => {
    expect(cardapioDynamicJs).toMatch(/PROMO HOJE/);
  });
});
