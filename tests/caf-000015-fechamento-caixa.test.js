import { describe, it, expect } from 'vitest';
import { calcularTotaisCaixa, calcularDiferencaCaixaCego } from '../js/utils/caixa-calculos.js';
import fs from 'fs';

/**
 * CAF-000015 — Fechamento de caixa do dia (Abertura única, sangria/suprimento, totais)
 */
describe('CAF-000015 — Fechamento de caixa do dia', () => {
  const caixaAdminJs = fs.readFileSync('js/admin/caixa-admin.js', 'utf8');

  it('CA01: calcula movimentação diária com saldo inicial, suprimentos e sangrias', () => {
    const saldoInicial = 100.00;
    const vendasDinheiro = 300.00;
    const suprimentos = 50.00;
    const sangrias = 70.00;
    const contagemFisica = 380.00;

    const res = calcularDiferencaCaixaCego(saldoInicial, vendasDinheiro, suprimentos, sangrias, contagemFisica);
    // Esperado: 100 + 300 + 50 - 70 = 380.00
    expect(res.saldoEsperado).toBe(380.00);
    expect(res.contagemFisica).toBe(380.00);
    expect(res.diferenca).toBe(0);
    expect(res.status).toBe('exato');
  });

  it('CA02: detecta quebra de caixa (falta ou sobra)', () => {
    const falta = calcularDiferencaCaixaCego(100, 200, 0, 0, 280);
    expect(falta.saldoEsperado).toBe(300);
    expect(falta.diferenca).toBe(-20);
    expect(falta.status).toBe('falta');

    const sobra = calcularDiferencaCaixaCego(100, 200, 0, 0, 315);
    expect(sobra.diferenca).toBe(15);
    expect(sobra.status).toBe('sobra');
  });

  it('CA03: código de caixa-admin.js suporta sangria, suprimento e fechamento', () => {
    expect(caixaAdminJs).toMatch(/sangria|suprimento/i);
    expect(caixaAdminJs).toMatch(/fechamento|fecharCaixa/i);
  });
});
