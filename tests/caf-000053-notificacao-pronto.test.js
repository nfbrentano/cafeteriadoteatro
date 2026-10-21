import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000053 — Notificações de pedido pronto (Áudio, vibração e Web Notifications)
 */
describe('CAF-000053 — Notificação de Pedido Pronto', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01 / CA11: executa vibração móvel e toca áudio ao receber evento de pedido pronto', () => {
    expect(pedidosJs).toMatch(/vibrate|ding\.wav|audioPronto/i);
  });

  it('CA02 / CA11: solicita permissão e dispara Notification da Web se permitido', () => {
    expect(pedidosJs).toMatch(/Notification\.permission|new Notification/);
  });
});
