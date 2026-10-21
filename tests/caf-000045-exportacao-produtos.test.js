import { describe, it, expect } from 'vitest';
import { exportarParaCsv } from '../js/utils/csv-export.js';
import fs from 'fs';

/**
 * CAF-000045 — Exportação de produtos e planilhas com suporte UTF-8 BOM
 */
describe('CAF-000045 — Exportação de produtos', () => {
  const productsJs = fs.readFileSync('js/admin/products.js', 'utf8');

  it('CA01: exporta CSV com BOM UTF-8 e cabeçalhos corretos para Excel', () => {
    const colunas = [
      { key: 'nome', label: 'Nome do Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'preco', label: 'Preço (R$)' }
    ];
    const dados = [
      { nome: 'Café Coado & Especial', categoria: 'Bebidas Quentes', preco: 12.00 },
      { nome: 'Bolo de Maçã "Artesanal"', categoria: 'Doces', preco: 15.50 }
    ];

    const csv = exportarParaCsv(colunas, dados, { includeBom: true });
    // Inicia com BOM UTF-8 (\uFEFF)
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('Nome do Produto,Categoria,Preço (R$)');
    expect(csv).toContain('Café Coado & Especial');
    // Aspas duplas escapadas corretamente
    expect(csv).toContain('"Bolo de Maçã ""Artesanal"""');
  });

  it('CA02: products.js possui funcionalidade de exportação de dados', () => {
    expect(productsJs).toMatch(/exportar|csv|download/i);
  });
});
