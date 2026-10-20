import { vi } from 'vitest';

/**
 * Creates an in-memory Supabase mock client.
 * Supports chaining: .from(table).select().insert().update().delete().eq().single().order()
 * and .rpc(fn, args)
 */
export function createSupabaseMock(initialData = {}) {
  const tables = { ...initialData };

  function getTable(name) {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function createQueryBuilder(tableName) {
    let currentData = [...getTable(tableName)];
    let isSingle = false;
    let pendingUpdate = null;

    const builder = {
      select: vi.fn((fields = '*') => {
        return builder;
      }),
      insert: vi.fn((rows) => {
        const toInsert = Array.isArray(rows) ? rows : [rows];
        const inserted = toInsert.map((r, i) => ({
          id: r.id || `mock-id-${Date.now()}-${i}`,
          created_at: new Date().toISOString(),
          ...r
        }));
        getTable(tableName).push(...inserted);
        currentData = inserted;
        return builder;
      }),
      update: vi.fn((values) => {
        pendingUpdate = values;
        return builder;
      }),
      delete: vi.fn(() => {
        const table = getTable(tableName);
        const idsToDelete = new Set(currentData.map(d => d.id));
        tables[tableName] = table.filter(t => !idsToDelete.has(t.id));
        return builder;
      }),
      eq: vi.fn((col, val) => {
        currentData = currentData.filter(item => item[col] === val);
        return builder;
      }),
      neq: vi.fn((col, val) => {
        currentData = currentData.filter(item => item[col] !== val);
        return builder;
      }),
      ilike: vi.fn((col, val) => {
        const pattern = String(val || '').replace(/%/g, '').toLowerCase();
        currentData = currentData.filter(item => {
          const itemVal = String(item[col] || '').toLowerCase();
          return itemVal.includes(pattern);
        });
        return builder;
      }),
      like: vi.fn((col, val) => {
        const pattern = String(val || '').replace(/%/g, '');
        currentData = currentData.filter(item => {
          const itemVal = String(item[col] || '');
          return itemVal.includes(pattern);
        });
        return builder;
      }),
      gte: vi.fn((col, val) => {
        currentData = currentData.filter(item => item[col] >= val);
        return builder;
      }),
      lte: vi.fn((col, val) => {
        currentData = currentData.filter(item => item[col] <= val);
        return builder;
      }),
      in: vi.fn((col, values) => {
        const set = new Set(values);
        currentData = currentData.filter(item => set.has(item[col]));
        return builder;
      }),
      order: vi.fn((col, { ascending = true } = {}) => {
        currentData.sort((a, b) => {
          if (a[col] < b[col]) return ascending ? -1 : 1;
          if (a[col] > b[col]) return ascending ? 1 : -1;
          return 0;
        });
        return builder;
      }),
      limit: vi.fn((n) => {
        currentData = currentData.slice(0, n);
        return builder;
      }),
      single: vi.fn(() => {
        isSingle = true;
        return builder;
      }),
      maybeSingle: vi.fn(() => {
        isSingle = true;
        return builder;
      }),
      then: (resolve) => {
        if (pendingUpdate) {
          currentData.forEach(item => Object.assign(item, pendingUpdate));
        }
        const result = isSingle ? (currentData[0] || null) : currentData;
        return resolve({ data: result, error: null });
      }
    };

    return builder;
  }

  const client = {
    _tables: tables,
    from: vi.fn((tableName) => createQueryBuilder(tableName)),
    rpc: vi.fn((fnName, args) => {
      if (fnName === 'registrar_uso_cupom') {
        const camp = (tables.campanhas || []).find(c => c.id === args?.p_campanha_id);
        if (camp) {
          camp.usos_registrados = (camp.usos_registrados || 0) + 1;
          camp.receita_atribuida = (Number(camp.receita_atribuida) || 0) + Number(args?.p_valor_pedido || 0);
        }
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb) => {
        if (cb) cb('SUBSCRIBED');
        return { unsubscribe: vi.fn() };
      })
    })),
    removeChannel: vi.fn()
  };

  return client;
}
