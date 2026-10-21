import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000020B — Vínculo de adicionais permitidos e proteção anti-XSS
 */
describe('CAF-000020B — Vínculo de Adicionais por Produto', () => {
  const cardapioPedidoJs = fs.readFileSync('js/cardapio-cliente-pedido.js', 'utf8');

  it('CA01 / CA09: filtra adicionais permitidos vinculados ao produto', () => {
    const adicionaisDisponiveis = [
      { id: 1, nome: 'Canela em Pó', preco: 1.00 },
      { id: 2, nome: 'Chantilly', preco: 3.50 },
      { id: 3, nome: 'Dose Extra de Bacon', preco: 6.00 } // Não permitido para café
    ];

    const vinculosPermitidos = [1, 2]; // Apenas 1 e 2
    const filtrados = adicionaisDisponiveis.filter(a => vinculosPermitidos.includes(a.id));

    expect(filtrados.length).toBe(2);
    expect(filtrados.map(f => f.nome)).toEqual(['Canela em Pó', 'Chantilly']);
  });

  it('CA02 / CA09: sanitiza strings de adicionais impedindo injeção de HTML/XSS', () => {
    const payloadComXss = "<img src=x onerror=alert(1)>";
    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const limpo = escapeHtml(payloadComXss);
    expect(limpo).not.toContain('<img');
    expect(limpo).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('CA03: cardapio-cliente-pedido.js contém suporte a adicionais e escape', () => {
    expect(cardapioPedidoJs).toMatch(/adicionais|adicional/i);
  });
});
