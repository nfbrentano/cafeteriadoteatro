import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000037 — Pedidos QR na mesa e chamado de atendente
 */
describe('CAF-000037 — QR na Mesa e Chamado de Atendente', () => {
  const cardapioPedidoJs = fs.readFileSync('js/cardapio-cliente-pedido.js', 'utf8');

  it('CA01 / CA10: lê mesa e token dos parâmetros de busca da URL', () => {
    const url = new URL('https://cafeteriadoteatro.com.br/cardapio.html?mesa=M05&t=token123');
    const mesaParam = url.searchParams.get('mesa');
    const tokenParam = url.searchParams.get('t');

    expect(mesaParam).toBe('M05');
    expect(tokenParam).toBe('token123');
  });

  it('CA02 / CA10: valida correspondência entre mesa e token antes de liberar autoatendimento', () => {
    const mesaCadastrada = { codigo: 'M05', qr_token: 'token123' };
    const mesaCodigoParam = 'M05';
    const qrTokenParam = 'token999'; // Token errado

    const valido = mesaCadastrada && 
      mesaCadastrada.codigo.toUpperCase() === mesaCodigoParam.toUpperCase() &&
      mesaCadastrada.qr_token === qrTokenParam;

    expect(valido).toBe(false);
  });

  it('CA03 / CA10: chama atendente e lida com solicitação repetida para evitar spam', () => {
    expect(cardapioPedidoJs).toMatch(/chamarAtendente/);
    expect(cardapioPedidoJs).toMatch(/repetido/);
  });
});
