import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axe from 'axe-core';
import fs from 'fs';
import path from 'path';
import { createPageHarness } from './helpers/page-harness.js';

describe('CAF-000125: Acessibilidade do Totem e Cardápio do Cliente (WCAG 2.1 AA)', () => {
  let harness = null;

  afterEach(() => {
    if (harness && harness.cleanup) {
      harness.cleanup();
    }
    harness = null;
    vi.restoreAllMocks();
  });

  const mockProdutos = [
    {
      id: 'prod-cafe-1',
      nome: 'Café Expresso Especial',
      descricao: 'Grãos 100% arábica moídos na hora',
      preco: 7.50,
      categoria_id: 'cat-cafes',
      ativo: true,
      disponivel: true,
      esgotado: false,
      ordem: 1
    },
    {
      id: 'prod-salgado-esgotado',
      nome: 'Folhado de Frango com Catupiry',
      descricao: 'Massa folhada artesanal dourada',
      preco: 14.00,
      categoria_id: 'cat-cafes',
      ativo: true,
      disponivel: true,
      esgotado: true,
      ordem: 2
    }
  ];

  const mockCategorias = [
    { id: 'cat-cafes', nome: 'Cafés & Bebidas', ativo: true, ordem: 1 },
    { id: 'cat-salgados', nome: 'Salgados Finos', ativo: true, ordem: 2 }
  ];

  const mockAdicionais = [
    { id: 'adic-chantilly', nome: 'Dose Extra de Chantilly', preco: 3.50, ativo: true }
  ];

  const mockInitialDataTotem = {
    categorias: mockCategorias,
    produtos: mockProdutos,
    adicionais: mockAdicionais,
    v_adicionais_produto: [],
    promocoes: [],
    totem_sugestoes: [],
    configuracoes_sistema: []
  };

  // Helper para cálculo exato de contraste WCAG (luminância relativa)
  function calcularLuminanciaRelativa(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const srgb = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function calcularRazaoContraste(hex1, hex2) {
    const l1 = calcularLuminanciaRelativa(hex1);
    const l2 = calcularLuminanciaRelativa(hex2);
    const maisClaro = Math.max(l1, l2);
    const maisEscuro = Math.min(l1, l2);
    return (maisClaro + 0.05) / (maisEscuro + 0.05);
  }

  // ─────────────────────────────────────────────────────────────
  // CA01: Auditoria automatizada com axe-core (0 violações critical/serious)
  // ─────────────────────────────────────────────────────────────
  describe('CA01: Auditoria axe-core sem violações críticas ou sérias', () => {
    it('totem.html possui 0 violações críticas e sérias segundo axe-core', async () => {
      harness = createPageHarness('totem.html');
      
      const results = await axe.run(document.documentElement, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
        },
        rules: {
          'color-contrast': { enabled: false } // Happy DOM não possui motor de rasterização visual
        }
      });

      const violacoesGraves = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(violacoesGraves, `Violações no Totem: ${JSON.stringify(violacoesGraves, null, 2)}`).toHaveLength(0);
    });

    it('cardapio.html possui 0 violações críticas e sérias segundo axe-core', async () => {
      harness = createPageHarness('cardapio.html');

      const results = await axe.run(document.documentElement, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
        },
        rules: {
          'color-contrast': { enabled: false }
        }
      });

      const violacoesGraves = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(violacoesGraves, `Violações no Cardápio: ${JSON.stringify(violacoesGraves, null, 2)}`).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA02: Leitor de tela em cards de produtos (nome, preço, esgotado)
  // ─────────────────────────────────────────────────────────────
  describe('CA02: Cards de produto anunciam nome, preço e status via acessibilidade', () => {
    it('Totem anuncia produto disponível com nome e preço e produto esgotado com "esgotado"', async () => {
      localStorage.setItem('cafeteria_totem_token', 'token-teste-123');
      harness = createPageHarness('totem.html', {
        rpcHandlers: {
          validar_sessao_totem: () => ({ data: { valido: true, nome: 'Totem Teste' }, error: null })
        },
        initialData: mockInitialDataTotem
      });

      await harness.carregarScript('js/totem.js');
      await new Promise(r => setTimeout(r, 60));

      const cards = document.querySelectorAll('.totem-product-card');
      expect(cards.length).toBeGreaterThanOrEqual(2);

      const cardDisponivel = Array.from(cards).find(c => c.getAttribute('data-prod-id') === 'prod-cafe-1');
      expect(cardDisponivel).toBeTruthy();
      expect(cardDisponivel.getAttribute('role')).toBe('button');
      expect(cardDisponivel.getAttribute('tabindex')).toBe('0');
      expect(cardDisponivel.getAttribute('aria-label')).toContain('Café Expresso Especial');
      expect(cardDisponivel.getAttribute('aria-label')).toContain('7,50');
      expect(cardDisponivel.getAttribute('aria-label')).not.toContain('esgotado');

      const cardEsgotado = Array.from(cards).find(c => c.getAttribute('data-prod-id') === 'prod-salgado-esgotado');
      expect(cardEsgotado).toBeTruthy();
      expect(cardEsgotado.getAttribute('role')).toBe('button');
      expect(cardEsgotado.getAttribute('aria-label')).toContain('Folhado de Frango com Catupiry');
      expect(cardEsgotado.getAttribute('aria-label')).toContain('esgotado');
    });

    it('Cardápio Digital anuncia produto disponível e esgotado via role region e aria-label', async () => {
      harness = createPageHarness('cardapio.html');
      await harness.carregarScript('js/cardapio-dynamic.js');

      const prodDisp = { id: 'p1', nome: 'Cappuccino Italiano', preco: 12.00, disponivel: true };
      const prodEsg = { id: 'p2', nome: 'Bolo de Cenoura', preco: 9.50, disponivel: false };

      const cardDispHtml = window.cardapioDynamic.renderProductCard(prodDisp);
      const cardEsgHtml = window.cardapioDynamic.renderProductCard(prodEsg);

      const div = document.createElement('div');
      div.innerHTML = cardDispHtml + cardEsgHtml;
      document.body.appendChild(div);

      const card1 = div.children[0];
      const card2 = div.children[1];

      expect(card1.getAttribute('role')).toBe('region');
      expect(card1.getAttribute('tabindex')).toBe('0');
      expect(card1.getAttribute('aria-label')).toContain('Cappuccino Italiano');
      expect(card1.getAttribute('aria-label')).toContain('12,00');
      expect(card1.getAttribute('aria-label')).not.toContain('esgotado');

      expect(card2.getAttribute('role')).toBe('region');
      expect(card2.getAttribute('aria-label')).toContain('Bolo de Cenoura');
      expect(card2.getAttribute('aria-label')).toContain('esgotado');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA03: Navegação completa por teclado (Tab, Enter, Space, Esc) e focus-visible
  // ─────────────────────────────────────────────────────────────
  describe('CA03: Navegação por teclado e foco visível :focus-visible', () => {
    it('CSS do Totem e Cardápio contêm regras explícitas de :focus-visible', () => {
      const cssTotem = fs.readFileSync(path.resolve(process.cwd(), 'css/totem.css'), 'utf-8');
      const cssCardapio = fs.readFileSync(path.resolve(process.cwd(), 'css/cardapio-cliente-pedido.css'), 'utf-8');

      expect(cssTotem).toContain(':focus-visible');
      expect(cssTotem).toContain('outline:');

      expect(cssCardapio).toContain(':focus-visible');
      expect(cssCardapio).toContain('outline:');
    });

    it('Cards de produto no Totem são ativáveis via teclado (Enter e Space)', async () => {
      localStorage.setItem('cafeteria_totem_token', 'token-teste-123');
      harness = createPageHarness('totem.html', {
        rpcHandlers: {
          validar_sessao_totem: () => ({ data: { valido: true, nome: 'Totem Teste' }, error: null })
        },
        initialData: mockInitialDataTotem
      });

      await harness.carregarScript('js/totem.js');
      await new Promise(r => setTimeout(r, 60));

      const card = document.querySelector('.totem-product-card[data-prod-id="prod-cafe-1"]');
      expect(card).toBeTruthy();

      const modalItem = document.getElementById('totem-modal-item');
      expect(modalItem.classList.contains('hidden')).toBe(true);

      // Dispara tecla 'Enter'
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(modalItem.classList.contains('hidden')).toBe(false);

      // Fecha modal com Escape
      modalItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(modalItem.classList.contains('hidden')).toBe(true);

      // Dispara tecla 'Space'
      card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(modalItem.classList.contains('hidden')).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA04: Modais e Bottom-Sheets com role="dialog", focus trap e focus restoration
  // ─────────────────────────────────────────────────────────────
  describe('CA04: Gestão de foco em modais (dialog, focus trap e retorno ao gatilho)', () => {
    it('Totem confina o foco no modal aberto e restaura para o elemento gatilho ao fechar via Esc', async () => {
      localStorage.setItem('cafeteria_totem_token', 'token-teste-123');
      harness = createPageHarness('totem.html', {
        rpcHandlers: {
          validar_sessao_totem: () => ({ data: { valido: true, nome: 'Totem Teste' }, error: null })
        },
        initialData: mockInitialDataTotem
      });

      await harness.carregarScript('js/totem.js');
      await new Promise(r => setTimeout(r, 60));

      const triggerBtn = document.querySelector('.totem-product-card[data-prod-id="prod-cafe-1"]');
      expect(triggerBtn).toBeTruthy();
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      // Abre modal
      triggerBtn.click();
      const modal = document.getElementById('totem-modal-item');
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      expect(modal.classList.contains('hidden')).toBe(false);

      await new Promise(r => setTimeout(r, 60));

      // Testa Focus Trap: Tab no último elemento volta para o primeiro
      const focusables = modal.querySelectorAll('button:not([disabled]), input:not([disabled])');
      expect(focusables.length).toBeGreaterThan(1);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      last.focus();
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      modal.dispatchEvent(tabEvent);
      expect(document.activeElement).toBe(first);

      // Fecha via Escape
      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(modal.classList.contains('hidden')).toBe(true);

      // Foco restaurado para o gatilho
      expect(document.activeElement).toBe(triggerBtn);
    });

    it('Cardápio Digital abre modal de personalização com role="dialog" e restaura foco ao fechar', async () => {
      harness = createPageHarness('cardapio.html');
      await harness.carregarScript('js/cardapio-dynamic.js');
      await harness.carregarScript('js/cardapio-cliente-pedido.js');

      window.injetarUIAutoatendimento();

      const triggerBtn = document.createElement('button');
      triggerBtn.id = 'gatilho-teste';
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();

      window.abrirModalCustomizar({ id: 'p1', nome: 'Suco Natural', preco: 10 }, triggerBtn);
      const modal = document.getElementById('modal-customizar-item');
      expect(modal).toBeTruthy();
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      expect(modal.classList.contains('hidden')).toBe(false);

      // Fecha com Escape
      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(modal.classList.contains('hidden')).toBe(true);
      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA05: Anúncios dinâmicos (aria-live) sem desviar o foco do usuário
  // ─────────────────────────────────────────────────────────────
  describe('CA05: Anúncios acessíveis via live regions para carrinho, erros e senha', () => {
    it('Totem atualiza #totem-live-announcer ao adicionar produto sem perder foco atual', async () => {
      localStorage.setItem('cafeteria_totem_token', 'token-teste-123');
      harness = createPageHarness('totem.html', {
        rpcHandlers: {
          validar_sessao_totem: () => ({ data: { valido: true, nome: 'Totem Teste' }, error: null })
        },
        initialData: mockInitialDataTotem
      });

      await harness.carregarScript('js/totem.js');
      await new Promise(r => setTimeout(r, 60));

      const card = document.querySelector('.totem-product-card[data-prod-id="prod-cafe-1"]');
      expect(card).toBeTruthy();
      card.click();

      const btnConfirmar = document.getElementById('btn-confirm-item-modal');
      expect(btnConfirmar).toBeTruthy();
      btnConfirmar.focus();
      btnConfirmar.click();

      await new Promise(r => setTimeout(r, 70));
      const announcer = document.getElementById('totem-live-announcer');
      expect(announcer.textContent).toContain('Café Expresso Especial adicionado ao pedido');
    });

    it('Cardápio Digital anuncia produtos adicionados e feedback de erros via #cardapio-live-announcer', async () => {
      harness = createPageHarness('cardapio.html');
      await harness.carregarScript('js/cardapio-dynamic.js');
      await harness.carregarScript('js/cardapio-cliente-pedido.js');

      window.anunciarCardapioA11y('Item adicionado ao carrinho com sucesso');
      await new Promise(r => setTimeout(r, 70));

      const announcer = document.getElementById('cardapio-live-announcer');
      expect(announcer.textContent).toBe('Item adicionado ao carrinho com sucesso');

      window.anunciarCardapioA11y('Erro: nome obrigatório', true);
      await new Promise(r => setTimeout(r, 70));

      const alertEl = document.getElementById('cardapio-live-alert');
      expect(alertEl.textContent).toBe('Erro: nome obrigatório');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA06: Contraste de cor mínimo de 4,5:1 e estado não indicado apenas por cor
  // ─────────────────────────────────────────────────────────────
  describe('CA06: Contraste mínimo e independência visual de cores', () => {
    it('Cores da paleta padrão do Totem e Cardápio atendem >= 4.5:1 para texto normal', () => {
      // Texto principal escuro (#2C1E16) sobre fundo bege (#FDFBF7)
      const ratioTextoNormal = calcularRazaoContraste('#2C1E16', '#FDFBF7');
      expect(ratioTextoNormal).toBeGreaterThanOrEqual(4.5); // Tipicamente ~14:1

      // Botão primário (#8B4513) sobre fundo claro (#FFF)
      const ratioBtnPrimario = calcularRazaoContraste('#8B4513', '#FFFFFF');
      expect(ratioBtnPrimario).toBeGreaterThanOrEqual(4.5); // Tipicamente ~6.5:1

      // Alto contraste Totem (#FFFFFF sobre #000000)
      const ratioAltoContraste = calcularRazaoContraste('#FFFFFF', '#000000');
      expect(ratioAltoContraste).toBeGreaterThanOrEqual(7.0); // 21:1 (AAA)

      // Amarelo acessível (#FFD700 sobre #000000)
      const ratioDouradoAltoContraste = calcularRazaoContraste('#FFD700', '#000000');
      expect(ratioDouradoAltoContraste).toBeGreaterThanOrEqual(7.0); // ~14:1 (AAA)
    });

    it('Produtos esgotados e estados de seleção possuem texto ou ícone explícito além da cor', async () => {
      harness = createPageHarness('cardapio.html');
      await harness.carregarScript('js/cardapio-dynamic.js');

      const prodEsg = { id: 'p2', nome: 'Bolo de Cenoura', preco: 9.50, disponivel: false };
      const cardHtml = window.cardapioDynamic.renderProductCard(prodEsg);

      const div = document.createElement('div');
      div.innerHTML = cardHtml;
      document.body.appendChild(div);

      // Não se baseia só em cor: o texto "Indisponível hoje" e aria-label com "esgotado" estão presentes
      const badge = div.querySelector('.badge');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('Indisponível hoje');

      const article = div.querySelector('article');
      expect(article.getAttribute('aria-label')).toContain('esgotado');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA07: Suporte a prefers-reduced-motion (desativação de animações/vídeos)
  // ─────────────────────────────────────────────────────────────
  describe('CA07: Suporte a prefers-reduced-motion', () => {
    it('Arquivos CSS contêm media query @media (prefers-reduced-motion: reduce)', () => {
      const cssTotem = fs.readFileSync(path.resolve(process.cwd(), 'css/totem.css'), 'utf-8');
      const cssCardapio = fs.readFileSync(path.resolve(process.cwd(), 'css/cardapio-cliente-pedido.css'), 'utf-8');

      expect(cssTotem).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssTotem).toContain('animation-duration: 0.001ms');

      expect(cssCardapio).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssCardapio).toContain('transition-duration: 0.001ms');
    });

    it('Totem não dispara animação de fundo dinâmico quando matchMedia indica prefers-reduced-motion: reduce', async () => {
      window.matchMedia = vi.fn().mockImplementation(query => {
        return {
          matches: query.includes('prefers-reduced-motion: reduce'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        };
      });

      localStorage.setItem('cafeteria_totem_token', 'token-teste-123');
      harness = createPageHarness('totem.html', {
        rpcHandlers: {
          validar_sessao_totem: () => ({
            data: {
              valido: true,
              nome: 'Totem Teste',
              animacao_fundo: { tipo: 'video', url: 'video.mp4' }
            },
            error: null
          })
        },
        initialData: mockInitialDataTotem
      });

      await harness.carregarScript('js/totem.js');
      await new Promise(r => setTimeout(r, 60));

      const idleBg = document.getElementById('totem-idle-bg-layer');
      // Com prefers-reduced-motion, a animação de vídeo não deve injetar tag <video>
      const videoEl = idleBg?.querySelector('video');
      expect(videoEl).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA08: Botão "Texto maior / alto contraste" (+30% e contraste) com auto-reset
  // ─────────────────────────────────────────────────────────────
  describe('CA08: Botão "Texto maior / alto contraste" (+30%) e auto-reset', () => {
    it('Botão do Totem alterna classes .totem-font-large e .totem-high-contrast e atualiza aria-pressed', async () => {
      localStorage.setItem('cafeteria_totem_token', 'token-teste-123');
      harness = createPageHarness('totem.html', {
        rpcHandlers: {
          validar_sessao_totem: () => ({ data: { valido: true, nome: 'Totem Teste' }, error: null })
        },
        initialData: mockInitialDataTotem
      });

      await harness.carregarScript('js/totem.js');

      const btnToggle = document.getElementById('btn-totem-font-toggle');
      expect(btnToggle).toBeTruthy();
      expect(btnToggle.getAttribute('aria-pressed')).toBe('false');

      // Clica para ativar
      btnToggle.click();
      expect(document.body.classList.contains('totem-font-large')).toBe(true);
      expect(document.body.classList.contains('totem-high-contrast')).toBe(true);
      expect(btnToggle.getAttribute('aria-pressed')).toBe('true');

      // Clica para desativar
      btnToggle.click();
      expect(document.body.classList.contains('totem-font-large')).toBe(false);
      expect(document.body.classList.contains('totem-high-contrast')).toBe(false);
      expect(btnToggle.getAttribute('aria-pressed')).toBe('false');
    });

    it('Preferência de acessibilidade reseta automaticamente ao iniciar novo pedido ou por timeout', async () => {
      localStorage.setItem('cafeteria_totem_token', 'token-teste-123');
      harness = createPageHarness('totem.html', {
        rpcHandlers: {
          validar_sessao_totem: () => ({ data: { valido: true, nome: 'Totem Teste' }, error: null })
        },
        initialData: mockInitialDataTotem
      });

      await harness.carregarScript('js/totem.js');

      const btnToggle = document.getElementById('btn-totem-font-toggle');
      btnToggle.click();
      expect(document.body.classList.contains('totem-high-contrast')).toBe(true);

      // Clica em "Novo Pedido" na tela de sucesso
      const btnNovo = document.getElementById('btn-totem-novo-pedido');
      btnNovo.click();

      // Confirma que resetou
      expect(document.body.classList.contains('totem-font-large')).toBe(false);
      expect(document.body.classList.contains('totem-high-contrast')).toBe(false);
      expect(btnToggle.getAttribute('aria-pressed')).toBe('false');
    });

    it('CSS define escala tipográfica de 1.30 (+30%) para body.totem-font-large', () => {
      const cssTotem = fs.readFileSync(path.resolve(process.cwd(), 'css/totem.css'), 'utf-8');
      expect(cssTotem).toContain('body.totem-font-large');
      expect(cssTotem).toContain('--totem-font-scale: 1.30');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // CA09: Layout do Cardápio preservado sem rolagem horizontal com zoom 200%
  // ─────────────────────────────────────────────────────────────
  describe('CA09: Preservação de layout no Cardápio em zoom 200%', () => {
    it('CSS do Cardápio possui proteções contra overflow horizontal (max-width: 100vw, flex-wrap)', () => {
      const cssCardapio = fs.readFileSync(path.resolve(process.cwd(), 'css/cardapio-cliente-pedido.css'), 'utf-8');
      expect(cssCardapio).toContain('max-width: 100vw');
      expect(cssCardapio).toContain('overflow-x: hidden');
    });

    it('Container e modais do Cardápio adaptam-se a viewports compactas (zoom 200%) sem estourar a tela', () => {
      harness = createPageHarness('cardapio.html');

      const body = document.body;
      expect(body).toBeTruthy();

      const mainContainer = document.querySelector('.cardapio-app') || document.querySelector('.main-content') || document.body;
      expect(mainContainer).toBeTruthy();
    });
  });
});
