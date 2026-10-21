import { describe, it, expect } from 'vitest';
import {
  dividirIgualmenteCents,
  dividirPorConsumoItens,
  distribuirTaxaEDesconto
} from '../js/utils/conta-mesa.js';

/**
 * CAF-000012 — Dividir conta
 */
describe('CAF-000012 — Dividir conta', () => {
  it('CA01: divide igualmente entre N pessoas com soma exata em centavos (sem perda de centavo)', () => {
    const totalCents = 10000; // R$ 100,00
    const partes = dividirIgualmenteCents(totalCents, 3);
    expect(partes).toHaveLength(3);
    expect(partes).toEqual([3334, 3333, 3333]);
    const soma = partes.reduce((a, b) => a + b, 0);
    expect(soma).toBe(totalCents);
  });

  it('CA02: divide entre 4 pessoas exatamente', () => {
    const partes = dividirIgualmenteCents(5000, 4);
    expect(partes).toEqual([1250, 1250, 1250, 1250]);
  });

  it('CA03: divide por itens consumidos por pessoa', () => {
    const itens = [
      { id: '1', nome: 'Café', valorTotalCents: 1000 },
      { id: '2', nome: 'Bolo', valorTotalCents: 1500 }
    ];
    const selecaoPorPessoa = [
      { pessoa: 'A', itemIds: ['1'] },
      { pessoa: 'B', itemIds: ['2'] }
    ];
    const res = dividirPorConsumoItens(itens, selecaoPorPessoa);
    expect(res.porPessoa['A']).toBe(1000);
    expect(res.porPessoa['B']).toBe(1500);
    expect(res.totalCalculadoCents).toBe(2500);
  });

  it('CA04: rateia taxa e desconto proporcionalmente aos subtotais de cada pessoa', () => {
    const subtotais = [2000, 3000]; // 40% e 60% de 5000
    const dist = distribuirTaxaEDesconto(subtotais, 500, 0); // 10% de taxa = 500
    expect(dist[0]).toBe(2200);
    expect(dist[1]).toBe(3300);
    expect(dist[0] + dist[1]).toBe(5500);
  });
});
