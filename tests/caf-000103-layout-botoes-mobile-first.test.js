import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';
import { setupPedidosPage } from './helpers/pedidos-page.js';

/**
 * CAF-000103: Suíte de Testes Funcionais Automatizados
 * Reorganização do Layout e Hierarquia de Botões Mobile-First em Pedidos, Cozinha e Totem
 */
describe('CAF-000103: Layout e Hierarquia de Botões Mobile-First', () => {

  // =========================================================================
  // MÓDULO 1: VERIFICAÇÃO ESTRUTURAL DE CÓDIGO E DESIGN TOKENS
  // =========================================================================
  describe('Módulo 1: Integridade Estrutural, Zero Estilos Inline e Breakpoints Mobile-First', () => {
    const filesWithButtons = [
      'pedidos.html',
      'cozinha.html',
      'totem.html',
      'js/pedidos.js',
      'js/cozinha.js',
      'js/totem.js'
    ];

    const cssFiles = [
      'css/base.css',
      'css/components.css',
      'css/totem.css',
      'css/cozinha.css',
      'css/pedidos.css'
    ];

    it('CA01: Zero atributos style="..." em elementos <button> nos 3 fluxos (HTML e JS)', () => {
      filesWithButtons.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const violations = [];

        lines.forEach((line, index) => {
          if (line.includes('<button') && line.includes('style=')) {
            violations.push(`${filePath}:${index + 1} -> ${line.trim()}`);
          }
        });

        expect(violations, `Violações de estilo inline em <button> encontradas em ${filePath}`).toHaveLength(0);
      });
    });

    it('CA04: Nenhuma media query nos arquivos CSS utiliza max-width (mobile-first)', () => {
      cssFiles.forEach(cssPath => {
        const content = fs.readFileSync(cssPath, 'utf8');
        const matches = content.match(/@media[^{]*max-width[^{]*\{/g) || [];
        expect(matches, `Media queries com max-width encontradas em ${cssPath}`).toHaveLength(0);
      });
    });

    it('Design Tokens: base.css e components.css possuem tokens de botões e variantes', () => {
      const baseCss = fs.readFileSync('css/base.css', 'utf8');
      const compCss = fs.readFileSync('css/components.css', 'utf8');

      expect(baseCss).toContain('--btn-h-sm:');
      expect(baseCss).toContain('--btn-h-md:');
      expect(baseCss).toContain('--btn-h-lg:');
      expect(baseCss).toContain('--btn-h-xl:');
      expect(baseCss).toContain('--btn-gap:');
      expect(baseCss).toContain('--vermelho-danger:');

      expect(compCss).toContain('.btn--primary');
      expect(compCss).toContain('.btn--secondary');
      expect(compCss).toContain('.btn--ghost');
      expect(compCss).toContain('.btn--danger');
      expect(compCss).toContain('.btn--choice');
    });

    it('CA17: IDs originais essenciais de botões são preservados em todas as telas', () => {
      const pedidosHtml = fs.readFileSync('pedidos.html', 'utf8');
      const cozinhaHtml = fs.readFileSync('cozinha.html', 'utf8');
      const totemHtml = fs.readFileSync('totem.html', 'utf8');

      const expectedPedidosIds = [
        'btn-enviar-pedido',
        'modal-mesa-fechar-conta',
        'btn-mesa-adicionar-itens',
        'btn-mesa-transferir',
        'btn-mesa-juntar',
        'btn-mesa-repetir-rodada',
        'modal-mesa-print',
        'btn-mesa-whatsapp',
        'btn-mesa-share',
        'modal-mesa-fechar',
        'modal-fechar-conta-confirmar',
        'modal-fechar-conta-cancelar',
        'btn-fechar-conta-next-1',
        'btn-fechar-conta-next-2'
      ];

      expectedPedidosIds.forEach(id => {
        expect(pedidosHtml).toContain(`id="${id}"`);
      });

      const expectedCozinhaIds = [
        'btn-kds-ferramentas',
        'filtro-estacao',
        'btn-filtro-intervalo',
        'sheet-kds-ferramentas',
        'btn-close-sheet-kds'
      ];

      expectedCozinhaIds.forEach(id => {
        expect(cozinhaHtml).toContain(`id="${id}"`);
      });

      const expectedTotemIds = [
        'btn-totem-limpar',
        'btn-totem-avancar',
        'btn-close-checkout-modal',
        'btn-back-checkout-modal',
        'btn-totem-enviar-pedido',
        'btn-totem-novo-pedido'
      ];

      expectedTotemIds.forEach(id => {
        expect(totemHtml).toContain(`id="${id}"`);
      });
    });
  });

  // =========================================================================
  // MÓDULO 2: PEDIDOS / PDV (EXECUÇÃO REAL NO DOM)
  // =========================================================================
  describe('Módulo 2: Fluxo do PDV — Modal de Mesa, Fechamento de Conta e Chips', () => {
    let harnessContext;

    beforeEach(async () => {
      localStorage.clear();
      sessionStorage.clear();
      harnessContext = await setupPedidosPage();
    });

    it('CA05: Drawer do carrinho possui botão sticky de largura total', () => {
      const btnEnviar = document.getElementById('btn-enviar-pedido');
      expect(btnEnviar).not.toBeNull();
      expect(btnEnviar.classList.contains('btn-primary')).toBe(true);

      const cartFooter = btnEnviar.closest('.cart-footer');
      expect(cartFooter).not.toBeNull();
    });

    it('CA06 / CA07: Modal da Mesa exibe apenas 3 botões principais e abre bottom sheet com ações secundárias', () => {
      const footerMain = document.querySelector('.modal-mesa-footer-main');
      expect(footerMain).not.toBeNull();

      const mainButtons = footerMain.querySelectorAll('button');
      expect(mainButtons).toHaveLength(3);

      const btnFecharConta = document.getElementById('modal-mesa-fechar-conta');
      const btnAddItens = document.getElementById('btn-mesa-adicionar-itens');
      const btnMaisAcoes = document.getElementById('btn-mesa-mais-acoes');

      expect(btnFecharConta).not.toBeNull();
      expect(btnAddItens).not.toBeNull();
      expect(btnMaisAcoes).not.toBeNull();

      const sheetAcoes = document.getElementById('modal-mesa-sheet-acoes');
      expect(sheetAcoes).not.toBeNull();
      expect(sheetAcoes.classList.contains('hidden')).toBe(true);

      // Clica em "Mais ações" para abrir a bottom sheet
      btnMaisAcoes.click();
      expect(sheetAcoes.classList.contains('hidden')).toBe(false);
      expect(btnMaisAcoes.getAttribute('aria-expanded')).toBe('true');

      // Verifica ações secundárias dentro da bottom sheet
      const btnTransferir = document.getElementById('btn-mesa-transferir');
      const btnJuntar = document.getElementById('btn-mesa-juntar');
      const btnRepetir = document.getElementById('btn-mesa-repetir-rodada');
      const btnPrint = document.getElementById('modal-mesa-print');
      const btnWhatsapp = document.getElementById('btn-mesa-whatsapp');
      const btnShare = document.getElementById('btn-mesa-share');

      expect(btnTransferir).not.toBeNull();
      expect(btnJuntar).not.toBeNull();
      expect(btnRepetir).not.toBeNull();
      expect(btnPrint).not.toBeNull();
      expect(btnWhatsapp).not.toBeNull();
      expect(btnShare).not.toBeNull();

      // Fechar a bottom sheet via botão fechar
      const btnCloseSheet = document.getElementById('btn-mesa-sheet-close');
      expect(btnCloseSheet).not.toBeNull();
      btnCloseSheet.click();
      expect(sheetAcoes.classList.contains('hidden')).toBe(true);
      expect(btnMaisAcoes.getAttribute('aria-expanded')).toBe('false');

      // Reabrir e fechar com Escape
      btnMaisAcoes.click();
      expect(sheetAcoes.classList.contains('hidden')).toBe(false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(sheetAcoes.classList.contains('hidden')).toBe(true);
    });

    it('CA08: Modal de Fechar Conta limita a no máximo 2 botões no rodapé por etapa e oculta WhatsApp/Share', () => {
      const setStep = window.baristaSetFecharContaStep;
      expect(typeof setStep).toBe('function');

      const btnNext1 = document.getElementById('btn-fechar-conta-next-1');
      const btnNext2 = document.getElementById('btn-fechar-conta-next-2');
      const btnConfirmar = document.getElementById('modal-fechar-conta-confirmar');
      const btnCancelar = document.getElementById('modal-fechar-conta-cancelar');
      const btnVoltarFooter = document.getElementById('btn-fechar-conta-voltar-footer');
      const btnWhatsapp = document.getElementById('btn-fechar-conta-whatsapp');
      const btnShare = document.getElementById('btn-fechar-conta-share');

      // --- Passo 1 ---
      setStep(1);
      expect(btnNext1.classList.contains('hidden')).toBe(false);
      expect(btnCancelar.classList.contains('hidden')).toBe(false);
      expect(btnNext2.classList.contains('hidden')).toBe(true);
      expect(btnConfirmar.classList.contains('hidden')).toBe(true);
      expect(btnVoltarFooter.classList.contains('hidden')).toBe(true);
      expect(btnWhatsapp.classList.contains('hidden')).toBe(true);
      expect(btnShare.classList.contains('hidden')).toBe(true);

      // --- Passo 2 ---
      setStep(2);
      expect(btnNext2.classList.contains('hidden')).toBe(false);
      expect(btnVoltarFooter.classList.contains('hidden')).toBe(false);
      expect(btnNext1.classList.contains('hidden')).toBe(true);
      expect(btnCancelar.classList.contains('hidden')).toBe(true);
      expect(btnConfirmar.classList.contains('hidden')).toBe(true);
      expect(btnWhatsapp.classList.contains('hidden')).toBe(true);
      expect(btnShare.classList.contains('hidden')).toBe(true);

      // --- Passo 3 ---
      setStep(3);
      expect(btnConfirmar.classList.contains('hidden')).toBe(false);
      expect(btnVoltarFooter.classList.contains('hidden')).toBe(false);
      expect(btnNext1.classList.contains('hidden')).toBe(true);
      expect(btnNext2.classList.contains('hidden')).toBe(true);
      expect(btnCancelar.classList.contains('hidden')).toBe(true);
      expect(btnWhatsapp.classList.contains('hidden')).toBe(true);
      expect(btnShare.classList.contains('hidden')).toBe(true);
    });

    it('CA10: Chips de filtro atualizam aria-pressed="true" no selecionado e "false" nos demais', () => {
      const escopoChips = document.querySelectorAll('.pedidos-filtro-escopo .btn-escopo-chip');
      expect(escopoChips.length).toBeGreaterThanOrEqual(2);

      const chipTodos = Array.from(escopoChips).find(c => c.dataset.scope === 'todos');
      const chipMeus = Array.from(escopoChips).find(c => c.dataset.scope === 'meus');

      expect(chipTodos).not.toBeUndefined();
      expect(chipMeus).not.toBeUndefined();

      chipMeus.click();
      expect(chipMeus.classList.contains('active')).toBe(true);
      expect(chipMeus.getAttribute('aria-pressed')).toBe('true');
      expect(chipTodos.classList.contains('active')).toBe(false);
      expect(chipTodos.getAttribute('aria-pressed')).toBe('false');

      chipTodos.click();
      expect(chipTodos.classList.contains('active')).toBe(true);
      expect(chipTodos.getAttribute('aria-pressed')).toBe('true');
      expect(chipMeus.classList.contains('active')).toBe(false);
      expect(chipMeus.getAttribute('aria-pressed')).toBe('false');

      // Filtros de status
      const statusChips = document.querySelectorAll('.status-filters .filter-chip');
      expect(statusChips.length).toBeGreaterThan(1);

      const chipPreparo = Array.from(statusChips).find(c => c.dataset.filter === 'em_preparo');
      expect(chipPreparo).not.toBeUndefined();

      chipPreparo.click();
      expect(chipPreparo.classList.contains('active')).toBe(true);
      expect(chipPreparo.getAttribute('aria-pressed')).toBe('true');

      const outrosStatus = Array.from(statusChips).filter(c => c !== chipPreparo);
      outrosStatus.forEach(c => {
        expect(c.getAttribute('aria-pressed')).toBe('false');
      });
    });

    it('CA19: Botões de ditado por voz estão presentes e preservados', () => {
      const btnVoiceCart = document.getElementById('btn-voice-pedido-obs');
      const btnVoiceMontagem = document.getElementById('btn-voice-montagem-obs');
      const btnVoiceModal = document.getElementById('btn-voice-modal-obs');

      expect(btnVoiceCart).not.toBeNull();
      expect(btnVoiceMontagem).not.toBeNull();
      expect(btnVoiceModal).not.toBeNull();

      expect(btnVoiceCart.classList.contains('btn-voice-dictation')).toBe(true);
      expect(btnVoiceMontagem.classList.contains('btn-voice-dictation')).toBe(true);
      expect(btnVoiceModal.classList.contains('btn-voice-dictation')).toBe(true);
    });
  });

  // =========================================================================
  // MÓDULO 3: COZINHA / KDS (EXECUÇÃO REAL NO DOM)
  // =========================================================================
  describe('Módulo 3: Fluxo da Cozinha (KDS) — Bottom Sheet de Ferramentas, Abas e Bump Bar', () => {
    let harness;

    beforeEach(async () => {
      localStorage.clear();
      sessionStorage.clear();

      const mockSupabase = createSupabaseMock({
        perfis: [{ id: 'u1', nome: 'Chef Cozinha', role: 'cozinha', ativo: true }],
        pedidos: [],
        itens_pedido: []
      });
      mockSupabase.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };
      window.cafeteriaSupabase = mockSupabase;
      window.supabaseClient = mockSupabase;

      harness = createPageHarness('cozinha.html', { supabase: mockSupabase });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/cozinha.js');
    });

    it('CA11 / CA13: Botão de ferramentas abre bottom sheet e fecha via botão, backdrop e Esc', () => {
      const btnFerramentas = document.getElementById('btn-kds-ferramentas');
      const sheetFerramentas = document.getElementById('sheet-kds-ferramentas');
      const btnCloseSheet = document.getElementById('btn-close-sheet-kds');

      expect(btnFerramentas).not.toBeNull();
      expect(sheetFerramentas).not.toBeNull();
      expect(sheetFerramentas.classList.contains('hidden')).toBe(true);

      // Abrir sheet
      btnFerramentas.click();
      expect(sheetFerramentas.classList.contains('hidden')).toBe(false);
      expect(btnFerramentas.getAttribute('aria-expanded')).toBe('true');

      // Fechar via botão
      btnCloseSheet.click();
      expect(sheetFerramentas.classList.contains('hidden')).toBe(true);
      expect(btnFerramentas.getAttribute('aria-expanded')).toBe('false');

      // Abrir e fechar via backdrop
      btnFerramentas.click();
      expect(sheetFerramentas.classList.contains('hidden')).toBe(false);
      sheetFerramentas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(sheetFerramentas.classList.contains('hidden')).toBe(true);

      // Abrir e fechar via Escape
      btnFerramentas.click();
      expect(sheetFerramentas.classList.contains('hidden')).toBe(false);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(sheetFerramentas.classList.contains('hidden')).toBe(true);
    });

    it('CA20: Bottom nav mobile (#kds-mobile-tabs) alterna filtros de coluna', () => {
      const tabPreparo = document.querySelector('#kds-mobile-tabs [data-col="preparo"]');
      const tabConcluidos = document.querySelector('#kds-mobile-tabs [data-col="concluidos"]');
      const tabPendentes = document.querySelector('#kds-mobile-tabs [data-col="pendentes"]');

      expect(tabPreparo).not.toBeNull();
      expect(tabConcluidos).not.toBeNull();
      expect(tabPendentes).not.toBeNull();

      tabPreparo.click();
      expect(tabPreparo.classList.contains('active')).toBe(true);
      expect(tabConcluidos.classList.contains('active')).toBe(false);

      tabConcluidos.click();
      expect(tabConcluidos.classList.contains('active')).toBe(true);
      expect(tabPreparo.classList.contains('active')).toBe(false);

      tabPendentes.click();
      expect(tabPendentes.classList.contains('active')).toBe(true);
      expect(tabConcluidos.classList.contains('active')).toBe(false);
    });

    it('CA14: Atalhos de teclado do bump bar (1-9, Espaço, E, Enter) são processados sem erro', () => {
      // Dispara teclas do bump bar
      const keys = ['1', '2', ' ', 'e', 'E', 'Enter'];
      keys.forEach(k => {
        expect(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        }).not.toThrow();
      });
    });
  });

  // =========================================================================
  // MÓDULO 4: TOTEM DE AUTOATENDIMENTO (EXECUÇÃO REAL NO DOM)
  // =========================================================================
  describe('Módulo 4: Totem — Posicionamento de Botões, Animações de Fundo e Sanitização', () => {
    let harness;

    beforeEach(async () => {
      localStorage.clear();
      sessionStorage.clear();

      const mockSupabase = createSupabaseMock({
        produtos: [],
        categorias: [],
        adicionais: [],
        configuracoes_sistema: []
      });
      mockSupabase.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };
      window.cafeteriaSupabase = mockSupabase;
      window.supabaseClient = mockSupabase;

      harness = createPageHarness('totem.html', { supabase: mockSupabase });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/totem.js');
    });

    it('CA15: Botão "Recomeçar" fica no header e barra inferior contém apenas "Finalizar Pedido"', () => {
      const btnLimpar = document.getElementById('btn-totem-limpar');
      const headerActions = btnLimpar.closest('.totem-header__actions');
      expect(headerActions).not.toBeNull();

      const footer = document.querySelector('.totem-bottom-bar');
      expect(footer).not.toBeNull();

      // Footer contém apenas finalizar pedido
      const btnFinalizar = document.getElementById('btn-totem-avancar');
      expect(btnFinalizar).not.toBeNull();
      expect(footer.contains(btnFinalizar)).toBe(true);
      expect(footer.contains(btnLimpar)).toBe(false);
    });

    it('CA21 / CA25: Catálogo de animações CSS aplica classes correspondentes no container', () => {
      const aplicarAnim = window.aplicarAnimacaoFundo;
      const limparAnim = window.limparAnimacaoFundo;
      expect(typeof aplicarAnim).toBe('function');
      expect(typeof limparAnim).toBe('function');

      const bgContainer = document.getElementById('totem-idle-bg-layer');
      expect(bgContainer).not.toBeNull();

      // Teste cortina
      aplicarAnim('cortina');
      expect(bgContainer.className).toContain('totem-anim--cortina');

      // Teste vapor
      aplicarAnim('vapor');
      expect(bgContainer.className).toContain('totem-anim--vapor');

      // Teste graos
      aplicarAnim('graos');
      expect(bgContainer.className).toContain('totem-anim--graos');

      // Teste nenhuma / limpar
      aplicarAnim('nenhuma');
      expect(bgContainer.className).not.toContain('totem-anim--');
      expect(bgContainer.children.length).toBe(1); // mantém o .totem-bg-overlay
    });

    it('CA22 / CA25: Animação de mídia personalizada cria elemento <video> ou <img>', () => {
      const aplicarAnim = window.aplicarAnimacaoFundo;
      const bgContainer = document.getElementById('totem-idle-bg-layer');

      // Video MP4
      aplicarAnim('https://example.com/assets/teatro-curtain.mp4');
      const video = bgContainer.querySelector('video');
      expect(video).not.toBeNull();
      expect(video.getAttribute('autoplay')).toBeDefined();
      expect(video.getAttribute('muted')).toBeDefined();
      expect(video.getAttribute('loop')).toBeDefined();
      expect(video.src).toContain('teatro-curtain.mp4');

      // Imagem GIF
      aplicarAnim('https://example.com/assets/fumaca-cafe.gif');
      const img = bgContainer.querySelector('img');
      expect(img).not.toBeNull();
      expect(img.getAttribute('alt')).toBe('Animação de fundo do Totem');
      expect(img.src).toContain('fumaca-cafe.gif');
    });

    it('CA26: Sanitização de URL bloqueia esquemas inseguros (javascript:, data:) e aceita HTTPS e caminhos relativos', () => {
      const sanitizar = window.sanitizarUrlMidia;
      expect(typeof sanitizar).toBe('function');

      // URLs perigosas rejeitadas
      expect(sanitizar('javascript:alert(1)')).toBeNull();
      expect(sanitizar('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(sanitizar('vbscript:msgbox(1)')).toBeNull();
      expect(sanitizar('file:///etc/passwd')).toBeNull();

      // URLs e caminhos seguros aprovados
      expect(sanitizar('https://teatro.com/assets/video.mp4')).toBe('https://teatro.com/assets/video.mp4');
      expect(sanitizar('/assets/animacao.gif')).toBe('/assets/animacao.gif');
      expect(sanitizar('assets/animacao.mp4')).toBe('assets/animacao.mp4');
    });
  });

  // =========================================================================
  // MÓDULO 5: CONFIGURAÇÕES E UPLOAD NO ADMIN (EXECUÇÃO REAL)
  // =========================================================================
  describe('Módulo 5: Admin — Validação de Arquivo e Salvamento de Animação', () => {
    let harness;

    beforeEach(async () => {
      localStorage.clear();
      sessionStorage.clear();

      const mockSupabase = createSupabaseMock({
        perfis: [{ id: 'u1', nome: 'Admin', role: 'admin', ativo: true }],
        configuracoes_sistema: [{ chave: 'totem_animacao_fundo', valor: 'cortina' }]
      });
      mockSupabase.auth = {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1' } } } })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      };
      window.cafeteriaSupabase = mockSupabase;
      window.supabaseClient = mockSupabase;

      harness = createPageHarness('admin.html', { supabase: mockSupabase });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/admin/settings.js');
    });

    it('CA24: Validação de arquivo rejeita arquivos com formato não permitido ou acima do limite de tamanho', () => {
      const validar = window.validarArquivoAnimacaoTotem;
      expect(typeof validar).toBe('function');

      // Arquivo MP4 válido (10 MB <= 15 MB)
      const validMp4 = { name: 'fundo.mp4', type: 'video/mp4', size: 10 * 1024 * 1024 };
      expect(validar(validMp4).valido).toBe(true);

      // Arquivo MP4 acima do limite (16 MB > 15 MB)
      const oversizedMp4 = { name: 'fundo.mp4', type: 'video/mp4', size: 16 * 1024 * 1024 };
      const resOversizedMp4 = validar(oversizedMp4);
      expect(resOversizedMp4.valido).toBe(false);
      expect(resOversizedMp4.erro).toMatch(/15\s*MB/i);

      // Arquivo GIF válido (5 MB <= 8 MB)
      const validGif = { name: 'anim.gif', type: 'image/gif', size: 5 * 1024 * 1024 };
      expect(validar(validGif).valido).toBe(true);

      // Arquivo GIF acima do limite (9 MB > 8 MB)
      const oversizedGif = { name: 'anim.gif', type: 'image/gif', size: 9 * 1024 * 1024 };
      const resOversizedGif = validar(oversizedGif);
      expect(resOversizedGif.valido).toBe(false);
      expect(resOversizedGif.erro).toMatch(/8\s*MB/i);

      // Extensões/MIME inválidos (PNG, JPG, EXE)
      const invalidPng = { name: 'foto.png', type: 'image/png', size: 1024 * 1024 };
      expect(validar(invalidPng).valido).toBe(false);

      const invalidExe = { name: 'malware.exe', type: 'application/x-msdownload', size: 1024 };
      expect(validar(invalidExe).valido).toBe(false);
    });

    it('CA23: Interface do admin possui o seletor de catálogo e campo de upload', () => {
      const selectAnim = document.getElementById('config-totem-animacao-catalogo');
      const inputUpload = document.getElementById('input-totem-midia-file');
      const btnSalvar = document.getElementById('btn-salvar-config-totem');
      const btnPublicar = document.getElementById('btn-publicar-totem-midia');

      expect(selectAnim).not.toBeNull();
      expect(inputUpload).not.toBeNull();
      expect(btnSalvar).not.toBeNull();
      expect(btnPublicar).not.toBeNull();

      const options = Array.from(selectAnim.options).map(o => o.value);
      expect(options).toContain('nenhuma');
      expect(options).toContain('cortina');
      expect(options).toContain('vapor');
      expect(options).toContain('graos');
    });
  });
});
