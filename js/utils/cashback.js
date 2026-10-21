/**
 * CAF-000063 — Programa de Fidelidade e Cashback Automático na Carteira
 * Utilitário compartilhado para Cardápio, Totem, PDV e Comprovante
 *
 * REGRA DO PROJETO: Cashback nasce estritamente DESATIVADO por padrão.
 * Precisa de ativação manual no Admin para funcionar ou exibir qualquer mensagem.
 */

export const FORMAS_PAGAMENTO_ELEGIVEIS = new Set([
  'pix',
  'dinheiro',
  'cartao',
  'cartao_credito',
  'cartao_debito'
]);

let _cachedConfig = null;
let _cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

export function clearCashbackConfigCache() {
  _cachedConfig = null;
  _cacheExpiresAt = 0;
}

export async function loadCashbackConfig(supabaseClient, forceReload = false) {
  const now = Date.now();
  if (!forceReload && _cachedConfig && now < _cacheExpiresAt) {
    return _cachedConfig;
  }

  const defaultConfig = {
    ativo: false,
    percentual: 5.0,
    valor_minimo: 10.0
  };

  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    return defaultConfig;
  }

  try {
    const { data, error } = await supabaseClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['cashback_ativo', 'cashback_percentual', 'cashback_valor_minimo']);

    if (error || !data) {
      return defaultConfig;
    }

    const map = {};
    data.forEach(item => {
      let val = item.valor;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (_) {}
      }
      map[item.chave] = val;
    });

    const ativoVal = map['cashback_ativo'];
    const ativo = ativoVal === true || ativoVal === 'true' || ativoVal === 1 || ativoVal === '1';
    const percentual = Number(map['cashback_percentual']) || 5.0;
    const valorMinimo = Number(map['cashback_valor_minimo']) || 10.0;

    _cachedConfig = {
      ativo,
      percentual,
      valor_minimo: valorMinimo
    };
    _cacheExpiresAt = now + CACHE_TTL_MS;
    return _cachedConfig;
  } catch (err) {
    return defaultConfig;
  }
}

export function isCashbackActive(config) {
  if (!config || typeof config !== 'object') return false;
  return config.ativo === true || config.cashback_ativo === true || config.cashback_ativo === 'true';
}

export function calculateEligiblePaymentAmount(pagamentos) {
  if (!pagamentos) return 0;

  if (typeof pagamentos === 'number') {
    return Math.max(0, pagamentos);
  }

  if (Array.isArray(pagamentos)) {
    return pagamentos.reduce((acc, p) => {
      const forma = String(p.forma || '').toLowerCase();
      if (FORMAS_PAGAMENTO_ELEGIVEIS.has(forma)) {
        return acc + Math.max(0, Number(p.valor) || 0);
      }
      return acc;
    }, 0);
  }

  return 0;
}

export function calculateCashback(config, pagamentosOuValor) {
  if (!isCashbackActive(config)) {
    return 0;
  }

  const valorElegivel = calculateEligiblePaymentAmount(pagamentosOuValor);
  const valorMinimo = Math.max(0, Number(config.valor_minimo || config.cashback_valor_minimo) || 10.0);

  if (valorElegivel < valorMinimo) {
    return 0;
  }

  const percentual = Math.max(0, Number(config.percentual || config.cashback_percentual) || 5.0);
  const cashback = (valorElegivel * percentual) / 100.0;

  return Math.round((cashback + Number.EPSILON) * 100) / 100;
}

export function getCashbackPrompt(config) {
  if (!isCashbackActive(config)) {
    return null;
  }
  const perc = Number(config.percentual || config.cashback_percentual) || 5;
  return `🎁 Informe seu WhatsApp para ganhar ${perc}% de cashback na sua carteira!`;
}

export function formatCashbackNotification(valorCashback, novoSaldo = null) {
  if (!valorCashback || valorCashback <= 0) return '';
  const valStr = Number(valorCashback).toFixed(2).replace('.', ',');
  if (novoSaldo !== null && novoSaldo !== undefined) {
    const saldoStr = Number(novoSaldo).toFixed(2).replace('.', ',');
    return `🎁 Você ganhou R$ ${valStr} de cashback! Saldo da carteira: R$ ${saldoStr}`;
  }
  return `🎁 Você ganhou R$ ${valStr} de cashback na sua carteira!`;
}

export async function processOrderCashback(supabaseClient, pedidoIdOrOpts, clienteIdArg, valorElegivelArg) {
  let pedidoId = null;
  let clienteId = null;
  let valorElegivel = 0;

  if (pedidoIdOrOpts && typeof pedidoIdOrOpts === 'object') {
    pedidoId = pedidoIdOrOpts.pedidoId || pedidoIdOrOpts.p_pedido_id || null;
    clienteId = pedidoIdOrOpts.clienteId || pedidoIdOrOpts.p_cliente_id || null;
    valorElegivel = pedidoIdOrOpts.valorElegivel || pedidoIdOrOpts.p_valor_elegivel || 0;
  } else {
    pedidoId = pedidoIdOrOpts;
    clienteId = clienteIdArg;
    valorElegivel = valorElegivelArg;
  }

  if (!supabaseClient || !clienteId) {
    return { creditado: false, error: 'Parâmetros insuficientes' };
  }

  try {
    const { data, error } = await supabaseClient.rpc('processar_cashback_pedido', {
      p_pedido_id: pedidoId ? Number(pedidoId) : null,
      p_cliente_id: clienteId,
      p_valor_elegivel: Number(valorElegivel) || 0
    });

    if (error) {
      console.warn('[Cashback] Erro na RPC processar_cashback_pedido:', error);
      return { creditado: false, error: error.message };
    }

    return data || { creditado: false };
  } catch (err) {
    console.warn('[Cashback] Exceção ao processar cashback:', err);
    return { creditado: false, error: err.message };
  }
}

if (typeof window !== 'undefined') {
  window.cafeteriaCashback = {
    FORMAS_PAGAMENTO_ELEGIVEIS,
    clearCashbackConfigCache,
    loadCashbackConfig,
    isCashbackActive,
    calculateEligiblePaymentAmount,
    calculateCashback,
    getCashbackPrompt,
    formatCashbackNotification,
    processOrderCashback
  };
}
