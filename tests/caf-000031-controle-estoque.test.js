import { describe, it, expect } from 'vitest';
import { calcularCustoMedioPonderado } from '../js/utils/estoque-custos.js';
import fs from 'fs';

/**
 * CAF-000031 — Controle de estoque (Entrada, saída, ajuste, perda, custo médio ponderado)
 */
describe('CAF-000031 — Controle de estoque', () => {
  const estoqueJs = fs.readFileSync('js/admin/estoque.js', 'utf8');

  it('CA01 / CA03: calcula custo médio ponderado exato: 10un @ 1.50 + 5un @ 2.50 = 1.8333', () => {
    // 10 * 1.50 = 15.00
    // 5 * 2.50 = 12.50
    // Total = 27.50 / 15 = 1.8333333333333335
    const custo = calcularCustoMedioPonderado(10, 1.50, 5, 2.50, 4);
    expect(custo).toBe(1.8333);
  });

  it('CA02: entrada com estoque zerado assume o custo unitário da entrada', () => {
    const custo = calcularCustoMedioPonderado(0, 0, 8, 3.20);
    expect(custo).toBe(3.20);
  });

  it('CA03: estoque.js possui manipulação de entradas, saídas e movimentações', () => {
    expect(estoqueJs).toMatch(/movimentacoes_estoque|estoque_itens/);
  });
});
