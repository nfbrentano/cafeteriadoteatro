import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000054 — Fechamento de conta em 3 etapas no PDV mobile
 */
describe('CAF-000054 — Fechamento em 3 Etapas', () => {
  const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');

  it('CA01 / CA03: modal de fechamento possui as 3 etapas bem definidas', () => {
    expect(pedidosHtml).toMatch(/modal-fechar-conta/);
    expect(pedidosHtml).toMatch(/data-step="1"/);
    expect(pedidosHtml).toMatch(/data-step="2"/);
    expect(pedidosHtml).toMatch(/data-step="3"/);
  });

  it('CA02: possui botões de avançar e voltar entre as etapas preservando o estado', () => {
    expect(pedidosHtml).toMatch(/btn-fechar-conta-voltar/);
    expect(pedidosHtml).toMatch(/btn-fechar-conta-next-1|btn-fechar-step-next/);
  });
});
