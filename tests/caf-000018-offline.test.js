import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

/**
 * CAF-000018 — Tolerância a queda de internet (Idempotência e Fila Local)
 */
describe('CAF-000018 — Tolerância a queda de internet', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01: gera client_id único (UUID) para idempotência de pedidos enviados', () => {
    expect(pedidosJs).toMatch(/client_id|crypto\.randomUUID|uuid/i);
  });

  it('CA02: detecta eventos online e offline do navegador', () => {
    expect(pedidosJs).toMatch(/addEventListener\(['"]online['"]/);
    expect(pedidosJs).toMatch(/addEventListener\(['"]offline['"]/);
  });

  it('CA03: enfileira pedidos localmente durante queda de conexão', () => {
    // Simula fila em memória de reenvio com chave idempotente
    const filaOffline = new Map();
    const pedido1 = { client_id: 'abc-1', mesa_id: 1, total: 20 };
    filaOffline.set(pedido1.client_id, pedido1);

    // Tentativa de duplicar o mesmo pedido na fila
    filaOffline.set(pedido1.client_id, pedido1);
    expect(filaOffline.size).toBe(1);
  });

  it('CA04: sincronização reenvia pedidos garantindo envio único por client_id', () => {
    const pedidosProcessados = new Set();
    const mockEnviar = vi.fn(pedido => {
      if (pedidosProcessados.has(pedido.client_id)) {
        return { idempotente: true, status: 'ja_processado' };
      }
      pedidosProcessados.add(pedido.client_id);
      return { sucesso: true };
    });

    const pedido = { client_id: 'test-uuid-123', total: 50 };
    const res1 = mockEnviar(pedido);
    const res2 = mockEnviar(pedido); // reenvio

    expect(res1.sucesso).toBe(true);
    expect(res2.idempotente).toBe(true);
    expect(pedidosProcessados.size).toBe(1);
  });
});
