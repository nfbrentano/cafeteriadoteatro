/* =========================================================
   PEDIDOS.JS — Ponto de entrada modular do PDV do Barista
   ========================================================= */

import { estadoPDV, resetarEstadoPDV } from './pdv/estado.js';
import { registrarSessaoPDV } from './pdv/sessao.js';
import { registrarOfflinePDV } from './pdv/offline.js';
import { registrarImpressaoPDV } from './pdv/impressao.js';
import { registrarCatalogoPDV } from './pdv/catalogo.js';
import { registrarCarrinhoPDV } from './pdv/carrinho.js';
import { registrarClientesPDV } from './pdv/clientes.js';
import { registrarMesasPDV } from './pdv/mesas.js';
import { registrarFechamentoPDV } from './pdv/fechamento.js';
import { registrarRealtimePDV } from './pdv/realtime.js';

export function inicializarPDV() {
  resetarEstadoPDV();

  registrarSessaoPDV();
  registrarOfflinePDV();
  registrarImpressaoPDV();
  registrarCatalogoPDV();
  registrarCarrinhoPDV();
  registrarClientesPDV();
  registrarMesasPDV();
  registrarFechamentoPDV();
  registrarRealtimePDV();

  estadoPDV.fn.updateConnectionStatus?.(navigator.onLine);
  estadoPDV.fn.atualizarContadorFilaOffline?.();
  estadoPDV.fn.initSoundAndNotificationSystem?.();
  estadoPDV.fn.checkSession?.();
  estadoPDV.fn.loadConfiguracoes?.();
}

inicializarPDV();
