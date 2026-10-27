import { vi } from 'vitest';
import { createPageHarness } from './page-harness.js';
import { createSupabaseMock } from './supabase-mock.js';
import 'fake-indexeddb/auto';

/**
 * Helper para testes funcionais do PDV (pedidos.html + js/pedidos.js)
 * CAF-000102 — Interage exclusivamente via DOM e window.*
 */

export function getDefaultMockData(overrides = {}) {
  return {
    perfis: [
      {
        id: 'u1',
        nome: 'Operador Teste',
        role: 'barista',
        permissions: ['pdv.vender', 'pdv.desconto', 'pdv.cancelar', 'pdv.transferir'],
        ativo: true
      }
    ],
    mesas: [
      { id: 'm1', codigo: '01', status: 'livre', ativo: true },
      { id: 'm2', codigo: '02', status: 'ocupada', ativo: true },
      { id: 'm3', codigo: '03', status: 'livre', ativo: true }
    ],
    categorias: [
      { id: 'c1', nome: 'Cafés', ativo: true, ordem: 1 },
      { id: 'c2', nome: 'Doces', ativo: true, ordem: 2 }
    ],
    produtos: [
      {
        id: 'p1',
        nome: 'Espresso',
        descricao: 'Café puro',
        preco: 8.0,
        categoria_id: 'c1',
        ativo: true,
        disponivel: true,
        permite_adicionais: false
      },
      {
        id: 'p2',
        nome: 'Cappuccino',
        descricao: 'Com leite vaporizado',
        preco: 14.0,
        categoria_id: 'c1',
        ativo: true,
        disponivel: true,
        permite_adicionais: true
      },
      {
        id: 'p3',
        nome: 'Croissant Esgotado',
        descricao: 'Folhado francês',
        preco: 12.0,
        categoria_id: 'c2',
        ativo: true,
        disponivel: false,
        permite_adicionais: false
      }
    ],
    adicionais: [
      { id: 'ad1', nome: 'Chantilly', preco: 3.5, ativo: true }
    ],
    v_adicionais_produto: [
      { produto_id: 'p2', adicional_id: 'ad1', adicional_nome: 'Chantilly', nome: 'Chantilly', preco: 3.5, ordem: 1 }
    ],
    v_cortesias_disponiveis: [],
    clientes: [
      {
        id: 'c_hab',
        nome: 'Carlos Habilitado',
        telefone: '11999990001',
        conta_habilitada: true,
        saldo_conta: 100.0,
        limite_fiado: 200.0
      },
      {
        id: 'c_des',
        nome: 'Daniela Desabilitada',
        telefone: '11999990002',
        conta_habilitada: false,
        saldo_conta: 0,
        limite_fiado: 0
      }
    ],
    pedidos: [
      {
        id: 101,
        numero_pedido: 'PED-101',
        mesa_codigo: '02',
        cliente_id: 'c_hab',
        cliente_nome: 'Carlos Habilitado',
        total: 20.0,
        status: 'pendente',
        status_pagamento: 'pendente',
        forma_pagamento: null,
        created_at: new Date().toISOString()
      }
    ],
    pedido_itens: [
      {
        id: 1,
        pedido_id: 101,
        produto_id: 'p1',
        nome_produto: 'Espresso',
        quantidade: 2,
        preco_unitario: 8.0,
        total: 16.0,
        cancelado: false
      }
    ],
    perfis: [
      {
        id: 'u1',
        nome: 'Barista Teste',
        email: 'barista@cafeteria.com',
        role: 'admin',
        ativo: true,
        pode_dar_desconto: true
      }
    ],
    configuracoes_sistema: [
      {
        chave: 'taxa_servico',
        valor: { ativa: true, percentual: 10 }
      }
    ],
    site_settings: [
      { key: 'taxa_servico_ativa', value: 'true' },
      { key: 'taxa_servico_percentual', value: '10' }
    ],
    ...overrides
  };
}

export function setupAuthMock(mock, user = { id: 'u1', email: 'barista@cafeteria.com' }) {
  mock.auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session: user ? { user } : null } })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
  };
  return mock;
}

export async function setupPedidosPage(options = {}) {
  if (!options.keepLocalStorage) {
    localStorage.clear();
  }
  sessionStorage.clear();

  const user = options.user !== undefined ? options.user : { id: 'u1', email: 'barista@cafeteria.com' };
  if (user?.id) {
    const defaultPerms = options.permissoes || {
      is_admin: options.isAdmin ?? true,
      cargo_nome: 'Administrador / Barista',
      permissoes: options.permissoesList || ['pdv.vender', 'pdv.desconto', 'pdv.cancelar_item', 'pdv.transferir_mesa']
    };
    localStorage.setItem('cafeteria_pdv_permissoes_' + user.id, JSON.stringify(defaultPerms));
  }

  const mockData = getDefaultMockData(options.initialData);
  const rpcHandlers = {
    promocoes_do_dia: () => ({ data: [], error: null }),
    criar_pedido: (args) => ({ data: { id: 'ped_novo_123', ...args?.p_payload }, error: null }),
    fechar_conta_mesa: (args) => ({ data: { success: true }, error: null }),
    transferir_mesa: (args) => ({ data: { success: true }, error: null }),
    ...(options.rpcHandlers || {})
  };

  const mockSupabase = setupAuthMock(
    createSupabaseMock(mockData, { rpcHandlers }),
    options.user !== undefined ? options.user : { id: 'u1', email: 'barista@cafeteria.com' }
  );

  const harness = createPageHarness('pedidos.html', { supabase: mockSupabase });

  // Carrega scripts reais da aplicação
  await harness.carregarScript('js/supabase-client.js');
  await harness.carregarScript('js/db.js');
  await harness.carregarScript('js/pedidos.js');

  // Mocks seguros de diálogos do navegador para Happy DOM
  window.prompt = vi.fn((msg) => 'Teste');
  window.showConfirmBottomSheet = vi.fn().mockResolvedValue(true);
  window.showConfirm = vi.fn().mockResolvedValue(true);

  // Capturador de toasts (envelopa o window.showToast definido por pedidos.js)
  const toasts = [];
  const originalShowToast = window.showToast;
  window.showToast = (message, optionsOrActionText = null, actionCallback = null, duracaoMs = 4000) => {
    let tipo = 'info';
    let acaoTexto = null;
    let acaoCb = null;

    if (typeof optionsOrActionText === 'object' && optionsOrActionText !== null) {
      tipo = optionsOrActionText.tipo || 'info';
      acaoTexto = optionsOrActionText.acaoTexto || null;
      acaoCb = optionsOrActionText.acaoCallback || null;
    } else if (typeof optionsOrActionText === 'string') {
      if (['info', 'success', 'error', 'warning'].includes(optionsOrActionText)) {
        tipo = optionsOrActionText;
      } else {
        acaoTexto = optionsOrActionText;
        acaoCb = actionCallback;
      }
    }

    toasts.push({ message, tipo, acaoTexto, acaoCb });
    if (typeof originalShowToast === 'function') {
      originalShowToast(message, optionsOrActionText, actionCallback, duracaoMs);
    }
  };

  // Reavalia a sessão do usuário mockado para este teste
  if (typeof window.baristaCheckSession === 'function') {
    await window.baristaCheckSession();
  }

  // Se não deve manter rascunho, garante carrinho limpo
  if (!options.keepLocalStorage && typeof window.baristaLimparCarrinho === 'function') {
    window.baristaLimparCarrinho();
  }

  // Aguarda promessas de inicialização pendentes (perfil, produtos e mesas renderizados)
  for (let i = 0; i < 50; i++) {
    const hasProducts = document.querySelectorAll('.product-card').length > 0;
    const hasMesas = (document.getElementById('mesa-select')?.options?.length || 0) > 1;
    if (hasProducts && hasMesas) break;
    await new Promise(r => setTimeout(r, 10));
  }

  const page = {
    harness,
    mockSupabase,
    get toasts() {
      const domToasts = Array.from(document.querySelectorAll('#toast-container .toast')).map(el => ({
        message: el.textContent || '',
        tipo: el.className.includes('error') ? 'error' : (el.className.includes('success') ? 'success' : 'info')
      }));
      return [...toasts, ...domToasts];
    },

    // Seletores e Ações do DOM
    getElement: (id) => document.getElementById(id),

    adicionarItemAoCarrinho: (produto, qtd = 1, adicionais = []) => {
      // Garante que todos os produtos estejam visíveis no grid (muda para aba 'Todos' se necessário)
      let cards = Array.from(document.querySelectorAll('.product-card'));
      let targetCard = cards.find(c => c.textContent.includes(produto.nome));
      if (!targetCard) {
        const catTabs = Array.from(document.querySelectorAll('.cat-tab'));
        const tabTodos = catTabs.find(t => t.textContent.includes('Todos'));
        if (tabTodos) {
          tabTodos.click();
        }
      }

      for (let i = 0; i < qtd; i++) {
        cards = Array.from(document.querySelectorAll('.product-card'));
        targetCard = cards.find(c => c.textContent.includes(produto.nome));
        if (targetCard) {
          if (typeof targetCard.onclick === 'function') {
            targetCard.onclick(new Event('click'));
          } else {
            targetCard.click();
          }
          // Se abriu o modal de montagem (produto com adicionais)
          const modalMontagem = document.getElementById('modal-montagem');
          if (modalMontagem && !modalMontagem.classList.contains('hidden')) {
            if (adicionais.length > 0) {
              const checkboxes = Array.from(modalMontagem.querySelectorAll('.chk-adicional, input[type="checkbox"]'));
              adicionais.forEach(ad => {
                const cb = checkboxes.find(c => c.value === ad.id || (c.dataset && c.dataset.nome === ad.nome) || c.parentElement?.textContent.includes(ad.nome));
                if (cb && !cb.checked) cb.click();
              });
            }
            const btnSave = document.getElementById('modal-montagem-save');
            if (btnSave) btnSave.click();
          }
        } else {
          console.log('NO TARGET CARD FOUND for', produto.nome, 'Total cards:', cards.length);
        }
      }
    },

    limparCarrinho: () => {
      if (typeof window.baristaLimparCarrinho === 'function') {
        window.baristaLimparCarrinho();
      } else {
        const items = Array.from(document.querySelectorAll('.cart-btn.remove'));
        items.forEach(btn => btn.click());
      }
      const mesaSelect = document.getElementById('mesa-select');
      if (mesaSelect) {
        mesaSelect.value = '';
        mesaSelect.dispatchEvent(new Event('change'));
      }
      const chkViagem = document.getElementById('pedido-para-viagem');
      if (chkViagem) {
        chkViagem.checked = false;
        chkViagem.dispatchEvent(new Event('change'));
      }
      const chkPrio = document.getElementById('pedido-prioritario');
      if (chkPrio) {
        chkPrio.checked = false;
        chkPrio.dispatchEvent(new Event('change'));
      }
      const chkInterv = document.getElementById('check-pedido-intervalo');
      if (chkInterv) {
        chkInterv.checked = false;
        chkInterv.dispatchEvent(new Event('change'));
      }
      const obs = document.getElementById('pedido-obs');
      if (obs) {
        obs.value = '';
        obs.dispatchEvent(new Event('input'));
      }
      if (typeof window.limparRascunhoCarrinho === 'function') {
        window.limparRascunhoCarrinho();
      }
    },

    selecionarMesa: (mesaCodigo) => {
      const select = document.getElementById('mesa-select');
      if (select) {
        select.value = mesaCodigo || '';
        select.dispatchEvent(new Event('change'));
      }
    },

    marcarParaViagem: (checked) => {
      const chk = document.getElementById('pedido-para-viagem');
      if (chk) {
        chk.checked = !!checked;
        chk.dispatchEvent(new Event('change'));
      }
    },

    marcarPrioritario: (checked, motivo = 'Espetáculo') => {
      const chk = document.getElementById('pedido-prioritario');
      if (chk) {
        chk.checked = !!checked;
        chk.dispatchEvent(new Event('change'));
      }
      const motivoSelect = document.getElementById('pedido-prioridade-motivo');
      if (motivoSelect && motivo) {
        motivoSelect.value = motivo;
        motivoSelect.dispatchEvent(new Event('change'));
      }
    },

    marcarIntervalo: (checked) => {
      const chk = document.getElementById('check-pedido-intervalo');
      if (chk) {
        chk.checked = !!checked;
        chk.dispatchEvent(new Event('change'));
      }
    },

    selecionarCliente: (cliente) => {
      const nomeInput = document.getElementById('pedido-cliente-nome');
      const idInput = document.getElementById('pedido-cliente-id');
      const badge = document.getElementById('cliente-selecionado-badge');
      const badgeNome = document.getElementById('cliente-selecionado-nome');
      const badgeConta = document.getElementById('cliente-selecionado-conta');

      if (!cliente) {
        if (typeof window.baristaDesvincularCliente === 'function') {
          window.baristaDesvincularCliente();
        } else {
          if (nomeInput) {
            nomeInput.value = '';
            nomeInput.style.display = '';
          }
          if (idInput) idInput.value = '';
          if (badge) badge.style.display = 'none';
        }
        return;
      }

      if (typeof cliente === 'string') {
        // Nome livre
        if (typeof window.baristaDesvincularCliente === 'function') {
          window.baristaDesvincularCliente();
        }
        if (nomeInput) {
          nomeInput.value = cliente;
          nomeInput.style.display = '';
          nomeInput.dispatchEvent(new Event('input'));
        }
        if (idInput) idInput.value = '';
        if (badge) badge.style.display = 'none';
      } else {
        // Objeto cadastrado
        if (typeof window.baristaSelecionarCliente === 'function') {
          window.baristaSelecionarCliente(cliente);
        } else {
          if (nomeInput) {
            nomeInput.value = cliente.nome;
            nomeInput.style.display = 'none';
          }
          if (idInput) idInput.value = cliente.id;
          if (badge) badge.style.display = 'flex';
          if (badgeNome) badgeNome.textContent = cliente.nome;
          if (badgeConta) {
            badgeConta.textContent = cliente.conta_habilitada ? 'Conta: Habilitada' : 'Conta: Bloqueada';
          }
        }
      }
    },

    selecionarPagamento: (forma, pago = false) => {
      const formaSelect = document.getElementById('pedido-pagamento');
      if (formaSelect) {
        formaSelect.value = forma || '';
        formaSelect.dispatchEvent(new Event('change'));
      }
      const pagoChk = document.getElementById('pedido-pago');
      if (pagoChk) {
        pagoChk.checked = !!pago;
        pagoChk.dispatchEvent(new Event('change'));
      }
    },

    definirObservacao: (obs) => {
      const txt = document.getElementById('pedido-obs');
      if (txt) {
        txt.value = obs || '';
        txt.dispatchEvent(new Event('input'));
      }
    },

    submeterPedido: async () => {
      const btn = document.getElementById('btn-enviar-pedido');
      if (btn) {
        const wasDisabled = btn.disabled;
        if (wasDisabled) {
          btn.disabled = false;
          btn.removeAttribute('disabled');
        }
        btn.click();
        if (wasDisabled) {
          btn.disabled = true;
          btn.setAttribute('disabled', '');
        }
        await new Promise(r => setTimeout(r, 8));
      }
    },

    // Ações de Fechamento de Conta
    abrirModalFechamentoMesa: async (mesaCodigo = 'M01', pedidosCustom = null) => {
      if (typeof window.baristaAbrirModalFecharConta === 'function') {
        const pedidos = pedidosCustom || [
          { id: 101, mesa_codigo: mesaCodigo, total: 50.00, status_pagamento: 'pendente', cliente_id: 'cli-001', itens: [{ id: 1, nome: 'Café Espresso', preco_unitario: 10.00, quantidade: 5 }] }
        ];
        window.baristaAbrirModalFecharConta(mesaCodigo, pedidos);
        return;
      }

      const tabMesas = document.getElementById('nav-btn-mesas');
      if (tabMesas) tabMesas.click();
      await new Promise(r => setTimeout(r, 10));

      const cards = Array.from(document.querySelectorAll('.mesa-card'));
      const targetCard = cards.find(c => c.textContent.includes(mesaCodigo));
      if (targetCard) targetCard.click();

      const btnFecharConta = document.getElementById('modal-mesa-fechar-conta');
      if (btnFecharConta) btnFecharConta.click();
      await new Promise(r => setTimeout(r, 10));
    },

    avancarEtapaFechamento: (step) => {
      if (typeof window.baristaSetFecharContaStep === 'function') {
        window.baristaSetFecharContaStep(step);
      } else {
        const tab = document.querySelector(`.fechar-conta-step-tab[data-step="${step}"]`);
        if (tab) tab.click();
      }
    },

    configurarTaxaServico: (checked) => {
      const chk = document.getElementById('fechar-conta-taxa-check');
      if (chk) {
        chk.checked = !!checked;
        chk.dispatchEvent(new Event('change'));
      }
    },

    configurarDesconto: (valor, motivo = 'Desconto Especial', tipo = 'valor') => {
      const tipoSelect = document.getElementById('fechar-conta-desconto-tipo');
      if (tipoSelect) {
        tipoSelect.value = tipo;
        tipoSelect.dispatchEvent(new Event('change'));
      }
      const valorInput = document.getElementById('fechar-conta-desconto-valor');
      if (valorInput) {
        valorInput.value = valor ? String(valor) : '';
        valorInput.dispatchEvent(new Event('input'));
      }
      const motivoInput = document.getElementById('fechar-conta-desconto-motivo');
      if (motivoInput) {
        motivoInput.value = motivo || '';
        motivoInput.dispatchEvent(new Event('input'));
      }
    },

    adicionarPagamentoFechamento: (forma, valor) => {
      const formaSelect = document.getElementById('fechar-conta-forma');
      if (formaSelect) {
        formaSelect.value = forma;
        formaSelect.dispatchEvent(new Event('change'));
      }
      const valorInput = document.getElementById('fechar-conta-valor');
      if (valorInput) {
        valorInput.value = valor !== undefined ? String(valor) : '';
        valorInput.dispatchEvent(new Event('input'));
      }
      const btnAdd = document.getElementById('btn-add-pagamento') || document.getElementById('fechar-conta-btn-add-pag');
      if (btnAdd) btnAdd.click();
    },

    confirmarFechamento: async () => {
      const btn = document.getElementById('modal-fechar-conta-confirmar') || document.getElementById('fechar-conta-confirmar');
      if (btn) {
        const wasDisabled = btn.disabled;
        if (wasDisabled) {
          btn.disabled = false;
          btn.removeAttribute('disabled');
        }
        btn.click();
        if (wasDisabled) {
          btn.disabled = true;
          btn.setAttribute('disabled', '');
        }
        await new Promise(r => setTimeout(r, 60));
      }
    },

    mockRpc: (nome, handler) => {
      rpcHandlers[nome] = handler;
      if (mockSupabase._rpcHandlers) {
        mockSupabase._rpcHandlers[nome] = handler;
      }
    },

    obterUltimoToast: () => {
      const t = toasts[toasts.length - 1];
      if (!t) return null;
      return { ...t, msg: t.message };
    },

    obterChamadasRpc: (nome) => {
      return harness.rpcCalls.filter(c => !nome || c.fnName === nome);
    },

    limparChamadasRpc: () => {
      harness.rpcCalls.length = 0;
    }
  };

  harness.mockRpc = page.mockRpc;

  return page;
}
