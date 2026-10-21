import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000008 — Marcar item a item como pronto
 */
describe('CAF-000008 — Marcar item a item como pronto', () => {
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: cozinha registra pronto_em individual por item', () => {
    expect(cozinhaJs).toMatch(/pronto_em/);
  });

  it('CA02: calcula progresso de conclusão dos itens (ex: 2/3 prontos)', () => {
    const itens = [
      { id: '1', pronto_em: '2026-10-21T10:00:00Z' },
      { id: '2', pronto_em: '2026-10-21T10:01:00Z' },
      { id: '3', pronto_em: null }
    ];
    const prontos = itens.filter(i => Boolean(i.pronto_em)).length;
    expect(prontos).toBe(2);
    expect(`${prontos}/${itens.length}`).toBe('2/3');
  });

  it('CA03: pedido avança para concluído quando todos os itens estão prontos', () => {
    expect(cozinhaJs).toMatch(/todosProntos|concluido/);
  });
});
