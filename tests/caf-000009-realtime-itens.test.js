import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';

/**
 * CAF-000009 — Realtime da cozinha também em pedido_itens
 */
describe('CAF-000009 — Realtime da cozinha também em pedido_itens', () => {
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: canal realtime assina eventos em pedido_itens', () => {
    expect(cozinhaJs).toMatch(/table:\s*['"]pedido_itens['"]/);
  });

  it('CA02: atualizações de itens disparam recarga ou patch do pedido', () => {
    expect(cozinhaJs).toMatch(/scheduleIncrementalFetch|recarregarPedidoIncremental/);
  });

  it('CA03: reconexão automática e recarga ao retornar para a aba visível', () => {
    expect(cozinhaJs).toMatch(/visibilitychange/);
  });
});
