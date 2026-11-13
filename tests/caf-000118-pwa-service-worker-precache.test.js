import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { Window } from 'happy-dom';
import {
  isPrecacheAsset,
  computePrecacheHash,
  buildStaticAssetsList,
  generatePrecache,
  scanDirectory
} from '../scripts/sw-precache-generator.js';

/**
 * CAF-000118: PWA — Service Worker com Precache Gerado no Build, Versão Automática e Cobertura
 * 
 * Critérios cobertos:
 * - CA01 / CA02: Hash determinístico baseado em conteúdo (muda se arquivo muda, igual se idêntico)
 * - CA03: Precache cobre todos os arquivos essenciais de PDV, KDS, Totem, Retirada e Admin (< 5 MB)
 * - CA04: Registro do Service Worker nas 9 telas, incluindo Totem, Retirada e Avaliar
 * - CA05: Detecção de nova versão e toast com botão "Atualizar" (sem confirm nativo)
 * - CA06: Bloqueio de recarga automática enquanto houver carrinho ou fechamento em andamento
 * - CA07: Versão em window.APP_VERSION e visível no rodapé do Admin
 * - CA08: Chamadas ao Supabase (REST, RPC, Auth, Realtime) nunca usam cache
 */

describe('CAF-000118: PWA — Service Worker, Precache e Versionamento', () => {

  describe('1. Versionamento Automático e Determinístico (CA01 / CA02)', () => {
    it('CA01: a versão do cache muda quando o conteúdo de um arquivo do precache é alterado', () => {
      const baseFiles = [
        { relativePath: 'index.html', content: '<html><body>Home v1</body></html>' },
        { relativePath: 'js/pedidos.js', content: 'console.log("PDV v1");' },
        { relativePath: 'css/main.css', content: 'body { color: black; }' }
      ];

      const hash1 = computePrecacheHash(baseFiles);

      // Simula alteração de código em js/pedidos.js
      const modifiedFiles = [
        { relativePath: 'index.html', content: '<html><body>Home v1</body></html>' },
        { relativePath: 'js/pedidos.js', content: 'console.log("PDV v2 - modificado");' },
        { relativePath: 'css/main.css', content: 'body { color: black; }' }
      ];

      const hash2 = computePrecacheHash(modifiedFiles);

      expect(hash1).toMatch(/^v-[a-f0-9]{10}$/);
      expect(hash2).toMatch(/^v-[a-f0-9]{10}$/);
      expect(hash1).not.toBe(hash2);
    });

    it('CA02: dois builds com conteúdo idêntico geram exatamente a mesma versão de cache', () => {
      const filesA = [
        { relativePath: 'js/cozinha.js', content: 'const kds = true;' },
        { relativePath: 'js/pedidos.js', content: 'const pdv = true;' },
        { relativePath: 'pedidos.html', content: '<main>PDV</main>' }
      ];

      // Mesmos arquivos, mesmo que a ordem no array de entrada mude
      const filesB = [
        { relativePath: 'pedidos.html', content: '<main>PDV</main>' },
        { relativePath: 'js/pedidos.js', content: 'const pdv = true;' },
        { relativePath: 'js/cozinha.js', content: 'const kds = true;' }
      ];

      const hashA = computePrecacheHash(filesA);
      const hashB = computePrecacheHash(filesB);

      expect(hashA).toBe(hashB);
    });

    it('isPrecacheAsset: filtra assets essenciais e rejeita imagens pesadas de galeria, mapas e .map', () => {
      // Devem ser incluídos
      expect(isPrecacheAsset('index.html')).toBe(true);
      expect(isPrecacheAsset('pedidos.html')).toBe(true);
      expect(isPrecacheAsset('totem.html')).toBe(true);
      expect(isPrecacheAsset('retirada.html')).toBe(true);
      expect(isPrecacheAsset('admin.html')).toBe(true);
      expect(isPrecacheAsset('avaliar.html')).toBe(true);
      expect(isPrecacheAsset('manifest.json')).toBe(true);
      expect(isPrecacheAsset('js/pedidos.js')).toBe(true);
      expect(isPrecacheAsset('js/utils/conta-mesa.js')).toBe(true);
      expect(isPrecacheAsset('js/admin/caixa-admin.js')).toBe(true);
      expect(isPrecacheAsset('css/main.css')).toBe(true);
      expect(isPrecacheAsset('assets/audio/ding.wav')).toBe(true);
      expect(isPrecacheAsset('assets/icons/favicon.png')).toBe(true);

      // NÃO devem ser incluídos (RNF02 e limites de precache)
      expect(isPrecacheAsset('sw.js')).toBe(false);
      expect(isPrecacheAsset('CNAME')).toBe(false);
      expect(isPrecacheAsset('robots.txt')).toBe(false);
      expect(isPrecacheAsset('sitemap.xml')).toBe(false);
      expect(isPrecacheAsset('dist/assets/app.js.map')).toBe(false);
      expect(isPrecacheAsset('assets/arte-monalisa-ClmeCi_U.webp')).toBe(false);
      expect(isPrecacheAsset('assets/galeria-doces-Bd4LNs1B.webp')).toBe(false);
      expect(isPrecacheAsset('assets/images_backup/galeria-massas.jpg')).toBe(false);
      expect(isPrecacheAsset('assets/images/sobre-cafe.png')).toBe(false);
    });
  });

  describe('2. Consistência do Precache em dist/ e Limite de 5 MB (CA03 / RNF02)', () => {
    it('CA03: todo arquivo listado no precache existe em dist/ e cobre PDV, KDS, Totem e Retirada', async () => {
      const distDir = path.resolve(process.cwd(), 'dist');
      expect(fs.existsSync(distDir)).toBe(true);

      const result = await generatePrecache(distDir);

      expect(result.version).toMatch(/^v-[a-f0-9]{10}$/);
      expect(result.assetsCount).toBeGreaterThan(50);

      // RNF02: Tamanho total estritamente abaixo de 5 MB (5.242.880 bytes)
      expect(result.totalSizeBytes).toBeLessThan(5 * 1024 * 1024);

      // Todo arquivo listado no STATIC_ASSETS deve existir fisicamente no dist/
      for (const assetUrl of result.assetsList) {
        if (assetUrl === '/') {
          expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);
          continue;
        }
        const rel = assetUrl.replace(/^\//, '');
        const full = path.join(distDir, rel);
        expect(fs.existsSync(full)).toBe(true);
      }

      // Garante presença dos arquivos chave de PDV, KDS, Totem e Retirada
      const requiredPages = [
        '/pedidos.html',
        '/cozinha.html',
        '/totem.html',
        '/retirada.html',
        '/admin.html',
        '/cardapio.html',
        '/avaliar.html'
      ];
      for (const page of requiredPages) {
        expect(result.assetsList).toContain(page);
      }

      // Garante presença de módulos críticos de js/utils
      const requiredUtils = [
        '/js/utils/conta-mesa.js',
        '/js/utils/offline-queue.js',
        '/js/utils/combos.js',
        '/js/utils/datas-sp.js',
        '/js/utils/error-reporter.js'
      ];
      for (const mod of requiredUtils) {
        expect(result.assetsList).toContain(mod);
      }
    });

    it('CA03: dist/version.json é gerado com metadados corretos', () => {
      const versionFile = path.resolve(process.cwd(), 'dist/version.json');
      expect(fs.existsSync(versionFile)).toBe(true);

      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      expect(data.version).toMatch(/^v-[a-f0-9]{10}$/);
      expect(data.totalSizeBytes).toBeGreaterThan(0);
      expect(data.totalSizeBytes).toBeLessThan(5 * 1024 * 1024);
      expect(data.filesCount).toBeGreaterThan(50);
      expect(data.buildTime).toBeDefined();
    });

    it('CA03: todo script, stylesheet e imagem local referenciados por pedidos, cozinha, totem e retirada existe no disco e em dist/', async () => {
      const distDir = path.resolve(process.cwd(), 'dist');
      const result = await generatePrecache(distDir);
      const targetPages = ['pedidos.html', 'cozinha.html', 'totem.html', 'retirada.html'];

      for (const page of targetPages) {
        // 1. Valida referências no HTML fonte (raiz)
        const srcHtml = fs.readFileSync(path.resolve(process.cwd(), page), 'utf8');
        const srcDom = new Window();
        srcDom.document.write(srcHtml);

        const srcRefs = [
          ...Array.from(srcDom.document.querySelectorAll('script[src]')).map(el => el.getAttribute('src')),
          ...Array.from(srcDom.document.querySelectorAll('link[rel="stylesheet"][href]')).map(el => el.getAttribute('href')),
          ...Array.from(srcDom.document.querySelectorAll('link[rel="icon"][href]')).map(el => el.getAttribute('href')),
          ...Array.from(srcDom.document.querySelectorAll('img[src]')).map(el => el.getAttribute('src'))
        ].filter(ref => ref && !/^https?:\/\//i.test(ref) && !ref.startsWith('data:'));

        for (const ref of srcRefs) {
          const cleanRef = ref.split('?')[0].replace(/^\//, '');
          expect(cleanRef).not.toBe('js/supabase-config.js');
          expect(cleanRef).not.toBe('js/vendor/qrcode.js');
          expect(cleanRef).not.toBe('assets/images/logo.webp');
          expect(
            fs.existsSync(path.resolve(process.cwd(), cleanRef)),
            `Recurso "${ref}" referenciado em ${page} não existe no disco`
          ).toBe(true);
        }

        // 2. Valida scripts e folhas de estilo no HTML buildado (dist/) e presença no STATIC_ASSETS
        const distHtmlPath = path.join(distDir, page);
        expect(fs.existsSync(distHtmlPath), `${distHtmlPath} não encontrado após build`).toBe(true);
        const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
        const distDom = new Window();
        distDom.document.write(distHtml);

        const distRefs = [
          ...Array.from(distDom.document.querySelectorAll('script[src]')).map(el => el.getAttribute('src')),
          ...Array.from(distDom.document.querySelectorAll('link[rel="stylesheet"][href]')).map(el => el.getAttribute('href'))
        ].filter(ref => ref && !/^https?:\/\//i.test(ref));

        for (const ref of distRefs) {
          const normalizedUrl = ref.startsWith('/') ? ref : `/${ref}`;
          const cleanRel = normalizedUrl.split('?')[0].replace(/^\//, '');
          expect(
            fs.existsSync(path.join(distDir, cleanRel)),
            `Asset "${ref}" referenciado em dist/${page} não existe em dist/`
          ).toBe(true);
          expect(
            result.assetsList,
            `Asset "${normalizedUrl}" referenciado em dist/${page} deve estar em STATIC_ASSETS`
          ).toContain(normalizedUrl);
        }
      }
    });
  });

  describe('3. Cobertura do Service Worker nos Arquivos HTML (CA04)', () => {
    it('CA04: todos os 9 arquivos HTML registram sw-register.js (incluindo Totem, Retirada e Avaliar)', () => {
      const htmlFiles = [
        'index.html',
        'cardapio.html',
        'pedidos.html',
        'cozinha.html',
        'admin.html',
        'totem.html',
        'retirada.html',
        'avaliar.html',
        '404.html'
      ];

      for (const file of htmlFiles) {
        const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
        expect(content, `Arquivo ${file} deve registrar sw-register.js`).toContain('src="js/sw-register.js"');
      }
    });
  });

  describe('4. Detecção de Atualização e Aviso sem Recarga Forçada (CA05 / CA06)', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      window.isFechamentoEmAndamento = false;
      window.pedidoAtualItens = [];
      window.totemCarrinho = [];
      window.cardapioClienteCarrinho = [];
    });

    it('CA05: showUpdateToast exibe toast amigável com botão "Atualizar" e envia SKIP_WAITING ao clicar', async () => {
      // Importa a implementação real de sw-register com URL de arquivo para instrumentação V8
      const swRegisterUrl = `${pathToFileURL(path.resolve(process.cwd(), 'js/sw-register.js')).href}?t=${Date.now()}_${Math.random()}`;
      await import(swRegisterUrl);

      expect(window.__swRegister).toBeDefined();

      const fakeWorker = {
        postMessage: vi.fn()
      };

      window.__swRegister.showUpdateToast(fakeWorker);

      const toast = document.getElementById('sw-update-toast');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toContain('Nova versão disponível');

      const btnAtualizar = document.getElementById('btn-sw-atualizar');
      expect(btnAtualizar).not.toBeNull();

      btnAtualizar.click();

      expect(fakeWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(btnAtualizar.textContent).toContain('Atualizando');
    });

    it('CA05: sw.js não chama skipWaiting no install e ativa somente ao receber mensagem SKIP_WAITING', async () => {
      const swCode = fs.readFileSync(path.resolve(process.cwd(), 'sw.js'), 'utf8');
      const listeners = {};
      const mockCache = {
        addAll: vi.fn().mockResolvedValue(undefined)
      };
      const mockCaches = {
        open: vi.fn().mockResolvedValue(mockCache),
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true)
      };
      const mockSelf = {
        addEventListener: (event, cb) => {
          listeners[event] = cb;
        },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn().mockResolvedValue(undefined) }
      };

      const runSw = new Function('self', 'caches', swCode);
      runSw(mockSelf, mockCaches);

      expect(typeof listeners.install).toBe('function');
      expect(typeof listeners.message).toBe('function');

      let installPromise = null;
      listeners.install({
        waitUntil: (p) => { installPromise = p; }
      });
      await installPromise;

      expect(mockSelf.skipWaiting).not.toHaveBeenCalled();

      listeners.message({ data: { type: 'OTHER' } });
      expect(mockSelf.skipWaiting).not.toHaveBeenCalled();

      listeners.message({ data: { type: 'SKIP_WAITING' } });
      expect(mockSelf.skipWaiting).toHaveBeenCalledTimes(1);
    });

    it('CA06: hasActiveCriticalOperation detecta fechamento de conta em andamento e bloqueia reload', async () => {
      const swRegisterUrl = `${pathToFileURL(path.resolve(process.cwd(), 'js/sw-register.js')).href}?t=${Date.now()}_${Math.random()}`;
      await import(swRegisterUrl);

      // Sem operação ativa
      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(false);

      // Cenário A: flag de fechamento ativa
      window.isFechamentoEmAndamento = true;
      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(true);
      window.isFechamentoEmAndamento = false;

      // Cenário B: modal de fechamento aberto no DOM
      const modal = document.createElement('div');
      modal.id = 'modal-fechar-conta';
      document.body.appendChild(modal);
      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(true);

      // Fechou modal (classe hidden adicionada)
      modal.classList.add('hidden');
      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(false);
      modal.remove();

      // Cenário C: itens no carrinho do PDV
      window.pedidoAtualItens = [{ id: 10, nome: 'Café Espresso' }];
      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(true);
      window.pedidoAtualItens = [];

      // Cenário D: itens no carrinho do Totem
      window.totemCarrinho = [{ produto: { id: 2 }, quantidade: 1 }];
      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(true);
      window.totemCarrinho = [];

      // Cenário E: carrinho com DOM no PDV
      const cartEl = document.createElement('div');
      cartEl.id = 'cart-items';
      const itemEl = document.createElement('div');
      itemEl.className = 'cart-item';
      cartEl.appendChild(itemEl);
      document.body.appendChild(cartEl);

      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(true);
      cartEl.remove();

      expect(window.__swRegister.hasActiveCriticalOperation()).toBe(false);
    });
  });

  describe('5. Versão no Rodapé do Admin e window.APP_VERSION (CA07)', () => {
    it('CA07: initAppVersion popula window.APP_VERSION e renderiza no rodapé do Admin', async () => {
      document.body.innerHTML = `
        <div class="sidebar__bottom">
          <div id="admin-app-version-box">
            Versão: <strong id="app-version-val">—</strong>
          </div>
        </div>
      `;

      // Mock de fetch para ./version.json
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: 'v-bld1234567', buildTime: '2026-11-13T10:00:00Z' })
      });

      const swRegisterUrl = `${pathToFileURL(path.resolve(process.cwd(), 'js/sw-register.js')).href}?t=${Date.now()}_${Math.random()}`;
      await import(swRegisterUrl);

      await window.__swRegister.initAppVersion();

      expect(window.APP_VERSION).toBe('v-bld1234567');
      const valEl = document.getElementById('app-version-val');
      expect(valEl.textContent).toBe('v-bld1234567');
    });

    it('CA07: admin.html contém o elemento de exibição de versão no rodapé da sidebar', () => {
      const adminHtml = fs.readFileSync(path.resolve(process.cwd(), 'admin.html'), 'utf8');
      expect(adminHtml).toContain('id="admin-app-version-box"');
      expect(adminHtml).toContain('id="app-version-val"');
    });
  });

  describe('6. Isolamento e Bypass Estrito do Supabase (CA08 / RNF01)', () => {
    it('CA08: requisições ao Supabase (REST, RPC, Auth, Realtime) são excluídas de qualquer cache no sw.js', () => {
      const swCode = fs.readFileSync(path.resolve(process.cwd(), 'sw.js'), 'utf8');

      // Verifica que sw.js contém a regra de exclusão explícita de supabase.co, /rest/v1 e /auth/v1
      expect(swCode).toContain('isSupabaseRequest');
      expect(swCode).toContain("url.hostname.includes('supabase.co')");
      expect(swCode).toContain("url.pathname.startsWith('/rest/v1')");
      expect(swCode).toContain("url.pathname.startsWith('/auth/v1')");

      // Simulação da lógica de decisão do sw.js com URLs reais do Supabase
      const isBypassed = (testUrl) => {
        const url = new URL(testUrl);
        return (
          url.hostname.includes('supabase.co') ||
          url.pathname.startsWith('/rest/v1') ||
          url.pathname.startsWith('/auth/v1') ||
          url.pathname.startsWith('/storage/v1') ||
          url.pathname.startsWith('/realtime/v1')
        );
      };

      // RPC de fechar conta do PDV
      expect(isBypassed('https://nyretgvzbnbtiyeioeju.supabase.co/rest/v1/rpc/fechar_conta_mesa')).toBe(true);

      // Consulta de pedidos ativos
      expect(isBypassed('https://nyretgvzbnbtiyeioeju.supabase.co/rest/v1/pedidos?select=*')).toBe(true);

      // Autenticação de operador
      expect(isBypassed('https://nyretgvzbnbtiyeioeju.supabase.co/auth/v1/token?grant_type=password')).toBe(true);

      // Realtime websocket
      expect(isBypassed('https://nyretgvzbnbtiyeioeju.supabase.co/realtime/v1/websocket')).toBe(true);

      // Asset estático local NÃO é bypassed (deve ir para cache)
      expect(isBypassed('http://localhost:3000/js/pedidos.js')).toBe(false);
      expect(isBypassed('http://localhost:3000/css/main.css')).toBe(false);
    });
  });

});

