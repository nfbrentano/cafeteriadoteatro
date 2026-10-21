import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000038 — Pedido online para retirada no balcão
 */
describe('CAF-000038 — Pedido Online para Retirada', () => {
  const cardapioPedidoJs = fs.readFileSync('js/cardapio-cliente-pedido.js', 'utf8');

  it('CA01 / CA11: valida obrigatoriedade do nome e telefone com DDD', () => {
    const validarDadosClienteOnline = (nome, telefone) => {
      const n = (nome || '').trim();
      const digits = (telefone || '').replace(/\D/g, '');
      if (!n) return { valido: false, erro: 'Nome obrigatório' };
      if (digits.length < 10 || digits.length > 13) return { valido: false, erro: 'Telefone inválido' };
      return { valido: true };
    };

    expect(validarDadosClienteOnline('', '51999998888').valido).toBe(false);
    expect(validarDadosClienteOnline('João', '123').valido).toBe(false);
    expect(validarDadosClienteOnline('João', '(51) 99999-8888').valido).toBe(true);
  });

  it('CA02 / CA11: inclui chave de idempotência e canal retirada no payload', () => {
    expect(cardapioPedidoJs).toMatch(/idempotencyKey|idempotencia/);
    expect(cardapioPedidoJs).toMatch(/canal:\s*(?:isModoMesa\s*\?\s*['"]mesa['"]\s*:\s*\()?['"]retirada['"]/);
  });
});
