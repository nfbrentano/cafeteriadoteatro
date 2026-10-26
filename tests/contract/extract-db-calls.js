import fs from 'fs';
import path from 'path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/**
 * Static extractor for Supabase calls (.rpc and .from) with column usage using AST (acorn).
 */
export function extractDbCallsFromFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true
    });
  } catch (errMod) {
    try {
      ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        locations: true
      });
    } catch (errScript) {
      throw new Error(`[ParseError] ${filePath}:${errScript.loc?.line || 1} - Falha ao analisar sintaxe JS: ${errScript.message}`);
    }
  }

  const rpcCalls = [];
  const fromCalls = [];

  function parseSelectColumns(selectStr) {
    if (!selectStr || typeof selectStr !== 'string') return [];
    // Remove quebras de linha e comentários
    const clean = selectStr.replace(/\s+/g, ' ').trim();
    const cols = [];
    // Divide por vírgula respeitando parênteses de relações
    let depth = 0;
    let current = '';
    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        if (current.trim()) cols.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) cols.push(current.trim());

    // Para cada item, se não for embed (sem ':'), extrai o nome simples da coluna
    return cols
      .map(c => {
        // Ignora embeds do tipo 'perfis:user_id(*)' ou 'pedido_itens(*)'
        if (c.includes(':') || c.includes('(')) return null;
        if (c === '*') return null;
        return c.split(/\s+/)[0].trim();
      })
      .filter(Boolean);
  }

  walk.ancestor(ast, {
    CallExpression(node, ancestors) {
      const line = node.loc ? node.loc.start.line : 1;

      // 1. Detectar .rpc('name', { params })
      if (
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property &&
        node.callee.property.name === 'rpc' &&
        node.arguments.length >= 1
      ) {
        const fnNameArg = node.arguments[0];
        let fnName = null;
        if (fnNameArg.type === 'Literal') {
          fnName = fnNameArg.value;
        }

        const params = [];
        if (node.arguments.length >= 2 && node.arguments[1].type === 'ObjectExpression') {
          node.arguments[1].properties.forEach(prop => {
            if (prop.key) {
              params.push(prop.key.name || prop.key.value);
            }
          });
        }

        if (fnName) {
          rpcCalls.push({
            file: filePath,
            line,
            fnName,
            params
          });
        }
      }

      // 2. Detectar .from('table')
      if (
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property &&
        node.callee.property.name === 'from' &&
        node.arguments.length >= 1
      ) {
        // Ignora chamadas a storage: supabase.storage.from('bucket')
        const obj = node.callee.object;
        const isStorage = obj && (
          (obj.type === 'MemberExpression' && obj.property && obj.property.name === 'storage') ||
          (obj.type === 'Identifier' && obj.name === 'storage')
        );
        if (isStorage) {
          return;
        }

        const tableArg = node.arguments[0];
        let tableName = null;
        if (tableArg.type === 'Literal') {
          tableName = tableArg.value;
        }

        if (tableName) {
          const columnsReferenced = [];

          // Analisa chamadas encadeadas nos ancestrais imediatos (.select, .insert, .update, .eq, .order)
          const parentChain = ancestors.filter(a => a.type === 'CallExpression');
          for (const call of parentChain) {
            if (call.callee && call.callee.type === 'MemberExpression' && call.callee.property) {
              const methodName = call.callee.property.name;

              // .select('col1, col2')
              if (methodName === 'select' && call.arguments.length >= 1 && call.arguments[0].type === 'Literal') {
                columnsReferenced.push(...parseSelectColumns(call.arguments[0].value));
              }

              // .insert({ col1: val }) ou .insert([{ col1: val }])
              if ((methodName === 'insert' || methodName === 'upsert' || methodName === 'update') && call.arguments.length >= 1) {
                const arg = call.arguments[0];
                if (arg.type === 'ObjectExpression') {
                  arg.properties.forEach(p => {
                    if (p.key) columnsReferenced.push(p.key.name || p.key.value);
                  });
                } else if (arg.type === 'ArrayExpression') {
                  arg.elements.forEach(el => {
                    if (el && el.type === 'ObjectExpression') {
                      el.properties.forEach(p => {
                        if (p.key) columnsReferenced.push(p.key.name || p.key.value);
                      });
                    }
                  });
                }
              }

              // .eq('col', val) ou .order('col')
              if ((methodName === 'eq' || methodName === 'order') && call.arguments.length >= 1 && call.arguments[0].type === 'Literal') {
                columnsReferenced.push(call.arguments[0].value);
              }
            }
          }

          fromCalls.push({
            file: filePath,
            line,
            tableName,
            columns: [...new Set(columnsReferenced)]
          });
        }
      }
    }
  });

  return { rpcCalls, fromCalls };
}

export function extractAllDbCalls(dir = 'js') {
  const results = { rpcCalls: [], fromCalls: [] };

  function scanDir(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'libs' && entry.name !== 'vendor') {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const { rpcCalls, fromCalls } = extractDbCallsFromFile(fullPath);
        results.rpcCalls.push(...rpcCalls);
        results.fromCalls.push(...fromCalls);
      }
    }
  }

  scanDir(dir);
  return results;
}
