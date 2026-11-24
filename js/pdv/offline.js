/* =========================================================
   PDV — FILA OFFLINE (INDEXEDDB) & SINCRONIZAÇÃO
   ========================================================= */

import { estadoPDV, definirGlobalPDV } from './estado.js';

const IDB_NAME = 'CafeteriaPDV_DB';
const IDB_VERSION = 1;
const IDB_STORE = 'pedidos_offline';

export function registrarOfflinePDV() {
  const showToast = (...args) => (window.showToast || estadoPDV.fn.showToast)?.(...args);
  const confirmAction = (...args) => (window.showConfirm || estadoPDV.fn.showConfirm)?.(...args);

  let cachedDb = null;

  function openOfflineDB() {
    if (cachedDb) return Promise.resolve(cachedDb);
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('[OfflineDB] IndexedDB não suportado.');
        return resolve(null);
      }
      try {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            const store = db.createObjectStore(IDB_STORE, { keyPath: 'client_id' });
            store.createIndex('created_at', 'created_at', { unique: false });
          }
        };
        request.onsuccess = () => {
          cachedDb = request.result;
          cachedDb.onclose = () => { cachedDb = null; };
          resolve(cachedDb);
        };
        request.onerror = (e) => {
          console.error('[OfflineDB] Erro ao abrir IndexedDB:', e);
          resolve(null);
        };
      } catch (err) {
        console.error('[OfflineDB] Falha crítica no IndexedDB:', err);
        resolve(null);
      }
    });
  }

  function getBackoffMs(tentativas) {
    if (tentativas === 1) return 30 * 1000;
    if (tentativas === 2) return 60 * 1000;
    if (tentativas === 3) return 120 * 1000;
    return 300 * 1000;
  }

  async function dbSalvarPedidoOffline(pedidoData) {
    const db = await openOfflineDB();
    if (!db) {
      try {
        const list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
        const idx = list.findIndex(p => p.client_id === pedidoData.client_id);
        if (idx >= 0) list[idx] = pedidoData;
        else list.push(pedidoData);
        localStorage.setItem('cafeteria_pedidos_offline_fallback', JSON.stringify(list));
        return true;
      } catch (e) {
        console.error('Fallback localStorage falhou:', e);
        return false;
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(pedidoData);
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => {
          console.error('[OfflineDB] Erro ao gravar pedido:', e);
          resolve(false);
        };
      } catch (err) {
        console.error('[OfflineDB] Exceção ao gravar pedido:', err);
        resolve(false);
      }
    });
  }

  async function dbObterFilaOffline() {
    const db = await openOfflineDB();
    if (!db) {
      try {
        const list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return list;
      } catch {
        return [];
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = req.result || [];
          items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          resolve(items);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async function dbRemoverPedidoOffline(clientId) {
    try {
      let list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
      const filtered = list.filter(item => item.client_id !== clientId);
      if (filtered.length !== list.length) {
        localStorage.setItem('cafeteria_pedidos_offline_fallback', JSON.stringify(filtered));
      }
    } catch {}

    const db = await openOfflineDB();
    if (!db) return true;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.delete(clientId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function dbAtualizarStatusPedidoOffline(clientId, status, ultimoErro = null) {
    // Atualiza fallback localStorage
    try {
      const list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
      const itemFb = list.find(p => p.client_id === clientId);
      if (itemFb) {
        itemFb.status = status;
        if (ultimoErro !== null) itemFb.ultimo_erro = ultimoErro;
        if (status === 'falha') {
          itemFb.tentativas = (itemFb.tentativas || 0) + 1;
          if (itemFb.tentativas >= 5) {
            itemFb.status = 'falha_manual';
            itemFb.proxima_tentativa_em = null;
          } else {
            itemFb.proxima_tentativa_em = Date.now() + getBackoffMs(itemFb.tentativas);
          }
        }
        localStorage.setItem('cafeteria_pedidos_offline_fallback', JSON.stringify(list));
      }
    } catch {}

    const db = await openOfflineDB();
    if (!db) return true;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(clientId);
        req.onsuccess = () => {
          if (req.result) {
            const item = req.result;
            item.status = status;
            if (ultimoErro !== null) item.ultimo_erro = ultimoErro;
            if (status === 'falha') {
              item.tentativas = (item.tentativas || 0) + 1;
              if (item.tentativas >= 5) {
                item.status = 'falha_manual';
                item.proxima_tentativa_em = null;
              } else {
                item.proxima_tentativa_em = Date.now() + getBackoffMs(item.tentativas);
              }
            } else if (status === 'aguardando_envio') {
              item.proxima_tentativa_em = null;
            }
            store.put(item);
          }
        };
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  function atualizarModoConexaoCarrinho() {
    const { cartTotalLabel, cartOfflineNote, btnEnviarPedido } = estadoPDV.refs;
    if (cartTotalLabel) {
      cartTotalLabel.textContent = estadoPDV.isPdvOnline ? 'Total:' : 'Total estimado:';
    }
    if (cartOfflineNote) {
      if (!estadoPDV.isPdvOnline) {
        cartOfflineNote.classList.remove('hidden');
      } else {
        cartOfflineNote.classList.add('hidden');
      }
    }
    if (btnEnviarPedido && !btnEnviarPedido.disabled) {
      btnEnviarPedido.textContent = estadoPDV.isPdvOnline ? 'Enviar para Cozinha' : 'Salvar na Fila (Offline)';
    }
  }

  async function atualizarContadorFilaOffline() {
    const offlineQueueCount = estadoPDV.refs.offlineQueueCount || document.getElementById('offline-queue-count');
    const btnOfflineQueue = estadoPDV.refs.btnOfflineQueue || document.getElementById('btn-offline-queue');
    const getFila = estadoPDV.fn.dbObterFilaOffline || dbObterFilaOffline;
    const fila = await getFila();
    const count = fila.length;
    const countFalhas = fila.filter(p => p.status === 'falha' || p.status === 'falha_manual').length;
    if (offlineQueueCount) offlineQueueCount.textContent = count;

    if (btnOfflineQueue) {
      if (count > 0) {
        if (countFalhas > 0) {
          const textoFalha = countFalhas === 1 ? '1 pedido com falha' : `${countFalhas} pedidos com falha`;
          btnOfflineQueue.textContent = `⚠️ ${textoFalha}`;
          btnOfflineQueue.title = `${textoFalha} na fila offline`;
        } else {
          btnOfflineQueue.textContent = `⏳ ${count} Pendente${count > 1 ? 's' : ''}`;
          btnOfflineQueue.title = `${count} pedido(s) pendentes na fila offline`;
        }
        btnOfflineQueue.classList.remove('hidden');
        btnOfflineQueue.classList.add('pulse-queue');
      } else {
        btnOfflineQueue.classList.add('hidden');
        btnOfflineQueue.classList.remove('pulse-queue');
      }
    }
    return fila;
  }

  async function processarFilaOffline() {
    const btnSyncOfflineNow = estadoPDV.refs.btnSyncOfflineNow || document.getElementById('btn-sync-offline-now');
    const btnOfflineQueue = estadoPDV.refs.btnOfflineQueue || document.getElementById('btn-offline-queue');
    const modalOfflineQueue = estadoPDV.refs.modalOfflineQueue || document.getElementById('modal-offline-queue');
    if (estadoPDV.isSyncingQueue) return;
    if (!navigator.onLine) {
      await atualizarContadorFilaOffline();
      return;
    }

    const getFila = estadoPDV.fn.dbObterFilaOffline || dbObterFilaOffline;
    const fila = await getFila();
    if (fila.length === 0) {
      await atualizarContadorFilaOffline();
      return;
    }

    estadoPDV.isSyncingQueue = true;
    if (btnSyncOfflineNow) {
      btnSyncOfflineNow.disabled = true;
      btnSyncOfflineNow.textContent = '🔄 Enviando...';
    }
    if (btnOfflineQueue) {
      btnOfflineQueue.textContent = `🔄 Enviando (${fila.length})...`;
    }

    let enviadosComSucesso = 0;

    for (const pedido of fila) {
      if (!navigator.onLine) break;

      // Se atingiu falha_manual (máx 5 tentativas) ou ainda está no intervalo de backoff, pula no loop automático (CA14)
      if (pedido.status === 'falha_manual') continue;
      if (pedido.proxima_tentativa_em && Date.now() < pedido.proxima_tentativa_em) continue;

      try {
        await dbAtualizarStatusPedidoOffline(pedido.client_id, 'enviando');

        const { error: pedidoError } = await window.cafeteriaSupabase.rpc('criar_pedido', {
          p_payload: pedido.payload
        });

        if (pedidoError) {
          console.error('[OfflineQueue] Erro ao sincronizar pedido:', pedido.client_id, pedidoError);
          const isNetError = !navigator.onLine || (pedidoError.message && (
            pedidoError.message.includes('fetch') ||
            pedidoError.message.includes('network') ||
            pedidoError.message.includes('Failed')
          ));
          if (isNetError) {
            await dbAtualizarStatusPedidoOffline(pedido.client_id, 'aguardando_envio', 'Erro de conexão');
            break;
          } else {
            await dbAtualizarStatusPedidoOffline(pedido.client_id, 'falha', pedidoError.message);
          }
        } else {
          await dbRemoverPedidoOffline(pedido.client_id);
          enviadosComSucesso++;
          const mesaStr = pedido.mesa_codigo ? (pedido.mesa_codigo === 'BALCAO' ? 'Balcão' : `Mesa ${pedido.mesa_codigo}`) : 'Balcão';
          showToast(`✅ Pedido (${mesaStr}) sincronizado com a cozinha!`, 'success');
        }
      } catch (err) {
        console.error('[OfflineQueue] Exceção durante envio:', err);
        await dbAtualizarStatusPedidoOffline(pedido.client_id, 'aguardando_envio', err.message);
        break;
      }
    }

    estadoPDV.isSyncingQueue = false;
    if (btnSyncOfflineNow) {
      btnSyncOfflineNow.disabled = false;
      btnSyncOfflineNow.textContent = '🔄 Sincronizar Fila Agora';
    }

    await atualizarContadorFilaOffline();

    if (enviadosComSucesso > 0) {
      await estadoPDV.fn.loadActivePedidos?.();
    }

    if (modalOfflineQueue && !modalOfflineQueue.classList.contains('hidden')) {
      renderOfflineQueueModal();
    }
  }

  async function renderOfflineQueueModal() {
    const offlineQueueCount = estadoPDV.refs.offlineQueueCount || document.getElementById('offline-queue-count');
    const offlineQueueList = estadoPDV.refs.offlineQueueList || document.getElementById('offline-queue-list');
    const getFila = estadoPDV.fn.dbObterFilaOffline || dbObterFilaOffline;
    const fila = await getFila();
    if (offlineQueueCount) offlineQueueCount.textContent = fila.length;
    if (!offlineQueueList) return;

    if (fila.length === 0) {
      offlineQueueList.innerHTML = '<div style="text-align:center; padding: 30px; color: #888;">Nenhum pedido pendente na fila. Tudo sincronizado! 🎉</div>';
      return;
    }

    offlineQueueList.innerHTML = '';
    fila.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'offline-card';

      const horaStr = p.created_at ? new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const mesaNome = p.mesa_codigo ? (p.mesa_codigo === 'BALCAO' ? '🥡 Balcão / Viagem' : `Mesa ${p.mesa_codigo}`) : 'Balcão';
      const safeClienteNome = p.cliente_nome ? window.escapeHtml(p.cliente_nome) : '';
      const safeClienteStr = safeClienteNome ? ` · Cliente: ${safeClienteNome}` : '';
      const totalStr = (p.total_estimado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      let statusHtml = '';
      if (p.status === 'enviando') {
        statusHtml = '<span style="color: #1976d2; font-size: 11px; font-weight: bold;">🔄 Enviando...</span>';
      } else if (p.status === 'falha_manual' || p.status === 'falha') {
        const prefixo = p.status === 'falha_manual' ? '❌ Falha permanente' : '⚠️ Falha';
        statusHtml = `<span style="color: #d32f2f; font-size: 11px; font-weight: bold;" title="${window.escapeHtml(p.ultimo_erro || '')}">${prefixo}: ${window.escapeHtml(p.ultimo_erro || '')}</span>`;
      } else {
        statusHtml = '<span style="color: #f57c00; font-size: 11px; font-weight: bold;">⏳ Aguardando conexão</span>';
      }

      const safeMesaNome = window.escapeHtml(mesaNome || '');
      const safeHoraStr = window.escapeHtml(horaStr || '--:--');
      const safeItensResumo = window.escapeHtml(p.itens_resumo || 'Itens do pedido');
      const safeTotalStr = window.escapeHtml(totalStr || '');
      const safeClientId = window.escapeHtml((p.client_id || '').toString());

      card.innerHTML = `
        <div class="offline-card__header">
          <div class="offline-card__title">${safeMesaNome}${safeClienteStr}</div>
          <div class="offline-card__time">${safeHoraStr}</div>
        </div>
        <div class="offline-card__items">
          ${safeItensResumo}
        </div>
        <div class="offline-card__footer">
          <div>
            <span class="offline-card__total">Estimado: ${safeTotalStr}</span>
            <div style="margin-top: 2px;">${statusHtml}</div>
          </div>
          <div class="offline-card__actions">
            <button class="btn-queue-action btn-queue-action--retry" data-action="barista-retry-offline" data-client-id="${safeClientId}">Reenviar</button>
            <button class="btn-queue-action btn-queue-action--discard" data-action="barista-discard-offline" data-client-id="${safeClientId}">Descartar</button>
          </div>
        </div>
      `;
      offlineQueueList.appendChild(card);
    });
  }

  async function baristaReenviarPedidoOffline(clientId) {
    if (!navigator.onLine) {
      showToast('Aparelho ainda sem internet. O envio ocorrerá automaticamente na reconexão.', 'warning');
      return;
    }
    if (clientId) {
      const db = await openOfflineDB();
      if (db) {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          const req = store.get(clientId);
          req.onsuccess = () => {
            if (req.result) {
              const item = req.result;
              item.status = 'aguardando_envio';
              item.tentativas = 0;
              item.proxima_tentativa_em = null;
              store.put(item);
            }
          };
        } catch (_) {}
      }
      try {
        const list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
        const itemFb = list.find(p => p.client_id === clientId);
        if (itemFb) {
          itemFb.status = 'aguardando_envio';
          itemFb.tentativas = 0;
          itemFb.proxima_tentativa_em = null;
          localStorage.setItem('cafeteria_pedidos_offline_fallback', JSON.stringify(list));
        }
      } catch (_) {}
    }
    await processarFilaOffline();
  }

  async function baristaDescartarPedidoOffline(clientId) {
    const confirmed = await confirmAction('Descartar Pedido?', 'Deseja realmente descartar este pedido da fila offline? Ele NÃO será enviado à cozinha.');
    if (!confirmed) return;
    await dbRemoverPedidoOffline(clientId);
    showToast('Pedido descartado da fila.', 'info');
    await atualizarContadorFilaOffline();
    renderOfflineQueueModal();
  }

  const { btnOfflineQueue, modalOfflineQueue, modalOfflineClose, modalOfflineCloseBtn, btnSyncOfflineNow } = estadoPDV.refs;

  if (btnOfflineQueue) {
    btnOfflineQueue.addEventListener('click', () => {
      renderOfflineQueueModal();
      if (modalOfflineQueue) modalOfflineQueue.classList.remove('hidden');
    });
  }
  if (modalOfflineClose) {
    modalOfflineClose.addEventListener('click', () => {
      if (modalOfflineQueue) modalOfflineQueue.classList.add('hidden');
    });
  }
  if (modalOfflineCloseBtn) {
    modalOfflineCloseBtn.addEventListener('click', () => {
      if (modalOfflineQueue) modalOfflineQueue.classList.add('hidden');
    });
  }
  if (btnSyncOfflineNow) {
    btnSyncOfflineNow.addEventListener('click', () => {
      processarFilaOffline();
    });
  }

  // Monitor de verificação da fila periódica (a cada 15s)
  estadoPDV.timers.offlineSyncInterval = setInterval(() => {
    if (navigator.onLine && !estadoPDV.isSyncingQueue) {
      processarFilaOffline();
    }
  }, 15000);

  definirGlobalPDV('baristaSalvarPedidoOffline', dbSalvarPedidoOffline);
  definirGlobalPDV('baristaObterFilaOffline', dbObterFilaOffline);
  definirGlobalPDV('baristaRemoverPedidoOffline', dbRemoverPedidoOffline);
  definirGlobalPDV('baristaReenviarPedidoOffline', baristaReenviarPedidoOffline);
  definirGlobalPDV('baristaDescartarPedidoOffline', baristaDescartarPedidoOffline);

  estadoPDV.fn.dbSalvarPedidoOffline = dbSalvarPedidoOffline;
  estadoPDV.fn.dbObterFilaOffline = dbObterFilaOffline;
  estadoPDV.fn.dbRemoverPedidoOffline = dbRemoverPedidoOffline;
  estadoPDV.fn.atualizarStatusPedidoOffline = dbAtualizarStatusPedidoOffline;
  estadoPDV.fn.atualizarModoConexaoCarrinho = atualizarModoConexaoCarrinho;
  estadoPDV.fn.atualizarContadorFilaOffline = atualizarContadorFilaOffline;
  estadoPDV.fn.processarFilaOffline = processarFilaOffline;
  estadoPDV.fn.renderOfflineQueueModal = renderOfflineQueueModal;
}
