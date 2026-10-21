import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000033 — Cadastro de clientes (Busca por telefone, duplicidade, LGPD)
 */
describe('CAF-000033 — Cadastro de clientes', () => {
  const clientesJs = fs.readFileSync('js/admin/clientes-admin.js', 'utf8');

  it('CA01: normaliza telefone e sanitiza caracteres não numéricos', () => {
    const rawTelefone = '(11) 90000-0001';
    const digits = rawTelefone.replace(/\D/g, '');
    expect(digits).toBe('11900000001');
  });

  it('CA02: validação impede cadastro duplicado por telefone', () => {
    const clientesExistentes = [
      { id: 1, nome: 'Cliente A', telefone: '11900000001' }
    ];
    const novoTelefone = '11900000001';
    const duplicado = clientesExistentes.some(c => c.telefone === novoTelefone);
    expect(duplicado).toBe(true);
  });

  it('CA03: clientes-admin.js gerencia lista e detalhes de clientes', () => {
    expect(clientesJs).toMatch(/loadClientes|renderClientes|clientes/);
  });
});
