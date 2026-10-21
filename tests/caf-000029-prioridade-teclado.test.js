import { describe, it, expect } from 'vitest';
import { ordenarFilaKDS } from '../js/utils/kds-regras.js';
import fs from 'fs';

/**
 * CAF-000029 — Prioridade e operação por teclado no KDS
 */
describe('CAF-000029 — Prioridade e operação por teclado', () => {
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: pedidos com prioridade marcada são ordenados no topo da fila', () => {
    const pedidos = [
      { id: '1', prioridade: false, created_at: '2026-10-21T10:00:00Z' },
      { id: '2', prioridade: true, created_at: '2026-10-21T10:05:00Z' },
      { id: '3', prioridade: false, created_at: '2026-10-21T09:55:00Z' }
    ];
    const ordenados = ordenarFilaKDS(pedidos);
    expect(ordenados[0].id).toBe('2'); // prioridade no topo
  });

  it('CA02: cozinha.js escuta atalhos de teclado para operação sem mouse', () => {
    expect(cozinhaJs).toMatch(/addEventListener\(['"]keydown['"]/);
  });
});
