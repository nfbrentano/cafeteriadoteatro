import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Window } from 'happy-dom';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';
import { setupPedidosPage } from './helpers/pedidos-page.js';

const HTML_FILES = [
  'index.html',
  'cardapio.html',
  'admin.html',
  'pedidos.html',
  'cozinha.html',
  'retirada.html',
  'totem.html',
  'avaliar.html',
  '404.html'
];

describe('CAF-000117: Segurança do Front — CSP, SRI, Versões de CDN e Dependabot', () => {

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('1. Versões Exatas e Integridade SRI em Bibliotecas de CDN (CA01 / CA06)', () => {
    it('CA01: todo script externo carregado via HTTPS possui versão exata travada na URL e atributo integrity válido', () => {
      HTML_FILES.forEach(fileName => {
        const filePath = path.resolve(process.cwd(), fileName);
        const html = fs.readFileSync(filePath, 'utf-8');
        const dom = new Window();
        dom.document.write(html);

        const scripts = Array.from(dom.document.querySelectorAll('script[src]'));
        const externalScripts = scripts.filter(s => {
          const src = s.getAttribute('src') || '';
          return src.startsWith('http://') || src.startsWith('https://');
        });

        externalScripts.forEach(scriptEl => {
          const src = scriptEl.getAttribute('src');
          // Ignora o loader assíncrono oficial do Google Tag Manager
          if (src.includes('googletagmanager.com')) {
            return;
          }

          // Deve ter versão exata no formato @X.Y.Z
          const hasSemver = /@[0-9]+\.[0-9]+\.[0-9]+/i.test(src);
          expect(hasSemver, `O script ${src} em ${fileName} deve declarar versão semver exata (ex: @2.119.0)`).toBe(true);

          // Deve ter atributo integrity com algoritmo SHA-256/384/512
          const integrity = scriptEl.getAttribute('integrity');
          expect(integrity, `O script ${src} em ${fileName} deve conter atributo integrity`).toBeTruthy();
          expect(integrity).toMatch(/^sha(256|384|512)-[A-Za-z0-9+/=]+$/);

          // Deve conter crossorigin="anonymous" para que o navegador valide o SRI
          const crossorigin = scriptEl.getAttribute('crossorigin');
          expect(crossorigin, `O script ${src} em ${fileName} deve conter crossorigin="anonymous"`).toBe('anonymous');
        });
      });
    });

    it('CA06: validador rejeita tags de script externo sem versão exata ou sem atributo integrity', () => {
      function validarTagScriptExterno(scriptTagHtml) {
        const dom = new Window();
        dom.document.write(`<html><head>${scriptTagHtml}</head><body></body></html>`);
        const s = dom.document.querySelector('script');
        if (!s) return { valido: false, motivo: 'Nenhuma tag de script encontrada' };
        
        const src = s.getAttribute('src') || '';
        if (src.startsWith('https://cdn.') || src.startsWith('https://unpkg.')) {
          if (!/@[0-9]+\.[0-9]+\.[0-9]+/i.test(src)) {
            return { valido: false, motivo: 'Versão móvel ou ausente na URL do CDN' };
          }
          const integrity = s.getAttribute('integrity');
          if (!integrity || !integrity.startsWith('sha')) {
            return { valido: false, motivo: 'Atributo integrity ausente ou inválido' };
          }
          if (s.getAttribute('crossorigin') !== 'anonymous') {
            return { valido: false, motivo: 'Atributo crossorigin="anonymous" ausente' };
          }
        }
        return { valido: true };
      }

      // Casos válidos
      const tagValida = '<script crossorigin="anonymous" integrity="sha384-gnyZit14c5lnGcarmA166QQjjJXpucw25ogZXuwH3HxxY904zHkBqmxVpelsPorb" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0"></script>';
      expect(validarTagScriptExterno(tagValida).valido).toBe(true);

      // Casos inválidos (devem falhar)
      const tagSemIntegrity = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0"></script>';
      expect(validarTagScriptExterno(tagSemIntegrity).valido).toBe(false);

      const tagVersaoMovel = '<script crossorigin="anonymous" integrity="sha384-12345" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
      expect(validarTagScriptExterno(tagVersaoMovel).valido).toBe(false);

      const tagSemCrossorigin = '<script integrity="sha384-12345" src="https://cdn.jsdelivr.net/npm/chart.js@4.6.1"></script>';
      expect(validarTagScriptExterno(tagSemCrossorigin).valido).toBe(false);
    });
  });

  describe('2. Content Security Policy em Todas as Páginas (CA02 / RNF01)', () => {
    it('CA02 / RNF01: todos os 9 arquivos HTML contêm tag meta CSP estrita, sem unsafe-eval e sem script-src *', () => {
      HTML_FILES.forEach(fileName => {
        const filePath = path.resolve(process.cwd(), fileName);
        const html = fs.readFileSync(filePath, 'utf-8');
        const dom = new Window();
        dom.document.write(html);

        const metaCsp = dom.document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        expect(metaCsp, `Página ${fileName} deve conter meta tag Content-Security-Policy`).not.toBeNull();

        const content = metaCsp.getAttribute('content') || '';
        expect(content, `CSP de ${fileName} não pode estar vazia`).toBeTruthy();

        // RNF01 / CA02: Proibido unsafe-eval
        expect(content, `CSP de ${fileName} não pode conter 'unsafe-eval'`).not.toContain('unsafe-eval');

        // CA02: Proibido script-src *
        expect(content, `CSP de ${fileName} não pode conter 'script-src *'`).not.toMatch(/script-src\s+[^;]*\*/);

        // Deve conter diretivas essenciais
        expect(content).toContain("default-src 'self'");
        expect(content).toContain("script-src 'self'");
        expect(content).toContain("https://cdn.jsdelivr.net");
        expect(content).toContain("connect-src 'self'");
        expect(content).toContain("https://nyretgvzbnbtiyeioeju.supabase.co");
        expect(content).toContain("wss://nyretgvzbnbtiyeioeju.supabase.co");
        expect(content).toContain("base-uri 'self'");
        expect(content).toContain("object-src 'none'");
      });
    });

    it('CA02: nenhum arquivo HTML possui blocos <script> inline executáveis sem atributo src', () => {
      HTML_FILES.forEach(fileName => {
        const filePath = path.resolve(process.cwd(), fileName);
        const html = fs.readFileSync(filePath, 'utf-8');
        const dom = new Window();
        dom.document.write(html);

        const scripts = Array.from(dom.document.querySelectorAll('script:not([src])'));
        // Filtra JSON-LD, que não é executável e é permitido pela CSP
        const executableInlineScripts = scripts.filter(s => {
          const type = (s.getAttribute('type') || '').toLowerCase();
          return type !== 'application/ld+json';
        });

        expect(
          executableInlineScripts.length,
          `Página ${fileName} não deve conter scripts inline executáveis (encontrados: ${executableInlineScripts.length})`
        ).toBe(0);
      });
    });
  });

  describe('3. Ausência Total de Handlers Inline e Proteção Contra XSS (CA03 / CA04 / RF03)', () => {
    it('RF03: nenhum elemento do HTML estático possui atributo inline onclick', () => {
      HTML_FILES.forEach(fileName => {
        const filePath = path.resolve(process.cwd(), fileName);
        const html = fs.readFileSync(filePath, 'utf-8');
        const dom = new Window();
        dom.document.write(html);

        const inlineOnclicks = dom.document.querySelectorAll('[onclick]');
        expect(
          inlineOnclicks.length,
          `Página ${fileName} possui ${inlineOnclicks.length} elementos com atributo onclick=`
        ).toBe(0);
      });
    });

    it('CA04: injeção maliciosa em observação de pedido não gera onclick nem executa script inline', async () => {
      window.xssHacked = false;

      const mockSupabase = createSupabaseMock({
        perfis: [{ id: 'u1', nome: 'Barista Teste', role: 'barista', ativo: true }],
        mesas: [{ id: 'm1', codigo: '01', status: 'ocupada', ativo: true }],
        produtos: [{ id: 'p1', nome: 'Café Espresso', preco: 8.50, categoria_id: 'c1', ativo: true }],
        pedidos: [{
          id: 9999,
          numero_pedido: 999,
          mesa_codigo: '01',
          status: 'em_preparo',
          origem: 'balcao',
          observacoes: '<script>window.xssHacked = true;</script><b onclick="window.xssHacked = true">Perigo</b>',
          pedido_itens: [{
            id: 1,
            nome_produto: 'Café Espresso',
            quantidade: 1,
            preco_unitario: 8.50,
            observacoes: '<img src=x onerror="window.xssHacked = true">'
          }]
        }]
      });

      const harness = createPageHarness('pedidos.html', { supabase: mockSupabase });
      await new Promise(resolve => setTimeout(resolve, 80));

      // Garante que o script malicioso NÃO foi executado
      expect(window.xssHacked).toBe(false);

      // Garante que nenhum elemento no DOM renderizado possui onclick
      const onClicks = document.querySelectorAll('[onclick]');
      expect(onClicks.length).toBe(0);
    });

    it('CA03: delegação de eventos do PDV aciona ações sem depender de onclick inline', async () => {
      await setupPedidosPage({
        mockData: {
          perfis: [{ id: 'u1', nome: 'Barista Teste', role: 'barista', ativo: true }],
          mesas: [{ id: 'm1', codigo: '01', status: 'ocupada', ativo: true }],
          produtos: [{ id: 'p1', nome: 'Café Coado', preco: 7.00, categoria_id: 'c1', ativo: true }]
        }
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simula clique no botão de cadastrar cliente via delegação
      let abrirCadastroChamado = false;
      const originalAbrir = window.baristaAbrirCadastroCliente;
      window.baristaAbrirCadastroCliente = () => {
        abrirCadastroChamado = true;
      };

      const btnCadastrar = document.getElementById('btn-abrir-cadastro-cliente');
      expect(btnCadastrar).not.toBeNull();
      btnCadastrar.dispatchEvent(new Event('click', { bubbles: true }));

      expect(abrirCadastroChamado).toBe(true);
      window.baristaAbrirCadastroCliente = originalAbrir;

      // Simula clique em chip de observação rápida
      const obsInput = document.getElementById('modal-montagem-obs');
      if (obsInput) {
        obsInput.value = '';
        const chipSemAcucar = document.querySelector('[data-obs-sugestao="Sem açúcar "]');
        if (chipSemAcucar) {
          chipSemAcucar.dispatchEvent(new Event('click', { bubbles: true }));
          expect(obsInput.value).toContain('Sem açúcar');
        }
      }
    });

    it('CA03: delegação de eventos no KDS aciona toggle e preparo de pedidos sem onclick', async () => {
      const mockSupabase = createSupabaseMock({
        perfis: [{ id: 'u1', role: 'cozinha', ativo: true }],
        pedidos: [{
          id: 555,
          numero_pedido: 55,
          mesa_codigo: '10',
          status: 'pendente',
          created_at: new Date().toISOString(),
          pedido_itens: [{ id: 10, nome_produto: 'Capuccino', quantidade: 1, pronto_em: null }]
        }]
      });
      mockSupabase.auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
      };

      const harness = createPageHarness('cozinha.html', { supabase: mockSupabase });
      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/cozinha.js');
      await new Promise(resolve => setTimeout(resolve, 50));

      let iniciarChamado = null;
      window.iniciarPreparoEstacao = (id) => {
        iniciarChamado = id;
      };

      // Cria um botão com data-action simulando a renderização do KDS
      const btnPreparo = document.createElement('button');
      btnPreparo.setAttribute('data-action', 'kds-iniciar-preparo');
      btnPreparo.setAttribute('data-pedido-id', '555');
      document.body.appendChild(btnPreparo);

      btnPreparo.click();
      expect(iniciarChamado).toBe(555);
      btnPreparo.remove();
    });
  });

  describe('4. Configuração do Dependabot (CA05)', () => {
    it('CA05: .github/dependabot.yml existe e monitora ecossistemas npm e github-actions semanalmente', () => {
      const dependabotPath = path.resolve(process.cwd(), '.github/dependabot.yml');
      expect(fs.existsSync(dependabotPath), 'Arquivo .github/dependabot.yml deve existir').toBe(true);

      const content = fs.readFileSync(dependabotPath, 'utf-8');
      expect(content).toContain('version: 2');
      expect(content).toContain('package-ecosystem: "npm"');
      expect(content).toContain('package-ecosystem: "github-actions"');
      expect(content).toContain('interval: "weekly"');
    });
  });

});
