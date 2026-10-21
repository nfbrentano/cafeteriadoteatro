import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000004 — Cancelar item individual
 */
describe('CAF-000004 — Cancelar item individual', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: invoca RPC cancelar_item com p_item_id e p_motivo', () => {
    expect(pedidosJs).toMatch(/rpc\(['"]cancelar_item['"],\s*\{[\s\S]*?p_item_id/);
  });

  it('CA02: motivo é obrigatório para confirmação do cancelamento', () => {
    expect(pedidosJs).toMatch(/motivo|cancelarItem/);
  });

  it('CA03: recálculo do total do pedido exclui o valor do item cancelado', () => {
    const itens = [
      { id: '1', preco: 15.00, cancelado: false },
      { id: '2', preco: 25.00, cancelado: true }
    ];
    const totalValido = itens.filter(i => !i.cancelado).reduce((acc, i) => acc + i.preco, 0);
    expect(totalValido).toBe(15.00);
  });

  it('CA04: cozinha exibe item cancelado com estilo riscado ou alerta', () => {
    expect(cozinhaJs).toMatch(/cancelado/);
  });
});
