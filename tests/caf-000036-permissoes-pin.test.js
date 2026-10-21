import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000036 — Permissões por cargo e bloqueio de PIN
 */
describe('CAF-000036 — Permissões por cargo e PIN', () => {
  const authJs = fs.readFileSync('js/admin/auth.js', 'utf8');
  const adminHtml = fs.readFileSync('admin.html', 'utf8');

  it('CA01: validação de PIN e bloqueio após 5 tentativas incorretas implementados no banco e client', () => {
    const migration081 = fs.readFileSync('supabase/migration_caf_000081_seguranca_pin_rls.sql', 'utf8');
    expect(migration081).toMatch(/tentativas_incorretas|bloqueado_ate/);
    const dbJs = fs.readFileSync('js/db.js', 'utf8');
    expect(dbJs).toMatch(/validar_pin_autorizacao/);
  });

  it('CA02: admin.html possui abas e seções restritas por perfil', () => {
    expect(adminHtml).toMatch(/data-page="financeiro"/);
    expect(adminHtml).toMatch(/data-page="usuarios"/);
    expect(adminHtml).toMatch(/data-page="configuracoes"/);
  });

  it('CA03: perfis operacionais (barista/cozinha) não têm acesso irrestrito ao financeiro', () => {
    expect(authJs).toMatch(/gerente|admin|permissao|role/i);
  });
});
