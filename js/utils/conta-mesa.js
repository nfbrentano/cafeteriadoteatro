/**
 * CAF-000087 / CAF-000073: Utilitários unificados de Fechamento de Conta de Mesa
 */

export function parseCurrencyToCents(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    return Math.round(val * 100);
  }
  let str = String(val).trim();
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const clean = str.replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

export function formatCentsToCurrency(cents) {
  const val = (Number(cents) || 0) / 100;
  return val.toFixed(2);
}

export function filterAtivosNaoCancelados(pedidos = []) {
  if (!Array.isArray(pedidos)) return [];
  return pedidos.filter(p => {
    if (!p) return false;
    const st = String(p.status || '').toLowerCase();
    return st !== 'cancelado';
  });
}

export function calculateMesaTotals(pedidos = [], options = {}) {
  const {
    taxaServicoPercent = 0,
    descontoManualCents = 0,
    jaPagoParcialCents = 0
  } = options;

  const pedidosValidos = filterAtivosNaoCancelados(pedidos);
  let subtotalCents = 0;

  for (const p of pedidosValidos) {
    subtotalCents += parseCurrencyToCents(p.total);
  }

  const jaPagoCents = Math.max(0, parseInt(jaPagoParcialCents, 10) || 0);
  const subtotalRestanteCents = Math.max(0, subtotalCents - jaPagoCents);

  const taxaServicoCents = Math.round((subtotalRestanteCents * (Number(taxaServicoPercent) || 0)) / 100);
  const descontoCents = Math.min(subtotalRestanteCents + taxaServicoCents, Number(descontoManualCents) || 0);
  const totalCents = Math.max(0, subtotalRestanteCents + taxaServicoCents - descontoCents);

  return {
    subtotalCents,
    subtotal: formatCentsToCurrency(subtotalCents),
    jaPagoCents,
    jaPago: formatCentsToCurrency(jaPagoCents),
    subtotalRestanteCents,
    subtotalRestante: formatCentsToCurrency(subtotalRestanteCents),
    taxaServicoCents,
    taxaServico: formatCentsToCurrency(taxaServicoCents),
    descontoCents,
    desconto: formatCentsToCurrency(descontoCents),
    totalCents,
    total: formatCentsToCurrency(totalCents),
    pedidosValidos
  };
}

export function buildFecharContaMesaPayload({
  mesaId,
  pedidos = [],
  taxaServicoPercent = 0,
  descontoManualCents = 0,
  descontoMotivo = null,
  pagamentos = [],
  idempotencyKey = null,
  cupomCodigo = null,
  campanhaId = null
} = {}) {
  const totals = calculateMesaTotals(pedidos, {
    taxaServicoPercent,
    descontoManualCents
  });

  const taxaVal = Number(totals.taxaServico);
  const descVal = Number(totals.desconto);
  const totVal = Number(totals.total);

  return {
    p_mesa_id: Number(mesaId),
    p_pagamentos: pagamentos.map(pg => ({
      forma: String(pg.forma || pg.metodo || 'dinheiro'),
      valor: Number(pg.valor) || 0
    })),
    p_taxa_servico: taxaVal,
    p_desconto_manual: descVal,
    p_desconto_motivo: descontoMotivo || null,
    p_idempotency_key: idempotencyKey || null,
    p_cupom_codigo: cupomCodigo || null,
    p_campanha_id: campanhaId || null,
    p_total: totVal
  };
}

export function validarFecharContaPayload(payload) {
  if (!payload) return { valido: false, erro: 'Payload nulo' };
  if (!payload.p_mesa_id) return { valido: false, erro: 'Mesa não informada' };
  if (!Array.isArray(payload.p_pagamentos) || payload.p_pagamentos.length === 0) {
    return { valido: false, erro: 'Nenhum pagamento informado' };
  }
  const somaPagamentos = payload.p_pagamentos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  const diff = Math.abs(somaPagamentos - (Number(payload.p_total) || 0));
  if (diff > 0.05) {
    return { valido: false, erro: 'Soma dos pagamentos diverge do total' };
  }
  return { valido: true };
}

export function calcularTrocoCents(valorPagoCents, totalEsperadoCents) {
  const troco = Math.max(0, valorPagoCents - totalEsperadoCents);
  return troco;
}

export function podeAplicarDesconto(usuario) {
  if (!usuario) return false;
  const cargo = String(usuario.cargo || '').toLowerCase();
  if (cargo === 'gerente' || cargo === 'admin' || cargo === 'administrador') return true;
  return Boolean(usuario.pode_dar_desconto);
}

export function dividirIgualmenteCents(totalCents, numPessoas) {
  const n = Math.max(1, parseInt(numPessoas, 10) || 1);
  const total = Math.max(0, parseInt(totalCents, 10) || 0);
  const base = Math.floor(total / n);
  const sobra = total % n;
  const partes = [];
  for (let i = 0; i < n; i++) {
    partes.push(base + (i < sobra ? 1 : 0));
  }
  return partes;
}

export function dividirPorConsumoItens(itens = [], selecaoPorPessoa = []) {
  const itemMap = new Map();
  for (const item of itens) {
    itemMap.set(String(item.id), Number(item.valorTotalCents || item.preco * 100 || 0));
  }
  const porPessoa = {};
  let totalCalculadoCents = 0;
  for (const sel of selecaoPorPessoa) {
    const nome = sel.pessoa || 'Pessoa';
    let soma = 0;
    for (const id of (sel.itemIds || [])) {
      soma += itemMap.get(String(id)) || 0;
    }
    porPessoa[nome] = soma;
    totalCalculadoCents += soma;
  }
  return { porPessoa, totalCalculadoCents };
}

export function distribuirTaxaEDesconto(subtotaisCents = [], taxaCents = 0, descontoCents = 0) {
  const somaSub = subtotaisCents.reduce((a, b) => a + b, 0);
  if (somaSub === 0) return subtotaisCents.map(() => 0);
  const liquidoAjuste = taxaCents - descontoCents;
  return subtotaisCents.map(sub => {
    const proporcao = sub / somaSub;
    return Math.round(sub + (liquidoAjuste * proporcao));
  });
}

/**
 * CAF-000112: Extrai todos os itens não cancelados dos pedidos da mesa com status de pagamento por item.
 */
export function extrairItensMesaComSaldo(pedidos = []) {
  const pedidosValidos = filterAtivosNaoCancelados(pedidos);
  const itens = [];

  for (const p of pedidosValidos) {
    const pItens = Array.isArray(p.pedido_itens) ? p.pedido_itens : [];
    for (const it of pItens) {
      if (it.cancelado) continue;
      const qtdTotal = Number(it.quantidade) || 0;
      const qtdPaga = Number(it.quantidade_paga) || 0;
      const qtdPendente = Math.max(0, qtdTotal - qtdPaga);
      const precoUnitCents = parseCurrencyToCents(it.preco_unitario);
      const subtotalCents = Math.round(qtdTotal * precoUnitCents);
      const saldoCents = Math.round(qtdPendente * precoUnitCents);

      itens.push({
        id: it.id,
        pedidoId: p.id,
        nome: it.nome_produto || 'Item',
        quantidadeTotal: qtdTotal,
        quantidadePaga: qtdPaga,
        quantidadePendente: qtdPendente,
        precoUnitarioCents: precoUnitCents,
        precoUnitario: formatCentsToCurrency(precoUnitCents),
        subtotalCents,
        subtotal: formatCentsToCurrency(subtotalCents),
        saldoCents,
        saldo: formatCentsToCurrency(saldoCents),
        quitado: qtdPendente <= 0
      });
    }
  }

  return itens;
}

/**
 * CAF-000112: Calcula o total e taxa proporcional de uma lista de itens selecionados para pagamento parcial.
 */
export function calcularTotalItensSelecionados(itensSelecionados = [], taxaServicoPercent = 0) {
  let subtotalCents = 0;
  for (const item of (itensSelecionados || [])) {
    const qtd = Number(item.quantidade) || 0;
    const precoUnitCents = parseCurrencyToCents(item.preco_unitario || item.precoUnitario);
    subtotalCents += Math.round(qtd * precoUnitCents);
  }
  const taxaServicoCents = Math.round((subtotalCents * (Number(taxaServicoPercent) || 0)) / 100);
  const totalCents = subtotalCents + taxaServicoCents;

  return {
    subtotalCents,
    subtotal: formatCentsToCurrency(subtotalCents),
    taxaServicoCents,
    taxaServico: formatCentsToCurrency(taxaServicoCents),
    totalCents,
    total: formatCentsToCurrency(totalCents)
  };
}

/**
 * CAF-000112: Validação completa de payload de pagamento parcial (Itens ou Abatimento).
 */
export function validarPagamentoParcialPayload({
  mesaCodigo,
  pagamentos = [],
  itens = [],
  valorAbatimentoCents = 0,
  saldoRestanteCents = 0,
  taxaServicoPercent = 0
} = {}) {
  if (!mesaCodigo || String(mesaCodigo).trim().length === 0) {
    return { valido: false, erro: 'Mesa não informada.' };
  }

  const temItens = Array.isArray(itens) && itens.some(it => Number(it.quantidade) > 0);
  const abatimento = Math.max(0, parseInt(valorAbatimentoCents, 10) || 0);

  if (!temItens && abatimento <= 0) {
    return { valido: false, erro: 'Informe itens a pagar ou um valor de abatimento maior que zero.' };
  }

  let valorEsperadoCents = 0;
  if (temItens) {
    const calc = calcularTotalItensSelecionados(itens, 0);
    valorEsperadoCents = calc.subtotalCents;
  } else {
    valorEsperadoCents = abatimento;
  }

  if (valorEsperadoCents <= 0) {
    return { valido: false, erro: 'Valor a pagar deve ser maior que zero.' };
  }

  const saldoDisponivel = Math.max(0, parseInt(saldoRestanteCents, 10) || 0);
  if (saldoDisponivel > 0 && valorEsperadoCents > (saldoDisponivel + 5)) {
    return {
      valido: false,
      erro: `Valor a pagar (R$ ${formatCentsToCurrency(valorEsperadoCents)}) excede o saldo restante da mesa (R$ ${formatCentsToCurrency(saldoDisponivel)}).`
    };
  }

  const taxaCents = Math.round((valorEsperadoCents * (Number(taxaServicoPercent) || 0)) / 100);
  const totalEsperadoCents = valorEsperadoCents + taxaCents;

  if (!Array.isArray(pagamentos) || pagamentos.length === 0) {
    return { valido: false, erro: 'Nenhuma forma de pagamento informada.' };
  }

  let totalPagoCents = 0;
  for (const pg of pagamentos) {
    totalPagoCents += parseCurrencyToCents(pg.valor);
  }

  if (totalPagoCents < (totalEsperadoCents - 5)) {
    return {
      valido: false,
      erro: `Total pago (R$ ${formatCentsToCurrency(totalPagoCents)}) é inferior ao total a pagar (R$ ${formatCentsToCurrency(totalEsperadoCents)}).`
    };
  }

  const trocoCents = Math.max(0, totalPagoCents - totalEsperadoCents);

  return {
    valido: true,
    valorEsperadoCents,
    taxaCents,
    totalEsperadoCents,
    totalPagoCents,
    trocoCents
  };
}

/**
 * CAF-000108: Filtra pedidos elegíveis para transferência de mesa.
 * Inclui pedidos em status 'entregue' desde que ainda não estejam pagos.
 * Exclui pedidos cancelados e pedidos já pagos (históricos de clientes anteriores).
 */
export function filtrarPedidosTransferiveisMesa(pedidos = [], mesaOrigem = '') {
  if (!Array.isArray(pedidos)) return [];
  const origemTrim = String(mesaOrigem || '').trim();
  return pedidos.filter(p => {
    if (!p) return false;
    if (origemTrim && String(p.mesa_codigo || '').trim() !== origemTrim) return false;
    const status = String(p.status || '').toLowerCase();
    const statusPagto = String(p.status_pagamento || '').toLowerCase();
    if (status === 'cancelado') return false;
    if (statusPagto === 'pago') return false;
    return true;
  });
}

/**
 * CAF-000108: Verifica se um pedido de balcão/online pago pertence à janela temporal do caixa
 * considerando o instante efetivo do pagamento (COALESCE(pago_em, updated_at, created_at)).
 */
export function pedidoPertenceAoTurnoCaixa(pedido, abertoEm, fechadoEm = null) {
  if (!pedido) return false;
  if (String(pedido.status || '').toLowerCase() === 'cancelado') return false;
  if (String(pedido.status_pagamento || '').toLowerCase() !== 'pago') return false;

  const tsRef = pedido.pago_em || pedido.updated_at || pedido.created_at;
  if (!tsRef || !abertoEm) return false;

  const tPagto = new Date(tsRef).getTime();
  const tInicio = new Date(abertoEm).getTime();
  const tFim = fechadoEm ? new Date(fechadoEm).getTime() : Date.now();

  if (Number.isNaN(tPagto) || Number.isNaN(tInicio) || Number.isNaN(tFim)) return false;
  return tPagto >= tInicio && tPagto <= tFim;
}

export default {
  parseCurrencyToCents,
  formatCentsToCurrency,
  filterAtivosNaoCancelados,
  calculateMesaTotals,
  buildFecharContaMesaPayload,
  validarFecharContaPayload,
  extrairItensMesaComSaldo,
  calcularTotalItensSelecionados,
  validarPagamentoParcialPayload,
  dividirIgualmenteCents,
  dividirPorConsumoItens,
  distribuirTaxaEDesconto,
  calcularTrocoCents,
  podeAplicarDesconto,
  filtrarPedidosTransferiveisMesa,
  pedidoPertenceAoTurnoCaixa
};
