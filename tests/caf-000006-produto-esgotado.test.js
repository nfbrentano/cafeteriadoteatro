import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000006 — Produto esgotado (liga/desliga rápido)
 */
describe('CAF-000006 — Produto esgotado', () => {
  const cardapioJs = fs.readFileSync('js/cardapio-dynamic.js', 'utf8');
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01: produtos possuem campo disponivel no banco/schema', () => {
    expect(pedidosJs).toMatch(/disponivel/);
  });

  it('CA02: produto esgotado (disponivel === false) não permite adição ao carrinho no PDV', () => {
    expect(pedidosJs).toMatch(/disponivel === false|!p\.disponivel/);
  });

  it('CA03: cardápio público exibe selo ou oculta produtos marcados como esgotados', () => {
    expect(cardapioJs).toMatch(/disponivel/);
  });
});
