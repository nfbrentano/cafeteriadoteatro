import fs from 'fs';
import path from 'path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/**
 * Static extractor for Supabase calls (.rpc and .from) using AST (acorn).
 */
export function extractDbCallsFromFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module'
    });
  } catch {
    try {
      ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'script'
      });
    } catch {
      return { rpcCalls: [], fromCalls: [] };
    }
  }

  const rpcCalls = [];
  const fromCalls = [];

  walk.simple(ast, {
    CallExpression(node) {
      // Check .rpc('name', { params })
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
            line: node.loc ? node.loc.start.line : 1,
            fnName,
            params
          });
        }
      }

      // Check .from('table')
      if (
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property &&
        node.callee.property.name === 'from' &&
        node.arguments.length >= 1
      ) {
        const tableArg = node.arguments[0];
        let tableName = null;
        if (tableArg.type === 'Literal') {
          tableName = tableArg.value;
        }
        if (tableName) {
          fromCalls.push({
            file: filePath,
            line: node.loc ? node.loc.start.line : 1,
            tableName
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
