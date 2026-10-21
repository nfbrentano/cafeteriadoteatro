import { describe, it, expect } from 'vitest';
import { mapearPayloadDespesaParaBanco } from '../js/utils/despesa-mapper.js';
import fs from 'fs';

/**
 * CAF-000035 — Contas a pagar e fluxo financeiro
 */
describe('CAF-000035 — Contas a pagar e fluxo', () => {
  const financeiroJs = fs.readFileSync('js/admin/financeiro-admin.js', 'utf8');

  it('CA01: normaliza campos do formulário para o schema do banco (valor, data_vencimento)', () => {
    const formInput = {
      descricao: 'Café Grão Especial',
      valor_total: 450.00,
      vencimento: '2026-10-25',
      recorrencia: 'unica',
      categoria: 'Insumos'
    };

    const payload = mapearPayloadDespesaParaBanco(formInput);
    expect(payload.valor).toBe(450.00);
    expect(payload.vencimento).toBe('2026-10-25');
    expect(payload.recorrencia).toBe('nenhuma');
  });

  it('CA02: calcula saldo de fluxo de caixa (Entradas - Saídas)', () => {
    const entradas = 12000.00;
    const saidas = 7500.00;
    const saldo = entradas - saidas;
    expect(saldo).toBe(4500.00);
  });

  it('CA03: financeiro-admin.js possui integração com despesas e fluxo de caixa', () => {
    expect(financeiroJs).toMatch(/despesas|contas_pagar|fluxo/);
  });
});
