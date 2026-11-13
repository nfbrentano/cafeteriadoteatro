import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createSupabaseMock } from './supabase-mock.js';

/**
 * Harness para testes das páginas da aplicação em Happy DOM com mock isolado do Supabase,
 * execução de scripts reais com instrumentação V8 e bloqueio de rede externa.
 */
export function createPageHarness(htmlFileName, options = {}) {
  const filePath = path.resolve(process.cwd(), htmlFileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Página não encontrada: ${filePath}`);
  }

  const htmlContent = fs.readFileSync(filePath, 'utf-8');
  const mockSupabase = options.supabase || createSupabaseMock(options.initialData || {}, {
    strict: options.strict,
    strictMock: options.strictMock,
    throwOnUnconfigured: options.throwOnUnconfigured,
    schemaSnapshot: options.schemaSnapshot,
    rpcHandlers: options.rpcHandlers
  });
  const rpcCalls = [];
  const fromCalls = [];

  // Wrap client methods to spy on calls
  const originalRpc = mockSupabase.rpc;
  mockSupabase.rpc = (fnName, args) => {
    rpcCalls.push({ fnName, args, timestamp: Date.now() });
    return originalRpc(fnName, args);
  };

  const originalFrom = mockSupabase.from;
  mockSupabase.from = (tableName) => {
    fromCalls.push({ tableName, timestamp: Date.now() });
    return originalFrom(tableName);
  };

  // Set up DOM
  document.documentElement.innerHTML = htmlContent;

  // Isolate document/window event listeners per harness session
  const origDocAdd = document.addEventListener.bind(document);
  const origDocRemove = document.removeEventListener.bind(document);
  const origWinAdd = window.addEventListener.bind(window);
  const origWinRemove = window.removeEventListener.bind(window);
  const docListeners = [];
  const winListeners = [];
  document.addEventListener = (type, listener, opts) => {
    docListeners.push({ type, listener, opts });
    return origDocAdd(type, listener, opts);
  };
  window.addEventListener = (type, listener, opts) => {
    winListeners.push({ type, listener, opts });
    return origWinAdd(type, listener, opts);
  };

  // Block external network
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => {
    const urlStr = String(url || '');
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      const err = new Error(`[PageHarness] Rede bloqueada: chamada externa para ${urlStr} não permitida em testes.`);
      return Promise.reject(err);
    }
    return originalFetch ? originalFetch(url, opts) : Promise.reject(new Error('Fetch unavailable'));
  };

  // Inject globals & web mocks
  window.cafeteriaSupabase = mockSupabase;
  window.supabaseClient = mockSupabase;
  if (!window.supabase) {
    window.supabase = {
      createClient: () => mockSupabase
    };
  } else {
    window.supabase.createClient = () => mockSupabase;
  }

  if (!window.Audio) {
    window.Audio = class {
      play() { return Promise.resolve(); }
      pause() {}
      load() {}
      addEventListener() {}
      removeEventListener() {}
    };
  }

  if (!window.QRCode) {
    window.QRCode = class {
      constructor(el) {
        if (el) el.innerHTML = '<canvas class="mock-qrcode"></canvas>';
      }
      makeCode() {}
      clear() {}
    };
  }

  if (!window.qrcode) {
    window.qrcode = () => ({
      addData() {},
      make() {},
      createDataURL: () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      createImgTag: () => '<img />',
      createSvgTag: () => '<svg></svg>',
      getModuleCount: () => 21,
      isDark: () => false
    });
  }

  if (!window.Chart) {
    window.Chart = class {
      destroy() {}
      update() {}
    };
  }

  if (!window.pdfjsLib) {
    window.pdfjsLib = {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({ promise: Promise.reject(new Error('PDF mock')) })
    };
  }

  if (!window.St) {
    class MockPageFlip {
      loadFromHTML() {}
      on() {}
      destroy() {}
    }
    window.St = { PageFlip: MockPageFlip };
    if (!window.PageFlip) window.PageFlip = MockPageFlip;
  }

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
  }

  if (typeof URL !== 'undefined') {
    if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock-url';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  }
  if (window.URL) {
    if (!window.URL.createObjectURL) window.URL.createObjectURL = URL.createObjectURL;
    if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = URL.revokeObjectURL;
  }

  const loadedScripts = [];

  async function carregarScript(relativePath) {
    const fullPath = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Script não encontrado: ${fullPath}`);
    }
    const moduleUrl = `${pathToFileURL(fullPath).href}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mod = await import(moduleUrl);
    loadedScripts.push(relativePath);
    return mod;
  }


  async function carregarScriptsDaPagina(filtro = null, opts = {}) {
    const scriptElements = Array.from(document.querySelectorAll('script[src]'));
    for (const el of scriptElements) {
      const src = el.getAttribute('src');
      if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        continue;
      }
      // Pular bibliotecas de terceiros locais
      if (src.includes('qrcode.min.js') || src.includes('pdf.min.js') || src.includes('page-flip')) {
        continue;
      }
      if (typeof filtro === 'function' && !filtro(src)) {
        continue;
      }
      await carregarScript(src);
    }
    if (opts.dispararDOMContentLoaded !== false) {
      dispararDOMContentLoaded();
    }
  }

  function dispararDOMContentLoaded() {
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
  }

  return {
    document,
    window,
    mockSupabase,
    rpcCalls,
    fromCalls,
    loadedScripts,
    carregarScript,
    carregarScriptsDaPagina,
    clicar(selectorOrEl) {
      const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
      if (!el) throw new Error(`Element not found for click: ${selectorOrEl}`);
      el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    },
    preencher(selectorOrEl, valor) {
      const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
      if (!el) throw new Error(`Element not found for preencher: ${selectorOrEl}`);
      el.value = valor;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    dispararDOMContentLoaded,
    aguardarRender(ms = 20) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    cleanup() {
      for (const { type, listener, opts } of docListeners) {
        origDocRemove(type, listener, opts);
      }
      for (const { type, listener, opts } of winListeners) {
        origWinRemove(type, listener, opts);
      }
      document.addEventListener = origDocAdd;
      window.addEventListener = origWinAdd;
      globalThis.fetch = originalFetch;
    }
  };
}

