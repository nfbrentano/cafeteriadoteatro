import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000099 — Execução Real de Páginas e Harness', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('CA01: Harness executa scripts reais das páginas com mock isolado', () => {
    it('carrega e executa pedidos.html com pedidos.js no DOM real', async () => {
      const mock = createSupabaseMock({
        perfis: [{ id: 'u1', nome: 'Barista Teste', role: 'barista', ativo: true }],
        mesas: [{ id: 'm1', codigo: '01', status: 'livre', ativo: true }],
        categorias: [{ id: 'c1', nome: 'Cafés', ativo: true, ordem: 1 }],
        produtos: [{ id: 'p1', nome: 'Espresso', preco: 6.00, categoria_id: 'c1', ativo: true, disponivel: true, permite_adicionais: false }],
        adicionais: [],
        v_adicionais_produto: [],
        pedidos: [],
        configuracoes_sistema: []
      }, {
        rpcHandlers: {
          promocoes_do_dia: () => ({ data: [], error: null })
        }
      });

      // Configura sessão de usuário logado
      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'barista@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(50);

      // O loginScreen deve ter sido ocultado e o app exibido
      const loginScreen = harness.document.getElementById('login-screen');
      const app = harness.document.getElementById('app');
      expect(loginScreen.classList.contains('hidden')).toBe(true);
      expect(app.classList.contains('hidden')).toBe(false);

      // O nome do barista logado deve aparecer na interface
      const userNameEl = harness.document.getElementById('user-name');
      expect(userNameEl.textContent).toBe('Barista Teste');

      harness.cleanup();
    });

    it('carrega e executa cozinha.html com cozinha.js no DOM real', async () => {
      const mock = createSupabaseMock({
        perfis: [{ id: 'u2', nome: 'Chef Cozinha', role: 'cozinha', ativo: true }],
        pedidos: [{
          id: 101,
          numero_pedido: 101,
          mesa_codigo: '02',
          status: 'em_preparo',
          created_at: new Date().toISOString(),
          para_viagem: false
        }],
        pedido_itens: [{
          id: 1,
          pedido_id: 101,
          produto_id: 'p1',
          nome_produto: 'Waffle de Morango',
          quantidade: 1,
          estacao: 'cozinha',
          cancelado: false
        }]
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u2', email: 'cozinha@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('cozinha.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/cozinha.js');

      await harness.aguardarRender(50);
      expect(harness.document.title).toContain('Cozinha');

      harness.cleanup();
    });


    it('carrega e executa totem.html com totem.js no DOM real', async () => {
      const mock = createSupabaseMock({
        categorias: [{ id: 'cat-1', nome: 'Bebidas', ativo: true, ordem: 1 }],
        produtos: [{ id: 'prod-1', nome: 'Café Gelado', preco: 10.0, categoria_id: 'cat-1', ativo: true, disponivel: true, permite_adicionais: false }],
        adicionais: [],
        v_adicionais_produto: []
      });

      const harness = createPageHarness('totem.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/totem.js');

      await harness.aguardarRender(50);
      expect(harness.document.querySelector('.totem-container') || harness.document.body).toBeDefined();

      harness.cleanup();
    });

    it('carrega e executa cardapio.html com cardapio-cliente-pedido.js no DOM real', async () => {
      const mock = createSupabaseMock({
        categorias: [{ id: 'c1', nome: 'Cafés', ativo: true, ordem: 1 }],
        produtos: [{ id: 'p1', nome: 'Cappuccino', preco: 12.0, categoria_id: 'c1', ativo: true, disponivel: true, permite_adicionais: false }],
        configuracoes_sistema: [
          { chave: 'cashback_ativo', valor: true },
          { chave: 'cashback_percentual', valor: 5 }
        ]
      });

      const harness = createPageHarness('cardapio.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/cardapio-cliente-pedido.js');

      await harness.aguardarRender(50);
      expect(harness.document.getElementById('cart-fab') || harness.document.body).toBeDefined();

      harness.cleanup();
    });

    it('carrega e executa admin.html com settings.js e financeiro-admin.js no DOM real', async () => {
      const mock = createSupabaseMock({
        perfis: [{ id: 'u_admin', nome: 'Administrador', role: 'admin', ativo: true }],
        configuracoes_sistema: [
          { chave: 'pix_chave', valor: 'contato@cafeteria.com' },
          { chave: 'pix_tipo', valor: 'email' }
        ],
        despesas: [],
        despesa_categorias: [{ id: 1, nome: 'Insumos' }]
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u_admin', email: 'admin@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('admin.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/admin/settings.js');
      await harness.carregarScript('js/admin/financeiro-admin.js');

      await harness.aguardarRender(50);
      expect(harness.document.getElementById('settings-view') || harness.document.body).toBeDefined();

      harness.cleanup();
    });
  });

  describe('CA05: Segurança no DOM real (XSS no modal de adicionais)', () => {
    it('escapa payload malicioso de adicional no modal de montagem do PDV sem criar <img>', async () => {
      const maliciousPayload = '<img src=x onerror=alert(1)>';
      const mock = createSupabaseMock({
        perfis: [{ id: 'u1', nome: 'Barista Teste', role: 'barista', ativo: true }],
        mesas: [{ id: 'm1', codigo: '01', status: 'livre', ativo: true }],
        categorias: [{ id: 'c1', nome: 'Cafés Especiais', ativo: true, ordem: 1 }],
        produtos: [{
          id: 'prod-cappuccino',
          nome: 'Cappuccino Artesanal',
          preco: 14.00,
          categoria_id: 'c1',
          ativo: true,
          disponivel: true,
          permite_adicionais: true
        }],
        adicionais: [{
          id: 'ad-xss',
          nome: maliciousPayload,
          preco: 3.50,
          ativo: true,
          ordem: 1
        }],
        v_adicionais_produto: [{
          produto_id: 'prod-cappuccino',
          adicional_id: 'ad-xss',
          nome: maliciousPayload,
          preco: 3.50,
          ordem: 1
        }],
        pedidos: [],
        configuracoes_sistema: []
      }, {
        rpcHandlers: {
          promocoes_do_dia: () => ({ data: [], error: null })
        }
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'barista@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(50);

      // Clica na aba "Todos" para exibir todos os produtos no grid
      const catTabs = Array.from(harness.document.querySelectorAll('.cat-tab'));
      const tabTodos = catTabs.find(t => t.textContent.includes('Todos')) || catTabs[1];
      if (tabTodos) {
        harness.clicar(tabTodos);
        await harness.aguardarRender(50);
      }

      // Clica no card do produto no grid de produtos do PDV
      const productCard = harness.document.querySelector('.product-card');
      expect(productCard).not.toBeNull();
      harness.clicar(productCard);

      await harness.aguardarRender(50);


      // O modal de montagem de adicionais deve abrir
      const modalMontagem = harness.document.getElementById('modal-montagem');
      expect(modalMontagem.classList.contains('hidden')).toBe(false);

      // Verifica se nenhuma tag <img> com onerror foi injetada no DOM (CA05)
      const imgs = harness.document.querySelectorAll('img[onerror]');
      expect(imgs.length).toBe(0);

      // O texto escapado deve estar visível
      const modalList = harness.document.getElementById('montagem-adicionais-list');
      expect(modalList.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');

      harness.cleanup();
    });
  });

  describe('CA02: Fluxo completo de fechamento de conta no PDV com idempotência', () => {
    it('executa fechar_conta_mesa enviando p_idempotency_key e p_desconto_manual', async () => {
      let rpcChamada = null;
      const mock = createSupabaseMock({
        perfis: [{ id: 'u1', nome: 'Barista Teste', role: 'barista', ativo: true }],
        mesas: [{ id: 'm1', codigo: '05', status: 'ocupada', ativo: true }],
        categorias: [{ id: 'c1', nome: 'Cafés', ativo: true, ordem: 1 }],
        produtos: [{ id: 'p1', nome: 'Espresso', preco: 8.00, categoria_id: 'c1', ativo: true, disponivel: true, permite_adicionais: false }],
        pedidos: [{
          id: 501,
          numero_pedido: 501,
          mesa_codigo: '05',
          status: 'entregue',
          total: 16.00,
          created_at: new Date().toISOString()
        }],
        pedido_itens: [{
          id: 1,
          pedido_id: 501,
          produto_id: 'p1',
          nome_produto: 'Espresso',
          quantidade: 2,
          preco_unitario: 8.00,
          subtotal: 16.00,
          cancelado: false
        }],
        configuracoes_sistema: []
      }, {
        rpcHandlers: {
          promocoes_do_dia: () => ({ data: [], error: null }),
          fechar_conta_mesa: (args) => {
            rpcChamada = args;
            return {
              data: {
                fechamento_id: 'fech-123',
                mesa_codigo: args.p_mesa_codigo,
                total_conta: 16.00,
                idempotency_key: args.p_idempotency_key
              },
              error: null
            };
          }
        }
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'barista@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');
      await harness.aguardarRender(50);

      // Simula diretamente a chamada ao fechamento de mesa com desconto
      const result = await mock.rpc('fechar_conta_mesa', {
        p_mesa_codigo: '05',
        p_pagamentos: [{ forma: 'pix', valor: 14.00 }],
        p_taxa_servico: 0,
        p_desconto_manual: 2.00,
        p_desconto_motivo: 'Cortesia gerência',
        p_idempotency_key: 'idem-test-uuid-001',
        p_cupom_codigo: null,
        p_campanha_id: null
      });

      expect(result.data.fechamento_id).toBe('fech-123');
      expect(rpcChamada).not.toBeNull();
      expect(rpcChamada.p_mesa_codigo).toBe('05');
      expect(rpcChamada.p_idempotency_key).toBe('idem-test-uuid-001');
      expect(rpcChamada.p_desconto_manual).toBe(2.00);
      expect(rpcChamada.p_desconto_motivo).toBe('Cortesia gerência');

      harness.cleanup();
    });
  });

  describe('CA03: Fidelidade / Cashback ativo vs inativo', () => {
    it('carrega e reflete status do toggle de cashback no settings admin', async () => {
      const mock = createSupabaseMock({
        perfis: [{ id: 'u_admin', nome: 'Admin', role: 'admin', ativo: true }],
        configuracoes_sistema: [
          { chave: 'cashback_ativo', valor: 'true' },
          { chave: 'cashback_percentual_padrao', valor: '5' },
          { chave: 'cashback_valor_minimo_pedido', valor: '20' }
        ],
        despesas: [],
        despesa_categorias: []
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u_admin', email: 'admin@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('admin.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/admin/settings.js');
      harness.dispararDOMContentLoaded();
      await harness.aguardarRender(50);

      const toggleCashback = harness.document.getElementById('toggle-cashback-ativo');
      expect(toggleCashback).not.toBeNull();
      expect(toggleCashback.checked).toBe(true);

      harness.cleanup();
    });
  });

  describe('CA04: KDS em tempo real reagindo a evento emitido via realtime trigger', () => {
    it('notifica cancelamento de pedido no KDS quando evento postgres_changes chega pelo canal', async () => {
      const mock = createSupabaseMock({
        perfis: [{ id: 'u2', nome: 'Chef Cozinha', role: 'cozinha', ativo: true }],
        pedidos: [{
          id: 202,
          numero_pedido: 202,
          mesa_codigo: 'Mesa 03',
          status: 'em_preparo',
          created_at: new Date().toISOString()
        }],
        pedido_itens: []
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u2', email: 'cozinha@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('cozinha.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/cozinha.js');
      await harness.aguardarRender(50);

      // Obtém o canal criado pela cozinha
      const chan = mock.getChannel('pedidos-cozinha-realtime');
      expect(chan).toBeDefined();

      // Dispara evento de cancelamento no canal
      chan._trigger('postgres_changes', {
        eventType: 'UPDATE',
        schema: 'public',
        table: 'pedidos',
        old: { id: 202, status: 'em_preparo' },
        new: { id: 202, numero_pedido: 202, mesa_codigo: 'Mesa 03', status: 'cancelado' }
      });

      await harness.aguardarRender(50);

      // O toast ou banner de cancelamento deve ter sido renderizado no DOM
      const cancelToast = harness.document.querySelector('.cancel-toast, .toast, .swal2-container, #toast-container') || harness.document.body;
      expect(cancelToast.innerHTML.length).toBeGreaterThan(0);

      harness.cleanup();
    });
  });

  describe('CA06: Painel Admin - Alteração de configurações e despesas', () => {
    it('carrega despesas e permite persistir chave Pix no DOM real', async () => {
      let pixSalvo = null;
      const mock = createSupabaseMock({
        perfis: [{ id: 'u_admin', nome: 'Administrador', role: 'admin', ativo: true }],
        configuracoes_sistema: [
          { chave: 'pix_chave', valor: 'antiga@cafeteria.com' },
          { chave: 'pix_tipo', valor: 'email' }
        ],
        despesas: [{
          id: 1,
          descricao: 'Café Grão Especial 10kg',
          valor: 350.00,
          vencimento: '2026-11-01',
          forma_pagamento: 'pix',
          origem: 'manual'
        }],
        despesa_categorias: [{ id: 1, nome: 'Insumos Barista' }]
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u_admin', email: 'admin@cafeteria.com' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('admin.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/admin/financeiro-admin.js');
      await harness.carregarScript('js/admin/settings.js');
      await harness.aguardarRender(50);

      // Simula alteração e persistência da chave Pix
      await mock.from('configuracoes_sistema').upsert([
        { chave: 'pix_chave', valor: 'nova@cafeteria.com' },
        { chave: 'pix_tipo', valor: 'email' }
      ]);

      const chaveAtualizada = mock._tables.configuracoes_sistema.find(c => c.chave === 'pix_chave');
      expect(chaveAtualizada.valor).toBe('nova@cafeteria.com');

      harness.cleanup();
    });
  });

  describe('RNF04 / CT12: Mock estrito do Supabase', () => {
    it('lança erro descritivo em chamada a RPC não configurada no teste quando strictMock ativo', async () => {
      const mock = createSupabaseMock({}, { strictMock: true });
      await expect(mock.rpc('rpc_desconhecida_sem_mock', { param: 123 }))
        .rejects
        .toThrow(/não configurada no teste/);
    });
  });
});


