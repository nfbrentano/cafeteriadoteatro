import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000100 — Resolução de Vulnerabilidades CodeQL e Dependabot', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('CA01: Atualização de Dependência Segura (Dependabot #2)', () => {
    it('verifica que happy-dom está na versão 21.0.4 ou superior no package.json e lockfile', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const happyDomVer = pkg.devDependencies['happy-dom'];
      expect(happyDomVer).toBeDefined();

      // Remove prefixos como ^ ou ~
      const cleanVer = happyDomVer.replace(/[\^~>=]/g, '');
      const parts = cleanVer.split('.').map(Number);
      const isGreaterOrEqual =
        parts[0] > 21 ||
        (parts[0] === 21 && parts[1] > 0) ||
        (parts[0] === 21 && parts[1] === 0 && parts[2] >= 4);

      expect(isGreaterOrEqual).toBe(true);

      const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
      const installedVer = lock.packages['node_modules/happy-dom']?.version;
      if (installedVer) {
        const instParts = installedVer.split('.').map(Number);
        const instOk =
          instParts[0] > 21 ||
          (instParts[0] === 21 && instParts[1] > 0) ||
          (instParts[0] === 21 && instParts[1] === 0 && instParts[2] >= 4);
        expect(instOk).toBe(true);
      }
    });
  });

  describe('CA02: Sanitização da Grade de Produtos em pedidos.js (CodeQL #13)', () => {
    it('escapa tags maliciosas em nome e descrição de produtos sem interpretar HTML', async () => {
      const mock = createSupabaseMock({
        perfis: [{ id: 'u1', nome: 'Operador Teste', role: 'barista', ativo: true }],
        mesas: [{ id: 'm1', codigo: '01', status: 'livre', ativo: true }],
        categorias: [{ id: 'c1', nome: 'Especiais', ativo: true, ordem: 1 }],
        produtos: [{
          id: 'p-xss-1',
          nome: '<img src=x onerror=alert("xss-nome")>Café Especial',
          descricao: '<b onmouseover=alert("xss-desc")>Grãos selecionados</b>',
          preco: 12.50,
          categoria_id: 'c1',
          ativo: true,
          disponivel: true,
          permite_adicionais: false
        }],
        adicionais: [],
        v_adicionais_produto: [],
        pedidos: [],
        configuracoes_sistema: []
      }, {
        rpcHandlers: {
          promocoes_do_dia: () => ({ data: [], error: null })
        }
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/pedidos.js');

      await harness.aguardarRender(60);

      const productsGrid = harness.document.getElementById('products-grid');
      expect(productsGrid).toBeTruthy();

      // Nenhuma tag <img> ou script injetado deve existir dentro do grid
      const imgsInjetadas = productsGrid.querySelectorAll('img[src="x"]');
      expect(imgsInjetadas.length).toBe(0);

      // O texto deve estar preservado de forma segura no DOM
      const cardTitle = productsGrid.querySelector('.product-card__header h4');
      expect(cardTitle).toBeTruthy();
      expect(cardTitle.textContent).toContain('<img src=x onerror=alert("xss-nome")>Café Especial');

      const cardDesc = productsGrid.querySelector('.product-card__desc');
      expect(cardDesc).toBeTruthy();
      expect(cardDesc.textContent).toContain('<b onmouseover=alert("xss-desc")>Grãos selecionados</b>');

      harness.cleanup();
    });
  });

  describe('CA03: Sanitização de Carrinho e Labels de Promoções em pedidos.js (CodeQL #14)', () => {
    it('escapa labels de promoções e dados dinâmicos no carrinho', () => {
      expect(typeof window.escapeHtml).toBe('function');

      const promoMaliciosa = '<script>alert("hack-promo")</script>Promoção 2x1';
      const safePromo = window.escapeHtml(promoMaliciosa);

      expect(safePromo).not.toContain('<script>');
      expect(safePromo).toContain('&lt;script&gt;');

      const div = document.createElement('div');
      div.innerHTML = `<div class="promo-box">${safePromo}</div>`;
      expect(div.querySelectorAll('script').length).toBe(0);
      expect(div.textContent).toContain('<script>alert("hack-promo")</script>Promoção 2x1');
    });
  });

  describe('CA04: Sanitização no Modal de Carrinho do Cardápio (CodeQL #15)', () => {
    it('escapa savedNome e mesaCodigo sem quebrar atributos HTML ou permitir injeção', async () => {
      localStorage.setItem('cafeteria_cliente_nome', '"><script>alert(1)</script><input value="');
      localStorage.setItem('cafeteria_cliente_telefone', '51999999999" onfocus="alert(2)');

      const mock = createSupabaseMock({
        produtos: [],
        categorias: [],
        mesas: [{ id: 'm1', codigo: 'Mesa <b onclick=alert(3)>01</b>', status: 'ocupada' }],
        adicionais: [],
        v_adicionais_produto: [],
        configuracoes_sistema: []
      });

      const harness = createPageHarness('cardapio.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/cardapio-cliente-pedido.js');

      harness.dispararDOMContentLoaded();
      await harness.aguardarRender(50);

      const modalCarrinho = harness.document.getElementById('modal-carrinho-cliente');
      expect(modalCarrinho).toBeTruthy();

      // Nenhum script deve ter sido injetado pelo nome salvo no localStorage
      const scripts = modalCarrinho.querySelectorAll('script');
      expect(scripts.length).toBe(0);

      const inputNome = harness.document.getElementById('input-cliente-nome');
      expect(inputNome).toBeTruthy();
      // O valor deve ser o texto exato, sem quebrar o atributo value
      expect(inputNome.value).toBe('"><script>alert(1)</script><input value="');

      harness.cleanup();
    });
  });

  describe('CA05: Sanitização de Nome de Dispositivo no KDS (CodeQL #16)', () => {
    it('escapa nome de dispositivo malicioso no resumo da impressora de cozinha.js', async () => {
      const mock = createSupabaseMock({
        perfis: [{ id: 'u2', nome: 'Chef Cozinha', role: 'cozinha', ativo: true }],
        pedidos: [],
        pedido_itens: [],
        mesas: [],
        categorias: [],
        produtos: []
      });

      mock.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u2' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };

      const harness = createPageHarness('cozinha.html', { supabase: mock });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/cozinha.js');

      harness.dispararDOMContentLoaded();
      await harness.aguardarRender(50);

      const devInput = harness.document.getElementById('cfg-device-name');
      const autoPrint = harness.document.getElementById('cfg-auto-print');
      const summaryBox = harness.document.getElementById('cfg-status-summary');

      if (devInput && summaryBox) {
        devInput.value = '<img src=x onerror=alert("kds-xss")>Tablet Bar';
        if (autoPrint) autoPrint.checked = true;

        // Dispara o evento de input para rodar atualizarResumoConfigModal
        devInput.dispatchEvent(new harness.window.Event('input'));
        await harness.aguardarRender(30);

        // O summaryBox NÃO pode conter tag <img> injetada
        expect(summaryBox.querySelectorAll('img[src="x"]').length).toBe(0);
        expect(summaryBox.textContent).toContain('<img src=x onerror=alert("kds-xss")>Tablet Bar');
      }

      harness.cleanup();
    });
  });

  describe('CA06: Sanitização no Modal Pix em Tela Cheia (CodeQL #17)', () => {
    it('escapa recebedor e subtitulo com tags perigosas em pix-brcode.js', async () => {
      const mock = createSupabaseMock({
        configuracoes_sistema: [
          { chave: 'pix_chave', valor: '00000000000' },
          { chave: 'pix_recebedor', valor: 'Cafeteria <script>alert(1)</script>' },
          { chave: 'pix_cidade', valor: 'Porto Alegre' }
        ]
      });

      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/pix-brcode.js');

      expect(harness.window.cafeteriaPix).toBeDefined();

      await harness.window.cafeteriaPix.abrirModalClienteTelaCheia({
        valor: 25.50,
        txid: 'TX1234',
        subtitulo: '<b onmouseover=alert(2)>Mesa 05 - João</b>'
      });

      const overlay = harness.document.getElementById('pix-fullscreen-modal');
      expect(overlay).toBeTruthy();

      // Nenhuma tag <script> ou <b> maliciosa foi instanciada como elemento HTML
      expect(overlay.querySelectorAll('script').length).toBe(0);
      expect(overlay.querySelectorAll('b').length).toBe(0);
      expect(overlay.textContent).toContain('CAFETERIA');
      expect(overlay.textContent).toContain('<b onmouseover=alert(2)>Mesa 05 - João</b>');
      expect(overlay.innerHTML).toContain('&lt;b onmouseover=alert(2)&gt;');

      harness.cleanup();
    });
  });

  describe('CA07: Sanitização de Impressão Térmica em pedido-print.js (CodeQL #11)', () => {
    it('escapa mesa_codigo, cliente_nome e observações antes de passar ao frame de impressão', async () => {
      const mock = createSupabaseMock({ pedidos: [] });
      const harness = createPageHarness('pedidos.html', { supabase: mock });
      await harness.carregarScript('js/pedido-print.js');

      const pedidoMalicioso = {
        id: 999,
        numero_pedido: 999,
        mesa_codigo: '<script>alert("mesa-xss")</script>12',
        cliente_nome: '<img src=x onerror=alert("cliente-xss")>Carlos',
        criado_por_nome: '<b onfocus=alert(1)>Atendente Pedro</b>',
        observacoes: '<iframe src="evil.com"></iframe>Sem açúcar',
        total: 15.00
      };

      const itens = [{
        id: 1,
        nome_produto: '<script>alert("prod-xss")</script>Capuccino',
        quantidade: 1,
        preco_unitario: 15.00,
        observacoes: '<img src=x>Com canela'
      }];

      // Mock iframe de impressão no harness
      let capturedHtml = '';
      const mockDoc = {
        open: vi.fn(),
        write: vi.fn((html) => { capturedHtml += html; }),
        close: vi.fn()
      };

      const mockIframe = {
        contentWindow: {
          document: mockDoc,
          focus: vi.fn(),
          print: vi.fn()
        }
      };

      vi.spyOn(harness.document, 'getElementById').mockImplementation((id) => {
        if (id === 'print-frame') return mockIframe;
        return harness.document.querySelector('#' + id);
      });

      expect(harness.window.cafeteriaPrint).toBeDefined();
      harness.window.cafeteriaPrint.printPedido(pedidoMalicioso, itens);

      expect(mockDoc.write).toHaveBeenCalled();
      // Verifica que nenhuma tag perigosa foi impressa sem escape
      expect(capturedHtml).not.toContain('<script>alert("mesa-xss")</script>');
      expect(capturedHtml).toContain('&lt;script&gt;alert(&quot;mesa-xss&quot;)&lt;/script&gt;');
      expect(capturedHtml).not.toContain('<iframe src="evil.com">');
      expect(capturedHtml).toContain('&lt;iframe src=&quot;evil.com&quot;&gt;');
      expect(capturedHtml).not.toContain('<b onfocus=alert(1)>Atendente Pedro</b>');
      expect(capturedHtml).toContain('&lt;b onfocus=alert(1)&gt;Atendente Pedro&lt;/b&gt;');

      harness.cleanup();
    });
  });

  describe('CA08: Integridade de escapeHtml e Caracteres Especiais', () => {
    it('neutraliza todos os caracteres de escape &, <, >, " e \' mantendo acentos', () => {
      const unsafe = '<div class="alerta" data-info=\'teste & mais\'>Ação café & pão!</div>';
      const safe = window.escapeHtml(unsafe);

      expect(safe).toBe('&lt;div class=&quot;alerta&quot; data-info=&#039;teste &amp; mais&#039;&gt;Ação café &amp; pão!&lt;/div&gt;');

      // Verifica tratamento de valores nulos e indefinidos
      expect(window.escapeHtml(null)).toBe('');
      expect(window.escapeHtml(undefined)).toBe('');
      expect(window.escapeHtml(0)).toBe('0');
    });
  });
});
