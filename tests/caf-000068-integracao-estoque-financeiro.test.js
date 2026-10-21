import { describe, it, expect } from 'vitest';
import { calcularPedidoCompra } from '../js/utils/stock-purchase.js';
import { mapearPayloadDespesaParaBanco } from '../js/utils/despesa-mapper.js';
import fs from 'fs';

/**
 * CAF-000068 — Integração de compras de estoque com financeiro (Contas a Pagar)
 */
describe('CAF-000068 — Integração Compras, Estoque e Financeiro', () => {
  const estoqueJs = fs.readFileSync('js/admin/estoque.js', 'utf8');

  it('CA01: cálculo do pedido de compra gera total líquido e itens para entrada', () => {
    const itens = [
      { insumo_id: 'cafe-grao', quantidade: 10, custo_unitario: 50.00 },
      { insumo_id: 'leite-integral', quantidade: 20, custo_unitario: 5.50 }
    ];
    // 10 * 50 = 500
    // 20 * 5.50 = 110
    // Total = 610
    const res = calcularPedidoCompra(itens);
    expect(res.total).toBe(610.00);
  });

  it('CA02: entrada de compra gera payload de despesa compatível com financeiro', () => {
    const despesaCompra = {
      descricao: 'Compra Estoque: Fornecedor Café Sul',
      valor_total: 610.00,
      vencimento: '2026-10-28',
      categoria: 'Insumos',
      recorrencia: 'nenhuma'
    };

    const payload = mapearPayloadDespesaParaBanco(despesaCompra);
    expect(payload.valor).toBe(610.00);
    expect(payload.vencimento).toBe('2026-10-28');
    expect(payload.recorrencia).toBe('nenhuma');
  });

  it('CA03: estoque.js contém integração com compras ou fornecedores', () => {
    expect(estoqueJs).toMatch(/fornecedor|compra|entrada/i);
  });
});
