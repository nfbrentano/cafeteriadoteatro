/**
 * js/utils/offline-queue.js
 * Gerenciador de persistência local da fila offline de pedidos do PDV.
 * Suporta IndexedDB com fallback transparente em localStorage (CAF-000018 / CAF-000093).
 */

export const IDB_NAME = 'CafeteriaPDV_DB';
export const IDB_VERSION = 1;
export const IDB_STORE = 'pedidos_offline';
export const FALLBACK_KEY = 'cafeteria_pedidos_offline_fallback';

/**
 * Abre conexão com o banco IndexedDB local
 * @param {IDBFactory} [customIndexedDB]
 * @returns {Promise<IDBDatabase|null>}
 */
export function openOfflineDB(customIndexedDB) {
  const idb = customIndexedDB || (typeof window !== 'undefined' ? window.indexedDB : null);
  return new Promise((resolve) => {
    if (!idb) {
      return resolve(null);
    }
    try {
      const request = idb.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'client_id' });
          store.createIndex('created_at', 'created_at', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
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

/**
 * Salva ou atualiza um pedido na fila offline (IndexedDB com fallback para localStorage)
 * @param {Object} pedidoData
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
export async function dbSalvarPedidoOffline(pedidoData, options = {}) {
  if (!pedidoData || !pedidoData.client_id) {
    return false;
  }
  const storage = options.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);
  const db = options.db !== undefined ? options.db : await openOfflineDB(options.indexedDB);

  if (!db) {
    if (!storage) return false;
    try {
      const list = JSON.parse(storage.getItem(FALLBACK_KEY) || '[]');
      const idx = list.findIndex(p => p.client_id === pedidoData.client_id);
      if (idx >= 0) {
        list[idx] = pedidoData;
      } else {
        list.push(pedidoData);
      }
      storage.setItem(FALLBACK_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('[OfflineDB] Fallback localStorage falhou ao gravar:', e);
      return false;
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(pedidoData);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => {
        console.error('[OfflineDB] Erro ao gravar pedido:', e);
        reject(e);
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Obtém todos os pedidos pendentes na fila ordenados cronologicamente
 * @param {Object} [options]
 * @returns {Promise<Array>}
 */
export async function dbObterFilaOffline(options = {}) {
  const storage = options.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);
  const db = options.db !== undefined ? options.db : await openOfflineDB(options.indexedDB);

  if (!db) {
    if (!storage) return [];
    try {
      const list = JSON.parse(storage.getItem(FALLBACK_KEY) || '[]');
      list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
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
        items.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        resolve(items);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Remove um pedido sincronizado da fila offline
 * @param {string} clientId
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
export async function dbRemoverPedidoOffline(clientId, options = {}) {
  if (!clientId) return false;
  const storage = options.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);
  const db = options.db !== undefined ? options.db : await openOfflineDB(options.indexedDB);

  if (!db) {
    if (!storage) return false;
    try {
      let list = JSON.parse(storage.getItem(FALLBACK_KEY) || '[]');
      list = list.filter(item => item.client_id !== clientId);
      storage.setItem(FALLBACK_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

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

/**
 * Atualiza status e último erro de um pedido na fila offline
 * @param {string} clientId
 * @param {string} status
 * @param {string|null} [ultimoErro]
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
export async function dbAtualizarStatusPedidoOffline(clientId, status, ultimoErro = null, options = {}) {
  if (!clientId) return false;
  const storage = options.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);
  const db = options.db !== undefined ? options.db : await openOfflineDB(options.indexedDB);

  if (!db) {
    if (!storage) return false;
    try {
      let list = JSON.parse(storage.getItem(FALLBACK_KEY) || '[]');
      const item = list.find(p => p.client_id === clientId);
      if (item) {
        item.status = status;
        if (ultimoErro !== null) item.ultimo_erro = ultimoErro;
        storage.setItem(FALLBACK_KEY, JSON.stringify(list));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

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
          store.put(item);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } else {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
