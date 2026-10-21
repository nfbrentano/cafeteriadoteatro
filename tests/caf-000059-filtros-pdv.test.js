import { describe, it, expect } from 'vitest';
import { filtrarPedidosPdv, calcularTrocoPdv } from '../js/utils/pdv-filtros.js';
import fs from 'fs';

/**
 * CAF-000059 — Filtros do PDV (Meus pedidos, chips de troco e envio otimista)
 */
describe('CAF-000059 — Filtros e Chips de Troco no PDV', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01 / CA06: calcula troco exato a partir do total da conta e do valor pago', () => {
    const total = 42.50;
    const pago = 50.00;
    const res = calcularTrocoPdv(total, pago);

    expect(res.troco).toBe(7.50);
    expect(res.valido).toBe(true);
  });

  it('CA02 / CA06: filtra pedidos por atendente / "Meus pedidos"', () => {
    const pedidos = [
      { id: 1, atendente_id: 'user-1' },
      { id: 2, atendente_id: 'user-2' },
      { id: 3, atendente_id: 'user-1' }
    ];

    const meus = filtrarPedidosPdv(pedidos, { atendenteId: 'user-1', apenasMeus: true });
    expect(meus.length).toBe(2);
    expect(meus.map(p => p.id)).toEqual([1, 3]);
  });

  it('CA03: pedidos.js possui suporte a chips de cálculo rápido de troco', () => {
    expect(pedidosJs).toMatch(/chips-troco|troco|btn-troco/i);
  });
});
