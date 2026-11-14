#!/usr/bin/env node
/**
 * scripts/e2e-server.mjs
 * CAF-000120 — Servidor HTTP local same-origin + Shim Supabase (Auth, PostgREST, RPC, Realtime SSE).
 *
 * Mantém todo o tráfego na mesma origem (http://127.0.0.1:<E2E_PORT>) respeitando a
 * Content-Security-Policy (connect-src 'self', script-src 'self') das páginas HTML.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createE2EDatabase } from './e2e-db.mjs';
import { expandHtmlPartials } from './html-partials.mjs';

const WORKSPACE_ROOT = path.resolve('.');
const DEFAULT_PORT = Number(process.env.E2E_PORT || 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf'
};

const REALTIME_TABLES = [
  'pedidos',
  'pedido_itens',
  'mesas',
  'mesa_chamados',
  'produtos',
  'caixas',
  'fechamentos',
  'fechamento_pagamentos',
  'pedido_impressoes'
];

// OIDs numéricos do PostgreSQL para normalização compatível com PostgREST JSON
const OID_NUMERIC_FLOAT = new Set([20, 21, 23, 700, 701, 1700]);

function coerceResultValue(value, dataTypeID, dataTypeName = '') {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (OID_NUMERIC_FLOAT.has(dataTypeID) || /^(numeric|decimal|bigint|int8|integer|int4|smallint|double|real)/i.test(dataTypeName)) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return value;
}

function normalizeQueryRows(result, columnTypeMap = null) {
  const fields = Array.isArray(result?.fields) ? result.fields : [];
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return rows.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      const fieldMeta = fields.find((f) => f.name === key);
      const colMeta = columnTypeMap?.get(key);
      normalized[key] = coerceResultValue(
        row[key],
        fieldMeta?.dataTypeID,
        colMeta?.data_type || colMeta?.udt_name || ''
      );
    }
    return normalized;
  });
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseTokenClaims(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return { sub: null, role: 'anon', email: null };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token === 'e2e-anon-key') {
    return { sub: null, role: 'anon', email: null };
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return { sub: null, role: 'anon', email: null };
  }
  try {
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return {
      sub: decoded.sub || null,
      role: decoded.role || 'authenticated',
      email: decoded.email || null
    };
  } catch {
    return { sub: null, role: 'anon', email: null };
  }
}

function createJwtToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 86400
    })
  ).toString('base64url');
  return `${header}.${payload}.e2e-signature`;
}

async function ensureRealtimeOutbox(e2eDb) {
  await e2eDb.exec(`
    CREATE SCHEMA IF NOT EXISTS _e2e;
    CREATE TABLE IF NOT EXISTS _e2e.realtime_outbox (
      id BIGSERIAL PRIMARY KEY,
      schema_name TEXT NOT NULL,
      table_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      old_row JSONB,
      new_row JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    GRANT USAGE ON SCHEMA _e2e TO anon, authenticated, service_role;
    GRANT ALL ON _e2e.realtime_outbox TO anon, authenticated, service_role;
    GRANT USAGE, SELECT ON SEQUENCE _e2e.realtime_outbox_id_seq TO anon, authenticated, service_role;

    CREATE OR REPLACE FUNCTION _e2e.capture_realtime_event()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      INSERT INTO _e2e.realtime_outbox (schema_name, table_name, event_type, old_row, new_row)
      VALUES (
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN NULL;
    END;
    $$;
  `);

  for (const table of REALTIME_TABLES) {
    await e2eDb.exec(`
      DO $$
      BEGIN
        IF to_regclass('public.${table}') IS NOT NULL THEN
          DROP TRIGGER IF EXISTS trg_e2e_realtime_${table} ON public.${table};
          CREATE TRIGGER trg_e2e_realtime_${table}
          AFTER INSERT OR UPDATE OR DELETE ON public.${table}
          FOR EACH ROW EXECUTE FUNCTION _e2e.capture_realtime_event();
        END IF;
      END $$;
    `);
  }
}

async function loadSchemaMetadata(e2eDb) {
  const { rows: colRows } = await e2eDb.query(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const tables = new Map();
  for (const row of colRows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, new Map());
    }
    tables.get(row.table_name).set(row.column_name, {
      data_type: row.data_type,
      udt_name: row.udt_name
    });
  }

  const { rows: pkRows } = await e2eDb.query(`
    SELECT
      cls.relname AS table_name,
      array_agg(att.attname ORDER BY ord.n) AS columns
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ord(attnum, n) ON true
    JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = ord.attnum
    WHERE nsp.nspname = 'public' AND con.contype = 'p'
    GROUP BY cls.relname
  `);

  const primaryKeys = new Map();
  for (const row of pkRows) {
    primaryKeys.set(row.table_name, row.columns);
  }

  const { rows: fkRows } = await e2eDb.query(`
    SELECT
      con.conname AS constraint_name,
      src_cls.relname AS source_table,
      src_att.attname AS source_column,
      dst_cls.relname AS target_table,
      dst_att.attname AS target_column
    FROM pg_constraint con
    JOIN pg_class src_cls ON src_cls.oid = con.conrelid
    JOIN pg_namespace src_nsp ON src_nsp.oid = src_cls.relnamespace
    JOIN pg_class dst_cls ON dst_cls.oid = con.confrelid
    JOIN pg_namespace dst_nsp ON dst_nsp.oid = dst_cls.relnamespace
    JOIN LATERAL unnest(con.conkey, con.confkey) AS cols(src_attnum, dst_attnum) ON true
    JOIN pg_attribute src_att ON src_att.attrelid = src_cls.oid AND src_att.attnum = cols.src_attnum
    JOIN pg_attribute dst_att ON dst_att.attrelid = dst_cls.oid AND dst_att.attnum = cols.dst_attnum
    WHERE src_nsp.nspname = 'public' AND dst_nsp.nspname = 'public' AND con.contype = 'f'
  `);

  const { rows: fnRows } = await e2eDb.query(`
    SELECT
      p.oid,
      p.proname,
      p.proretset,
      pg_catalog.format_type(p.prorettype, NULL) AS return_type,
      p.proargnames,
      p.proargmodes,
      p.proargtypes::oid[] AS arg_type_oids,
      COALESCE(
        (
          SELECT array_agg(pg_catalog.format_type(t, NULL) ORDER BY idx)
          FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS u(t, idx)
        ),
        ARRAY[]::text[]
      ) AS arg_types
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  `);

  const functions = new Map();
  for (const fn of fnRows) {
    if (!functions.has(fn.proname)) {
      functions.set(fn.proname, []);
    }
    functions.get(fn.proname).push(fn);
  }

  return { tables, primaryKeys, foreignKeys: fkRows, functions };
}

function splitTopLevelCommas(str) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '"' && str[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelectSpec(selectStr = '*') {
  const raw = String(selectStr || '*').trim();
  const parts = splitTopLevelCommas(raw);
  const scalarCols = [];
  const relations = [];
  let includeAll = false;

  for (const part of parts) {
    const openIdx = part.indexOf('(');
    if (openIdx !== -1 && part.endsWith(')')) {
      const head = part.slice(0, openIdx).trim();
      const inner = part.slice(openIdx + 1, -1).trim();
      const colonIdx = head.indexOf(':');
      const alias = colonIdx !== -1 ? head.slice(0, colonIdx).trim() : null;
      const targetSpec = colonIdx !== -1 ? head.slice(colonIdx + 1).trim() : head;
      const bangIdx = targetSpec.indexOf('!');
      const table = bangIdx !== -1 ? targetSpec.slice(0, bangIdx).trim() : targetSpec;
      const hint = bangIdx !== -1 ? targetSpec.slice(bangIdx + 1).trim() : null;
      relations.push({
        propName: alias || table,
        table,
        hint,
        inner: parseSelectSpec(inner)
      });
    } else if (part === '*') {
      includeAll = true;
    } else {
      scalarCols.push(part);
    }
  }

  return { includeAll, scalarCols, relations };
}

function stripOuterParensAndQuotes(val) {
  const trimmed = val.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function coerceSqlInput(value, colMeta) {
  if (value === null || value === undefined) return null;
  const udt = (colMeta?.udt_name || '').toLowerCase();
  const dtype = (colMeta?.data_type || '').toLowerCase();
  if (dtype === 'jsonb' || dtype === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  if (udt.startsWith('_') && Array.isArray(value)) {
    return value;
  }
  return value;
}

function buildConditionSql(col, op, val, tableCols, params) {
  if (!tableCols.has(col)) {
    throw new Error(`Coluna desconhecida na tabela: ${col}`);
  }
  const colIdent = quoteIdent(col);
  const normalizedOp = op.toLowerCase();

  if (normalizedOp === 'is') {
    const v = String(val).toLowerCase();
    if (v === 'null' || val === null) return `${colIdent} IS NULL`;
    if (v === 'not.null') return `${colIdent} IS NOT NULL`;
    if (v === 'true' || val === true) return `${colIdent} IS TRUE`;
    if (v === 'false' || val === false) return `${colIdent} IS FALSE`;
  }

  if (normalizedOp === 'not') {
    if (typeof val === 'object' && val !== null && val.op) {
      return `NOT (${buildConditionSql(col, val.op, val.val, tableCols, params)})`;
    }
  }

  if (normalizedOp === 'in') {
    const list = Array.isArray(val)
      ? val
      : splitTopLevelCommas(String(val).replace(/^\(|\)$/g, '')).map(stripOuterParensAndQuotes);
    if (list.length === 0) return 'FALSE';
    const placeholders = list.map((item) => {
      params.push(item);
      return `$${params.length}`;
    });
    return `${colIdent} IN (${placeholders.join(', ')})`;
  }

  if (normalizedOp === 'cs' || normalizedOp === 'contains') {
    params.push(typeof val === 'string' ? val : JSON.stringify(val));
    return `${colIdent} @> $${params.length}`;
  }

  const opMap = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    like: 'LIKE',
    ilike: 'ILIKE'
  };

  const sqlOp = opMap[normalizedOp];
  if (!sqlOp) {
    throw new Error(`Operador PostgREST não suportado: ${op}`);
  }

  const colMeta = tableCols.get(col);
  let paramVal = val;
  if (typeof val === 'string') {
    if (val === 'null') paramVal = null;
    else if (colMeta?.data_type === 'boolean') paramVal = val === 'true';
  }
  params.push(coerceSqlInput(paramVal, colMeta));
  return `${colIdent} ${sqlOp} $${params.length}`;
}

function parseOrToken(token, tableCols, params) {
  const trimmed = token.trim();
  if (trimmed.startsWith('and(') && trimmed.endsWith(')')) {
    const inner = splitTopLevelCommas(trimmed.slice(4, -1));
    const parts = inner.map((part) => parseOrToken(part, tableCols, params));
    return `(${parts.join(' AND ')})`;
  }
  if (trimmed.startsWith('or(') && trimmed.endsWith(')')) {
    const inner = splitTopLevelCommas(trimmed.slice(3, -1));
    const parts = inner.map((part) => parseOrToken(part, tableCols, params));
    return `(${parts.join(' OR ')})`;
  }

  const firstDot = trimmed.indexOf('.');
  if (firstDot === -1) {
    throw new Error(`Filtro inválido: ${trimmed}`);
  }
  const col = trimmed.slice(0, firstDot);
  const rest = trimmed.slice(firstDot + 1);

  if (rest.startsWith('not.')) {
    const subRest = rest.slice(4);
    const subDot = subRest.indexOf('.');
    const innerOp = subRest.slice(0, subDot);
    const innerVal = subRest.slice(subDot + 1);
    return `NOT (${buildConditionSql(col, innerOp, innerVal, tableCols, params)})`;
  }

  const secondDot = rest.indexOf('.');
  if (secondDot === -1) {
    throw new Error(`Filtro sem operador válido: ${trimmed}`);
  }
  const op = rest.slice(0, secondDot);
  const rawVal = rest.slice(secondDot + 1);
  return buildConditionSql(col, op, rawVal, tableCols, params);
}

function buildWhereClause(filters = [], orFilters = [], tableCols) {
  const params = [];
  const clauses = [];

  for (const f of filters) {
    clauses.push(buildConditionSql(f.col, f.op, f.val, tableCols, params));
  }

  for (const orExpr of orFilters) {
    const tokens = splitTopLevelCommas(orExpr);
    if (tokens.length > 0) {
      const parsed = tokens.map((tok) => parseOrToken(tok, tableCols, params));
      clauses.push(`(${parsed.join(' OR ')})`);
    }
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function findRelationLink(parentTable, childTable, hint, foreignKeys) {
  const parentToChild = foreignKeys.filter(
    (fk) => fk.source_table === childTable && fk.target_table === parentTable && (!hint || fk.constraint_name === hint || fk.source_column === hint)
  );
  if (parentToChild.length > 0) {
    return {
      mode: 'many',
      parentKey: parentToChild[0].target_column,
      childKey: parentToChild[0].source_column
    };
  }

  const childToParent = foreignKeys.filter(
    (fk) => fk.source_table === parentTable && fk.target_table === childTable && (!hint || fk.constraint_name === hint || fk.source_column === hint)
  );
  if (childToParent.length > 0) {
    return {
      mode: 'one',
      parentKey: childToParent[0].source_column,
      childKey: childToParent[0].target_column
    };
  }

  // Fallback para views ou relações sem FK explícita
  if (parentTable === 'pedido_itens' && childTable === 'produtos') {
    return { mode: 'one', parentKey: 'produto_id', childKey: 'id' };
  }
  if (parentTable === 'pedidos' && childTable === 'pedido_itens') {
    return { mode: 'many', parentKey: 'id', childKey: 'pedido_id' };
  }
  if (parentTable === 'produtos' && childTable === 'categorias') {
    return { mode: 'one', parentKey: 'categoria_id', childKey: 'id' };
  }

  throw new Error(`Relação PostgREST não encontrada entre ${parentTable} e ${childTable}`);
}

async function resolveRelationsForRows(tx, parentTable, rows, spec, metadata) {
  if (!Array.isArray(rows) || rows.length === 0 || spec.relations.length === 0) {
    return rows;
  }

  for (const rel of spec.relations) {
    const childCols = metadata.tables.get(rel.table);
    if (!childCols) {
      throw new Error(`Tabela relacionada não encontrada: ${rel.table}`);
    }

    const link = findRelationLink(parentTable, rel.table, rel.hint, metadata.foreignKeys);
    const keyValues = [...new Set(rows.map((r) => r[link.parentKey]).filter((v) => v !== null && v !== undefined))];

    if (keyValues.length === 0) {
      for (const row of rows) {
        row[rel.propName] = link.mode === 'many' ? [] : null;
      }
      continue;
    }

    const selectCols = rel.inner.includeAll || rel.inner.scalarCols.length === 0
      ? '*'
      : [...new Set([...rel.inner.scalarCols, link.childKey])].map(quoteIdent).join(', ');

    const placeholders = keyValues.map((_, idx) => `$${idx + 1}`).join(', ');
    const childRes = await tx.query(
      `SELECT ${selectCols} FROM public.${quoteIdent(rel.table)} WHERE ${quoteIdent(link.childKey)} IN (${placeholders})`,
      keyValues
    );
    let childRows = normalizeQueryRows(childRes, childCols);
    childRows = await resolveRelationsForRows(tx, rel.table, childRows, rel.inner, metadata);

    if (link.mode === 'many') {
      const grouped = new Map();
      for (const child of childRows) {
        const k = String(child[link.childKey]);
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k).push(child);
      }
      for (const row of rows) {
        const k = row[link.parentKey] === null || row[link.parentKey] === undefined ? '' : String(row[link.parentKey]);
        row[rel.propName] = grouped.get(k) || [];
      }
    } else {
      const byKey = new Map();
      for (const child of childRows) {
        byKey.set(String(child[link.childKey]), child);
      }
      for (const row of rows) {
        const k = row[link.parentKey] === null || row[link.parentKey] === undefined ? '' : String(row[link.parentKey]);
        row[rel.propName] = byKey.get(k) || null;
      }
    }
  }

  return rows;
}

function projectRowColumns(row, spec) {
  if (spec.includeAll || spec.scalarCols.length === 0) {
    return row;
  }
  const projected = {};
  for (const col of spec.scalarCols) {
    if (Object.prototype.hasOwnProperty.call(row, col)) {
      projected[col] = row[col];
    }
  }
  for (const rel of spec.relations) {
    if (Object.prototype.hasOwnProperty.call(row, rel.propName)) {
      projected[rel.propName] = row[rel.propName];
    }
  }
  return projected;
}

async function executePostgrestQuery(e2eDb, metadata, claims, body) {
  const table = body.table;
  const tableCols = metadata.tables.get(table);
  if (!tableCols) {
    return { data: null, error: { message: `Tabela não encontrada: ${table}`, code: '42P01' } };
  }

  const action = body.action || 'select';
  const selectSpec = parseSelectSpec(body.columns || '*');

  try {
    return await e2eDb.withJwtClaims(claims, async (tx) => {
      if (action === 'select') {
        const { whereSql, params } = buildWhereClause(body.filters, body.orFilters, tableCols);
        const orderClauses = Array.isArray(body.orderBy) && body.orderBy.length > 0
          ? `ORDER BY ${body.orderBy
              .filter((o) => tableCols.has(o.col))
              .map((o) => {
                const dir = o.ascending === false ? 'DESC' : 'ASC';
                const nulls = o.nullsFirst === true ? 'NULLS FIRST' : o.nullsFirst === false ? 'NULLS LAST' : '';
                return `${quoteIdent(o.col)} ${dir} ${nulls}`.trim();
              })
              .join(', ')}`
          : '';

        let limitSql = '';
        if (Number.isInteger(body.rangeFrom) && Number.isInteger(body.rangeTo) && body.rangeTo >= body.rangeFrom) {
          limitSql = `LIMIT ${body.rangeTo - body.rangeFrom + 1} OFFSET ${Math.max(0, body.rangeFrom)}`;
        } else if (Number.isInteger(body.limitVal) && body.limitVal >= 0) {
          limitSql = `LIMIT ${body.limitVal}`;
        }

        let count = null;
        if (body.selectOptions?.count === 'exact') {
          const countRes = await tx.query(
            `SELECT COUNT(*)::int AS total FROM public.${quoteIdent(table)} ${whereSql}`,
            params
          );
          count = countRes.rows[0]?.total ?? 0;
        }

        if (body.selectOptions?.head === true) {
          return { data: null, count, error: null };
        }

        const relationFkCols = selectSpec.relations
          .map((rel) => {
            try {
              const link = findRelationLink(table, rel.table, rel.hint, metadata.foreignKeys);
              return link.parentKey;
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        const colsToSelect = selectSpec.includeAll || selectSpec.scalarCols.length === 0
          ? '*'
          : [...new Set([...selectSpec.scalarCols, ...relationFkCols])]
              .filter((c) => tableCols.has(c))
              .map(quoteIdent)
              .join(', ') || '*';

        const sql = `SELECT ${colsToSelect} FROM public.${quoteIdent(table)} ${whereSql} ${orderClauses} ${limitSql}`;
        const res = await tx.query(sql, params);
        let rows = normalizeQueryRows(res, tableCols);
        rows = await resolveRelationsForRows(tx, table, rows, selectSpec, metadata);

        if (!selectSpec.includeAll && selectSpec.scalarCols.length > 0) {
          rows = rows.map((r) => projectRowColumns(r, selectSpec));
        }

        if (body.singleMode === 'single') {
          if (rows.length !== 1) {
            return {
              data: null,
              count,
              error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }
            };
          }
          return { data: rows[0], count, error: null };
        }

        if (body.singleMode === 'maybeSingle') {
          if (rows.length > 1) {
            return {
              data: null,
              count,
              error: { message: 'Multiple rows returned for maybeSingle', code: 'PGRST116' }
            };
          }
          return { data: rows[0] ?? null, count, error: null };
        }

        return { data: rows, count, error: null };
      }

      if (action === 'insert' || action === 'upsert') {
        const inputRows = Array.isArray(body.values) ? body.values : [body.values];
        if (inputRows.length === 0) {
          return { data: body.selectAfter ? [] : null, error: null };
        }

        const insertCols = [...new Set(inputRows.flatMap((r) => Object.keys(r || {})))].filter((c) => tableCols.has(c));
        if (insertCols.length === 0) {
          return { data: null, error: { message: 'Nenhuma coluna válida informada para inserção', code: '400' } };
        }

        const params = [];
        const valueTuples = inputRows.map((row) => {
          const placeholders = insertCols.map((col) => {
            const val = row?.[col];
            if (val === undefined) return 'DEFAULT';
            params.push(coerceSqlInput(val, tableCols.get(col)));
            return `$${params.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });

        let conflictSql = '';
        if (action === 'upsert') {
          const conflictCols = body.onConflict
            ? String(body.onConflict).split(',').map((c) => c.trim()).filter((c) => tableCols.has(c))
            : metadata.primaryKeys.get(table) || ['id'];
          const updateCols = insertCols.filter((c) => !conflictCols.includes(c));
          const conflictTarget = conflictCols.map(quoteIdent).join(', ');
          if (updateCols.length > 0) {
            const sets = updateCols.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ');
            conflictSql = `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${sets}`;
          } else {
            conflictSql = `ON CONFLICT (${conflictTarget}) DO NOTHING`;
          }
        }

        const returningSql = body.selectAfter ? 'RETURNING *' : '';
        const sql = `INSERT INTO public.${quoteIdent(table)} (${insertCols.map(quoteIdent).join(', ')}) VALUES ${valueTuples.join(', ')} ${conflictSql} ${returningSql}`;
        const res = await tx.query(sql, params);

        if (!body.selectAfter) {
          return { data: null, error: null };
        }
        let rows = normalizeQueryRows(res, tableCols);
        const afterSpec = parseSelectSpec(typeof body.selectAfter === 'string' ? body.selectAfter : '*');
        rows = await resolveRelationsForRows(tx, table, rows, afterSpec, metadata);
        if (body.singleMode === 'single' || body.singleMode === 'maybeSingle') {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }

      if (action === 'update') {
        const patch = body.values || {};
        const patchCols = Object.keys(patch).filter((c) => tableCols.has(c));
        if (patchCols.length === 0) {
          return { data: null, error: { message: 'Nenhuma coluna válida para atualização', code: '400' } };
        }

        const setParams = [];
        const setClauses = patchCols.map((col) => {
          setParams.push(coerceSqlInput(patch[col], tableCols.get(col)));
          return `${quoteIdent(col)} = $${setParams.length}`;
        });

        const { whereSql, params: whereParams } = buildWhereClause(body.filters, body.orFilters, tableCols);
        const shiftedWhereSql = whereSql.replace(/\$(\d+)/g, (_, num) => `$${Number(num) + setParams.length}`);
        const allParams = [...setParams, ...whereParams];
        const returningSql = body.selectAfter ? 'RETURNING *' : '';

        const res = await tx.query(
          `UPDATE public.${quoteIdent(table)} SET ${setClauses.join(', ')} ${shiftedWhereSql} ${returningSql}`,
          allParams
        );

        if (!body.selectAfter) {
          return { data: null, error: null };
        }
        let rows = normalizeQueryRows(res, tableCols);
        const afterSpec = parseSelectSpec(typeof body.selectAfter === 'string' ? body.selectAfter : '*');
        rows = await resolveRelationsForRows(tx, table, rows, afterSpec, metadata);
        if (body.singleMode === 'single' || body.singleMode === 'maybeSingle') {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }

      if (action === 'delete') {
        const { whereSql, params } = buildWhereClause(body.filters, body.orFilters, tableCols);
        const returningSql = body.selectAfter ? 'RETURNING *' : '';
        const res = await tx.query(`DELETE FROM public.${quoteIdent(table)} ${whereSql} ${returningSql}`, params);
        if (!body.selectAfter) {
          return { data: null, error: null };
        }
        const rows = normalizeQueryRows(res, tableCols);
        if (body.singleMode === 'single' || body.singleMode === 'maybeSingle') {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }

      return { data: null, error: { message: `Ação PostgREST inválida: ${action}`, code: '400' } };
    });
  } catch (err) {
    return {
      data: null,
      error: { message: err.message, code: err.code || 'P0001' }
    };
  }
}

async function executeRpc(e2eDb, metadata, claims, body) {
  const fnName = body?.fn;
  const args = body?.args && typeof body.args === 'object' ? body.args : {};
  const candidates = metadata.functions.get(fnName);
  if (!candidates || candidates.length === 0) {
    return { data: null, error: { message: `Função RPC não encontrada: ${fnName}`, code: '42883' } };
  }

  const argKeys = Object.keys(args);
  let selected = candidates[0];
  let bestScore = -1;
  for (const cand of candidates) {
    const paramNames = cand.proargnames || [];
    const matched = argKeys.filter((k) => paramNames.includes(k)).length;
    if (matched === argKeys.length && matched > bestScore) {
      bestScore = matched;
      selected = cand;
    }
  }

  const paramNames = selected.proargnames || [];
  const argTypes = selected.arg_types || [];
  const params = [];
  const namedCalls = [];

  for (const key of argKeys) {
    const idx = paramNames.indexOf(key);
    if (idx === -1 && paramNames.length > 0) continue;
    const paramType = idx >= 0 && argTypes[idx] ? argTypes[idx] : 'text';
    const rawVal = args[key];
    const encodedVal = rawVal === undefined
      ? null
      : (paramType === 'jsonb' || paramType === 'json') && typeof rawVal !== 'string'
        ? JSON.stringify(rawVal)
        : rawVal;
    params.push(encodedVal);
    namedCalls.push(`${quoteIdent(key)} => $${params.length}::${paramType}`);
  }

  const callSql = `${quoteIdent('public')}.${quoteIdent(fnName)}(${namedCalls.join(', ')})`;

  try {
    return await e2eDb.withJwtClaims(claims, async (tx) => {
      if (selected.proretset || String(selected.return_type).startsWith('TABLE') || String(selected.return_type) === 'record') {
        const res = await tx.query(`SELECT * FROM ${callSql}`, params);
        return { data: normalizeQueryRows(res), error: null };
      }

      if (selected.return_type === 'void') {
        await tx.query(`SELECT ${callSql}`, params);
        return { data: null, error: null };
      }

      const res = await tx.query(`SELECT ${callSql} AS result`, params);
      const rawResult = res.rows[0]?.result ?? null;
      const fieldMeta = res.fields?.[0];
      return { data: coerceResultValue(rawResult, fieldMeta?.dataTypeID, selected.return_type), error: null };
    });
  } catch (err) {
    return {
      data: null,
      error: { message: err.message, code: err.code || 'P0001' }
    };
  }
}

function buildSupabaseBrowserShimSource() {
  return `(function() {
  'use strict';

  var STORAGE_KEY = 'cafeteria_e2e_session';
  var listeners = [];
  var sharedEventSource = null;
  var channelRegistry = [];

  window.__CAFETERIA_E2E_CONFIG__ = {
    url: window.location.origin + '/e2e',
    anonKey: 'e2e-anon-key'
  };

  window.Chart = window.Chart || function() {
    return { destroy: function() {}, update: function() {}, data: { labels: [], datasets: [] } };
  };
  window.gtag = window.gtag || function() {};

  function readSession() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeSession(session) {
    try {
      if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function notifyAuth(event, session) {
    for (var i = 0; i < listeners.length; i += 1) {
      try { listeners[i](event, session); } catch (_) {}
    }
  }

  function ensureEventSource() {
    if (sharedEventSource) return sharedEventSource;
    sharedEventSource = new EventSource('/e2e/events');
    sharedEventSource.addEventListener('postgres_changes', function(ev) {
      var payload = null;
      try { payload = JSON.parse(ev.data); } catch (_) { return; }
      for (var i = 0; i < channelRegistry.length; i += 1) {
        channelRegistry[i]._dispatch(payload);
      }
    });
    return sharedEventSource;
  }

  async function apiPost(endpoint, payload) {
    var session = readSession();
    var headers = { 'Content-Type': 'application/json' };
    if (session && session.access_token) {
      headers.Authorization = 'Bearer ' + session.access_token;
    } else {
      headers.Authorization = 'Bearer e2e-anon-key';
    }
    var res = await window.fetch('/e2e/api' + endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload || {})
    });
    return res.json();
  }

  function QueryBuilder(table) {
    this._state = {
      table: table,
      action: 'select',
      columns: '*',
      selectOptions: null,
      selectAfter: null,
      values: null,
      onConflict: null,
      filters: [],
      orFilters: [],
      orderBy: [],
      limitVal: null,
      rangeFrom: null,
      rangeTo: null,
      singleMode: null
    };
  }

  QueryBuilder.prototype.select = function(cols, options) {
    if (this._state.action === 'insert' || this._state.action === 'update' || this._state.action === 'upsert' || this._state.action === 'delete') {
      this._state.selectAfter = cols || '*';
    } else {
      this._state.action = 'select';
      this._state.columns = cols || '*';
      this._state.selectOptions = options || null;
    }
    return this;
  };

  QueryBuilder.prototype.insert = function(values) {
    this._state.action = 'insert';
    this._state.values = values;
    return this;
  };

  QueryBuilder.prototype.upsert = function(values, options) {
    this._state.action = 'upsert';
    this._state.values = values;
    this._state.onConflict = options && options.onConflict ? options.onConflict : null;
    return this;
  };

  QueryBuilder.prototype.update = function(values) {
    this._state.action = 'update';
    this._state.values = values;
    return this;
  };

  QueryBuilder.prototype.delete = function() {
    this._state.action = 'delete';
    return this;
  };

  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'contains'].forEach(function(op) {
    QueryBuilder.prototype[op] = function(col, val) {
      this._state.filters.push({ col: col, op: op, val: val });
      return this;
    };
  });

  QueryBuilder.prototype.not = function(col, op, val) {
    this._state.filters.push({ col: col, op: 'not', val: { op: op, val: val } });
    return this;
  };

  QueryBuilder.prototype.or = function(expr) {
    if (expr) this._state.orFilters.push(expr);
    return this;
  };

  QueryBuilder.prototype.order = function(col, options) {
    var opts = options || {};
    this._state.orderBy.push({
      col: col,
      ascending: opts.ascending !== false,
      nullsFirst: opts.nullsFirst
    });
    return this;
  };

  QueryBuilder.prototype.limit = function(n) {
    this._state.limitVal = n;
    return this;
  };

  QueryBuilder.prototype.range = function(from, to) {
    this._state.rangeFrom = from;
    this._state.rangeTo = to;
    return this;
  };

  QueryBuilder.prototype.single = function() {
    this._state.singleMode = 'single';
    return this;
  };

  QueryBuilder.prototype.maybeSingle = function() {
    this._state.singleMode = 'maybeSingle';
    return this;
  };

  QueryBuilder.prototype._execute = function() {
    if (!this._promise) {
      this._promise = apiPost('/query', this._state);
    }
    return this._promise;
  };

  QueryBuilder.prototype.then = function(onFulfilled, onRejected) {
    return this._execute().then(onFulfilled, onRejected);
  };

  QueryBuilder.prototype.catch = function(onRejected) {
    return this._execute().catch(onRejected);
  };

  QueryBuilder.prototype.finally = function(onFinally) {
    return this._execute().finally(onFinally);
  };

  function RealtimeChannel(name) {
    this.name = name;
    this.handlers = [];
  }

  RealtimeChannel.prototype.on = function(type, filter, callback) {
    if (type === 'postgres_changes') {
      this.handlers.push({ filter: filter || {}, callback: callback });
    }
    return this;
  };

  RealtimeChannel.prototype.subscribe = function(statusCallback) {
    ensureEventSource();
    if (channelRegistry.indexOf(this) === -1) {
      channelRegistry.push(this);
    }
    if (typeof statusCallback === 'function') {
      setTimeout(function() { statusCallback('SUBSCRIBED'); }, 10);
    }
    return this;
  };

  RealtimeChannel.prototype.unsubscribe = function() {
    var idx = channelRegistry.indexOf(this);
    if (idx !== -1) channelRegistry.splice(idx, 1);
    return Promise.resolve('ok');
  };

  RealtimeChannel.prototype._dispatch = function(payload) {
    for (var i = 0; i < this.handlers.length; i += 1) {
      var h = this.handlers[i];
      var f = h.filter || {};
      if (f.table && f.table !== payload.table) continue;
      if (f.schema && f.schema !== payload.schema) continue;
      if (f.event && f.event !== '*' && String(f.event).toUpperCase() !== payload.eventType) continue;
      try { h.callback(payload); } catch (_) {}
    }
  };

  function createClient() {
    return {
      auth: {
        async signInWithPassword(creds) {
          var res = await apiPost('/auth', { action: 'signInWithPassword', email: creds && creds.email, password: creds && creds.password });
          if (!res.error && res.data && res.data.session) {
            writeSession(res.data.session);
            notifyAuth('SIGNED_IN', res.data.session);
          }
          return res;
        },
        async signOut() {
          writeSession(null);
          notifyAuth('SIGNED_OUT', null);
          return { error: null };
        },
        async getSession() {
          var session = readSession();
          return { data: { session: session }, error: null };
        },
        async getUser() {
          var session = readSession();
          if (!session) return { data: { user: null }, error: null };
          return apiPost('/auth', { action: 'getUser' });
        },
        onAuthStateChange(callback) {
          if (typeof callback === 'function') {
            listeners.push(callback);
            setTimeout(function() { callback('INITIAL_SESSION', readSession()); }, 0);
          }
          return {
            data: {
              subscription: {
                unsubscribe: function() {
                  var idx = listeners.indexOf(callback);
                  if (idx !== -1) listeners.splice(idx, 1);
                }
              }
            }
          };
        }
      },
      from: function(table) {
        return new QueryBuilder(table);
      },
      rpc: function(fn, args) {
        return apiPost('/rpc', { fn: fn, args: args || {} });
      },
      storage: {
        from: function(bucket) {
          return {
            upload: async function(filePath) {
              return { data: { path: filePath }, error: null };
            },
            getPublicUrl: function(filePath) {
              return { data: { publicUrl: window.location.origin + '/e2e/storage/' + bucket + '/' + filePath } };
            }
          };
        }
      },
      channel: function(name) {
        return new RealtimeChannel(name);
      },
      removeChannel: function(ch) {
        return ch ? ch.unsubscribe() : Promise.resolve('ok');
      },
      removeAllChannels: function() {
        channelRegistry.length = 0;
        return Promise.resolve([]);
      }
    };
  }

  window.supabase = { createClient: createClient };
})();
`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? Number(value) : value));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export function transformHtmlForE2E(html) {
  const expanded = expandHtmlPartials(String(html), WORKSPACE_ROOT);
  return expanded
    .replace(
      /<script[^>]*src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js[^"']*["'][^>]*><\/script>/gi,
      '<script src="/e2e/supabase-shim.js"></script>'
    )
    .replace(
      /<script[^>]*src=["']https:\/\/(?:cdn\.jsdelivr\.net|www\.googletagmanager\.com)[^"']*["'][^>]*><\/script>/gi,
      ''
    )
    .replace(
      /<link[^>]*href=["']https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|nyretgvzbnbtiyeioeju\.supabase\.co)[^"']*["'][^>]*>/gi,
      ''
    );
}

export async function startE2EServer(options = {}) {
  const port = Number(options.port ?? DEFAULT_PORT);
  const rootDir = path.resolve(options.rootDir || WORKSPACE_ROOT);
  const e2eDb = await createE2EDatabase(options.dbOptions);
  await ensureRealtimeOutbox(e2eDb);
  let metadata = await loadSchemaMetadata(e2eDb);

  const sseClients = new Set();

  async function drainAndBroadcastRealtime() {
    try {
      const { rows } = await e2eDb.query(`
        WITH drained AS (
          DELETE FROM _e2e.realtime_outbox
          RETURNING id, schema_name, table_name, event_type, old_row, new_row
        )
        SELECT id, schema_name, table_name, event_type, old_row, new_row
        FROM drained
        ORDER BY id ASC
      `);
      if (!rows || rows.length === 0) return;

      for (const ev of rows) {
        const payload = JSON.stringify({
          schema: ev.schema_name,
          table: ev.table_name,
          eventType: ev.event_type,
          old: ev.old_row || {},
          new: ev.new_row || {},
          commit_timestamp: new Date().toISOString()
        });
        for (const client of sseClients) {
          client.write(`event: postgres_changes\ndata: ${payload}\n\n`);
        }
      }
    } catch {
      // Silencioso caso o outbox seja reiniciado durante reset
    }
  }

  const heartbeat = setInterval(() => {
    for (const client of sseClients) {
      client.write(': ping\n\n');
    }
  }, 15000);
  if (typeof heartbeat.unref === 'function') {
    heartbeat.unref();
  }

  const shimSource = buildSupabaseBrowserShimSource();

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url, `http://127.0.0.1:${port}`);
      const pathname = decodeURIComponent(urlObj.pathname);

      if (req.method === 'GET' && pathname === '/e2e/health') {
        const appliedCount = await e2eDb.getAppliedMigrationsCount();
        return sendJson(res, 200, { ok: true, appliedMigrations: appliedCount });
      }

      if (req.method === 'GET' && pathname === '/e2e/supabase-shim.js') {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(shimSource);
        return;
      }

      if (req.method === 'GET' && pathname === '/e2e/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });
        res.write(': connected\n\n');
        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/e2e/api/reset') {
        await e2eDb.reset();
        await ensureRealtimeOutbox(e2eDb);
        metadata = await loadSchemaMetadata(e2eDb);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'POST' && pathname === '/e2e/api/auth') {
        const body = await readJsonBody(req);
        if (body.action === 'signInWithPassword') {
          const email = String(body.email || '').trim().toLowerCase();
          const password = String(body.password || '');
          const { rows } = await e2eDb.query(
            `SELECT id, email, raw_user_meta_data, (crypt($2, encrypted_password) = encrypted_password) AS ok
             FROM auth.users
             WHERE lower(email) = $1 AND deleted_at IS NULL
             LIMIT 1`,
            [email, password]
          );
          if (rows.length === 0 || !rows[0].ok) {
            return sendJson(res, 400, { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
          }
          const user = {
            id: rows[0].id,
            email: rows[0].email,
            user_metadata: rows[0].raw_user_meta_data || {},
            role: 'authenticated'
          };
          const session = {
            access_token: createJwtToken(user),
            token_type: 'bearer',
            expires_in: 86400,
            user
          };
          return sendJson(res, 200, { data: { user, session }, error: null });
        }

        if (body.action === 'getUser') {
          const claims = parseTokenClaims(req.headers.authorization);
          if (!claims.sub) {
            return sendJson(res, 200, { data: { user: null }, error: { message: 'Not authenticated' } });
          }
          const { rows } = await e2eDb.query('SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1 LIMIT 1', [claims.sub]);
          if (rows.length === 0) {
            return sendJson(res, 200, { data: { user: null }, error: { message: 'User not found' } });
          }
          return sendJson(res, 200, {
            data: { user: { id: rows[0].id, email: rows[0].email, user_metadata: rows[0].raw_user_meta_data || {} } },
            error: null
          });
        }

        return sendJson(res, 200, { data: null, error: null });
      }

      if (req.method === 'POST' && pathname === '/e2e/api/query') {
        const body = await readJsonBody(req);
        const claims = parseTokenClaims(req.headers.authorization);
        const result = await executePostgrestQuery(e2eDb, metadata, claims, body);
        if (body.action && body.action !== 'select') {
          await drainAndBroadcastRealtime();
        }
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && pathname === '/e2e/api/rpc') {
        const body = await readJsonBody(req);
        const claims = parseTokenClaims(req.headers.authorization);
        const result = await executeRpc(e2eDb, metadata, claims, body);
        await drainAndBroadcastRealtime();
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && pathname === '/e2e/api/sql') {
        const body = await readJsonBody(req);
        const resSql = await e2eDb.query(String(body.sql || ''), Array.isArray(body.params) ? body.params : []);
        await drainAndBroadcastRealtime();
        return sendJson(res, 200, { rows: normalizeQueryRows(resSql), error: null });
      }

      // Arquivos estáticos do projeto
      const relPath = pathname === '/' ? '/index.html' : pathname;
      const targetPath = path.resolve(rootDir, `.${relPath}`);
      if (targetPath !== rootDir && !targetPath.startsWith(`${rootDir}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      if (ext === '.html') {
        const html = transformHtmlForE2E(fs.readFileSync(targetPath, 'utf8'));
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext],
          'Cache-Control': 'no-store'
        });
        res.end(html);
        return;
      }

      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(targetPath).pipe(res);
    } catch (err) {
      sendJson(res, 500, { error: { message: err.message } });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    e2eDb,
    async close() {
      clearInterval(heartbeat);
      for (const client of sseClients) {
        client.end();
      }
      sseClients.clear();
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
      await e2eDb.close();
    }
  };
}

const isCliEntry = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCliEntry) {
  const srv = await startE2EServer();
  console.log(`[E2E Server] Pronto em ${srv.baseUrl}`);

  const shutdown = async () => {
    await srv.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
