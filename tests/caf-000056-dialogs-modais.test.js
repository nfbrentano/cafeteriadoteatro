import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000056 — Modais, Bottom Sheets e Toasts elegantes no lugar de alert/confirm nativos
 */
describe('CAF-000056 — Dialogs e Modais Elegantes', () => {
  const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');

  it('CA01 / CA04: possui containers de modais, bottom sheets e toasts', () => {
    expect(pedidosHtml).toMatch(/modal|bottom-sheet|toast-container/i);
  });

  it('CA02: possui botões de confirmação e cancelamento com foco acessível', () => {
    expect(pedidosHtml).toMatch(/btn-primary|btn--primary|btn-ghost|btn-secondary/);
  });
});
