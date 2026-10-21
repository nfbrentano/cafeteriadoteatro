import fs from 'fs';
import path from 'path';
import { createSupabaseMock } from './supabase-mock.js';

/**
 * Harness for testing application pages in Happy DOM with isolated Supabase mock
 * and blocking external network fetch requests.
 */
export function createPageHarness(htmlFileName, options = {}) {
  const filePath = path.resolve(process.cwd(), htmlFileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Page not found: ${filePath}`);
  }

  const htmlContent = fs.readFileSync(filePath, 'utf-8');
  const mockSupabase = options.supabase || createSupabaseMock(options.initialData || {});
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

  // Inject globals
  window.cafeteriaSupabase = mockSupabase;
  window.supabaseClient = mockSupabase;
  if (!window.supabase) {
    window.supabase = {
      createClient: () => mockSupabase
    };
  } else {
    window.supabase.createClient = () => mockSupabase;
  }

  return {
    document,
    window,
    mockSupabase,
    rpcCalls,
    fromCalls,
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
    aguardarRender(ms = 10) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    cleanup() {
      globalThis.fetch = originalFetch;
    }
  };
}
