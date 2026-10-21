import { describe, it, expect } from 'vitest';
import { calcularCustoFichaTecnica, calcularMargemLucro, calcularCmv } from '../js/utils/estoque-custos.js';
import fs from 'fs';

/**
 * CAF-000032 — Ficha técnica, custo e margem de lucro
 */
describe('CAF-000032 — Ficha técnica, custo e lucro', () => {
  const estoqueJs = fs.readFileSync('js/admin/estoque.js', 'utf8');

  it('CA01: calcula custo da ficha técnica somando os insumos multiplicados pelas quantidades', () => {
    const ficha = [
      { insumo_id: 'cafe-grao', quantidade: 0.02 }, // 20g
      { insumo_id: 'leite', quantidade: 0.15 }       // 150ml
    ];
    const mapaCustos = {
      'cafe-grao': 60.00, // R$ 60/kg -> 0.02 * 60 = 1.20
      'leite': 6.00       // R$ 6/L -> 0.15 * 6 = 0.90
    };

    const custoTotal = calcularCustoFichaTecnica(ficha, mapaCustos);
    expect(custoTotal).toBe(2.10);
  });

  it('CA02: calcula margem de lucro percentual a partir do preço de venda', () => {
    const precoVenda = 10.00;
    const custo = 2.10;
    // Lucro: 7.90 -> (7.90 / 10) * 100 = 79%
    const margem = calcularMargemLucro(precoVenda, custo);
    expect(margem).toBe(79.00);
  });

  it('CA03: calcula CMV (Estoque Inicial + Compras - Estoque Final)', () => {
    const cmv = calcularCmv(5000, 3000, 4200);
    expect(cmv).toBe(3800);
  });

  it('CA04: código possui referências à composição de ficha técnica', () => {
    expect(estoqueJs).toMatch(/ficha_tecnica|custo_medio|custo_unitario/);
  });
});
