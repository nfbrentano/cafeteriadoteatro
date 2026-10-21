/**
 * CAF-000087 / CAF-000016 / CAF-000080: Utilitário para Geração e Exportação de CSV
 */

import { formatarDataHoraSP } from './datas-sp.js';

export function escapeCSV(val, separator = ';') {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(separator) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function gerarCSVPedidos(pedidos = [], options = {}) {
  const {
    separator = ';',
    incluirBOM = true,
    colunas = ['Nº', 'Data/Hora', 'Mesa', 'Status', 'Pagamento', 'Total']
  } = options;

  const linhas = [];
  linhas.push(colunas.map(c => escapeCSV(c, separator)).join(separator));

  for (const p of pedidos) {
    if (!p) continue;
    const num = p.numero_pedido || p.id || '';
    const dataHora = p.created_at ? formatarDataHoraSP(p.created_at) : '';
    const mesa = p.mesa_codigo || (p.mesa_id ? `Mesa ${p.mesa_id}` : 'Balcão/Viagem');
    const status = p.status || '';
    const pagamento = p.forma_pagamento || p.status_pagamento || '';
    const total = Number(p.total || 0).toFixed(2).replace('.', ',');

    linhas.push([
      escapeCSV(num, separator),
      escapeCSV(dataHora, separator),
      escapeCSV(mesa, separator),
      escapeCSV(status, separator),
      escapeCSV(pagamento, separator),
      escapeCSV(total, separator)
    ].join(separator));
  }

  const csvBody = linhas.join('\r\n');
  return incluirBOM ? '\uFEFF' + csvBody : csvBody;
}

export function exportarParaCsv(colunas = [], dados = [], options = {}) {
  const { separator = ',', includeBom = true } = options;
  const header = colunas.map(c => escapeCSV(c.label || c.key, separator)).join(separator);
  const rows = dados.map(row => {
    return colunas.map(c => escapeCSV(row[c.key], separator)).join(separator);
  });
  const csvContent = [header, ...rows].join('\r\n');
  return includeBom ? '\uFEFF' + csvContent : csvContent;
}

export default {
  escapeCSV,
  gerarCSVPedidos,
  exportarParaCsv
};
