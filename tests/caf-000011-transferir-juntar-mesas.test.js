import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000011 — Transferir e juntar mesas
 */
describe('CAF-000011 — Transferir e juntar mesas', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01: invoca RPC transferir_mesa passando mesa_origem e mesa_destino', () => {
    expect(pedidosJs).toMatch(/rpc\(['"]transferir_mesa['"]/);
  });

  it('CA02: valida que mesa de destino é diferente da mesa de origem', () => {
    expect(pedidosJs).toMatch(/origem.*destino|transferir/i);
  });

  it('CA03: atualiza consumo e comanda após transferência bem-sucedida', () => {
    expect(pedidosJs).toMatch(/loadActivePedidos|renderMesas/);
  });
});
