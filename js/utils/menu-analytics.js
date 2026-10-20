/**
 * CAF-000069: Menu Analytics - Funil de Conversão do Cardápio Digital e Desempenho de Produtos
 */

export const FUNNEL_STAGES = [
  { key: 'sessao_cardapio', label: '1. Acesso ao Cardápio', icon: '📱' },
  { key: 'view_item', label: '2. Visualização de Produto', icon: '🔍' },
  { key: 'add_to_cart', label: '3. Adição à Sacola', icon: '🛒' },
  { key: 'begin_checkout', label: '4. Início de Checkout', icon: '💳' },
  { key: 'purchase', label: '5. Pedido Enviado', icon: '🎉' }
];

/**
 * Calcula a taxa de conversão percentual entre duas etapas.
 */
export function calculateConversionRate(converted, base) {
  const c = Number(converted) || 0;
  const b = Number(base) || 0;
  if (b <= 0 || c <= 0) return 0;
  return Number(((c / b) * 100).toFixed(1));
}

/**
 * Dispara evento de telemetria no GA4 e no Supabase de forma totalmente assíncrona e não-bloqueante.
 */
export async function trackMenuEvent(supabaseClient, {
  canal = 'mesa',
  tipoEvento,
  produtoId = null,
  produtoNome = null,
  valor = null
} = {}) {
  if (!tipoEvento) return;

  // 1. Google Analytics 4 (se presente no navegador)
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      const gaParams = {
        channel: canal,
        event_category: 'menu_funnel'
      };
      if (produtoId) gaParams.item_id = String(produtoId);
      if (produtoNome) gaParams.item_name = produtoNome;
      if (valor !== null && valor !== undefined) gaParams.value = Number(valor);

      window.gtag('event', tipoEvento, gaParams);
    }
  } catch (gaErr) {
    // Silencioso por design (RNF01)
  }

  // 2. Supabase contador agregado diário (se cliente disponível)
  if (supabaseClient && typeof supabaseClient.rpc === 'function') {
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const parsedProdId = produtoId ? parseInt(produtoId, 10) : null;

      await supabaseClient.rpc('registrar_evento_cardapio', {
        p_canal: canal,
        p_tipo_evento: tipoEvento,
        p_produto_id: isNaN(parsedProdId) ? null : parsedProdId,
        p_data: hoje
      });
    } catch (sbErr) {
      // Falha de rede não interrompe o cliente (RNF01)
      console.warn('[MenuAnalytics] Erro ao registrar evento diário:', sbErr?.message || sbErr);
    }
  }
}

/**
 * Agrega os eventos brutos ou diários do Supabase no Funil de Conversão do Cardápio.
 */
export function buildFunnelData(eventos = []) {
  const contadores = {
    sessao_cardapio: 0,
    view_item: 0,
    add_to_cart: 0,
    begin_checkout: 0,
    purchase: 0
  };

  eventos.forEach(ev => {
    const tipo = ev.tipo_evento;
    const qtd = Number(ev.total_eventos || ev.quantidade || 1);
    if (contadores[tipo] !== undefined) {
      contadores[tipo] += qtd;
    }
  });

  const etapas = FUNNEL_STAGES.map((stg, idx) => {
    const total = contadores[stg.key] || 0;
    const anterior = idx > 0 ? (contadores[FUNNEL_STAGES[idx - 1].key] || 0) : total;
    const taxaPasso = idx === 0 ? 100 : calculateConversionRate(total, anterior);
    const taxaGeral = calculateConversionRate(total, contadores.sessao_cardapio || total);

    return {
      chave: stg.key,
      rotulo: stg.label,
      icone: stg.icon,
      total,
      taxaPasso,
      taxaGeral
    };
  });

  const conversaoGeral = calculateConversionRate(contadores.purchase, contadores.sessao_cardapio);

  return {
    contadores,
    etapas,
    conversaoGeral
  };
}

/**
 * Calcula métricas de conversão individual por produto (Views vs AddToCart).
 */
export function calculateProductConversionMetrics(eventos = [], produtos = []) {
  const produtoMap = new Map();

  (produtos || []).forEach(p => {
    produtoMap.set(String(p.id), {
      id: p.id,
      nome: p.nome,
      preco: Number(p.preco || 0),
      categoria: p.categoria_nome || p.categoria || 'Geral',
      views: 0,
      adds: 0
    });
  });

  (eventos || []).forEach(ev => {
    if (!ev.produto_id) return;
    const key = String(ev.produto_id);
    if (!produtoMap.has(key)) {
      produtoMap.set(key, {
        id: ev.produto_id,
        nome: ev.produto_nome || `Produto #${ev.produto_id}`,
        preco: 0,
        categoria: 'Geral',
        views: 0,
        adds: 0
      });
    }

    const prod = produtoMap.get(key);
    const qtd = Number(ev.total_eventos || ev.quantidade || 1);

    if (ev.tipo_evento === 'view_item') {
      prod.views += qtd;
    } else if (ev.tipo_evento === 'add_to_cart') {
      prod.adds += qtd;
    }
  });

  return Array.from(produtoMap.values())
    .map(p => {
      const taxa = calculateConversionRate(p.adds, p.views);
      let status = 'pouca_amostragem';
      let statusLabel = '🔍 Pouca amostragem';

      if (p.views >= 5 && taxa < 20) {
        status = 'muito_visto_pouco_comprado';
        statusLabel = '👀 Muito visto, pouco comprado';
      } else if (taxa >= 50 && p.views >= 3) {
        status = 'alta_conversao';
        statusLabel = '🔥 Alta conversão';
      } else if (p.views >= 3) {
        status = 'equilibrado';
        statusLabel = '⚖️ Equilibrado';
      }

      return {
        ...p,
        taxaConversao: taxa,
        status,
        statusLabel
      };
    })
    .sort((a, b) => b.views - a.views);
}

if (typeof window !== 'undefined') {
  window.cafeteriaMenuAnalytics = {
    FUNNEL_STAGES,
    calculateConversionRate,
    trackMenuEvent,
    buildFunnelData,
    calculateProductConversionMetrics
  };
}
