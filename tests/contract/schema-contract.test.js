import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractAllDbCalls } from './extract-db-calls.js';

describe('CAF-000086 — Teste de Contrato Front ↔ Schema do Supabase', () => {
  const snapshotPath = path.resolve(process.cwd(), 'tests/fixtures/schema-snapshot.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  const { rpcCalls, fromCalls } = extractAllDbCalls('js');

  it('deve extrair chamadas de banco de js/ sem erros', () => {
    expect(rpcCalls.length).toBeGreaterThan(0);
    expect(fromCalls.length).toBeGreaterThan(0);
  });

  it('toda RPC chamada no front deve existir no catálogo do Supabase', () => {
    const knownRpcs = new Set(Object.keys(snapshot.rpcs || {}));
    const missing = rpcCalls.filter(c => !knownRpcs.has(c.fnName));
    expect(missing, `RPCs não encontradas no snapshot: ${JSON.stringify(missing)}`).toHaveLength(0);
  });

  it('[CAF-000073] fechar_conta_mesa deve aceitar apenas os parâmetros esperados pelo schema', () => {
    const call = rpcCalls.find(c => c.fnName === 'fechar_conta_mesa');
    expect(call).toBeDefined();
    expect(call.params).not.toContain('p_subtotal');
    expect(call.params).toContain('p_desconto_manual');
    expect(call.params).toContain('p_idempotency_key');
  });

  it('[CAF-000078] despesas não deve chamar colunas fora do schema (valor_total, status, data_pagamento)', () => {
    const finAdminCode = fs.readFileSync(path.resolve(process.cwd(), 'js/admin/financeiro-admin.js'), 'utf-8');
    expect(finAdminCode).not.toMatch(/valor_total/);
    expect(finAdminCode).not.toMatch(/data_pagamento/);
    expect(finAdminCode).not.toMatch(/\.status\b/);
  });

  it('todas as tabelas chamadas em .from() devem existir no schema ou estarem explicitamente mapeadas', () => {
    const knownTables = new Set(Object.keys(snapshot.tables || {}));
    // Views ou tabelas adicionais permitidas
    const allowed = new Set([
      ...knownTables,
      'categorias',
      'adicionais',
      'fechamentos_caixa',
      'caixa_movimentos',
      'caixa_sessoes',
      'pedido_itens',
      'pedido_item_sabores',
      'pedido_item_adicionais',
      'produto_adicionais_permitidos',
      'fichas_tecnicas',
      'ficha_tecnica_itens',
      'avaliacoes_atendimento',
      'v_cliente_saldo',
      'perfis'
    ]);

    const unknown = fromCalls.filter(c => !allowed.has(c.tableName));
    expect(unknown, `Tabelas desconhecidas em .from(): ${JSON.stringify(unknown)}`).toHaveLength(0);
  });
});
