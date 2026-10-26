import { vi } from 'vitest';

/**
 * Creates an in-memory Supabase mock client.
 * Supports chaining: .from(table).select().insert().upsert().update().delete().eq().neq().or().in().is().gte().lte().range().limit().single().maybeSingle().order()
 * and .rpc(fn, args) with configurable handlers and strict schema validation mode.
 */
export function createSupabaseMock(initialData = {}, options = {}) {
  const tables = { ...initialData };
  const rpcHandlers = { ...(options.rpcHandlers || {}) };
  const channels = [];

  function getTable(name) {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function createQueryBuilder(tableName) {
    if (options.strict && options.schemaSnapshot) {
      const allowedTables = options.schemaSnapshot.tables || {};
      if (!allowedTables[tableName]) {
        return {
          then: (resolve) => resolve({ data: null, error: { code: '42P01', message: `relation "public.${tableName}" does not exist` } })
        };
      }
    }

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
      upsert: vi.fn((rows) => {
        const toUpsert = Array.isArray(rows) ? rows : [rows];
        const table = getTable(tableName);
        const inserted = toUpsert.map((r, i) => {
          const idx = table.findIndex(t => 
            (r.id && t.id === r.id) || 
            (r.chave && t.chave === r.chave) || 
            (r.forma && t.forma === r.forma)
          );
          const fullRow = {
            updated_at: new Date().toISOString(),
            ...r
          };
          if (r.id) fullRow.id = r.id;
          if (idx >= 0) {
            table[idx] = { ...table[idx], ...fullRow };
            return table[idx];
          } else {
            if (!fullRow.id && !fullRow.chave && !fullRow.forma) {
              fullRow.id = `mock-id-${Date.now()}-${i}`;
            }
            table.push(fullRow);
            return fullRow;
          }
        });
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
      or: vi.fn((filterStr) => {
        return builder;
      }),
      is: vi.fn((col, val) => {
        currentData = currentData.filter(item => item[col] === val);
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
      gt: vi.fn((col, val) => {
        currentData = currentData.filter(item => item[col] > val);
        return builder;
      }),
      lt: vi.fn((col, val) => {
        currentData = currentData.filter(item => item[col] < val);
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
      range: vi.fn((from, to) => {
        currentData = currentData.slice(from, to + 1);
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
    _rpcHandlers: rpcHandlers,
    from: vi.fn((tableName) => createQueryBuilder(tableName)),
    rpc: vi.fn((fnName, args) => {
      if (options.strict && options.schemaSnapshot) {
        const rpcDef = options.schemaSnapshot.rpcs?.[fnName];
        if (!rpcDef) {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST202', message: `Could not find the function public.${fnName} in the schema cache` }
          });
        }
        if (args && typeof args === 'object') {
          const allowedArgs = new Set(rpcDef.parameters || []);
          for (const key of Object.keys(args)) {
            if (!allowedArgs.has(key)) {
              return Promise.resolve({
                data: null,
                error: { code: 'PGRST202', message: `Function public.${fnName} has no parameter ${key}` }
              });
            }
          }
        }
      }

      if (rpcHandlers[fnName]) {
        return Promise.resolve(rpcHandlers[fnName](args, tables));
      }

      if (fnName === 'registrar_uso_cupom') {
        const camp = (tables.campanhas || []).find(c => c.id === args?.p_campanha_id);
        const pedido = (tables.pedidos || []).find(p => p.id === args?.p_pedido_id);
        const valor = pedido ? Number(pedido.total || 0) : Number(args?.p_valor_pedido || 0);
        if (camp) {
          camp.usos_registrados = (camp.usos_registrados || 0) + 1;
          camp.receita_atribuida = (Number(camp.receita_atribuida) || 0) + valor;
        }
        return Promise.resolve({ data: true, error: null });
      }

      if (options.strictMock || options.throwOnUnconfigured) {
        return Promise.reject(new Error(`[SupabaseMock] Chamada não configurada no teste: RPC "${fnName}" com args ${JSON.stringify(args)}`));
      }

      return Promise.resolve({ data: null, error: null });
    }),


    channel: vi.fn((name = 'realtime') => {
      const listeners = [];
      const chan = {
        name,
        listeners,
        on: vi.fn((event, filter, callback) => {
          const cb = typeof filter === 'function' ? filter : callback;
          listeners.push({ event, filter: typeof filter === 'object' ? filter : null, cb });
          return chan;
        }),
        subscribe: vi.fn((cb) => {
          if (cb) cb('SUBSCRIBED');
          return chan;
        }),
        unsubscribe: vi.fn(),
        _trigger: (event, payload) => {
          listeners.forEach(l => {
            if (l.event === '*' || l.event === event || event === 'postgres_changes') {
              l.cb(payload);
            }
          });
        }
      };
      channels.push(chan);
      return chan;
    }),
    removeChannel: vi.fn(),
    _channels: channels,
    getChannel: (name) => channels.find(c => c.name === name) || channels[0]
  };

  return client;
}
