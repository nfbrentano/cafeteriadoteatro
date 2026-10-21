/**
 * js/utils/relatorios-agregados.js
 * Utilitários para agregações estatísticas de relatórios (ticket médio, ranking, vendas por período) (CAF-000089).
 */

/**
 * Calcula o ticket médio a partir de uma lista de pedidos ou total / quantidade.
 * @param {Array<{total?: number, valor?: number}>|number} pedidosOuTotal
 * @param {number} [quantidadePedidos]
 * @returns {number}
 */
export function calcularTicketMedio(pedidosOuTotal, quantidadePedidos) {
  if (typeof pedidosOuTotal === 'number') {
    const total = pedidosOuTotal;
    const qtd = Number(quantidadePedidos) || 0;
    if (qtd <= 0) return 0;
    return Math.round((total / qtd) * 100) / 100;
  }

  if (!Array.isArray(pedidosOuTotal) || pedidosOuTotal.length === 0) return 0;

  let totalCents = 0;
  let count = 0;

  for (const p of pedidosOuTotal) {
    const val = Number(p.total ?? p.valor) || 0;
    totalCents += Math.round(val * 100);
    count += 1;
  }

  if (count === 0) return 0;
  return Math.round(totalCents / count) / 100;
}

/**
 * Calcula ranking dos produtos mais vendidos por quantidade e faturamento.
 * @param {Array<{produto_id: any, nome_produto?: string, quantidade: number, preco_unitario?: number, subtotal?: number}>} itens
 * @param {number} [topN=10]
 * @returns {Array<{produto_id: any, nome: string, quantidade: number, faturamento: number}>}
 */
export function calcularRankingProdutos(itens = [], topN = 10) {
  if (!Array.isArray(itens)) return [];

  const mapa = new Map();

  for (const item of itens) {
    if (item.cancelado === true) continue;
    const id = item.produto_id || item.id || 'desconhecido';
    const nome = item.nome_produto || item.nome || `Produto #${id}`;
    const qtd = Number(item.quantidade) || 1;
    const subtotal = Number(item.subtotal ?? (qtd * (item.preco_unitario || 0))) || 0;

    if (!mapa.has(id)) {
      mapa.set(id, { produto_id: id, nome, quantidade: 0, faturamentoCents: 0 });
    }

    const reg = mapa.get(id);
    reg.quantidade += qtd;
    reg.faturamentoCents += Math.round(subtotal * 100);
  }

  const list = Array.from(mapa.values()).map(r => ({
    produto_id: r.produto_id,
    nome: r.nome,
    quantidade: r.quantidade,
    faturamento: r.faturamentoCents / 100
  }));

  list.sort((a, b) => b.quantidade - a.quantidade || b.faturamento - a.faturamento);

  return list.slice(0, topN);
}

/**
 * Agrupa vendas por período (dia/data YYYY-MM-DD).
 * @param {Array<{created_at: string|Date, total?: number, valor?: number}>} pedidos
 * @returns {Record<string, { total: number, quantidade: number }>}
 */
export function agruparVendasPorData(pedidos = []) {
  if (!Array.isArray(pedidos)) return {};

  const resultado = {};

  for (const p of pedidos) {
    if (!p.created_at) continue;
    const dataStr = new Date(p.created_at).toISOString().slice(0, 10);
    const valor = Number(p.total ?? p.valor) || 0;

    if (!resultado[dataStr]) {
      resultado[dataStr] = { total: 0, quantidade: 0, totalCents: 0 };
    }

    resultado[dataStr].totalCents += Math.round(valor * 100);
    resultado[dataStr].quantidade += 1;
    resultado[dataStr].total = resultado[dataStr].totalCents / 100;
  }

  // Limpar campo auxiliar
  for (const k of Object.keys(resultado)) {
    delete resultado[k].totalCents;
  }

  return resultado;
}

/**
 * Calcula tempo médio de preparo em minutos.
 * @param {Array<{created_at: string|Date, concluido_em?: string|Date}>} pedidosConcluidos
 * @returns {number} Tempo médio em minutos
 */
export function calcularTempoMedioPreparo(pedidosConcluidos = []) {
  if (!Array.isArray(pedidosConcluidos) || pedidosConcluidos.length === 0) return 0;

  let totalMinutos = 0;
  let count = 0;

  for (const p of pedidosConcluidos) {
    if (!p.created_at || !p.concluido_em) continue;
    const inicio = new Date(p.created_at).getTime();
    const fim = new Date(p.concluido_em).getTime();

    if (fim >= inicio) {
      const diffMin = (fim - inicio) / (1000 * 60);
      totalMinutos += diffMin;
      count += 1;
    }
  }

  if (count === 0) return 0;
  return Math.round((totalMinutos / count) * 10) / 10;
}
