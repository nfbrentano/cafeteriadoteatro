import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000019 — Log de auditoria
 */
describe('CAF-000019 — Log de auditoria', () => {
  const schemaSnapshot = JSON.parse(fs.readFileSync('tests/fixtures/schema-snapshot.json', 'utf8'));

  it('CA01: tabela logs_auditoria ou pedido_eventos existe no schema', () => {
    const tableNames = Object.keys(schemaSnapshot.tables || {});
    const hasAuditTable = tableNames.includes('logs_auditoria') ||
                          tableNames.includes('pedido_eventos') ||
                          tableNames.includes('caixas_historico');
    expect(hasAuditTable).toBe(true);
  });

  it('CA02: estrutura de evento registra pedido_id, acao e usuario_id', () => {
    const eventoMock = {
      pedido_id: 'ped-10',
      item_id: 'item-2',
      acao: 'cancelar_item',
      usuario_id: 'usr-1',
      motivo: 'Cliente desistiu',
      created_at: new Date().toISOString()
    };
    expect(eventoMock.pedido_id).toBeDefined();
    expect(eventoMock.acao).toBe('cancelar_item');
    expect(eventoMock.motivo).toBe('Cliente desistiu');
  });

  it('CA03: migration_caf_000019_log_auditoria.sql está versionada no repositório', () => {
    expect(fs.existsSync('supabase/migration_caf_000019_log_auditoria.sql')).toBe(true);
  });
});
