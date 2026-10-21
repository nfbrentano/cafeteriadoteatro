/**
 * js/utils/crm-segmentos.js
 * Utilitários para segmentação RFV de clientes e filtros por tags (CAF-000089).
 */

/**
 * Classifica um cliente segundo matriz RFV (Recência, Frequência e Valor).
 * @param {{
 *   ultima_compra?: string|Date,
 *   total_pedidos?: number,
 *   valor_total_gasto?: number
 * }} cliente
 * @param {{ hoje?: Date }} [opts]
 * @returns {{
 *   recenciaScore: number,
 *   frequenciaScore: number,
 *   valorScore: number,
 *   segmento: 'vip'|'frequente'|'promissor'|'novo'|'em_risco'|'inativo'|'indefinido',
 *   diasDesdeUltimaCompra: number|null
 * }}
 */
export function classificarClienteRfv(cliente, opts = {}) {
  const hoje = opts.hoje ? new Date(opts.hoje) : new Date();

  if (!cliente || typeof cliente !== 'object') {
    return {
      recenciaScore: 0,
      frequenciaScore: 0,
      valorScore: 0,
      segmento: 'indefinido',
      diasDesdeUltimaCompra: null
    };
  }

  let dias = null;
  if (cliente.ultima_compra) {
    const dataCompra = new Date(cliente.ultima_compra);
    if (!isNaN(dataCompra.getTime())) {
      const diffMs = hoje.getTime() - dataCompra.getTime();
      dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
  }

  // Recência:
  // <= 15 dias: 5 | <= 30 dias: 4 | <= 60 dias: 3 | <= 90 dias: 2 | > 90 dias: 1
  let rScore = 1;
  if (dias === null) rScore = 1;
  else if (dias <= 15) rScore = 5;
  else if (dias <= 30) rScore = 4;
  else if (dias <= 60) rScore = 3;
  else if (dias <= 90) rScore = 2;
  else rScore = 1;

  // Frequência:
  // >= 15 pedidos: 5 | >= 10: 4 | >= 5: 3 | >= 2: 2 | 1: 1
  const freq = Number(cliente.total_pedidos) || 0;
  let fScore = 1;
  if (freq >= 15) fScore = 5;
  else if (freq >= 10) fScore = 4;
  else if (freq >= 5) fScore = 3;
  else if (freq >= 2) fScore = 2;
  else fScore = 1;

  // Valor (gasto total em reais):
  // >= 300: 5 | >= 150: 4 | >= 75: 3 | >= 30: 2 | < 30: 1
  const valor = Number(cliente.valor_total_gasto) || 0;
  let vScore = 1;
  if (valor >= 300) vScore = 5;
  else if (valor >= 150) vScore = 4;
  else if (valor >= 75) vScore = 3;
  else if (valor >= 30) vScore = 2;
  else vScore = 1;

  // Determinar segmento consolidado
  let segmento = 'indefinido';
  if (rScore >= 4 && fScore >= 4 && vScore >= 4) {
    segmento = 'vip';
  } else if (rScore >= 4 && fScore >= 3) {
    segmento = 'frequente';
  } else if (rScore >= 4 && fScore <= 2) {
    segmento = 'novo';
  } else if (rScore === 3 && fScore >= 3) {
    segmento = 'promissor';
  } else if (rScore === 2 && fScore >= 3) {
    segmento = 'em_risco';
  } else {
    segmento = 'inativo';
  }

  return {
    recenciaScore: rScore,
    frequenciaScore: fScore,
    valorScore: vScore,
    segmento,
    diasDesdeUltimaCompra: dias
  };
}

/**
 * Filtra uma lista de clientes por tags desejadas.
 * @param {Array<{tags?: string[]}>} clientes
 * @param {string|string[]} tagsFiltro
 * @param {'qualquer'|'todas'} [modo='qualquer']
 * @returns {Array<any>}
 */
export function filtrarClientesPorTag(clientes = [], tagsFiltro = [], modo = 'qualquer') {
  if (!Array.isArray(clientes)) return [];
  const tagsAlvo = (Array.isArray(tagsFiltro) ? tagsFiltro : [tagsFiltro])
    .map(t => String(t || '').trim().toLowerCase())
    .filter(Boolean);

  if (tagsAlvo.length === 0) return [...clientes];

  return clientes.filter(cliente => {
    const clientTags = (Array.isArray(cliente.tags) ? cliente.tags : [])
      .map(t => String(t || '').trim().toLowerCase());

    if (modo === 'todas') {
      return tagsAlvo.every(t => clientTags.includes(t));
    }
    return tagsAlvo.some(t => clientTags.includes(t));
  });
}
