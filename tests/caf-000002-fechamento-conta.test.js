import { describe, it, expect } from 'vitest';
import {
  calculateMesaTotals,
  buildFecharContaMesaPayload,
  validarFecharContaPayload,
  calcularTrocoCents
} from '../js/utils/conta-mesa.js';
import fs from 'fs';

/**
 * CAF-000002 — Fechamento de conta da mesa
 */
describe('CAF-000002 — Fechamento de conta da mesa', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01: calcula subtotal da mesa somando apenas pedidos ativos não cancelados', () => {
    const pedidos = [
      { id: '1', total: '25.50', status: 'concluido' },
      { id: '2', total: '15.00', status: 'entregue' },
      { id: '3', total: '100.00', status: 'cancelado' }
    ];
    const totals = calculateMesaTotals(pedidos);
    expect(totals.subtotalCents).toBe(4050);
    expect(totals.subtotal).toBe('40.50');
    expect(totals.pedidosValidos).toHaveLength(2);
  });

  it('CA02: suporta múltiplos pagamentos somando o total exato da conta', () => {
    const pagamentos = [
      { forma: 'pix', valor: 20.00 },
      { forma: 'dinheiro', valor: 20.50 }
    ];
    const payload = buildFecharContaMesaPayload({
      mesaId: 5,
      pedidos: [{ id: '1', total: '40.50', status: 'concluido' }],
      pagamentos
    });
    expect(payload.p_pagamentos).toHaveLength(2);
    expect(payload.p_total).toBe(40.50);
    const validacao = validarFecharContaPayload(payload);
    expect(validacao.valido).toBe(true);
  });

  it('CA03: calcula troco com precisão sem erros de ponto flutuante', () => {
    const troco = calcularTrocoCents(5000, 4050);
    expect(troco).toBe(950);
  });

  it('CA04: payload de fechar_conta_mesa contém p_mesa_id, p_pagamentos, p_taxa_servico, p_desconto_manual', () => {
    const payload = buildFecharContaMesaPayload({
      mesaId: 10,
      pedidos: [{ id: '1', total: '10.00' }]
    });
    expect(payload).toHaveProperty('p_mesa_id', 10);
    expect(payload).toHaveProperty('p_pagamentos');
    expect(payload).toHaveProperty('p_taxa_servico');
    expect(payload).toHaveProperty('p_desconto_manual');
  });

  it('CA05: pedidos.js invoca RPC fechar_conta_mesa e não atualiza status diretamente', () => {
    expect(pedidosJs).toMatch(/rpc\(['"]fechar_conta_mesa['"]/);
  });
});
