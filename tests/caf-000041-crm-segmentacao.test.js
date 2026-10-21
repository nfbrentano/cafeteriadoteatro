import { describe, it, expect } from 'vitest';
import { classificarClienteRfv, filtrarClientesPorTag } from '../js/utils/crm-segmentos.js';

/**
 * CAF-000041 — CRM, segmentação RFV e tags de clientes
 */
describe('CAF-000041 — CRM, segmentação e tags', () => {
  const hoje = new Date('2026-10-21T12:00:00Z');

  it('CA01: classifica cliente VIP (recente, alta frequência e alto gasto)', () => {
    const clienteVip = {
      ultima_compra: '2026-10-18T10:00:00Z', // 3 dias atrás
      total_pedidos: 18,
      valor_total_gasto: 550.00
    };

    const res = classificarClienteRfv(clienteVip, { hoje });
    expect(res.segmento).toBe('vip');
    expect(res.recenciaScore).toBe(5);
    expect(res.frequenciaScore).toBe(5);
    expect(res.valorScore).toBe(5);
  });

  it('CA02: classifica cliente em risco (já foi frequente mas não compra há mais de 60 dias)', () => {
    const clienteEmRisco = {
      ultima_compra: '2026-08-01T10:00:00Z', // > 80 dias atrás
      total_pedidos: 12,
      valor_total_gasto: 350.00
    };

    const res = classificarClienteRfv(clienteEmRisco, { hoje });
    expect(res.segmento).toBe('em_risco');
    expect(res.recenciaScore).toBe(2);
    expect(res.frequenciaScore).toBe(4);
  });

  it('CA03: classifica novo cliente (comprou recentemente com poucos pedidos)', () => {
    const clienteNovo = {
      ultima_compra: '2026-10-20T10:00:00Z',
      total_pedidos: 1,
      valor_total_gasto: 25.00
    };

    const res = classificarClienteRfv(clienteNovo, { hoje });
    expect(res.segmento).toBe('novo');
  });

  it('CA04: filtra clientes por tags no modo qualquer e modo todas', () => {
    const clientes = [
      { id: 1, nome: 'Ana', tags: ['vip', 'espetaculo', 'cafe-especial'] },
      { id: 2, nome: 'Beto', tags: ['espetaculo'] },
      { id: 3, nome: 'Carlos', tags: ['delivery'] }
    ];

    // Modo qualquer: quem tem 'vip' OU 'delivery'
    const resQualquer = filtrarClientesPorTag(clientes, ['vip', 'delivery'], 'qualquer');
    expect(resQualquer.map(c => c.nome)).toEqual(['Ana', 'Carlos']);

    // Modo todas: quem tem 'vip' E 'espetaculo'
    const resTodas = filtrarClientesPorTag(clientes, ['vip', 'espetaculo'], 'todas');
    expect(resTodas.map(c => c.nome)).toEqual(['Ana']);
  });
});
