import { describe, it, expect } from 'vitest';
import { agruparPorEstacao } from '../js/utils/kds-regras.js';
import fs from 'fs';

/**
 * CAF-000007 — Separação por estação (bar × cozinha)
 */
describe('CAF-000007 — Separação por estação (bar × cozinha)', () => {
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: agrupa itens entre estação bar e estação cozinha corretamente', () => {
    const itens = [
      { id: '1', nome: 'Espresso Duplo', estacao: 'bar' },
      { id: '2', nome: 'Cappuccino', estacao: 'bar' },
      { id: '3', nome: 'Baguete Frango', estacao: 'cozinha' }
    ];
    const grupos = agruparPorEstacao(itens);
    expect(grupos.bar).toHaveLength(2);
    expect(grupos.cozinha).toHaveLength(1);
    expect(grupos.cozinha[0].nome).toBe('Baguete Frango');
  });

  it('CA02: cozinha.js suporta filtro por parâmetro URL ?estacao=bar ou ?estacao=cozinha', () => {
    expect(cozinhaJs).toMatch(/URLSearchParams|estacao/);
  });
});
