import { describe, it, expect, vi } from 'vitest';
import { trackMenuEvent, calculateConversionRate, FUNNEL_STAGES } from '../js/utils/menu-analytics.js';

/**
 * CAF-000069 — Menu Analytics: Funil do cardápio e telemetria não-bloqueante
 */
describe('CAF-000069 — Menu Analytics e Telemetria', () => {
  it('CA01 / CA14: dispara evento via RPC registrar_evento_cardapio com parâmetros corretos', async () => {
    let rpcCalled = false;
    let rpcArgs = null;

    const mockSb = {
      rpc: vi.fn((name, params) => {
        rpcCalled = true;
        rpcArgs = { name, params };
        return Promise.resolve({ data: true, error: null });
      })
    };

    await trackMenuEvent(mockSb, {
      canal: 'mesa',
      tipoEvento: 'add_to_cart',
      produtoId: 42,
      produtoNome: 'Café Espresso',
      valor: 8.50
    });

    expect(rpcCalled).toBe(true);
    expect(rpcArgs.name).toBe('registrar_evento_cardapio');
    expect(rpcArgs.params.p_tipo_evento).toBe('add_to_cart');
    expect(rpcArgs.params.p_produto_id).toBe(42);
  });

  it('CA02 / CA14: não quebra e não bloqueia a execução se a chamada da RPC falhar', async () => {
    const brokenSb = {
      rpc: vi.fn(() => Promise.reject(new Error('Network error 503')))
    };

    // Não deve lançar erro
    await expect(trackMenuEvent(brokenSb, {
      canal: 'retirada',
      tipoEvento: 'begin_checkout'
    })).resolves.not.toThrow();
  });

  it('CA03: calcula taxas de conversão de funil', () => {
    expect(calculateConversionRate(50, 100)).toBe(50.0);
    expect(calculateConversionRate(0, 100)).toBe(0);
    expect(calculateConversionRate(10, 0)).toBe(0);
  });
});
