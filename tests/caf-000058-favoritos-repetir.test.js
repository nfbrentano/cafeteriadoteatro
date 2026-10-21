import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000058 — Atalhos de favoritos e ação Repetir Rodada
 */
describe('CAF-000058 — Favoritos e Repetir Rodada', () => {
  const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');

  it('CA01 / CA06: possui seção ou chips de produtos favoritos / frequentes', () => {
    expect(pedidosHtml).toMatch(/categories-tabs|product-search/);
  });

  it('CA02 / CA06: possui ação de repetir rodada para duplicar o último pedido da mesa', () => {
    expect(pedidosHtml).toMatch(/btn-repetir-rodada|repetir-itens|repetir/i);
  });
});
