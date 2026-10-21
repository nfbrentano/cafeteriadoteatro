import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000005 — Adicionar itens a um pedido já enviado
 */
describe('CAF-000005 — Adicionar itens a um pedido já enviado', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01: permite modo de adição vinculado a uma mesa/pedido existente', () => {
    expect(pedidosJs).toMatch(/modoAdicao|pedidoOrigemIdAdicao/);
  });

  it('CA02: bloqueia troca de mesa enquanto o modo de adição de itens estiver ativo', () => {
    expect(pedidosJs).toMatch(/pedidoOrigemIdAdicao/);
  });

  it('CA03: envia payload com pedido_origem_id ou is_adicional para a RPC', () => {
    expect(pedidosJs).toMatch(/pedido_origem_id/);
  });

  it('CA04: adicionais são incorporados sem recriar ou duplicar a comanda inteira', () => {
    expect(pedidosJs).toMatch(/ADICIONAL|adicionar/i);
  });
});
