import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000055 — Alvos de toque touch-friendly (>= 44px) e Bottom Navigation
 */
describe('CAF-000055 — Touch Targets e Bottom Nav', () => {
  const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');
  const pedidosCss = fs.readFileSync('css/pedidos.css', 'utf8');

  it('CA01 / CA02: bottom navigation do PDV mobile está estruturada no HTML', () => {
    expect(pedidosHtml).toMatch(/mobile-bottom-nav|bottom-bar|bottom-nav/i);
  });

  it('CA02 / CA02: regras de CSS definem alvos de toque com min-height >= 44px ou 48px', () => {
    expect(pedidosCss).toMatch(/min-height:\s*(?:4[4-9]|[5-9]\d)px/);
  });
});
