import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizePhone,
  formatCurrency,
  formatDigitalReceipt,
  openWhatsAppReceipt,
  shareOrCopyReceipt
} from '../js/utils/receipt-formatter.js';

describe('CAF-000066 — Digital Receipt WhatsApp & Web Share API Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('CA01: Formats complete receipt with items, totals, and review link', () => {
    const text = formatDigitalReceipt({
      cafeteriaNome: 'Cafeteria do Teatro',
      mesaCodigo: '04',
      itens: [
        { nome: 'Cappuccino Italiano', quantidade: 2, preco_unitario: 14.00 },
        { nome: 'Pão de Queijo Mineiro', quantidade: 1, preco_unitario: 8.00 }
      ],
      subtotal: 36.00,
      total: 36.00,
      pedidoId: 'ped-123'
    });

    expect(text).toContain('CAFETERIA DO TEATRO');
    expect(text).toContain('Mesa 04');
    expect(text).toContain('2x Cappuccino Italiano');
    expect(text).toContain('1x Pão de Queijo Mineiro');
    expect(text).toContain('TOTAL:');
    expect(text).toContain('avaliar.html?pedido=ped-123');
  });

  it('CA02: Includes discount and calculation per person when split', () => {
    const text = formatDigitalReceipt({
      mesaCodigo: '10',
      itens: [{ nome: 'Café', quantidade: 1, preco_unitario: 30.00 }],
      subtotal: 30.00,
      desconto: 5.00,
      total: 25.00,
      divisaoPessoas: 2
    });

    expect(text).toContain('*Desconto:* -');
    expect(text).toContain('5,00');
    expect(text).toContain('Divisão (2 pessoas):');
    expect(text).toContain('12,50 por pessoa');
  });

  it('CA03: Automatically addresses WhatsApp URL to customer phone', () => {
    window.open = vi.fn();
    const url = openWhatsAppReceipt('Resumo do pedido', '(51) 99999-8888');

    expect(url).toContain('wa.me/5551999998888?text=');
    expect(window.open).toHaveBeenCalledWith(url, '_blank');
  });

  it('CA04: Uses navigator.share if available', async () => {
    const shareMock = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true
    });
    const res = await shareOrCopyReceipt('Texto comprovante', { title: 'Comprovante' });

    expect(shareMock).toHaveBeenCalledWith({
      title: 'Comprovante',
      text: 'Texto comprovante'
    });
    expect(res.shared).toBe(true);
  });

  it('CA04 (Fallback): Copies to clipboard when navigator.share is unavailable', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
      writable: true
    });
    const writeMock = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeMock },
      configurable: true,
      writable: true
    });
    const onCopy = vi.fn();

    const res = await shareOrCopyReceipt('Texto comprovante', { onCopySuccess: onCopy });

    expect(writeMock).toHaveBeenCalledWith('Texto comprovante');
    expect(onCopy).toHaveBeenCalled();
    expect(res.copied).toBe(true);
  });
});
