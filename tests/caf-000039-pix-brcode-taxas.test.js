import { describe, it, expect } from 'vitest';
import '../js/pix-brcode.js';
import { calcularTotaisCaixa } from '../js/utils/caixa-calculos.js';

const cafeteriaPix = globalThis.cafeteriaPix || window.cafeteriaPix;

/**
 * CAF-000039 — Pix QR Code estático (BR Code) e gestão de taxas
 */
describe('CAF-000039 — Pix QR Code e taxas', () => {
  it('CA01: CRC16-CCITT-FALSE com vetor oficial BACEN "123456789" retorna "29B1"', () => {
    expect(cafeteriaPix.crc16CCITT('123456789')).toBe('29B1');
  });

  it('CA02: sanitização EMV remove acentos e caracteres especiais', () => {
    const nome = 'Cafeteria do Teatro Ltda';
    const normalizado = cafeteriaPix.normalizarTextoEmv(nome, 25);
    expect(normalizado).toBe('CAFETERIA DO TEATRO LTDA');
    expect(normalizado.length).toBeLessThanOrEqual(25);
    expect(normalizado).not.toMatch(/[áàãâéêíóôõúç&!]/i);
  });

  it('CA03: gera payload completo com tags obrigatórias do padrão BR Code', () => {
    const payloadInfo = cafeteriaPix.gerarPayloadPix({
      chave: 'financeiro@cafeteriadoteatro.com.br',
      recebedor: 'Cafeteria do Teatro',
      cidade: 'Porto Alegre',
      valor: 12.50,
      txid: 'CAF001'
    });

    const str = payloadInfo.payload;
    expect(str).toContain('000201'); // Tag 00 Format Indicator
    expect(str).toContain('br.gov.bcb.pix'); // Tag 26 GUI
    expect(str).toContain('52040000'); // Tag 52 Merchant Category Code
    expect(str).toContain('5303986'); // Tag 53 Moeda BRL (986)
    expect(str).toContain('540512.50'); // Tag 54 Valor formatado com 2 casas
    expect(str).toContain('5802BR'); // Tag 58 País
    expect(str).toContain('6012PORTO ALEGRE'); // Tag 60 Cidade normalizada
    expect(str).toContain('62100506CAF001'); // Tag 62 / Subtag 05 TxID
    expect(str).toMatch(/6304[0-9A-F]{4}$/); // Tag 63 CRC16 no final
  });

  it('CA04: calcula deduções de taxas por forma de pagamento mantendo Pix sem taxa', () => {
    const pagamentos = [
      { forma_pagamento: 'pix', valor: 100.00 },
      { forma_pagamento: 'debito', valor: 100.00 },
      { forma_pagamento: 'credito', valor: 100.00 }
    ];

    const totais = calcularTotaisCaixa(pagamentos, {
      debito: 1.99,
      credito: 3.49,
      pix: 0
    });

    expect(totais.bruto).toBe(300.00);
    // Débito 1.99 + Crédito 3.49 + Pix 0 = 5.48
    expect(totais.taxas).toBe(5.48);
    expect(totais.liquido).toBe(294.52);
    expect(totais.porForma.pix.taxa).toBe(0);
    expect(totais.porForma.pix.liquido).toBe(100.00);
  });
});
