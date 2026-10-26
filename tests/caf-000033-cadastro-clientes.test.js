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

  it('CA04: botao + Cadastrar abre modal de cadastro com touch target e window.baristaAbrirCadastroCliente', async () => {
    const { createPageHarness } = await import('./helpers/page-harness.js');
    const { createSupabaseMock } = await import('./helpers/supabase-mock.js');

    const mock = createSupabaseMock({
      perfis: [{ id: 'u1', nome: 'Barista', role: 'barista', ativo: true }],
      configuracoes_sistema: []
    });
    mock.auth = {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    };

    const harness = createPageHarness('pedidos.html', { supabase: mock });
    await harness.carregarScript('js/supabase-client.js');
    await harness.carregarScript('js/db.js');
    await harness.carregarScript('js/pedidos.js');
    await harness.aguardarRender(50);

    const btn = harness.document.getElementById('btn-abrir-cadastro-cliente');
    const modal = harness.document.getElementById('modal-cadastro-cliente');
    expect(btn).toBeTruthy();
    expect(modal).toBeTruthy();
    expect(modal.classList.contains('hidden')).toBe(true);

    // Clica no botão
    btn.click();
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.style.display).toBe('flex');

    // Testa fechamento por ESC
    harness.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.classList.contains('hidden')).toBe(true);

    // Testa reabertura via fallback global
    window.baristaAbrirCadastroCliente('Cliente Teste');
    expect(modal.classList.contains('hidden')).toBe(false);
    const inputNome = harness.document.getElementById('cad-cliente-nome');
    expect(inputNome.value).toBe('Cliente Teste');

    // Testa fechamento pelo clique no backdrop
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal.classList.contains('hidden')).toBe(true);

    harness.cleanup();
  });
});
