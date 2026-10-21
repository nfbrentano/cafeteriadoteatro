import { describe, it, expect } from 'vitest';
import { ImpressaoTrava } from '../js/utils/impressao-trava.js';

/**
 * CAF-000028 — Tela impressora e comanda por estação
 */
describe('CAF-000028 — Impressora e comanda por estação', () => {
  it('CA01: trava impede impressão automática duplicada para o mesmo pedido e estação', () => {
    const trava = new ImpressaoTrava();
    const p1 = trava.deveImprimirAutomatico('ped-1', 'bar');
    const p2 = trava.deveImprimirAutomatico('ped-1', 'bar'); // segunda tentativa
    expect(p1).toBe(true);
    expect(p2).toBe(false);
  });

  it('CA02: permite impressão automática para estações diferentes do mesmo pedido', () => {
    const trava = new ImpressaoTrava();
    expect(trava.deveImprimirAutomatico('ped-1', 'bar')).toBe(true);
    expect(trava.deveImprimirAutomatico('ped-1', 'cozinha')).toBe(true);
  });

  it('CA03: reimpressão manual ignora a trava automática', () => {
    const trava = new ImpressaoTrava();
    trava.deveImprimirAutomatico('ped-1', 'bar');
    // Forçar manual
    const reimpressao = trava.deveImprimirAutomatico('ped-1', 'bar', true);
    expect(reimpressao).toBe(true);
  });
});
