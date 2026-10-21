import { describe, it, expect } from 'vitest';
import { createSupabaseMock } from './helpers/supabase-mock.js';
import { calculateSubtotal, calculateOrderTotal, calculateChange } from '../js/utils/order-calculator.js';
import { normalizePhone } from '../js/utils/receipt-formatter.js';
import { createPageHarness } from './helpers/page-harness.js';

describe('CAF-000086 / Core Business Rules & Flows (Código Real)', () => {
  it('calculates totals, discount and change correctly using real module', () => {
    const items = [
      { preco: 12.50, quantidade: 2 }, // 25.00
      { preco: 8.00, quantidade: 1 }   // 8.00
    ];
    const subtotal = calculateSubtotal(items);
    expect(subtotal).toBe(33.00);

    const totalLiquido = calculateOrderTotal(subtotal, { desconto: 3.00 });
    expect(totalLiquido).toBe(30.00);

    const troco = calculateChange(50.00, totalLiquido);
    expect(troco).toBe(20.00);
  });

  it('normalizes Brazilian phone numbers cleanly using real receipt-formatter utility', () => {
    expect(normalizePhone('(51) 99999-8888')).toBe('5551999998888');
    expect(normalizePhone('51 98888-7777')).toBe('5551988887777');
    expect(normalizePhone('+55 51 99999-8888')).toBe('5551999998888');
    expect(normalizePhone('999998888')).toBe('999998888');
  });

  it('in-memory supabase mock correctly chains and queries data with strict mode and realtime', async () => {
    const mock = createSupabaseMock({
      produtos: [
        { id: 'p1', nome: 'Espresso', preco: 7.00, ativo: true },
        { id: 'p2', nome: 'Cappuccino', preco: 14.00, ativo: true },
        { id: 'p3', nome: 'Bolo Antigo', preco: 10.00, ativo: false }
      ]
    });

    const res = await mock.from('produtos').select('*').eq('ativo', true);
    expect(res.data).toHaveLength(2);
    expect(res.data.map(p => p.nome)).toEqual(['Espresso', 'Cappuccino']);

    // Insert new product
    await mock.from('produtos').insert({ nome: 'Mocha', preco: 16.00, ativo: true });
    const updated = await mock.from('produtos').select('*').eq('ativo', true);
    expect(updated.data).toHaveLength(3);
  });

  it('page harness loads HTML page without external network requests', () => {
    const harness = createPageHarness('cardapio.html');
    expect(harness.document.title).toBeDefined();
    expect(harness.rpcCalls).toHaveLength(0);
    harness.cleanup();
  });
});
