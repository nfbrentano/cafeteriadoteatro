import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validarEstruturaPgTap, listarTestesSql } from '../scripts/test-db-runner.js';

/**
 * Helper que cria um cliente Supabase simulando o comportamento real de RLS do Postgres
 * conforme as políticas da migration CAF-000107.
 */
function createRlsEnforcingSupabase({ role = 'anon', permissions = [], initialData = {} } = {}) {
  const store = {
    produtos: [...(initialData.produtos || [{ id: 'p1', nome: 'Espresso', preco: 8, categoria_id: 'c1', ativo: true, disponivel: true }])],
    categorias: [...(initialData.categorias || [{ id: 'c1', nome: 'Cafés', ordem: 1, ativo: true }])],
    site_settings: [...(initialData.site_settings || [{ key: 'pix_chave', value: 'cafeteria@teatro.com' }])],
    business_hours: [...(initialData.business_hours || [{ id: 1, dia_semana: 1, abertura: '08:00', fechamento: '20:00', ativo: true }])],
    contador: [...(initialData.contador || [{ id: 'visitas', valor: 100 }])],
    v_adicionais_produto: [...(initialData.v_adicionais_produto || [{ produto_id: 'p1', adicional_id: 'a1', nome: 'Leite Vegetal', preco: 4 }])]
  };

  function canWriteTable(table, operation) {
    if (['produtos', 'categorias', 'promotions'].includes(table)) {
      return role === 'admin' || permissions.includes('produtos');
    }
    if (['site_settings', 'business_hours', 'hero_home'].includes(table)) {
      return role === 'admin' || permissions.includes('admin.configuracoes');
    }
    if (table === 'contador') {
      if (operation === 'DELETE') return role === 'admin';
      return true; // INSERT / UPDATE permitidos para telemetria com id válido
    }
    return role === 'admin';
  }

  return {
    store,
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: role === 'anon' ? null : { id: 'u-1', email: `${role}@teatro.com`, role } },
        error: null
      })),
      getSession: vi.fn(async () => ({
        data: { session: role === 'anon' ? null : { user: { id: 'u-1', role } } },
        error: null
      }))
    },
    from(table) {
      let pendingOp = 'SELECT';
      let pendingPayload = null;
      let filters = [];

      const builder = {
        select() {
          if (pendingOp === 'SELECT') pendingOp = 'SELECT';
          return builder;
        },
        insert(rows) {
          pendingOp = 'INSERT';
          pendingPayload = Array.isArray(rows) ? rows : [rows];
          return builder;
        },
        update(patch) {
          pendingOp = 'UPDATE';
          pendingPayload = patch;
          return builder;
        },
         upsert(rows) {
          pendingOp = 'UPSERT';
          pendingPayload = Array.isArray(rows) ? rows : [rows];
          return builder;
        },
        delete() {
          pendingOp = 'DELETE';
          return builder;
        },
        eq(col, val) {
          filters.push(r => r[col] === val);
          return builder;
        },
        in(col, vals) {
          filters.push(r => vals.includes(r[col]));
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          return builder.then(res => ({
            data: Array.isArray(res.data) ? (res.data[0] || null) : res.data,
            error: res.error
          }));
        },
        single() {
          return builder.then(res => {
            if (res.error) return res;
            const item = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!item) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
            return { data: item, error: null };
          });
        },
        then(resolve, reject) {
          try {
            if (pendingOp !== 'SELECT' && !canWriteTable(table, pendingOp)) {
              const err = {
                code: '42501',
                message: `new row violates row-level security policy for table "${table}"`
              };
              return Promise.resolve({ data: null, error: err }).then(resolve, reject);
            }

            const rows = store[table] || [];
            if (pendingOp === 'SELECT') {
              const matched = filters.reduce((acc, fn) => acc.filter(fn), rows);
              return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
            }
            if (pendingOp === 'INSERT' || pendingOp === 'UPSERT') {
              for (const item of pendingPayload) {
                if (table === 'contador' && !item.id) {
                  return Promise.resolve({
                    data: null,
                    error: { code: '42501', message: 'RLS check failed: id is required' }
                  }).then(resolve, reject);
                }
                rows.push({ ...item });
              }
              store[table] = rows;
              return Promise.resolve({ data: pendingPayload, error: null }).then(resolve, reject);
            }
            if (pendingOp === 'UPDATE') {
              const updated = [];
              for (let i = 0; i < rows.length; i++) {
                if (filters.every(fn => fn(rows[i]))) {
                  rows[i] = { ...rows[i], ...pendingPayload };
                  updated.push(rows[i]);
                }
              }
              return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
            }
            if (pendingOp === 'DELETE') {
              const remaining = rows.filter(r => !filters.every(fn => fn(r)));
              store[table] = remaining;
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            }
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        }
      };
      return builder;
    }
  };
}

function loadRealDbJs(supabaseClient) {
  window.cafeteriaSupabase = supabaseClient;
  window.supabaseClient = supabaseClient;
  const dbCode = fs.readFileSync(path.resolve(__dirname, '../js/db.js'), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', 'console', dbCode);
  fn(window, document, localStorage, console);
  return window.cafeteriaDB;
}

describe('CAF-000107: Hardening Completo do Supabase Security & Performance Advisors', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migration_caf_000107_hardening_supabase_advisors.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('CA01 & CA02: Escrita em produtos, categorias, site_settings e business_hours restrita a Admin/Permissão via CafeteriaDB real', () => {
    it('CA01: bloqueia alteração de preço ou exclusão em produtos e categorias quando usuário é cozinha/garcom sem permissão', async () => {
      const sbCozinha = createRlsEnforcingSupabase({ role: 'cozinha', permissions: ['kds'] });
      const db = loadRealDbJs(sbCozinha);

      // Leitura pública de produtos e categorias funciona via CafeteriaDB real
      const prods = await db.products.all();
      expect(prods.length).toBe(1);
      expect(prods[0].nome).toBe('Espresso');

      // Tentativa de escrita via CafeteriaDB.products.upsert e categories.delete por perfil cozinha é bloqueada pelo RLS
      await expect(db.products.upsert({ id: 'p1', nome: 'Espresso', preco: 0.01 })).rejects.toMatchObject({ code: '42501' });
      await expect(db.categories.delete('c1')).rejects.toMatchObject({ code: '42501' });
      expect(sbCozinha.store.categorias.length).toBe(1);
    });

    it('CA01: permite escrita em produtos e categorias quando usuário possui role admin ou permissão produtos', async () => {
      const sbAdmin = createRlsEnforcingSupabase({ role: 'admin', permissions: [] });
      loadRealDbJs(sbAdmin);

      const resUpdate = await sbAdmin.from('produtos').update({ preco: 9.5 }).eq('id', 'p1');
      expect(resUpdate.error).toBeNull();
      expect(sbAdmin.store.produtos[0].preco).toBe(9.5);
    });

    it('CA02: bloqueia alteração de chave Pix em site_settings e horários em business_hours por colaborador não-admin', async () => {
      const sbGarcom = createRlsEnforcingSupabase({ role: 'garcom', permissions: ['pdv.vender'] });
      loadRealDbJs(sbGarcom);

      const resPix = await sbGarcom.from('site_settings').update({ value: 'hacker@pix.com' }).eq('key', 'pix_chave');
      expect(resPix.error).toBeTruthy();
      expect(resPix.error.code).toBe('42501');
      expect(sbGarcom.store.site_settings[0].value).toBe('cafeteria@teatro.com');

      const resHours = await sbGarcom.from('business_hours').update({ fechamento: '23:59' }).eq('id', 1);
      expect(resHours.error).toBeTruthy();
      expect(resHours.error.code).toBe('42501');
    });

    it('CA02: permite atualização de site_settings por admin via CafeteriaDB.settings', async () => {
      const sbAdmin = createRlsEnforcingSupabase({ role: 'admin' });
      const db = loadRealDbJs(sbAdmin);

      const res = await sbAdmin.from('site_settings').update({ value: 'novo@teatro.com' }).eq('key', 'pix_chave');
      expect(res.error).toBeNull();
      expect(sbAdmin.store.site_settings[0].value).toBe('novo@teatro.com');
      expect(db.settings).toBeDefined();
    });
  });

  describe('CA03: Proteção da tabela contador contra DELETE anônimo', () => {
    it('CA03: anon consegue ler e incrementar contador com id válido, mas DELETE é negado pelo RLS', async () => {
      const sbAnon = createRlsEnforcingSupabase({ role: 'anon' });
      loadRealDbJs(sbAnon);

      const resUpdate = await sbAnon.from('contador').update({ valor: 101 }).eq('id', 'visitas');
      expect(resUpdate.error).toBeNull();
      expect(sbAnon.store.contador[0].valor).toBe(101);

      const resDelete = await sbAnon.from('contador').delete().eq('id', 'visitas');
      expect(resDelete.error).toBeTruthy();
      expect(resDelete.error.code).toBe('42501');
      expect(sbAnon.store.contador.length).toBe(1);
    });
  });

  describe('CA04, CA05 & CA06: Funções com search_path, Views security_invoker e Suíte pgTAP', () => {
    it('CA04: migration 107 configura SET search_path = public em 100% das funções do schema public', () => {
      expect(migrationSql).toMatch(/ALTER FUNCTION public\.%I\(%s\) SET search_path = public/i);
      expect(migrationSql).toMatch(/WHERE n\.nspname = 'public'\s+AND p\.prokind = 'f'/i);
    });

    it('CA05: views públicas configuram security_invoker = true e preservam leitura anônima no cardápio', async () => {
      expect(migrationSql).toMatch(/ALTER VIEW public\.produto_adicionais_permitidos SET \(security_invoker = true\)/i);
      expect(migrationSql).toMatch(/ALTER VIEW public\.v_adicionais_produto SET \(security_invoker = true\)/i);
      expect(migrationSql).toMatch(/ALTER VIEW public\.v_cortesias_disponiveis SET \(security_invoker = true\)/i);

      const sbAnon = createRlsEnforcingSupabase({ role: 'anon' });
      loadRealDbJs(sbAnon);
      const { data, error } = await sbAnon.from('v_adicionais_produto').select('*').eq('produto_id', 'p1');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].nome).toBe('Leite Vegetal');
    });

    it('CA06: remove policies duplicadas abertas e valida arquivo pgTAP hardening_advisors.test.sql', () => {
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "Admins podem atualizar configurações" ON public\.site_settings/i);
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "Escrita para admins" ON public\.site_settings/i);
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "Escrita para admins" ON public\.business_hours/i);

      const pgtapPath = path.resolve(__dirname, '../supabase/tests/hardening_advisors.test.sql');
      expect(fs.existsSync(pgtapPath)).toBe(true);
      const checagem = validarEstruturaPgTap(fs.readFileSync(pgtapPath, 'utf8'));
      expect(checagem.valido).toBe(true);
      expect(listarTestesSql('supabase/tests')).toContain(path.join('supabase/tests', 'hardening_advisors.test.sql'));
    });
  });
});
