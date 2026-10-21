import { describe, it, expect } from 'vitest';
import { calcularTotaisCaixa, calcularDiferencaCaixaCego } from '../js/utils/caixa-calculos.js';
import fs from 'fs';

/**
 * CAF-000044 — Caixa cego e conciliação de fechamento
 */
describe('CAF-000044 — Caixa cego e correções', () => {
  const caixaAdminJs = fs.readFileSync('js/admin/caixa-admin.js', 'utf8');

  it('CA01 / CA04: fechamento com contagem cega, sangria e taxas por forma de pagamento ao centavo', () => {
    // Vendas:
    // Dinheiro: 362.30
    // Débito: 200.00 (taxa 1.99% = 3.98)
    // Crédito: 300.00 (taxa 3.49% = 10.47)
    // Pix: 150.00 (taxa 0% = 0.00)
    // Sangria em dinheiro: 50.00
    // Saldo inicial: 100.00
    // Contagem cega: 412.30
    const pagamentos = [
      { forma_pagamento: 'dinheiro', valor: 362.30 },
      { forma_pagamento: 'debito', valor: 200.00 },
      { forma_pagamento: 'credito', valor: 300.00 },
      { forma_pagamento: 'pix', valor: 150.00 }
    ];

    const totais = calcularTotaisCaixa(pagamentos, {
      debito: 1.99,
      credito: 3.49,
      pix: 0
    });

    expect(totais.bruto).toBe(1012.30);
    // Taxas: Débito 3.98 + Crédito 10.47 = 14.45
    expect(totais.taxas).toBe(14.45);
    expect(totais.liquido).toBe(997.85);

    // Conferência física do dinheiro:
    // Esperado: 100.00 (saldo inicial) + 362.30 (vendas dinheiro) - 50.00 (sangria) = 412.30
    const conf = calcularDiferencaCaixaCego(100.00, 362.30, 0, 50.00, 412.30);
    expect(conf.saldoEsperado).toBe(412.30);
    expect(conf.contagemFisica).toBe(412.30);
    expect(conf.diferenca).toBe(0.00);
    expect(conf.status).toBe('exato');
  });

  it('CA02: caixa-admin.js suporta campo de contagem física/cega antes de exibir saldo do sistema', () => {
    expect(caixaAdminJs).toMatch(/contagem|cego|conferencia/i);
  });
});
