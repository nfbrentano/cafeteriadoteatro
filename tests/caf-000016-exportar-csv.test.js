import { describe, it, expect } from 'vitest';
import { escapeCSV, gerarCSVPedidos } from '../js/utils/csv-export.js';

/**
 * CAF-000016 — Exportar CSV
 */
describe('CAF-000016 — Exportar CSV', () => {
  it('CA01: escapa strings com separador, aspas ou quebra de linha', () => {
    expect(escapeCSV('Café;Duplo', ';')).toBe('"Café;Duplo"');
    expect(escapeCSV('Bolo "Cenoura"', ';')).toBe('"Bolo ""Cenoura"""');
    expect(escapeCSV('Linha1\nLinha2', ';')).toBe('"Linha1\nLinha2"');
    expect(escapeCSV('Normal', ';')).toBe('Normal');
  });

  it('CA02: inclui BOM UTF-8 (\\uFEFF) para compatibilidade com Microsoft Excel', () => {
    const csv = gerarCSVPedidos([]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('CA03: gera linhas corretas com cabeçalho e dados de pedidos formatados em SP', () => {
    const pedidos = [
      {
        id: '123',
        numero_pedido: '042',
        created_at: '2026-10-21T15:30:00.000Z',
        mesa_codigo: 'Mesa 4',
        status: 'concluido',
        forma_pagamento: 'pix',
        total: 25.50
      }
    ];
    const csv = gerarCSVPedidos(pedidos, { separator: ';' });
    const linhas = csv.replace('\uFEFF', '').split('\r\n');
    expect(linhas[0]).toBe('Nº;Data/Hora;Mesa;Status;Pagamento;Total');
    expect(linhas[1]).toContain('042');
    expect(linhas[1]).toContain('Mesa 4');
    expect(linhas[1]).toContain('25,50');
  });
});
