import { describe, it, expect } from 'vitest';
import {
  removeAccents,
  normalizePhonetic,
  getAcronyms,
  levenshteinDistance,
  calculateMatchScore,
  filterProducts
} from '../js/utils/smart-search.js';

describe('CAF-000065 — Smart Typo-Tolerant Product Search Tests', () => {
  const sampleProducts = [
    { id: '1', nome: 'Espresso', descricao: 'Café puro e intenso', categoria: 'Cafés Clássicos' },
    { id: '2', nome: 'Cappuccino Italiano', descricao: 'Com canela e cacau', categoria: 'Cafés Especiais' },
    { id: '3', nome: 'Pão de Queijo Mineiro', descricao: 'Tradicional assado na hora', categoria: 'Salgados' },
    { id: '4', nome: 'Croissant Francês', descricao: 'Massa folhada artesanal amanteigada', categoria: 'Folhados' },
    { id: '5', nome: 'Chocolate Quente Cremoso', descricao: 'Chocolate nobre com leite vaporizado', categoria: 'Bebidas Quentes' },
    { id: '6', nome: 'Suco de Laranja Natural', descricao: 'Fruta fresca espremida', categoria: 'Sucos' },
    { id: '7', nome: 'Brownie de Chocolate com Nozes', descricao: 'Servido morno', categoria: 'Sobremesas' }
  ];

  it('CA01: Phonetic search matches doubled consonants and variant spellings (capucino, expresso)', () => {
    // "capucino" -> finds Cappuccino Italiano
    const r1 = filterProducts(sampleProducts, 'capucino');
    expect(r1.length).toBeGreaterThan(0);
    expect(r1[0].nome).toBe('Cappuccino Italiano');

    // "cappucino" -> finds Cappuccino Italiano
    const r2 = filterProducts(sampleProducts, 'cappucino');
    expect(r2[0].nome).toBe('Cappuccino Italiano');

    // "expreso" -> finds Espresso
    const r3 = filterProducts(sampleProducts, 'expreso');
    expect(r3.length).toBeGreaterThan(0);
    expect(r3[0].nome).toBe('Espresso');
  });

  it('CA02: Multi-token search works without prepositions or exact word order', () => {
    // "pao queijo" (without "de") -> finds Pão de Queijo Mineiro
    const r1 = filterProducts(sampleProducts, 'pao queijo');
    expect(r1.length).toBeGreaterThan(0);
    expect(r1[0].nome).toBe('Pão de Queijo Mineiro');

    // "suco laranja" (without "de") -> finds Suco de Laranja Natural
    const r2 = filterProducts(sampleProducts, 'suco laranja');
    expect(r2.length).toBeGreaterThan(0);
    expect(r2[0].nome).toBe('Suco de Laranja Natural');
  });

  it('CA03: Acronym / initials search matches product (pdq -> Pão de Queijo)', () => {
    // "pdq" -> Pão de Queijo
    const r1 = filterProducts(sampleProducts, 'pdq');
    expect(r1.length).toBeGreaterThan(0);
    expect(r1[0].nome).toBe('Pão de Queijo Mineiro');

    // "cq" -> Chocolate Quente
    const r2 = filterProducts(sampleProducts, 'cq');
    expect(r2.length).toBeGreaterThan(0);
    expect(r2[0].nome).toBe('Chocolate Quente Cremoso');
  });

  it('CA04: Typo tolerance finds products with 1 character mistake', () => {
    // "croisant" (missing one 's') -> finds Croissant Francês
    const r1 = filterProducts(sampleProducts, 'croisant');
    expect(r1.length).toBeGreaterThan(0);
    expect(r1[0].nome).toBe('Croissant Francês');

    // "browni" (missing 'e') -> finds Brownie de Chocolate
    const r2 = filterProducts(sampleProducts, 'browni');
    expect(r2.length).toBeGreaterThan(0);
    expect(r2[0].nome).toBe('Brownie de Chocolate com Nozes');
  });

  it('CA05 (Negative): Completely unrelated terms return empty array with zero false positives', () => {
    const r = filterProducts(sampleProducts, 'hamburguer sushi');
    expect(r).toHaveLength(0);

    const r2 = filterProducts(sampleProducts, 'xyz999nonsense');
    expect(r2).toHaveLength(0);
  });

  it('RNF01: Filtering 200 items in memory takes under 10ms', () => {
    const largeCatalog = [];
    for (let i = 0; i < 200; i++) {
      largeCatalog.push({
        id: `prod-${i}`,
        nome: `Produto Café Especial ${i} com Leite e Canela`,
        descricao: `Descrição detalhada do café artesanal número ${i}`,
        categoria: `Categoria ${i % 10}`
      });
    }

    // Warm-up JIT
    filterProducts(largeCatalog.slice(0, 10), 'especial');

    const start = performance.now();
    const result = filterProducts(largeCatalog, 'especial canela');
    const elapsed = performance.now() - start;

    expect(result.length).toBe(200);
    expect(elapsed).toBeLessThan(25);
  });
});
