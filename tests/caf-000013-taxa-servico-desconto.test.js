import { describe, it, expect } from 'vitest';
import {
  calculateMesaTotals,
  buildFecharContaMesaPayload,
  podeAplicarDesconto
} from '../js/utils/conta-mesa.js';
import fs from 'fs';

/**
 * CAF-000013 — Taxa de serviço e desconto manual
 */
describe('CAF-000013 — Taxa de serviço e desconto manual', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01: calcula taxa de serviço opcional (ex: 10%) sobre o subtotal válido', () => {
    const pedidos = [{ id: '1', total: '100.00', status: 'concluido' }];
    const totals = calculateMesaTotals(pedidos, { taxaServicoPercent: 10 });
    expect(totals.taxaServicoCents).toBe(1000); // R$ 10,00
    expect(totals.totalCents).toBe(11000); // R$ 110,00
  });

  it('CA02: aplica desconto manual subtraindo do total e validando limites', () => {
    const pedidos = [{ id: '1', total: '50.00', status: 'concluido' }];
    const totals = calculateMesaTotals(pedidos, { descontoManualCents: 500 }); // R$ 5,00
    expect(totals.descontoCents).toBe(500);
    expect(totals.totalCents).toBe(4500);
  });

  it('CA03: impede total negativo se desconto for superior ao subtotal', () => {
    const pedidos = [{ id: '1', total: '30.00', status: 'concluido' }];
    const totals = calculateMesaTotals(pedidos, { descontoManualCents: 5000 });
    expect(totals.totalCents).toBe(0);
  });

  it('CA04: restringe aplicação de desconto a perfis autorizados (gerente/admin)', () => {
    expect(podeAplicarDesconto({ cargo: 'garcom' })).toBe(false);
    expect(podeAplicarDesconto({ cargo: 'garcom', pode_dar_desconto: true })).toBe(true);
    expect(podeAplicarDesconto({ cargo: 'gerente' })).toBe(true);
    expect(podeAplicarDesconto({ cargo: 'admin' })).toBe(true);
  });

  it('CA05: payload de fechar conta envia p_taxa_servico e p_desconto_manual', () => {
    const payload = buildFecharContaMesaPayload({
      mesaId: 3,
      pedidos: [{ id: '1', total: '100.00' }],
      taxaServicoPercent: 10,
      descontoManualCents: 1000
    });
    expect(payload.p_taxa_servico).toBe(10.00);
    expect(payload.p_desconto_manual).toBe(10.00);
    expect(payload.p_total).toBe(100.00);
  });
});
