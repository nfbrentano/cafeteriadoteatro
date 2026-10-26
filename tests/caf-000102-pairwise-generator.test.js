import { describe, it, expect } from 'vitest';
import {
  gerarProdutoCartesiano,
  gerarPairwise,
  obterTodosOsPares,
  verificarCoberturaPares
} from './helpers/pairwise-generator.js';

describe('CAF-000102: CA01 — Gerador Determinístico Cartesiano e Pairwise', () => {
  it('gera produto cartesiano correto para dimensões com múltiplos valores', () => {
    const dimensoes = {
      a: [1, 2],
      b: ['x', 'y', 'z'],
      c: [true, false]
    };
    const casos = gerarProdutoCartesiano(dimensoes);
    expect(casos.length).toBe(2 * 3 * 2); // 12
    expect(casos[0]).toEqual({ a: 1, b: 'x', c: true });
  });

  it('calcula todos os pares esperados entre dimensões', () => {
    const dimensoes = {
      a: [1, 2],
      b: ['x', 'y']
    };
    const pares = obterTodosOsPares(dimensoes);
    expect(pares.size).toBe(4);
    expect(pares.has('a:::1|||b:::x')).toBe(true);
    expect(pares.has('a:::2|||b:::y')).toBe(true);
  });

  it('gera conjunto pairwise que cobre 100% de todos os pares possíveis (3x4x5)', () => {
    const dimensoes = {
      d1: ['A', 'B', 'C'],
      d2: [1, 2, 3, 4],
      d3: ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
    };

    const casos = gerarPairwise(dimensoes);
    const verificacao = verificarCoberturaPares(dimensoes, casos);

    expect(verificacao.coberto).toBe(true);
    expect(verificacao.paresNaoCobertos.length).toBe(0);
    // Produto cartesiano seria 3 * 4 * 5 = 60 casos. Pairwise reduz para em torno de 20 casos.
    expect(casos.length).toBeLessThan(60);
    expect(casos.length).toBeGreaterThanOrEqual(5 * 4 / 2); // Cota inferior razoável
  });

  it('é determinístico (múltiplas chamadas geram exatamente a mesma saída)', () => {
    const dimensoes = {
      categoria: ['rapidos', 'todos', 'promos'],
      busca: ['vazia', 'com_match', 'sem_match'],
      produto: ['disponivel', 'esgotado']
    };

    const run1 = gerarPairwise(dimensoes);
    const run2 = gerarPairwise(dimensoes);

    expect(run1).toEqual(run2);
  });

  it('trata casos de borda: dimensões vazias ou de dimensão única', () => {
    expect(gerarPairwise({})).toEqual([]);
    expect(gerarPairwise({ unico: ['a', 'b'] })).toEqual([{ unico: 'a' }, { unico: 'b' }]);
  });
});
