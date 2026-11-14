import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { lerCodigoFontePDV } from './helpers/page-harness.js';

/**
 * CAF-000057 — Rascunho do carrinho persistido e faixa de conectividade offline
 */
describe('CAF-000057 — Carrinho Persistido e Offline', () => {
  const pedidosJs = lerCodigoFontePDV();
  const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');

  it('CA01 / CA05: salva e restaura rascunho do carrinho no localStorage', () => {
    expect(pedidosJs).toMatch(/localStorage\.setItem\(['"]cafeteria_carrinho|carrinho_rascunho/);
  });

  it('CA02 / CA05: escuta eventos de online e offline e exibe faixa de aviso', () => {
    expect(pedidosJs).toMatch(/addEventListener\(['"]online['"]/);
    expect(pedidosJs).toMatch(/addEventListener\(['"]offline['"]/);
    expect(pedidosHtml).toMatch(/offline-banner|banner-offline|faixa-offline/i);
  });
});
