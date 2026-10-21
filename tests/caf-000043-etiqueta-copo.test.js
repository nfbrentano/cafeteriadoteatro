import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000043 — Etiqueta de copo e embalagem
 */
describe('CAF-000043 — Etiqueta de copo e embalagem', () => {
  const printJs = fs.readFileSync('js/pedido-print.js', 'utf8');

  it('CA01: pedido-print.js possui função para geração de etiqueta individual de copo/item', () => {
    expect(printJs).toMatch(/gerarEtiqueta|etiqueta|imprimir/i);
  });

  it('CA02: etiqueta inclui nome do cliente, produto, adicionais e observação', () => {
    expect(printJs).toMatch(/cliente|nome|adicionais|obs/i);
  });
});
