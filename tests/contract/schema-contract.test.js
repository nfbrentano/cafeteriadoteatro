import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractAllDbCalls } from './extract-db-calls.js';

describe('CAF-000086 / CAF-000099 — Teste de Contrato Front ↔ Schema do Supabase', () => {
  const snapshotPath = path.resolve(process.cwd(), 'tests/fixtures/schema-snapshot.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  const { rpcCalls, fromCalls } = extractAllDbCalls('js');

  it('deve extrair chamadas de banco de js/ com locations (arquivo:linha) sem erros de parse', () => {
    expect(rpcCalls.length).toBeGreaterThan(0);
    expect(fromCalls.length).toBeGreaterThan(0);

    // Valida que todas as chamadas contêm linha e arquivo
    for (const call of [...rpcCalls, ...fromCalls]) {
      expect(call.file).toBeDefined();
      expect(typeof call.line).toBe('number');
      expect(call.line).toBeGreaterThan(0);
    }
  });

  it('toda RPC chamada no front deve existir no catálogo de produção', () => {
    const knownRpcs = new Set(Object.keys(snapshot.rpcs || {}));
    const missing = rpcCalls
      .filter(c => !knownRpcs.has(c.fnName))
      .map(c => `${path.basename(c.file)}:${c.line} -> RPC "${c.fnName}" inexistente`);
    expect(missing, `RPCs não encontradas no snapshot de produção: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('todos os parâmetros enviados a RPCs devem bater com a assinatura única do banco (sem parâmetros fantasmas)', () => {
    const divergencias = [];

    for (const call of rpcCalls) {
      const rpcDef = snapshot.rpcs?.[call.fnName];
      if (!rpcDef) continue;
      const allowedParams = new Set(rpcDef.parameters || []);

      for (const param of call.params) {
        if (!allowedParams.has(param)) {
          divergencias.push(`${path.basename(call.file)}:${call.line} -> RPC "${call.fnName}" recebeu parâmetro inválido "${param}". Parâmetros válidos: [${(rpcDef.parameters || []).join(', ')}]`);
        }
      }
    }

    expect(divergencias, `Parâmetros divergentes em chamadas RPC: \n${divergencias.join('\n')}`).toHaveLength(0);
  });

  it('todas as tabelas e views chamadas em .from() devem existir no schema real (sem allowlist manual)', () => {
    const knownTables = new Set(Object.keys(snapshot.tables || {}));
    const unknown = fromCalls
      .filter(c => !knownTables.has(c.tableName))
      .map(c => `${path.basename(c.file)}:${c.line} -> tabela/view "${c.tableName}" não encontrada`);

    expect(unknown, `Tabelas desconhecidas em .from(): \n${unknown.join('\n')}`).toHaveLength(0);
  });

  it('colunas enviadas em .insert(), .update(), .eq() e .order() devem existir nas tabelas do schema real', () => {
    const divergencias = [];

    for (const call of fromCalls) {
      const tableDef = snapshot.tables?.[call.tableName];
      if (!tableDef || !tableDef.columns || tableDef.columns.length === 0) continue;
      const knownCols = new Set(tableDef.columns);

      for (const col of (call.columns || [])) {
        // Ignora identificadores especiais, contadores ou relacionamentos aninhados
        if (col === '*' || col.includes('.') || col.startsWith('$')) continue;
        if (!knownCols.has(col)) {
          divergencias.push(`${path.basename(call.file)}:${call.line} -> coluna "${col}" não existe na tabela "${call.tableName}". Colunas válidas: [${tableDef.columns.slice(0, 10).join(', ')}...]`);
        }
      }
    }

    expect(divergencias, `Colunas inexistentes referenciadas no front: \n${divergencias.join('\n')}`).toHaveLength(0);
  });

  it('[Sentinela CT01]: fechar_conta_mesa rejeita p_subtotal e exige p_idempotency_key e p_desconto_manual', () => {
    const rpcDef = snapshot.rpcs?.['fechar_conta_mesa'];
    expect(rpcDef).toBeDefined();
    expect(rpcDef.parameters).not.toContain('p_subtotal');
    expect(rpcDef.parameters).toContain('p_desconto_manual');
    expect(rpcDef.parameters).toContain('p_idempotency_key');
  });

  it('[Sentinela CT04]: despesas não referencia valor_total no schema real de produção', () => {
    const despesasCols = snapshot.tables?.['despesas']?.columns || [];
    expect(despesasCols).toContain('valor');
    expect(despesasCols).toContain('documento');
    expect(despesasCols).not.toContain('valor_total');
  });
});
