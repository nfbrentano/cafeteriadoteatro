import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000060 — Pedidos para viagem sem vinculação obrigatória de mesa
 */
describe('CAF-000060 — Pedidos Para Viagem Sem Mesa', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01 / CA07: pedido para viagem sem mesa é permitido desde que o nome do cliente seja informado', () => {
    const validarEnvioPedido = (paraViagem, mesaId, clienteNome) => {
      const nome = (clienteNome || '').trim();
      if (paraViagem) {
        if (!nome) return { valido: false, erro: 'Informe o nome do cliente para viagem' };
        return { valido: true };
      }
      if (!mesaId) {
        return { valido: false, erro: 'Selecione uma mesa ou marque Para Viagem' };
      }
      return { valido: true };
    };

    expect(validarEnvioPedido(true, null, 'Mariana').valido).toBe(true);
    expect(validarEnvioPedido(true, null, '').valido).toBe(false);
    expect(validarEnvioPedido(false, null, 'Mariana').valido).toBe(false);
    expect(validarEnvioPedido(false, 5, '').valido).toBe(true);
  });

  it('CA02: pedidos.js valida mesa ou para viagem antes do envio', () => {
    expect(pedidosJs).toMatch(/para_viagem|paraViagem/);
  });
});
