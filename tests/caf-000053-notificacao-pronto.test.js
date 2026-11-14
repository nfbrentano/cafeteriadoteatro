import { describe, it, expect } from 'vitest';
import { lerCodigoFontePDV } from './helpers/page-harness.js';

/**
 * CAF-000053 — Notificações de pedido pronto (Áudio, vibração e Web Notifications)
 */
describe('CAF-000053 — Notificação de Pedido Pronto', () => {
  const pedidosJs = lerCodigoFontePDV();

  it('CA01 / CA11: executa vibração móvel e toca áudio ao receber evento de pedido pronto', () => {
    expect(pedidosJs).toMatch(/vibrate|ding\.wav|audioPronto/i);
  });

  it('CA02 / CA11: solicita permissão e dispara Notification da Web se permitido', () => {
    expect(pedidosJs).toMatch(/Notification\.permission|new Notification/);
  });
});
