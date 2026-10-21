import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000052 — Grade de mesas touch-friendly no mobile
 */
describe('CAF-000052 — Grade de Mesas Mobile', () => {
  const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');

  it('CA01 / CA03: possui container de grade de mesas com botões rápidos de seleção', () => {
    expect(pedidosHtml).toMatch(/mesas-grid|grid-mesas|mesas-container/i);
  });

  it('CA02: visualização do mapa do salão permite troca direta de mesa ativa', () => {
    expect(pedidosHtml).toMatch(/btn-mesa|card-mesa|mesa-btn/i);
  });
});
