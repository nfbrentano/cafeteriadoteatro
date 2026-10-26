import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000101: Resolução de Alertas CodeQL #14 e #19 de DOM XSS em pedidos.js', () => {
  function getBaseMockConfig(customTables = {}) {
    return {
      perfis: [{ id: 'u1', nome: 'Operador Teste', role: 'barista', ativo: true }],
      mesas: [{ id: 'm1', codigo: '01', status: 'livre', ativo: true }],
      categorias: [{ id: 'c1', nome: 'Bebidas', ativo: true, ordem: 1 }],
      produtos: [
        {
          id: 'p1',
          nome: 'Café Espresso',
          descricao: 'Espresso clássico',
          preco: 8.0,
          categoria_id: 'c1',
          ativo: true,
          disponivel: true,
          permite_adicionais: false
        },
        {
          id: 'p2',
          nome: '<img src=x onerror=alert("p2-xss")>Cappuccino',
          descricao: '<script>alert("p2-desc")</script>Cappuccino italiano',
          preco: 14.0,
          categoria_id: 'c1',
          ativo: true,
          disponivel: true,
          permite_adicionais: false
        }
      ],
      adicionais: [
        { id: 'ad1', nome: '<script>alert("ad-xss")</script>Chantilly', preco: 3.5, ativo: true }
      ],
      v_adicionais_produto: [],
      v_cortesias_disponiveis: [],
      pedidos: [],
      configuracoes_sistema: [],
      ...customTables
    };
  }

  function setupAuth(mock) {
    mock.auth = {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'barista@cafeteria.com' } } } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    };
    return mock;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('CA01: Função local escapeHtml no escopo de pedidos.js', () => {
    it('sanitiza caracteres & < > " e \' corretamente preservando números e tratando nulos', async () => {
      const mock = setupAuth(createSupabaseMock(getBaseMockConfig(), {
        rpcHandlers: { promocoes_do_dia: () => ({ data: [], error: null }) }
      }));
      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      expect(typeof window.escapeHtml).toBe('function');
      expect(window.escapeHtml('Café & Bolo <script>alert("xss")</script>')).toBe(
        'Café &amp; Bolo &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
      expect(window.escapeHtml("Teste 'aspas'")).toBe('Teste &#039;aspas&#039;');
      expect(window.escapeHtml(0)).toBe('0');
      expect(window.escapeHtml(42)).toBe('42');
      expect(window.escapeHtml(null)).toBe('');
      expect(window.escapeHtml(undefined)).toBe('');

      harness.cleanup();
    });
  });

  describe('CA02: Sanitização na fonte nos modais de observação e montagem', () => {
    it('higieniza modalObsInput.value antes de persistir no objeto do carrinho', async () => {
      const mock = setupAuth(createSupabaseMock(getBaseMockConfig(), {
        rpcHandlers: { promocoes_do_dia: () => ({ data: [], error: null }) }
      }));
      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(60);

      // Adiciona p1 ao carrinho primeiro
      const productsGrid = harness.document.getElementById('products-grid');
      const firstCard = productsGrid.querySelector('.product-card');
      firstCard.click();
      await harness.aguardarRender(30);

      // Abre modal de observação para o item 0
      window.baristaOpenObs(0);

      const modalObsInput = harness.document.getElementById('modal-obs-input');
      const modalObsSave = harness.document.getElementById('modal-obs-save');
      expect(modalObsInput).toBeTruthy();
      expect(modalObsSave).toBeTruthy();

      // Digita payload malicioso
      modalObsInput.value = '<script>alert("hack-obs")</script>Sem açúcar';
      modalObsSave.click();

      // Carrinho agora deve ter a observação sanitizada sem interpretar tags script
      const cartItems = harness.document.getElementById('cart-items');
      expect(cartItems).toBeTruthy();
      expect(cartItems.querySelectorAll('script').length).toBe(0);
      expect(cartItems.textContent).toContain('&lt;script&gt;alert(&quot;hack-obs&quot;)&lt;/script&gt;Sem açúcar');

      harness.cleanup();
    });

    it('higieniza modalMontagemObs.value antes de adicionar ao carrinho', async () => {
      const mock = setupAuth(createSupabaseMock(getBaseMockConfig({
        produtos: [
          {
            id: 'p1',
            nome: 'Espresso c/ Montagem',
            descricao: 'Permite adicionais',
            preco: 10.0,
            categoria_id: 'c1',
            ativo: true,
            disponivel: true,
            permite_adicionais: true
          }
        ],
        v_adicionais_produto: [
          { produto_id: 'p1', adicional_id: 'ad1', nome_adicional: 'Chantilly', preco_adicional: 3.5 }
        ]
      }), {
        rpcHandlers: { promocoes_do_dia: () => ({ data: [], error: null }) }
      }));

      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(60);

      const productsGrid = harness.document.getElementById('products-grid');
      const cardComMontagem = productsGrid.querySelector('.product-card');
      cardComMontagem.click();
      await harness.aguardarRender(30);

      const modalMontagemObs = harness.document.getElementById('modal-montagem-obs');
      const modalMontagemSave = harness.document.getElementById('modal-montagem-save');
      expect(modalMontagemObs).toBeTruthy();
      expect(modalMontagemSave).toBeTruthy();

      modalMontagemObs.value = '   <img src=x onerror=alert("hack-montagem")>Muito quente   ';
      modalMontagemSave.click();
      await harness.aguardarRender(30);

      const cartItems = harness.document.getElementById('cart-items');
      expect(cartItems.querySelectorAll('img[src="x"]').length).toBe(0);
      expect(cartItems.textContent).toContain('&lt;img src=x onerror=alert(&quot;hack-montagem&quot;)&gt;Muito quente');

      harness.cleanup();
    });
  });

  describe('CA03: Renderização segura de item.observacoes em renderCart via textContent', () => {
    it('cria nó cart-item-obs usando textContent sem injetar HTML no DOM', async () => {
      const mock = setupAuth(createSupabaseMock(getBaseMockConfig(), {
        rpcHandlers: { promocoes_do_dia: () => ({ data: [], error: null }) }
      }));
      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(60);

      // Adiciona item simples p1
      const productsGrid = harness.document.getElementById('products-grid');
      productsGrid.querySelector('.product-card').click();
      await harness.aguardarRender(30);

      // Abre modal e atribui payload complexo
      window.baristaOpenObs(0);
      const modalObsInput = harness.document.getElementById('modal-obs-input');
      const modalObsSave = harness.document.getElementById('modal-obs-save');
      modalObsInput.value = '<b>Negrito falso</b> <svg onload=alert(1)>';
      modalObsSave.click();

      const obsBox = harness.document.querySelector('.cart-item-obs-box');
      expect(obsBox).toBeTruthy();

      // Nenhuma tag SVG ou B deve ser criada dentro do container de observações
      expect(obsBox.querySelectorAll('svg').length).toBe(0);
      expect(obsBox.querySelectorAll('b').length).toBe(0);

      const obsItem = obsBox.querySelector('.cart-item-obs');
      expect(obsItem).toBeTruthy();
      expect(obsItem.textContent).toContain('Obs:');
      expect(obsItem.textContent).toContain('Negrito falso');

      harness.cleanup();
    });
  });

  describe('CA04: Renderização de produtos com itens no carrinho e parseInt estrito', () => {
    it('renderiza os cards de produtos com quantidades numéricas sem propagar taints do carrinho', async () => {
      const mock = setupAuth(createSupabaseMock(getBaseMockConfig(), {
        rpcHandlers: { promocoes_do_dia: () => ({ data: [], error: null }) }
      }));
      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(60);

      const productsGrid = harness.document.getElementById('products-grid');
      expect(productsGrid).toBeTruthy();

      // Nenhuma tag <img> do produto malicioso p2 foi interpretada como elemento HTML
      expect(productsGrid.querySelectorAll('img[src="x"]').length).toBe(0);
      expect(productsGrid.querySelectorAll('script').length).toBe(0);

      // Adiciona p1 ao carrinho via card
      const initialCard = productsGrid.querySelector('.product-card');
      expect(initialCard).toBeTruthy();
      initialCard.click();

      await harness.aguardarRender(40);

      // Após o clique, renderProducts substitui os cards do grid
      const updatedCard = productsGrid.querySelector('.product-card');
      expect(updatedCard).toBeTruthy();

      // Verifica controles de quantidade e que o valor renderizado é numérico seguro
      const qtyControls = updatedCard.querySelector('.card-qty-controls');
      expect(qtyControls).toBeTruthy();
      const qtyVal = updatedCard.querySelector('.card-qty-val');
      expect(qtyVal).toBeTruthy();
      const parsedQty = parseInt(qtyVal.textContent.trim(), 10);
      expect(parsedQty).toBeGreaterThan(0);
      expect(Number.isInteger(parsedQty)).toBe(true);
      expect(qtyVal.textContent.trim()).not.toContain('<');

      harness.cleanup();
    });
  });

  describe('CA05: Sanitização em renderPedidosClienteAguardando contra XSS em pedidos de clientes', () => {
    it('escapa nome do cliente, mesa, itens e observações em pedidos pendentes de aprovação', async () => {
      const mock = setupAuth(createSupabaseMock(getBaseMockConfig({
        pedidos: [
          {
            id: 'ped-xss-1',
            created_at: new Date().toISOString(),
            origem: 'online',
            status: 'aguardando_aprovacao',
            mesa_codigo: '<script>alert("mesa")</script>10',
            cliente_nome: '<b onmouseover=alert(1)>João Malicioso</b>',
            cliente_telefone: '51999999999"><img src=x onerror=alert(2)>',
            total: 25.50,
            observacoes_gerais: '<script>alert("obs-geral")</script>Sem canudo plástico',
            pedido_itens: [
              {
                id: 'pi-1',
                quantidade: 2,
                nome_produto: '<img src=x onerror=alert("item-xss")>Torta de Maçã',
                preco_unitario: 10.0,
                subtotal: 20.0,
                observacoes: '<script>alert("item-obs")</script>Bem gelada',
                pedido_item_adicionais: [
                  {
                    nome_adicional: '<b onclick=alert("adic")>Canela extra</b>',
                    preco_unitario: 2.75
                  }
                ]
              }
            ]
          }
        ]
      }), {
        rpcHandlers: { promocoes_do_dia: () => ({ data: [], error: null }) }
      }));

      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(80);

      const lista = harness.document.getElementById('lista-pedidos-cliente-aguardando');
      expect(lista).toBeTruthy();

      // Nenhuma tag perigosa (script, img injetada) deve estar no DOM
      const scripts = lista.querySelectorAll('script');
      expect(scripts.length).toBe(0);

      const imgs = lista.querySelectorAll('img[src="x"]');
      expect(imgs.length).toBe(0);

      // Conteúdos textuais estão legíveis para o atendente
      expect(lista.textContent).toContain('João Malicioso');
      expect(lista.textContent).toContain('Sem canudo plástico');
      expect(lista.textContent).toContain('Torta de Maçã');
      expect(lista.textContent).toContain('Bem gelada');
      expect(lista.textContent).toContain('Canela extra');

      harness.cleanup();
    });
  });
});
