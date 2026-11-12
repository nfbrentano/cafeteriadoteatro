/**
 * js/utils/error-reporter.js
 * Captura e observabilidade de erros do front em produção (CAF-000115).
 * - Listeners globais de window.onerror e unhandledrejection
 * - Interceptação de falhas de RPC/REST
 * - Mascaramento obrigatório de dados sensíveis (RNF01 / CA08)
 * - Rate limiting anti-enxurrada por sessão (RF05 / CA06)
 * - Tolerância e silêncio absoluto em caso de falha (RNF02 / CA02)
 */

export const MAX_SAME_ERROR_PER_SESSION = 10;
export const MAX_OFFLINE_ERRORS = 25;
export const STORAGE_KEY_OFFLINE = 'cafeteria_erros_offline';
export const DEFAULT_APP_VERSION = '1.0.0';

// Mapa de contadores por assinatura de erro na sessão atual
const sessionErrorCounts = new Map();

/**
 * Mascara dados sensíveis em mensagens de erro e stack traces
 * Telefones, PINs, senhas, tokens e números de cartão (CA08 / RNF01)
 * @param {string} text
 * @returns {string}
 */
export function maskSensitiveData(text) {
  if (text === null || text === undefined) return '';
  let str = String(text);

  // 1. Mascarar cartões de crédito (13 a 16 dígitos com ou sem separador)
  str = str.replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[CARTAO_MASCARADO]');

  // 2. Mascarar telefones brasileiros comuns
  // Ex: +55 (11) 98765-4321, (11) 98765-4321, 11987654321, +55 11 987654321
  str = str.replace(/(?:\+?55\s?)?(?:\(?0?[1-9]{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/g, '[TELEFONE_MASCARADO]');

  // 3. Mascarar credenciais, PINs, senhas e tokens com atribuição
  // Ex: pin: 1234, pin=1234, "pin": "1234", senha: "xxx", token: "bearer..."
  str = str.replace(/((?:pin|senha|password|token|bearer|cpf)\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,;]+)/gi, '$1[MASCARADO]');

  return str;
}

/**
 * Identifica a tela atual da aplicação a partir da URL ou do DOM
 * @param {Window} [win]
 * @returns {string}
 */
export function getScreenName(win) {
  const targetWin = win || (typeof window !== 'undefined' ? window : null);
  if (!targetWin) return 'desconhecida';

  try {
    const path = targetWin.location?.pathname || '';
    const file = path.split('/').pop().toLowerCase();

    if (file.includes('pedidos')) return 'pedidos';
    if (file.includes('cozinha')) return 'cozinha';
    if (file.includes('totem')) return 'totem';
    if (file.includes('admin')) {
      // Se houver subpágina ativa no admin, pode complementar
      const activePage = targetWin.document?.querySelector?.('.page.active')?.id?.replace('page-', '');
      return activePage ? `admin:${activePage}` : 'admin';
    }
    if (file.includes('cardapio')) return 'cardapio';
    if (file.includes('retirada')) return 'retirada';
    if (file.includes('avaliar')) return 'avaliar';

    // Se o path for raiz ou genérico (comum em testes com happy-dom), inspeciona o título/documento
    if (targetWin.document) {
      const title = (targetWin.document.title || '').toLowerCase();
      if (title.includes('pedido') || title.includes('pdv')) return 'pedidos';
      if (title.includes('cozinha') || title.includes('kds')) return 'cozinha';
      if (title.includes('totem')) return 'totem';
      if (title.includes('admin') || title.includes('painel')) return 'admin';
      if (title.includes('cardápio') || title.includes('cardapio')) return 'cardapio';
      if (title.includes('retirada')) return 'retirada';
      if (title.includes('avalia')) return 'avaliar';
    }

    if (file === '' || file.includes('index')) return 'home';

    return file.replace('.html', '') || 'home';
  } catch {
    return 'desconhecida';
  }
}

/**
 * Retorna a versão atual do app (padrão ou configurada globalmente)
 * @param {Window} [win]
 * @returns {string}
 */
export function getAppVersion(win) {
  const targetWin = win || (typeof window !== 'undefined' ? window : null);
  return (targetWin && targetWin.APP_VERSION) ? String(targetWin.APP_VERSION) : DEFAULT_APP_VERSION;
}

/**
 * Gera uma assinatura única para o erro visando deduplicação e rate limit por sessão
 * @param {Object} payload
 * @returns {string}
 */
export function getErrorSignature(payload = {}) {
  const tela = payload.tela || 'desconhecida';
  const rpc = payload.rpc_nome || '';
  const msg = (payload.mensagem || '').slice(0, 150);
  return `${tela}|${rpc}|${msg}`;
}

/**
 * Verifica e incrementa a contagem de ocorrências do erro na sessão atual.
 * Retorna true se estiver dentro do limite permitido (< 10), false se exceder (CA06).
 * @param {string} signature
 * @returns {boolean}
 */
export function shouldSendError(signature) {
  const current = sessionErrorCounts.get(signature) || 0;
  if (current >= MAX_SAME_ERROR_PER_SESSION) {
    return false;
  }
  sessionErrorCounts.set(signature, current + 1);
  return true;
}

/**
 * Reseta o contador de erros da sessão (útil para testes unitários)
 */
export function resetSessionErrorCounts() {
  sessionErrorCounts.clear();
}

/**
 * Salva um erro na fila local offline se o banco estiver indisponível
 * @param {Object} errorItem
 * @param {Storage} [customStorage]
 */
export function saveErrorOffline(errorItem, customStorage) {
  try {
    const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (!storage) return;

    const list = JSON.parse(storage.getItem(STORAGE_KEY_OFFLINE) || '[]');
    list.push(errorItem);
    // Limita o buffer para não estourar armazenamento
    if (list.length > MAX_OFFLINE_ERRORS) {
      list.splice(0, list.length - MAX_OFFLINE_ERRORS);
    }
    storage.setItem(STORAGE_KEY_OFFLINE, JSON.stringify(list));
  } catch {
    // Silencioso por design (RNF02)
  }
}

/**
 * Tenta descarregar os erros pendentes salvos na fila offline
 * @param {Object} [supabaseClient]
 * @param {Storage} [customStorage]
 * @returns {Promise<number>} Quantidade de erros reenviados
 */
export async function flushOfflineQueue(supabaseClient, customStorage) {
  try {
    const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : null);
    const client = supabaseClient || (typeof window !== 'undefined' ? window.cafeteriaSupabase : null);
    if (!storage || !client) return 0;

    const raw = storage.getItem(STORAGE_KEY_OFFLINE);
    if (!raw) return 0;

    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    let sent = 0;
    const remaining = [];

    for (const item of list) {
      try {
        const { error } = await client.rpc('registrar_erro_cliente', item);
        if (!error) {
          sent++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length > 0) {
      storage.setItem(STORAGE_KEY_OFFLINE, JSON.stringify(remaining));
    } else {
      storage.removeItem(STORAGE_KEY_OFFLINE);
    }

    return sent;
  } catch {
    return 0;
  }
}

/**
 * Envia o registro de erro para o Supabase de forma estritamente assíncrona e silenciosa
 * @param {Object} rawPayload
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
export async function sendErrorToDatabase(rawPayload, options = {}) {
  try {
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    const client = options.supabase || (win ? win.cafeteriaSupabase : null);

    const tela = rawPayload.tela || getScreenName(win);
    const versao = rawPayload.versao_app || getAppVersion(win);
    const mensagem = maskSensitiveData(rawPayload.mensagem || 'Erro sem mensagem');
    const stack = maskSensitiveData(rawPayload.stack || '');
    const rpcNome = rawPayload.rpc_nome || null;
    const erroCodigo = rawPayload.erro_codigo || null;
    const tipo = rawPayload.tipo || 'uncaught_error';

    // Evita recursão infinita se o erro for da própria RPC de erro
    if (rpcNome === 'registrar_erro_cliente') {
      return false;
    }

    // Rate limiting por sessão (CA06)
    const signature = getErrorSignature({ tela, rpc_nome: rpcNome, mensagem });
    if (!shouldSendError(signature)) {
      return false;
    }

    const payload = {
      p_tela: tela,
      p_mensagem: mensagem,
      p_tipo: tipo,
      p_stack: stack || null,
      p_versao: versao,
      p_rpc_nome: rpcNome,
      p_erro_codigo: erroCodigo,
      p_metadados: {
        userAgent: (win && win.navigator) ? win.navigator.userAgent : '',
        timestamp: new Date().toISOString(),
        ...(rawPayload.metadados || {})
      }
    };

    // Se cliente indisponível ou offline, enfileira
    const isOffline = (win && win.navigator && win.navigator.onLine === false);
    if (!client || isOffline) {
      saveErrorOffline(payload, options.storage);
      return false;
    }

    let rpcSuccess = false;
    try {
      const { error } = await client.rpc('registrar_erro_cliente', payload);
      rpcSuccess = !error;
    } catch {
      rpcSuccess = false;
    }

    if (!rpcSuccess) {
      saveErrorOffline(payload, options.storage);
      return false;
    }

    return true;
  } catch {
    // RNF02 / CA02: falha no envio é estritamente silenciosa
    return false;
  }
}

/**
 * Reporta um erro genérico não tratado ou manual
 * @param {Error|Event|string} err
 * @param {Object} [extra]
 * @returns {Promise<boolean>}
 */
export async function reportError(err, extra = {}) {
  try {
    let mensagem = '';
    let stack = '';
    let tipo = extra.tipo || 'uncaught_error';

    if (typeof err === 'string') {
      mensagem = err;
    } else if (err instanceof Error) {
      mensagem = err.message || err.name;
      stack = err.stack || '';
    } else if (err && typeof err === 'object') {
      mensagem = err.message || err.reason || JSON.stringify(err);
      stack = err.error?.stack || err.stack || '';
    }

    return await sendErrorToDatabase({
      mensagem,
      stack,
      tipo,
      ...extra
    });
  } catch {
    return false;
  }
}

/**
 * Reporta uma falha de chamada RPC / REST do Supabase (CA03)
 * @param {string} rpcName Nome da função RPC chamada
 * @param {Error|Object|string} err Erro retornado ou capturado
 * @param {Object} [extra]
 * @returns {Promise<boolean>}
 */
export async function reportRpcError(rpcName, err, extra = {}) {
  try {
    if (!rpcName || rpcName === 'registrar_erro_cliente') {
      return false;
    }

    let mensagem = '';
    let codigo = null;
    let stack = '';

    if (typeof err === 'string') {
      mensagem = err;
    } else if (err && typeof err === 'object') {
      mensagem = err.message || err.details || err.hint || JSON.stringify(err);
      codigo = err.code || err.status || err.statusCode || null;
      stack = err.stack || '';
    }

    return await sendErrorToDatabase({
      tela: extra.tela,
      tipo: 'rpc_error',
      rpc_nome: rpcName,
      erro_codigo: codigo ? String(codigo) : null,
      mensagem: `[RPC ${rpcName}] ${mensagem}`,
      stack,
      metadados: extra.metadados || {}
    }, extra);
  } catch {
    return false;
  }
}

/**
 * Inicializa os ouvintes globais de erro no navegador (CA01 / CA02)
 * @param {Object} [options]
 */
export function initErrorReporter(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  if (!win || win.__errorReporterInitialized) return;

  try {
    // 1. Ouvinte para erros não tratados de JS (window.onerror / ErrorEvent)
    win.addEventListener('error', (event) => {
      try {
        const errorObj = event.error || {};
        const msg = event.message || errorObj.message || 'Erro não tratado no script';
        const stack = errorObj.stack || (event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '');

        sendErrorToDatabase({
          tipo: 'uncaught_error',
          mensagem: msg,
          stack,
          metadados: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        }, { window: win });
      } catch {
        // Silêncio absoluto
      }
    });

    // 2. Ouvinte para Promises rejeitadas não tratadas
    win.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event.reason;
        let msg = 'Promise rejeitada não tratada';
        let stack = '';

        if (typeof reason === 'string') {
          msg = reason;
        } else if (reason instanceof Error) {
          msg = reason.message || msg;
          stack = reason.stack || '';
        } else if (reason && typeof reason === 'object') {
          msg = reason.message || JSON.stringify(reason);
          stack = reason.stack || '';
        }

        sendErrorToDatabase({
          tipo: 'unhandled_rejection',
          mensagem: msg,
          stack
        }, { window: win });
      } catch {
        // Silêncio absoluto
      }
    });

    // 3. Ouvinte de reconexão para descarregar erros offline
    win.addEventListener('online', () => {
      flushOfflineQueue(win.cafeteriaSupabase, win.localStorage);
    });

    win.__errorReporterInitialized = true;
  } catch {
    // Silêncio absoluto
  }
}

// Objeto de exportação unificado
export const ErrorReporter = {
  maskSensitiveData,
  getScreenName,
  getAppVersion,
  getErrorSignature,
  shouldSendError,
  resetSessionErrorCounts,
  saveErrorOffline,
  flushOfflineQueue,
  sendErrorToDatabase,
  reportError,
  reportRpcError,
  initErrorReporter
};

export default ErrorReporter;

// Vinculação global e auto-inicialização no navegador
if (typeof window !== 'undefined') {
  window.errorReporter = ErrorReporter;
  window.ErrorReporter = ErrorReporter;
  initErrorReporter();
}
