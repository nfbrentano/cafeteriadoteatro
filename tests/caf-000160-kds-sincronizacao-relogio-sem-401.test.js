// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import { createPageHarness } from './helpers/page-harness.js';

const ANON_CLAIMS = { sub: '00000000-0000-0000-0000-000000000099', role: 'anon', email: 'anon@e2e.local' };
const AUTH_CLAIMS = { sub: '00000000-0000-0000-0000-000000000002', role: 'authenticated', email: 'cozinha@e2e.local' };

describe('CAF-000160: Sincronização de Relógio no KDS sem Erro 401 em auth/v1/health (RPC get_server_time)', () => {
  let db;

  beforeAll(async () => {
    // Inicializa o banco PGlite com todas as migrations canônicas (incluindo 160)
    db = await createE2EDatabase();
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // 1. Execução Real no PostgreSQL (PGlite) com migration 160 (CA04)
  // ---------------------------------------------------------------------------
  describe('1. Execução da RPC get_server_time no PostgreSQL (CA04)', () => {
    it('CA04: RPC get_server_time existe e retorna timestamp válido sob authenticated', async () => {
      const res = await db.withJwtClaims(AUTH_CLAIMS, async (tx) => {
        return await tx.query(`SELECT public.get_server_time() AS server_time`);
      });

      expect(res.rows.length).toBe(1);
      const serverTime = res.rows[0].server_time;
      expect(serverTime).toBeDefined();

      const parsed = new Date(serverTime).getTime();
      expect(Number.isNaN(parsed)).toBe(false);
      // Deve estar muito próximo do timestamp atual da máquina (< 10 segundos)
      expect(Math.abs(Date.now() - parsed)).toBeLessThan(10000);
    });

    it('CA04: RPC get_server_time pode ser executada por anon', async () => {
      const res = await db.withJwtClaims(ANON_CLAIMS, async (tx) => {
        return await tx.query(`SELECT public.get_server_time() AS server_time`);
      });

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].server_time).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Execução no DOM Real de cozinha.html / cozinha.js (CA01, CA02, CA03)
  // ---------------------------------------------------------------------------
  describe('2. Execução Funcional no KDS via cozinha.js (CA01, CA02, CA03)', () => {
    it('CA01: syncServerClock utiliza cafeteriaSupabase.rpc("get_server_time") e não chama fetch para /auth/v1/health', async () => {
      const harness = await createPageHarness('cozinha.html');
      const fetchSpy = vi.spyOn(window, 'fetch');
      const mockRpc = vi.fn().mockImplementation((rpcName) => {
        if (rpcName === 'get_server_time') {
          return Promise.resolve({ data: new Date().toISOString(), error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      window.cafeteriaSupabase = {
        rpc: mockRpc,
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } })
        }
      };

      await harness.carregarScript('js/cozinha.js');

      expect(typeof window.syncServerClock).toBe('function');
      await window.syncServerClock();

      expect(mockRpc).toHaveBeenCalledWith('get_server_time');

      // Garante que NENHUM fetch foi feito para /auth/v1/health (causa do erro 401)
      const chamadasAuthHealth = fetchSpy.mock.calls.filter(call => {
        const url = String(call[0] || '');
        return url.includes('/auth/v1/health');
      });
      expect(chamadasAuthHealth.length).toBe(0);
    });

    it('CA02: skew é calculado com precisão quando o relógio do servidor estiver adiantado (+120s)', async () => {
      const harness = await createPageHarness('cozinha.html');
      const mockRpc = vi.fn();

      window.cafeteriaSupabase = {
        rpc: mockRpc,
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } })
        }
      };

      // Simula servidor 120 segundos (2 minutos) à frente
      const nowClient = Date.now();
      const serverTimeFake = new Date(nowClient + 120000).toISOString();

      mockRpc.mockImplementation((rpcName) => {
        if (rpcName === 'get_server_time') {
          return Promise.resolve({ data: serverTimeFake, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await harness.carregarScript('js/cozinha.js');
      await window.syncServerClock();

      const skew = window.getServerClockSkewMs();
      expect(skew).toBeGreaterThanOrEqual(119000);
      expect(skew).toBeLessThanOrEqual(121000);
    });

    it('CA02: skew é calculado com precisão quando o relógio do servidor estiver atrasado (-60s)', async () => {
      const harness = await createPageHarness('cozinha.html');
      const mockRpc = vi.fn();

      window.cafeteriaSupabase = {
        rpc: mockRpc,
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } })
        }
      };

      // Simula servidor 60 segundos atrás
      const nowClient = Date.now();
      const serverTimeFake = new Date(nowClient - 60000).toISOString();

      mockRpc.mockImplementation((rpcName) => {
        if (rpcName === 'get_server_time') {
          return Promise.resolve({ data: serverTimeFake, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      await harness.carregarScript('js/cozinha.js');
      await window.syncServerClock();

      const skew = window.getServerClockSkewMs();
      expect(skew).toBeGreaterThanOrEqual(-61000);
      expect(skew).toBeLessThanOrEqual(-59000);
    });

    it('CA03: fallback seguro (skew = 0) quando a RPC falha ou está offline', async () => {
      const harness = await createPageHarness('cozinha.html');
      const mockRpc = vi.fn();

      window.cafeteriaSupabase = {
        rpc: mockRpc,
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } })
        }
      };

      // Simula falha na RPC
      mockRpc.mockRejectedValueOnce(new Error('Network disconnected'));

      await harness.carregarScript('js/cozinha.js');
      await expect(window.syncServerClock()).resolves.not.toThrow();

      const skew = window.getServerClockSkewMs();
      expect(skew).toBe(0);
    });

    it('CA01 / Cliente: supabase-client.js disponibiliza window.SUPABASE_ANON_KEY', async () => {
      const harness = await createPageHarness('cozinha.html');
      await harness.carregarScript('js/supabase-client.js');

      expect(window.SUPABASE_URL).toBeDefined();
      expect(window.SUPABASE_ANON_KEY).toBeDefined();
      expect(typeof window.SUPABASE_ANON_KEY).toBe('string');
      expect(window.SUPABASE_ANON_KEY.length).toBeGreaterThan(20);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Validação Estática da Migração e Rollback 160 (CA05)
  // ---------------------------------------------------------------------------
  describe('3. Validação Estática da Migration e Rollback 160 (CA05)', () => {
    it('CA05: migration_caf_000160_get_server_time.sql existe e define public.get_server_time', () => {
      const migPath = path.resolve('supabase/migration_caf_000160_get_server_time.sql');
      expect(fs.existsSync(migPath)).toBe(true);

      const sql = fs.readFileSync(migPath, 'utf8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_server_time()');
      expect(sql).toContain('RETURNS TIMESTAMPTZ');
      expect(sql).toContain('SELECT now();');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated, service_role;');
      expect(sql).toContain("INSERT INTO public.app_migrations (versao, arquivo)");
      expect(sql).toContain("'160'");
    });

    it('CA05: rollback_caf_000160.sql existe e remove public.get_server_time', () => {
      const rbPath = path.resolve('supabase/rollback/rollback_caf_000160.sql');
      expect(fs.existsSync(rbPath)).toBe(true);

      const sql = fs.readFileSync(rbPath, 'utf8');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.get_server_time();');
      expect(sql).toContain("DELETE FROM public.app_migrations WHERE versao = '160';");
    });

    it('CA05: migrations.manifest.json contém registro da migração 160 com checksum correto', () => {
      const manifestPath = path.resolve('supabase/migrations.manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const entry160 = manifest.migrations.find(m => m.versao === '160');
      expect(entry160).toBeDefined();
      expect(entry160.arquivo).toBe('migration_caf_000160_get_server_time.sql');
      expect(entry160.rollback).toBe('rollback_caf_000160.sql');
      expect(entry160.checksum).toBe('212a8a9464e375cbb84fd194beadef10bd4d99929693dc4ebbc641536a3f41f5');
    });
  });
});
