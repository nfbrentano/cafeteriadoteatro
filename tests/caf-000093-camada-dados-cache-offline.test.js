import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../js/db.js';
import {
  openOfflineDB,
  dbSalvarPedidoOffline,
  dbObterFilaOffline,
  dbRemoverPedidoOffline,
  dbAtualizarStatusPedidoOffline,
  FALLBACK_KEY
} from '../js/utils/offline-queue.js';

const db = globalThis.cafeteriaDB || window.cafeteriaDB;

/**
 * CAF-000093 — Cobertura de Testes: Camada de Dados, Cache Local e Fila Offline
 */
describe('CAF-000093 — Camada de Dados, Cache Local e Fila Offline', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Módulo de Cache Seguro (db.cache) — Sanitização e Mitigação CWE-312', () => {
    it('CA01 / RF01: persiste chaves autorizadas em base64 com sanitização de campos', () => {
      expect(db).toBeDefined();
      expect(db.cache).toBeDefined();

      const mockSettings = {
        sobre_titulo: 'Cafeteria do Teatro',
        sobre_texto: 'O melhor café do centro histórico',
        whatsapp_ativo: true,
        whatsapp_numero: '51999999999',
        campo_malicioso_injetado: 'deve_ser_ignorado'
      };

      db.cache.set(db.cache.KEYS.SETTINGS, mockSettings);

      const rawArmazenado = localStorage.getItem(db.cache.KEYS.SETTINGS);
      expect(rawArmazenado).toBeTruthy();

      // Verifica que não está armazenado em cleartext cru (CWE-312)
      expect(rawArmazenado).not.toContain('O melhor café do centro histórico');

      // Decodifica e valida integridade e sanitização
      const recuperado = db.cache.get(db.cache.KEYS.SETTINGS);
      expect(recuperado).toEqual({
        sobre_titulo: 'Cafeteria do Teatro',
        sobre_texto: 'O melhor café do centro histórico',
        exp_subtitulo: '',
        galeria_subtitulo: '',
        sobre_imagem_url: '',
        whatsapp_ativo: 'true',
        whatsapp_numero: '51999999999'
      });
      expect(recuperado.campo_malicioso_injetado).toBeUndefined();
    });

    it('CA02 / RF01: rejeita chaves não autorizadas fora de ALLOWED_CACHE_KEYS', () => {
      const chaveNaoPermitida = 'chave_secreta_usuario';
      db.cache.set(chaveNaoPermitida, { token: '123456' });

      expect(localStorage.getItem(chaveNaoPermitida)).toBeNull();
      expect(db.cache.get(chaveNaoPermitida)).toBeNull();
    });

    it('CA02 / RF01: descarta valores nulos ou indefinidos sem quebrar o storage', () => {
      db.cache.set(db.cache.KEYS.HERO, null);
      db.cache.set(db.cache.KEYS.PROMOS, undefined);

      expect(localStorage.getItem(db.cache.KEYS.HERO)).toBeNull();
      expect(localStorage.getItem(db.cache.KEYS.PROMOS)).toBeNull();
    });

    it('CA03 / RF02: retorna null de forma segura se o payload no localStorage estiver corrompido', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simula string corrompida não-base64
      localStorage.setItem(db.cache.KEYS.SETTINGS, '%%%dado-corrompido-invalido%%%');
      const resCorrompido = db.cache.get(db.cache.KEYS.SETTINGS);
      expect(resCorrompido).toBeNull();

      // Simula base64 válido mas cujo conteúdo não é JSON válido
      const base64TextoInvalido = btoa('isto_nao_e_json');
      localStorage.setItem(db.cache.KEYS.SETTINGS, base64TextoInvalido);
      const resJsonInvalido = db.cache.get(db.cache.KEYS.SETTINGS);
      expect(resJsonInvalido).toBeNull();

      warnSpy.mockRestore();
    });

    it('CA04 / RF03: bloqueia a gravação de cache público se estiver no painel administrativo', () => {
      // Simula ambiente de admin
      const originalPath = window.location.pathname;
      delete window.location;
      window.location = { pathname: '/admin.html' };

      db.cache.set(db.cache.KEYS.SETTINGS, { sobre_titulo: 'Admin Test' });
      expect(localStorage.getItem(db.cache.KEYS.SETTINGS)).toBeNull();

      // Restaura pathname
      window.location = { pathname: originalPath || '/' };
    });
  });

  describe('2. Fila Offline de Pedidos — Persistência, Ordenação e Fallback', () => {
    it('CA05 / CA07 / RF04: grava pedido com client_id e timestamp no fallback de localStorage', async () => {
      const pedidoMock = {
        client_id: 'client-offline-001',
        created_at: new Date('2026-10-22T10:00:00Z').toISOString(),
        tipo_consumo: 'viagem',
        cliente_nome: 'Carlos Drummond',
        itens: [{ produto_id: 1, nome: 'Café Coado', quantidade: 2, preco: 8.0 }],
        total: 16.0,
        status: 'pendente'
      };

      // Força modo fallback sem IndexedDB
      const salvo = await dbSalvarPedidoOffline(pedidoMock, { db: null });
      expect(salvo).toBe(true);

      const filaRaw = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
      expect(filaRaw).toHaveLength(1);
      expect(filaRaw[0].client_id).toBe('client-offline-001');
      expect(filaRaw[0].total).toBe(16.0);
    });

    it('CA06 / RF04: obtém fila offline ordenada cronologicamente por created_at', async () => {
      const pedido1 = {
        client_id: 'ped-tarde',
        created_at: '2026-10-22T15:00:00Z',
        total: 20.0
      };
      const pedido2 = {
        client_id: 'ped-manha',
        created_at: '2026-10-22T08:30:00Z',
        total: 12.0
      };
      const pedido3 = {
        client_id: 'ped-almoco',
        created_at: '2026-10-22T12:00:00Z',
        total: 35.0
      };

      await dbSalvarPedidoOffline(pedido1, { db: null });
      await dbSalvarPedidoOffline(pedido2, { db: null });
      await dbSalvarPedidoOffline(pedido3, { db: null });

      const fila = await dbObterFilaOffline({ db: null });
      expect(fila).toHaveLength(3);
      expect(fila[0].client_id).toBe('ped-manha');
      expect(fila[1].client_id).toBe('ped-almoco');
      expect(fila[2].client_id).toBe('ped-tarde');
    });

    it('CA08 / RF04: remove pedido com sucesso da fila após sincronização', async () => {
      const p1 = { client_id: 'ped-101', created_at: '2026-10-22T10:00:00Z' };
      const p2 = { client_id: 'ped-102', created_at: '2026-10-22T10:05:00Z' };

      await dbSalvarPedidoOffline(p1, { db: null });
      await dbSalvarPedidoOffline(p2, { db: null });

      const removido = await dbRemoverPedidoOffline('ped-101', { db: null });
      expect(removido).toBe(true);

      const filaRestante = await dbObterFilaOffline({ db: null });
      expect(filaRestante).toHaveLength(1);
      expect(filaRestante[0].client_id).toBe('ped-102');
    });

    it('CA09 / RF05: atualiza status e registra mensagem de erro sem descartar o pedido da fila', async () => {
      const p = {
        client_id: 'ped-falha-rede',
        created_at: '2026-10-22T11:00:00Z',
        status: 'pendente'
      };

      await dbSalvarPedidoOffline(p, { db: null });

      const atualizou = await dbAtualizarStatusPedidoOffline(
        'ped-falha-rede',
        'erro_sincronizacao',
        'Timeout 504 Gateway ao contatar Supabase',
        { db: null }
      );

      expect(atualizou).toBe(true);

      const fila = await dbObterFilaOffline({ db: null });
      expect(fila).toHaveLength(1);
      expect(fila[0].status).toBe('erro_sincronizacao');
      expect(fila[0].ultimo_erro).toBe('Timeout 504 Gateway ao contatar Supabase');
    });

    it('CA10 / RNF01: rejeita operações inválidas com parâmetros nulos ou inválidos com segurança', async () => {
      expect(await dbSalvarPedidoOffline(null)).toBe(false);
      expect(await dbSalvarPedidoOffline({})).toBe(false);
      expect(await dbRemoverPedidoOffline(null)).toBe(false);
      expect(await dbRemoverPedidoOffline('')).toBe(false);
      expect(await dbAtualizarStatusPedidoOffline(null, 'erro')).toBe(false);
      expect(await dbAtualizarStatusPedidoOffline('id-inexistente', 'erro', null, { db: null })).toBe(false);
    });

    it('CA10 / RNF01: openOfflineDB resolve null com segurança se indexedDB não existir ou falhar', async () => {
      const dbInstanceNull = await openOfflineDB(null);
      expect(dbInstanceNull).toBeNull();

      // Simula erro no request.open
      const mockFactoryError = {
        open: () => {
          const req = {};
          setTimeout(() => req.onerror && req.onerror(new Error('Erro simulado')), 0);
          return req;
        }
      };
      const dbInstanceErr = await openOfflineDB(mockFactoryError);
      expect(dbInstanceErr).toBeNull();

      // Simula sucesso com upgrade
      const mockDbResult = {
        objectStoreNames: { contains: () => false },
        createObjectStore: vi.fn(() => ({ createIndex: vi.fn() }))
      };
      const mockFactorySuccess = {
        open: () => {
          const req = { result: mockDbResult };
          setTimeout(() => {
            if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
            if (req.onsuccess) req.onsuccess({ target: req });
          }, 0);
          return req;
        }
      };
      const dbInstanceOk = await openOfflineDB(mockFactorySuccess);
      expect(dbInstanceOk).toBe(mockDbResult);
      expect(mockDbResult.createObjectStore).toHaveBeenCalledWith('pedidos_offline', { keyPath: 'client_id' });
    });

    it('CA05 / CA06 / CA08 / CA09: opera corretamente através de conexão IndexedDB ativa', async () => {
      const storeMap = new Map();

      const mockDb = {
        transaction: (storeName, mode) => {
          const tx = {
            set oncomplete(cb) {
              setTimeout(() => cb && cb(), 0);
            },
            set onerror(cb) {},
            objectStore: () => ({
              put: (item) => {
                storeMap.set(item.client_id, { ...item });
              },
              getAll: () => {
                const req = { result: Array.from(storeMap.values()) };
                setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
                return req;
              },
              get: (key) => {
                const req = { result: storeMap.get(key) || null };
                setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
                return req;
              },
              delete: (key) => {
                storeMap.delete(key);
              }
            })
          };
          return tx;
        }
      };

      const pedidoIdb = {
        client_id: 'ped-idb-001',
        created_at: '2026-10-22T14:00:00Z',
        total: 55.0,
        status: 'pendente'
      };

      // 1. Salvar via IDB
      const salvou = await dbSalvarPedidoOffline(pedidoIdb, { db: mockDb });
      expect(salvou).toBe(true);

      // 2. Obter fila via IDB
      const fila = await dbObterFilaOffline({ db: mockDb });
      expect(fila).toHaveLength(1);
      expect(fila[0].client_id).toBe('ped-idb-001');

      // 3. Atualizar status via IDB
      const atualizou = await dbAtualizarStatusPedidoOffline('ped-idb-001', 'sincronizando', null, { db: mockDb });
      expect(atualizou).toBe(true);

      const atualizouInexistente = await dbAtualizarStatusPedidoOffline('inexistente', 'sincronizando', null, { db: mockDb });
      expect(atualizouInexistente).toBe(false);

      // 4. Remover via IDB
      const removeu = await dbRemoverPedidoOffline('ped-idb-001', { db: mockDb });
      expect(removeu).toBe(true);

      const filaVazia = await dbObterFilaOffline({ db: mockDb });
      expect(filaVazia).toHaveLength(0);
    });
  });
});
