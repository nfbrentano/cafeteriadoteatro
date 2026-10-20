import { describe, it, expect, vi } from 'vitest';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('Core Business Rules & Helpers', () => {
  it('calculates totals, discount and change correctly', () => {
    const items = [
      { preco: 12.50, quantidade: 2 }, // 25.00
      { preco: 8.00, quantidade: 1 }   // 8.00
    ];
    const subtotal = items.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
    expect(subtotal).toBe(33.00);

    const desconto = 3.00;
    const totalLiquido = Math.max(0, subtotal - desconto);
    expect(totalLiquido).toBe(30.00);

    const valorPago = 50.00;
    const troco = valorPago - totalLiquido;
    expect(troco).toBe(20.00);
  });

  it('normalizes Brazilian phone numbers cleanly', () => {
    function normalizePhone(raw) {
      const digits = String(raw || '').replace(/\D/g, '');
      if (digits.length === 11) return `55${digits}`;
      if (digits.length === 10) return `55${digits}`;
      if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
      return digits;
    }

    expect(normalizePhone('(51) 99999-8888')).toBe('5551999998888');
    expect(normalizePhone('51 98888-7777')).toBe('5551988887777');
    expect(normalizePhone('+55 51 99999-8888')).toBe('5551999998888');
  });

  it('in-memory supabase mock correctly chains and queries data', async () => {
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
});
