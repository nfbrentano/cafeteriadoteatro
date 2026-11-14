import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createPageHarness,
  listarArquivosFontePDV,
  lerAdminHtmlCompleto
} from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';
import { setupAuthMock, setupPedidosPage, getDefaultMockData } from './helpers/pedidos-page.js';
import { expandHtmlPartials } from '../scripts/html-partials.mjs';
import {
  estadoPDV,
  WINDOW_PDV_ALLOWLIST,
  definirGlobalPDV,
  resetarEstadoPDV
} from '../js/pdv/estado.js';
import { inicializarPDV } from '../js/pedidos.js';

/**
 * CAF-000121: Suíte de Testes Funcionais e Estruturais
 * Modularização do PDV (js/pedidos.js -> js/pdv/*.js) e do Admin (admin.html -> admin/partials/*.html)
 */
describe('CAF-000121: Modularização do PDV e Admin sem Mudança de Comportamento', () => {
  const rootDir = process.cwd();

  afterEach(() => {
    resetarEstadoPDV();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CT01 / CA01: Comportamento idêntico do PDV modularizado
  // =========================================================================
  describe('CT01 / CA01: Inicialização e Fluxo End-to-End do PDV Modularizado', () => {
    it('renderiza cardápio e mesas, envia pedido ao banco, abre fechamento e reseta estado/timers cleanly', async () => {
      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: () => ({
            data: { id: 901, numero_pedido: 'PED-901', status: 'pendente' },
            error: null
          })
        }
      });

      try {
        expect(typeof inicializarPDV).toBe('function');
        expect(typeof page.harness.window.baristaLimparCarrinho).toBe('function');
        expect(typeof page.harness.window.baristaAbrirModalFecharConta).toBe('function');

        // Produtos e mesas carregados do mock via módulos de catalogo e mesas
        const cards = page.harness.document.querySelectorAll('.product-card');
        expect(cards.length).toBeGreaterThanOrEqual(3);

        // Adiciona produto ao carrinho real e confere estadoPDV
        const mockData = getDefaultMockData();
        page.adicionarItemAoCarrinho(mockData.produtos[0], 2);
        expect(estadoPDV.cart.length).toBe(1);
        expect(estadoPDV.cart[0].quantidade).toBe(2);

        // Envia pedido selecionando mesa livre 01
        await page.selecionarMesa('01');
        const btnEnviar = page.harness.document.getElementById('btn-enviar-pedido');
        expect(btnEnviar.disabled).toBe(false);
        btnEnviar.click();
        await page.harness.aguardarRender(80);

        const rpcCriar = page.obterChamadasRpc('criar_pedido');
        expect(rpcCriar.length).toBe(1);
        expect(estadoPDV.cart.length).toBe(0);

        // Abre modal de fechamento em 3 etapas na mesa ocupada 02
        await page.abrirModalFechamentoMesa('02');
        await page.harness.aguardarRender(40);
        const modalFechar = page.harness.document.getElementById('modal-fechar-conta');
        expect(modalFechar.classList.contains('hidden')).toBe(false);

        // resetarEstadoPDV limpa timer e estado compartilhado de forma determinística
        estadoPDV.timers.offlineSyncInterval = setInterval(() => {}, 15000);
        resetarEstadoPDV();
        expect(estadoPDV.cart).toEqual([]);
        expect(estadoPDV.timers.offlineSyncInterval).toBeNull();
        expect(estadoPDV.currentFechamento.mesaCodigo).toBeNull();
        expect(estadoPDV.currentFechamento.pedidos).toEqual([]);
      } finally {
        page.harness.cleanup();
      }
    }, 15000);
  });

  // =========================================================================
  // CT02 / CA02: Limite de 1.500 linhas por arquivo no PDV
  // =========================================================================
  describe('CT02 / CA02: Particionamento e Limite de Linhas em js/pedidos.js e js/pdv/*.js', () => {
    it('js/pdv/ possui >= 7 módulos coesos e todos os arquivos do PDV possuem <= 1.500 linhas', () => {
      const arquivos = listarArquivosFontePDV(rootDir);
      const modulosPdv = arquivos.filter((a) => a.startsWith('js/pdv/'));
      expect(modulosPdv.length).toBeGreaterThanOrEqual(7);

      const entryContent = fs.readFileSync(path.join(rootDir, 'js/pedidos.js'), 'utf-8');
      const entryLines = entryContent.split('\n').length;
      expect(entryLines).toBeLessThanOrEqual(150);

      for (const relPath of arquivos) {
        const linesCount = fs.readFileSync(path.join(rootDir, relPath), 'utf-8').split('\n').length;
        expect(linesCount, `${relPath} excede 1.500 linhas (${linesCount})`).toBeLessThanOrEqual(1500);
      }
    });
  });

  // =========================================================================
  // CT03 / CA03: Estado centralizado e Allowlist estrita de window.*
  // =========================================================================
  describe('CT03 / CA03: Governança de Estado Global (estadoPDV e WINDOW_PDV_ALLOWLIST)', () => {
    it('definirGlobalPDV aceita nomes da allowlist e rejeita globais não documentadas', () => {
      expect(WINDOW_PDV_ALLOWLIST.includes('baristaLimparCarrinho')).toBe(true);

      const stubFn = () => 'ok';
      definirGlobalPDV('baristaLimparCarrinho', stubFn);
      expect(window.baristaLimparCarrinho).toBe(stubFn);

      expect(() => definirGlobalPDV('__pdvGlobalNaoAutorizada__', stubFn)).toThrow(/Atribuição não autorizada/i);
      expect(window.__pdvGlobalNaoAutorizada__).toBeUndefined();
    });

    it('todas as atribuições globais nos módulos PDV usam definirGlobalPDV e pertencem à WINDOW_PDV_ALLOWLIST', () => {
      const arquivos = listarArquivosFontePDV(rootDir);
      const atribuicoesDiretas = [];
      const registrosPermitidos = [];
      const directRegex = /\bwindow\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?!=)/g;
      const definirRegex = /\bdefinirGlobalPDV\(\s*['"]([A-Za-z_$][A-Za-z0-9_$]*)['"]/g;

      for (const relPath of arquivos) {
        const content = fs.readFileSync(path.join(rootDir, relPath), 'utf-8');
        let m;
        while ((m = directRegex.exec(content)) !== null) {
          atribuicoesDiretas.push({ file: relPath, prop: m[1] });
        }
        while ((m = definirRegex.exec(content)) !== null) {
          registrosPermitidos.push({ file: relPath, prop: m[1] });
        }
      }

      for (const item of atribuicoesDiretas) {
        expect(
          WINDOW_PDV_ALLOWLIST.includes(item.prop),
          `Atribuição direta não autorizada window.${item.prop} em ${item.file}`
        ).toBe(true);
      }

      expect(registrosPermitidos.length).toBeGreaterThanOrEqual(25);
      for (const item of registrosPermitidos) {
        expect(
          WINDOW_PDV_ALLOWLIST.includes(item.prop),
          `Registro via definirGlobalPDV fora da allowlist: ${item.prop} em ${item.file}`
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // CT04 / CA04: admin.html < 500 linhas, parciais <= 1.500 e todas as abas OK
  // =========================================================================
  describe('CT04 / CA04: Modularização de admin.html, Segurança de Partials e Navegação Real', () => {
    it('admin.html possui < 500 linhas e todas as parciais em admin/partials/*.html têm <= 1.500 linhas', () => {
      const adminLines = fs.readFileSync(path.join(rootDir, 'admin.html'), 'utf-8').split('\n').length;
      expect(adminLines).toBeLessThan(500);

      const partialsDir = path.join(rootDir, 'admin/partials');
      expect(fs.existsSync(partialsDir)).toBe(true);
      const partialFiles = fs.readdirSync(partialsDir).filter((f) => f.endsWith('.html')).sort();
      expect(partialFiles.length).toBeGreaterThanOrEqual(15);

      for (const f of partialFiles) {
        const lines = fs.readFileSync(path.join(partialsDir, f), 'utf-8').split('\n').length;
        expect(lines, `${f} excede 1.500 linhas (${lines})`).toBeLessThanOrEqual(1500);
      }
    });

    it('expandHtmlPartials bloqueia path traversal, arquivo inexistente e inclusão cíclica', () => {
      const adminExpanded = lerAdminHtmlCompleto(rootDir);
      expect(adminExpanded).not.toContain('<include');
      expect(adminExpanded).toContain('id="page-dashboard"');
      expect(adminExpanded).toContain('id="modal-fornecedores-overlay"');

      expect(() => expandHtmlPartials('<include src="../package.json"></include>', rootDir)).toThrow(/fora da raiz/i);
      expect(() => expandHtmlPartials('<include src="admin/partials/inexistente.html"></include>', rootDir)).toThrow(/nao encontrada/i);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-partials-'));
      try {
        fs.writeFileSync(path.join(tmpDir, 'a.html'), '<include src="b.html"></include>');
        fs.writeFileSync(path.join(tmpDir, 'b.html'), '<include src="a.html"></include>');
        expect(() => expandHtmlPartials('<include src="a.html"></include>', tmpDir)).toThrow(/Ciclo/i);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('navega por todas as 20 abas do Admin no DOM real com createPageHarness("admin.html")', async () => {
      const rpcHandlers = {
        get_minhas_permissoes: () => ({
          data: [
            'admin.relatorios', 'admin.clientes', 'admin.estoque', 'admin.cardapio',
            'admin.usuarios', 'admin.configuracoes', 'caixa.abrir_fechar', 'admin.financeiro', 'pdv.vender'
          ],
          error: null
        })
      };
      const mockSupabase = setupAuthMock(
        createSupabaseMock({
          perfis: [{ id: 'admin-1', nome: 'Admin', role: 'admin', is_admin: true, ativo: true }],
          categorias: [{ id: 'c1', nome: 'Cafés', ativo: true, ordem: 1 }],
          produtos: [{ id: 'p1', nome: 'Espresso', categoria_id: 'c1', preco: 8, ativo: true }],
          clientes: [{ id: 'cl1', nome: 'Maria', telefone: '11999990000' }],
          pedidos: [],
          mesas: [{ id: 'm1', codigo: '01', status: 'livre', ativo: true }]
        }, { rpcHandlers }),
        { id: 'admin-1', email: 'admin@teatro.com', role: 'admin', is_admin: true }
      );

      const harness = createPageHarness('admin.html', { supabase: mockSupabase });
      try {
        await harness.carregarScriptsDaPagina((src) => !src.includes('utils/error-reporter.js'));
        await harness.aguardarRender(60);

        harness.window.cafeteriaAdmin.session = {
          isLoggedIn: true,
          isAdmin: true,
          user: { id: 'admin-1', email: 'admin@teatro.com', role: 'admin', is_admin: true }
        };

        const abas = [
          'dashboard', 'pedidos', 'produtos', 'categorias', 'adicionais', 'estoque',
          'mesas', 'clientes', 'avaliacoes', 'usuarios', 'configuracoes', 'relatorios',
          'caixa', 'financeiro', 'erros', 'hero', 'horarios', 'promocoes', 'conteudo', 'menu-pdf'
        ];

        for (const aba of abas) {
          harness.clicar(`#nav-${aba}`);
          const activeSections = Array.from(harness.document.querySelectorAll('section.page.active'));
          expect(activeSections.some((s) => s.id === `page-${aba}`), `Aba ${aba} deve ficar ativa`).toBe(true);
        }

        // Preserva ambas as seções #page-promocoes (Promoções Ativas e Campanhas) e modais
        expect(harness.document.getElementById('promocoes-table-body')).toBeTruthy();
        expect(harness.document.getElementById('promo-table-body')).toBeTruthy();
        expect(harness.document.getElementById('area-impressao-todos-qr')).toBeTruthy();
      } finally {
        harness.cleanup();
      }
    }, 15000);
  });

  // =========================================================================
  // CT05 / CA05: Remoção de CSS inline em admin.html e parciais
  // =========================================================================
  describe('CT05 / CA05: Redução de Estilos Inline e Migração para css/admin.css', () => {
    it('admin.html + admin/partials/*.html têm <= 50 atributos style=" e zero blocos <style>', () => {
      const files = [
        path.join(rootDir, 'admin.html'),
        ...fs.readdirSync(path.join(rootDir, 'admin/partials'))
          .filter((f) => f.endsWith('.html'))
          .map((f) => path.join(rootDir, 'admin/partials', f))
      ];

      let totalStyleAttrs = 0;
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(content, `<style> não permitido em ${path.basename(file)}`).not.toMatch(/<style\b/i);

        const matches = [...content.matchAll(/\bstyle="([^"]*)"/g)];
        totalStyleAttrs += matches.length;
        for (const m of matches) {
          expect(m[1].trim()).toMatch(/^display\s*:\s*none;?$/i);
        }
      }

      expect(totalStyleAttrs).toBeLessThanOrEqual(50);

      const adminCss = fs.readFileSync(path.join(rootDir, 'css/admin.css'), 'utf-8');
      expect(adminCss).toContain('@media print');
      expect(adminCss).toContain('#area-impressao-todos-qr');
      expect(adminCss).toContain('.adm-hidden');
    });
  });

  // =========================================================================
  // CT06 / CA06: Bundles minificados e ordenação de scripts no build dist/
  // =========================================================================
  describe('CT06 / CA06: Bundling e Minificação do PDV e Admin em dist/', () => {
    it('dist/pedidos.html e dist/admin.html referenciam bundles /assets/*-[hash].js após js/db.js', () => {
      const distDir = path.join(rootDir, 'dist');
      expect(fs.existsSync(distDir), 'Execute npm run build antes dos testes').toBe(true);

      for (const page of ['pedidos.html', 'admin.html']) {
        const html = fs.readFileSync(path.join(distDir, page), 'utf-8');
        expect(html).not.toContain('<include');

        const moduleMatches = [...html.matchAll(/<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/?(assets\/[^"']+\.js)["'])[^>]*><\/script>/gi)];
        expect(moduleMatches.length, `${page} deve carregar bundle module em /assets/`).toBeGreaterThan(0);

        const dbIdx = html.indexOf('src="js/db.js"');
        expect(dbIdx).toBeGreaterThan(-1);

        for (const m of moduleMatches) {
          const assetRelPath = m[1];
          expect(assetRelPath).toMatch(/-[A-Za-z0-9_-]{6,}\.js$/);
          expect(m.index, `Bundle ${assetRelPath} em ${page} deve vir após js/db.js`).toBeGreaterThan(dbIdx);

          const fullAssetPath = path.join(distDir, assetRelPath);
          expect(fs.existsSync(fullAssetPath), `Asset ${assetRelPath} deve existir em dist/`).toBe(true);
          const jsSize = fs.statSync(fullAssetPath).size;
          expect(jsSize).toBeGreaterThan(1024);
        }
      }
    });
  });
});
