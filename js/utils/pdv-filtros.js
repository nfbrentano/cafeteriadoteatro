/**
 * CAF-000087 / CAF-000003 / CAF-000080: Montagem de filtros do PDV com corte do dia operacional
 */

import { inicioDoDiaSP } from './datas-sp.js';

export function montarFiltroPedidosAtivos(dataReferencia = new Date(), options = {}) {
  const inicioISO = inicioDoDiaSP(dataReferencia);

  return {
    inicioISO,
    // Status considerados ativos no PDV
    statusValidos: ['pendente', 'em_preparo', 'pronto', 'concluido'],
    statusExcluidos: ['cancelado', 'entregue'],
    // Condição para carregar: criado a partir do início do dia operacional OU pendente de pagamento do dia
    filtroSupabase: {
      colunaData: 'created_at',
      operador: 'gte',
      valorData: inicioISO
    }
  };
}

export function filtrarPedidosAtivosMemoria(pedidos = [], inicioISO = null) {
  if (!Array.isArray(pedidos)) return [];
  const corteTime = inicioISO ? new Date(inicioISO).getTime() : 0;

  return pedidos.filter(p => {
    if (!p) return false;
    const status = String(p.status || '').toLowerCase();
    if (status === 'cancelado') return false;

    // Se entregue e pago, já saiu da operação ativa da mesa
    if (status === 'entregue' && p.status_pagamento === 'pago') return false;

    // Corte do dia: pedidos anteriores ao dia operacional não devem poluir o PDV
    if (corteTime > 0 && p.created_at) {
      const pedidoTime = new Date(p.created_at).getTime();
      if (pedidoTime < corteTime) return false;
    }

    return true;
  });
}

export function calcularTrocoPdv(total = 0, valorPago = 0) {
  const tot = Math.round(Number(total || 0) * 100);
  const pago = Math.round(Number(valorPago || 0) * 100);
  const diferenca = pago - tot;
  return {
    valido: diferenca >= 0,
    troco: diferenca > 0 ? Number((diferenca / 100).toFixed(2)) : 0
  };
}

export function filtrarPedidosPdv(pedidos = [], { atendenteId = null, apenasMeus = false } = {}) {
  if (!Array.isArray(pedidos)) return [];
  if (!apenasMeus || !atendenteId) return pedidos;
  return pedidos.filter(p => p && p.atendente_id === atendenteId);
}

export default {
  montarFiltroPedidosAtivos,
  filtrarPedidosAtivosMemoria,
  calcularTrocoPdv,
  filtrarPedidosPdv
};
