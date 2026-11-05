/**
 * CAF-000068 / CAF-000111: Lista de Compras por Fornecedor, Entrada de Estoque
 * e Sugestão Inteligente Baseada no Consumo dos Últimos 30 Dias (PEPS / Dias de Cobertura)
 */

/**
 * Calcula o Consumo Médio Diário (CMD) a partir do total de saídas no período.
 * @param {number} totalSaidas Quantidade total de saídas no período
 * @param {number} dias Quantidade de dias do período (padrão 30)
 * @returns {number} CMD arredondado com 3 casas decimais
 */
export function calcularConsumoMedioDiario(totalSaidas, dias = 30) {
  const saidas = Math.max(0, Number(totalSaidas) || 0);
  const periodo = Number(dias) || 30;
  if (periodo <= 0) return 0;
  return Number((saidas / periodo).toFixed(3));
}

/**
 * Calcula a autonomia estimada em dias com base no saldo atual e no CMD.
 * @param {number} saldoAtual Saldo disponível no estoque
 * @param {number} cmd Consumo Médio Diário
 * @returns {number|null} Autonomia em dias (arredondada para 1 casa decimal) ou null se CMD <= 0
 */
export function calcularAutonomiaDias(saldoAtual, cmd) {
  const saldo = Math.max(0, Number(saldoAtual) || 0);
  const consumo = Number(cmd) || 0;
  if (consumo <= 0) return null;
  if (saldo === 0) return 0;
  return Number((saldo / consumo).toFixed(1));
}

/**
 * Calcula a quantidade sugerida de reposição clássica para itens com estoque baixo.
 * Fórmula: MAX(estoque_minimo * 2 - estoque_atual, estoque_minimo)
 */
export function calculateSuggestedPurchaseQuantity(estoqueAtual, estoqueMinimo) {
  const atual = Math.max(0, Number(estoqueAtual) || 0);
  const minInput = Number(estoqueMinimo) || 0;

  if (minInput <= 0) {
    return atual === 0 ? 1 : 0;
  }

  if (atual > minInput) {
    return 0;
  }

  const sugerido = Math.max(minInput * 2 - atual, minInput);
  return Math.ceil(sugerido);
}

/**
 * Calcula a sugestão de compra inteligente baseada no consumo real, horizonte de cobertura e estoque mínimo.
 * @param {Object} params
 * @param {number} params.saldoAtual
 * @param {number} params.estoqueMinimo
 * @param {number} [params.cmd] Consumo Médio Diário dos últimos 30 dias
 * @param {number} [params.diasCobertura=14] Horizonte desejado (ex.: 7, 14 ou 30 dias)
 * @param {number} [params.fatorEspetaculo=1.0] Fator de espetáculo (ex.: 1.30 para +30%)
 * @returns {number} Quantidade inteira sugerida para compra
 */
export function calcularSugestaoCompraInteligente({
  saldoAtual,
  estoqueMinimo,
  cmd = 0,
  diasCobertura = 14,
  fatorEspetaculo = 1.0
}) {
  const atual = Math.max(0, Number(saldoAtual) || 0);
  const minimo = Number(estoqueMinimo) || 0;
  const consumo = Math.max(0, Number(cmd) || 0);
  const dias = Number(diasCobertura) || 14;
  const fator = Number(fatorEspetaculo) || 1.0;

  if (consumo > 0) {
    const demandaProjetada = consumo * dias * fator;
    const necessidadeDemanda = demandaProjetada - atual;
    const necessidadePiso = minimo - atual;
    const metaNecessidade = Math.max(necessidadeDemanda, necessidadePiso);
    return Math.max(0, Math.ceil(metaNecessidade));
  }

  // Fallback quando não há histórico de consumo nos últimos 30 dias
  if (atual <= minimo) {
    return calculateSuggestedPurchaseQuantity(atual, minimo);
  }
  return 0;
}

/**
 * Calcula o custo unitário da compra com base no custo total e quantidade.
 */
export function calculateUnitPrice(custoTotal, quantidade) {
  const total = Number(custoTotal) || 0;
  const qtd = Number(quantidade) || 0;
  if (qtd <= 0 || total <= 0) return 0;
  return Number((total / qtd).toFixed(2));
}

/**
 * Monta a lista de compras/reposição agrupada por fornecedor com suporte a sugestão inteligente.
 * @param {Array} items Lista de itens de estoque
 * @param {Array} suppliers Lista de fornecedores cadastrados
 * @param {Object} [options]
 * @param {number} [options.diasCobertura=14] Dias de cobertura desejados
 * @param {boolean} [options.modoEspetaculo=false] Se aplica multiplicador de espetáculo (+30%)
 * @param {Map|Object} [options.consumoMap] Mapa de CMD por item_id
 */
export function buildShoppingListBySupplier(items = [], suppliers = [], options = {}) {
  const supplierMap = new Map();
  (suppliers || []).forEach(s => {
    supplierMap.set(String(s.id), s);
  });

  const diasCobertura = Number(options.diasCobertura) || 14;
  const modoEspetaculo = !!options.modoEspetaculo;
  const fatorEspetaculo = modoEspetaculo ? 1.3 : (Number(options.fatorEspetaculo) || 1.0);
  const consumoMap = options.consumoMap || new Map();

  function getCmd(itemId) {
    if (consumoMap instanceof Map) {
      return Number(consumoMap.get(itemId) ?? consumoMap.get(String(itemId)) ?? 0);
    }
    if (typeof consumoMap === 'object' && consumoMap !== null) {
      return Number(consumoMap[itemId] ?? consumoMap[String(itemId)] ?? 0);
    }
    return 0;
  }

  const semFornecedorId = '__sem_fornecedor__';
  const grupos = new Map();

  items.forEach(item => {
    const atual = Number(item.saldo_atual !== undefined ? item.saldo_atual : (item.quantidade !== undefined ? item.quantidade : 0));
    const minimo = Number(item.estoque_minimo || 0);
    const cmd = getCmd(item.id);
    const autonomiaDias = calcularAutonomiaDias(atual, cmd);

    // Sugestão de compra calculada com base na cobertura e piso mínimo
    const sugerida = calcularSugestaoCompraInteligente({
      saldoAtual: atual,
      estoqueMinimo: minimo,
      cmd,
      diasCobertura,
      fatorEspetaculo
    });

    // Item entra na lista se estiver abaixo do mínimo OU se a autonomia for menor/igual aos dias de cobertura com sugestão > 0
    const precisaRepor = (atual <= minimo) || (autonomiaDias !== null && autonomiaDias <= diasCobertura && sugerida > 0);

    if (precisaRepor && sugerida > 0) {
      const fornecedorId = item.fornecedor_padrao_id ? String(item.fornecedor_padrao_id) : semFornecedorId;

      if (!grupos.has(fornecedorId)) {
        const fornecedor = supplierMap.get(fornecedorId) || (fornecedorId === semFornecedorId ? {
          id: null,
          nome: 'Sem Fornecedor Padrão',
          telefone: ''
        } : {
          id: fornecedorId,
          nome: 'Fornecedor Não Identificado',
          telefone: ''
        });

        grupos.set(fornecedorId, {
          fornecedor,
          itens: []
        });
      }

      grupos.get(fornecedorId).itens.push({
        id: item.id,
        nome: item.nome,
        unidade: item.unidade_medida || item.unidade || 'un',
        saldoAtual: atual,
        estoqueMinimo: minimo,
        cmd,
        autonomiaDias,
        quantidadeSugerida: sugerida
      });
    }
  });

  // Ordena grupos (fornecedores com nome primeiro, sem fornecedor por último)
  return Array.from(grupos.values()).sort((a, b) => {
    if (!a.fornecedor.id) return 1;
    if (!b.fornecedor.id) return -1;
    return a.fornecedor.nome.localeCompare(b.fornecedor.nome);
  });
}

/**
 * Formata o texto de mensagem do WhatsApp para envio do pedido ao fornecedor.
 */
export function formatSupplierWhatsAppOrder(supplierName, items = [], options = {}) {
  const header = `☕ *Cafeteria do Teatro Univates — Pedido de Reposição*\n\nOlá, ${supplierName || 'Fornecedor'}!\nPrecisamos repor os seguintes itens para a nossa cafeteria:\n\n`;
  
  const lines = items.map(it => {
    const autonomiaStr = (it.autonomiaDias !== undefined && it.autonomiaDias !== null)
      ? `, autonomia: ${it.autonomiaDias}d`
      : '';
    return `• *${it.quantidadeSugerida} ${it.unidade}* — ${it.nome} _(estoque atual: ${it.saldoAtual}${autonomiaStr})_`;
  }).join('\n');
  
  const avisoEspetaculo = options.modoEspetaculo
    ? `\n\n🎭 *Nota:* Quantidades com reforço de demanda para semana de espetáculo (+30%).`
    : '';

  const footer = `\n\nPor favor, confirme os itens e a previsão de entrega.\nMuito obrigado!`;

  return `${header}${lines}${avisoEspetaculo}${footer}`;
}

/**
 * Gera URL do WhatsApp com a mensagem pronta.
 */
export function getWhatsAppShareUrl(phone, text) {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Prepara o payload para criação da despesa em contas a pagar a partir de uma entrada de estoque.
 */
export function buildStockPayableExpensePayload({
  itemNome,
  quantidade,
  unidade,
  custoTotal,
  fornecedorId = null,
  vencimento = null,
  pagoHoje = false,
  categoriaId = null,
  estoqueMovimentoId = null
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const dataVencimento = vencimento || hoje;

  const desc = `Entrada Estoque: ${quantidade} ${unidade} - ${itemNome}`;

  return {
    descricao: desc,
    fornecedor_id: fornecedorId || null,
    categoria_id: categoriaId || null,
    valor: Number(Number(custoTotal).toFixed(2)),
    vencimento: dataVencimento,
    pago_em: pagoHoje ? hoje : null,
    valor_pago: pagoHoje ? Number(Number(custoTotal).toFixed(2)) : null,
    forma_pagamento: pagoHoje ? 'pix' : null,
    origem: 'estoque',
    estoque_movimento_id: estoqueMovimentoId || null,
    observacoes: `Gerado automaticamente via Entrada de Estoque em ${new Date().toLocaleDateString('pt-BR')}`
  };
}

export function calcularPedidoCompra(itens = []) {
  let total = 0;
  for (const item of itens) {
    const qtd = Number(item.quantidade) || 0;
    const custo = Number(item.custo_unitario) || 0;
    total += qtd * custo;
  }
  return {
    total: Math.round(total * 100) / 100,
    itens
  };
}

if (typeof window !== 'undefined') {
  window.cafeteriaStockPurchase = {
    calcularConsumoMedioDiario,
    calcularAutonomiaDias,
    calculateSuggestedPurchaseQuantity,
    calcularSugestaoCompraInteligente,
    calculateUnitPrice,
    buildShoppingListBySupplier,
    formatSupplierWhatsAppOrder,
    getWhatsAppShareUrl,
    buildStockPayableExpensePayload,
    calcularPedidoCompra
  };
}
