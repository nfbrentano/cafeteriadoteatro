// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { setupPedidosPage } from './helpers/pedidos-page.js';

describe('CAF-000102: Fluxos Pairwise — Catálogo, Carrinho, Fila Offline, Mesas e Sessão', () => {
  let page;

  beforeEach(() => {
    vi.clearAllMocks();
    window.prompt = vi.fn().mockReturnValue('Motivo teste');
    window.showConfirm = vi.fn().mockResolvedValue(true);
    window.showConfirmBottomSheet = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    if (page?.cleanup) {
      page.cleanup();
    }
  });

  // --------------------------------------------------------------------------
  // CA08: Catálogo e Carrinho (M3 e M4)
  // --------------------------------------------------------------------------
  describe('CA08: Catálogo e Carrinho (M3 e M4)', () => {
    it('M3: Filtro por categoria exibe apenas os produtos da categoria selecionada', async () => {
      page = await setupPedidosPage();

      // Clica na categoria "Cafés" (id c1)
      const catTabs = Array.from(document.querySelectorAll('.cat-tab'));
      const catBtn = catTabs.find(t => t.textContent.toLowerCase().includes('c1') || t.textContent.toLowerCase().includes('café'));
      if (catBtn) catBtn.click();

      const cards = Array.from(document.querySelectorAll('.product-card'));
      const visiveis = cards.filter(c => c.style.display !== 'none');
      
      expect(visiveis.length).toBeGreaterThan(0);
      visiveis.forEach(c => {
        expect(c.textContent).toMatch(/café|espresso|cappuccino/i);
      });
    });

    it('M3: Busca textual filtra produtos por nome com suporte a maiúsculas e acentos', async () => {
      page = await setupPedidosPage();

      const searchInput = document.getElementById('product-search');
      expect(searchInput).toBeTruthy();

      // Busca "ESPRESSO"
      searchInput.value = 'ESPRESSO';
      searchInput.dispatchEvent(new Event('input'));

      const cards = Array.from(document.querySelectorAll('.product-card'));
      const visiveis = cards.filter(c => c.style.display !== 'none');

      expect(visiveis.length).toBeGreaterThan(0);
      visiveis.forEach(c => {
        expect(c.textContent).toMatch(/espresso/i);
      });
    });

    it('M3: Produto esgotado é sinalizado e não permite adição ao carrinho', async () => {
      page = await setupPedidosPage();

      const cards = Array.from(document.querySelectorAll('.product-card'));
      const cardEsgotado = cards.find(c => c.textContent.includes('Croissant Esgotado'));

      expect(cardEsgotado).toBeTruthy();
      expect(cardEsgotado.classList.contains('esgotado') || cardEsgotado.textContent.includes('Esgotado')).toBe(true);

      // Clicar em produto esgotado não adiciona ao carrinho
      if (typeof cardEsgotado.onclick === 'function') {
        cardEsgotado.onclick(new Event('click'));
      } else {
        cardEsgotado.click();
      }

      const itensCarrinho = document.querySelectorAll('.cart-item');
      expect(itensCarrinho.length).toBe(0);
    });

    it('M4: Adiciona item simples ao carrinho e calcula subtotal e total', async () => {
      page = await setupPedidosPage();

      page.adicionarItemAoCarrinho({ id: 'p1', nome: 'Espresso' }, 2);

      const cartItems = document.querySelectorAll('.cart-item');
      expect(cartItems.length).toBe(1);

      const totalLbl = document.getElementById('cart-total-value');
      // 2 x 8.00 = 16.00
      expect(totalLbl.textContent).toContain('16,00');
    });

    it('M4: Adiciona produto com adicionais opcionais calculando acréscimo', async () => {
      page = await setupPedidosPage();

      // p2: Cappuccino (14.00) + ad1: Chantilly (3.50) = 17.50
      page.adicionarItemAoCarrinho(
        { id: 'p2', nome: 'Cappuccino' },
        1,
        [{ id: 'ad1', nome: 'Chantilly' }]
      );

      const cartItems = document.querySelectorAll('.cart-item');
      expect(cartItems.length).toBe(1);

      const totalLbl = document.getElementById('cart-total-value');
      expect(totalLbl.textContent).toContain('17,50');
    });

    it('M4: Modifica quantidade com botões + / - e remove com lixeira', async () => {
      page = await setupPedidosPage();

      page.adicionarItemAoCarrinho({ id: 'p1', nome: 'Espresso' }, 1);

      // Botão +
      if (typeof window.baristaUpdateQty === 'function') {
        window.baristaUpdateQty(0, 1); // qtd = 2
      }
      expect(document.getElementById('cart-total-value').textContent).toContain('16,00');

      // Botão -
      if (typeof window.baristaUpdateQty === 'function') {
        window.baristaUpdateQty(0, -1); // qtd = 1
      }
      expect(document.getElementById('cart-total-value').textContent).toContain('8,00');

      // Remover com lixeira (-999)
      if (typeof window.baristaUpdateQty === 'function') {
        window.baristaUpdateQty(0, -999);
      }
      expect(document.querySelectorAll('.cart-item').length).toBe(0);
    });

    it('M4: Sanitização de XSS em observação de item do carrinho (CAF-000101)', async () => {
      page = await setupPedidosPage();

      page.adicionarItemAoCarrinho({ id: 'p1', nome: 'Espresso' }, 1);

      // Abre modal de obs e insere payload XSS
      if (typeof window.baristaOpenObs === 'function') {
        window.baristaOpenObs(0);
        const txtObs = document.getElementById('modal-obs-input');
        const btnSaveObs = document.getElementById('modal-obs-save');
        if (txtObs && btnSaveObs) {
          txtObs.value = '<script id="xss-test">alert(1)</script><b>Sem açúcar</b>';
          btnSaveObs.click();
        }
      }

      // Nenhum elemento script inserido no DOM
      expect(document.getElementById('xss-test')).toBeNull();

      // Observação renderizada de forma segura
      const cartItem = document.querySelector('.cart-item');
      expect(cartItem.textContent).toContain('Sem açúcar');
    });

    it('M4: Itens idênticos sem adicionais e sem observação são agrupados', async () => {
      page = await setupPedidosPage();

      page.adicionarItemAoCarrinho({ id: 'p1', nome: 'Espresso' }, 1);
      page.adicionarItemAoCarrinho({ id: 'p1', nome: 'Espresso' }, 1);

      const items = document.querySelectorAll('.cart-item');
      expect(items.length).toBe(1);

      const qtdSpan = items[0].querySelector('.cart-qty');
      expect(qtdSpan.textContent).toContain('2');
    });
  });

  // --------------------------------------------------------------------------
  // CA09: Fila Offline com IndexedDB (M5)
  // --------------------------------------------------------------------------
  describe('CA09: Fila Offline com IndexedDB (M5)', () => {
    it('Exibe estado vazio no modal quando a fila offline não possui itens', async () => {
      page = await setupPedidosPage();

      const btnQueue = document.getElementById('btn-offline-queue');
      if (btnQueue) btnQueue.click();
      await new Promise(r => setTimeout(r, 20));

      const list = document.getElementById('offline-queue-list');
      expect(list.textContent).toContain('Nenhum pedido pendente na fila');
    });

    it('Reenviar pedido da fila offline com sucesso remove da fila e atualiza contador', async () => {
      page = await setupPedidosPage();

      page.harness.mockRpc('criar_pedido', async () => ({
        data: { id: 'ped_recuperado_999' },
        error: null
      }));

      // Salva pedido offline via helper da aplicação
      await window.baristaSalvarPedidoOffline({
        client_id: 'client_off_101',
        payload: { mesa_codigo: '05', total: 20.00, itens: [] },
        mesa_codigo: '05',
        total_estimado: 20.00,
        status: 'aguardando_envio',
        tentativas: 0,
        created_at: new Date().toISOString()
      });

      // Dispara reenvio
      if (typeof window.baristaReenviarPedidoOffline === 'function') {
        await window.baristaReenviarPedidoOffline('client_off_101');
      }

      // Verifica se o item foi processado e removido do IDB
      const fila = await window.baristaObterFilaOffline();
      expect(fila.find(p => p.client_id === 'client_off_101')).toBeUndefined();
    });

    it('Descartar pedido remove da fila offline e atualiza a UI', async () => {
      page = await setupPedidosPage();

      await window.baristaSalvarPedidoOffline({
        client_id: 'client_disc_202',
        payload: { mesa_codigo: '03', total: 10.00 },
        mesa_codigo: '03',
        status: 'falha',
        tentativas: 1
      });

      if (typeof window.baristaDescartarPedidoOffline === 'function') {
        await window.baristaDescartarPedidoOffline('client_disc_202');
      }

      // Item removido
      const fila = await window.baristaObterFilaOffline();
      expect(fila.find(p => p.client_id === 'client_disc_202')).toBeUndefined();

      const toast = page.obterUltimoToast();
      expect(toast.msg).toContain('descartado da fila');
    });
  });

  // --------------------------------------------------------------------------
  // CA10: Gestão de Mesas, Cancelamentos, Cortesias e Triagem (M6–M8)
  // --------------------------------------------------------------------------
  describe('CA10: Gestão de Mesas, Cancelamentos, Cortesias e Triagem (M6–M8)', () => {
    it('M6: Transfere pedidos entre mesas chamando RPC transferir_mesa', async () => {
      page = await setupPedidosPage();

      page.harness.mockRpc('transferir_mesa', async () => ({
        data: { success: true },
        error: null
      }));

      // Abre aba mesas e aguarda renderização
      const tabMesas = document.getElementById('nav-btn-mesas');
      if (tabMesas) tabMesas.click();
      for (let i = 0; i < 30; i++) {
        if (document.querySelectorAll('.mesa-card').length > 0) break;
        await new Promise(r => setTimeout(r, 10));
      }

      const cards = Array.from(document.querySelectorAll('.mesa-card'));
      const cardMesa = cards.find(c => c.textContent.includes('02'));
      if (cardMesa) cardMesa.click();
      await new Promise(r => setTimeout(r, 20));

      const btnTransferir = document.getElementById('btn-mesa-transferir');
      if (btnTransferir) btnTransferir.click();

      // Aguarda carregamento das opções do select no modal
      for (let i = 0; i < 30; i++) {
        if ((document.getElementById('transferir-mesa-select')?.options?.length || 0) > 1) break;
        await new Promise(r => setTimeout(r, 10));
      }

      // Seleciona mesa destino e confirma
      const selectDestino = document.getElementById('transferir-mesa-select');
      const btnConfirmar = document.getElementById('modal-transferir-confirm');
      if (selectDestino && btnConfirmar) {
        selectDestino.value = '03';
        selectDestino.dispatchEvent(new Event('change'));
        btnConfirmar.click();
        await new Promise(r => setTimeout(r, 40));
      }

      const chamadas = page.obterChamadasRpc('transferir_mesa');
      expect(chamadas.length).toBe(1);
      expect(chamadas[0].args.p_origem).toBe('02');
      expect(chamadas[0].args.p_destino).toBe('03');
    });

    it('M7: Cancelar item com permissão chama RPC cancelar_item', async () => {
      page = await setupPedidosPage();

      page.harness.mockRpc('cancelar_item', async () => ({
        data: { success: true },
        error: null
      }));

      window.prompt = vi.fn().mockReturnValue('Cliente desistiu');

      if (typeof window.baristaCancelarItem === 'function') {
        await window.baristaCancelarItem(1, 101, '02');
      }

      const chamadas = page.obterChamadasRpc('cancelar_item');
      expect(chamadas.length).toBe(1);
      expect(chamadas[0].args.p_item_id).toBe(1);
      expect(chamadas[0].args.p_motivo).toBe('Cliente desistiu');
    });

    it('M7: Cancelar item sem permissão solicita autorização por PIN', async () => {
      page = await setupPedidosPage({
        isAdmin: false,
        permissoesList: ['pdv.vender'], // sem pdv.cancelar_item
        initialData: {
          perfis: [{ id: 'u1', role: 'barista', pode_dar_desconto: false, ativo: true }]
        }
      });

      const btnClosePin = document.getElementById('modal-pin-close');

      const cancelPromise = window.baristaCancelarItem(1, 101, '02');
      // Fecha o modal de PIN negando
      setTimeout(() => {
        if (btnClosePin) btnClosePin.click();
      }, 10);
      await cancelPromise;

      // Nenhuma RPC de cancelamento deve ter sido chamada
      expect(page.obterChamadasRpc('cancelar_item').length).toBe(0);
      const toast = page.obterUltimoToast();
      expect(toast.msg).toContain('não autorizado por supervisor');
    });

    it('M7: Lançar cortesia chama RPC adicionar_itens_pedido', async () => {
      page = await setupPedidosPage();

      page.harness.mockRpc('adicionar_itens_pedido', async () => ({
        data: { success: true },
        error: null
      }));

      if (typeof window.baristaLancarCortesia === 'function') {
        await window.baristaLancarCortesia(101, 1, 'p1');
      }

      const chamadas = page.obterChamadasRpc('adicionar_itens_pedido');
      expect(chamadas.length).toBe(1);
      expect(chamadas[0].args.p_pedido_id).toBe(101);
      expect(chamadas[0].args.p_itens[0].cortesia_de_item_id).toBe(1);
    });

    it('M8: Triagem de Totem permite receber pedido e liberar para a cozinha', async () => {
      page = await setupPedidosPage();

      page.harness.mockRpc('receber_pedido_totem', async () => ({
        data: { success: true },
        error: null
      }));

      window.prompt = vi.fn().mockReturnValue('pix');

      if (typeof window.baristaReceberPedidoTotem === 'function') {
        await window.baristaReceberPedidoTotem(101);
      }

      const chamadas = page.obterChamadasRpc('receber_pedido_totem');
      expect(chamadas.length).toBe(1);
      expect(chamadas[0].args.p_pedido_id).toBe(101);
      expect(chamadas[0].args.p_forma_pagamento).toBe('pix');
    });
  });

  // --------------------------------------------------------------------------
  // CA11: Sessão, Permissões e Rascunho (M9)
  // --------------------------------------------------------------------------
  describe('CA11: Sessão, Permissões e Rascunho (M9)', () => {
    it('Exibe tela de login quando não há sessão ativa de usuário', async () => {
      page = await setupPedidosPage({ user: null });

      const loginScreen = document.getElementById('login-screen');
      const app = document.getElementById('app');

      expect(loginScreen.classList.contains('hidden')).toBe(false);
      expect(app.classList.contains('hidden')).toBe(true);
    });

    it('Bloqueia acesso e desloga usuário quando perfil não tem permissão pdv.vender', async () => {
      page = await setupPedidosPage({
        user: { id: 'u_sem_acesso', email: 'guest@cafeteria.com' },
        isAdmin: false,
        permissoesList: [], // sem pdv.vender
        initialData: {
          perfis: [
            { id: 'u_sem_acesso', nome: 'Sem Vendas', role: 'garcom', ativo: true }
          ]
        }
      });

      const toast = page.toasts.find(t => t.message.includes('Acesso negado') || t.msg?.includes('Acesso negado'));
      expect(toast || page.mockSupabase.auth.signOut.mock.calls.length > 0).toBeTruthy();
    });

    it('Restaura rascunho válido salvo no localStorage ao recarregar a tela', async () => {
      // Prepara rascunho válido no localStorage com o schema de pedidos.js
      localStorage.setItem('cafeteria_pdv_carrinho_rascunho', JSON.stringify({
        cart: [
          {
            produtoId: 'p1',
            quantidade: 2,
            observacoes: '',
            adicionaisIds: []
          }
        ],
        mesa: '02',
        paraViagem: false,
        prioridade: 0,
        prioridadeMotivo: '',
        clienteNome: '',
        clienteId: '',
        observacoesGerais: '',
        timestamp: Date.now()
      }));

      page = await setupPedidosPage({ keepLocalStorage: true });

      // Carrinho restaurado
      const items = document.querySelectorAll('.cart-item');
      expect(items.length).toBe(1);
      expect(document.getElementById('cart-total-value').textContent).toContain('16,00');

      const toast = page.toasts.find(t => t.message.includes('Rascunho recuperado') || t.msg?.includes('Rascunho recuperado'));
      expect(toast).toBeTruthy();
    });

    it('Descarta suavemente rascunho expirado (mais de 12h) sem poluir o carrinho', async () => {
      if (typeof window.baristaLimparCarrinho === 'function') {
        window.baristaLimparCarrinho();
      }
      const vinteHorasAtras = Date.now() - (20 * 60 * 60 * 1000);
      localStorage.setItem('cafeteria_pdv_carrinho_rascunho', JSON.stringify({
        cart: [
          {
            produtoId: 'p1',
            quantidade: 5
          }
        ],
        mesa: '02',
        timestamp: vinteHorasAtras
      }));

      page = await setupPedidosPage({ keepLocalStorage: true });

      // Carrinho deve iniciar vazio
      const items = document.querySelectorAll('.cart-item');
      expect(items.length).toBe(0);
    });
  });
});
