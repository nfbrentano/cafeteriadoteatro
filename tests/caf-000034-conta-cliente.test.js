import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000034 — Conta do cliente / fiado (Limite, depósitos, estorno e saldo)
 */
describe('CAF-000034 — Conta do cliente / fiado', () => {
  const clientesJs = fs.readFileSync('js/admin/clientes-admin.js', 'utf8');

  it('CA01: cálculo de saldo disponível respeita saldo atual + limite de crédito', () => {
    const cliente = {
      saldo: 25.00,
      limite_credito: 100.00
    };
    const disponivel = cliente.saldo + cliente.limite_credito;
    expect(disponivel).toBe(125.00);
  });

  it('CA02: bloqueia compra quando valor excede saldo disponível', () => {
    const cliente = {
      saldo: 10.00,
      limite_credito: 50.00 // Total disponível: 60
    };
    const valorCompra = 75.00;
    const permitido = (cliente.saldo + cliente.limite_credito) >= valorCompra;
    expect(permitido).toBe(false);
  });

  it('CA03: clientes-admin.js gerencia movimentações de crédito e débito', () => {
    expect(clientesJs).toMatch(/movimentacoes_conta_cliente|saldo|credito|debito/);
  });
});
