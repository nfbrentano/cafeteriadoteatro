/**
 * CAF-000068: Lista de Compras por Fornecedor e Entrada de Estoque Integrada ao Contas a Pagar
 */

/**
 * Calcula a quantidade sugerida de reposição para itens com estoque baixo.
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
 * Calcula o custo unitário da compra com base no custo total e quantidade.
 */
export function calculateUnitPrice(custoTotal, quantidade) {
  const total = Number(custoTotal) || 0;
  const qtd = Number(quantidade) || 0;
  if (qtd <= 0 || total <= 0) return 0;
  return Number((total / qtd).toFixed(2));
}

/**
 * Monta a lista de compras/reposição agrupada por fornecedor.
 * @param {Array} items Lista de itens de estoque
 * @param {Array} suppliers Lista de fornecedores cadastrados
 */
export function buildShoppingListBySupplier(items = [], suppliers = []) {
  const supplierMap = new Map();
  (suppliers || []).forEach(s => {
    supplierMap.set(String(s.id), s);
  });

  const semFornecedorId = '__sem_fornecedor__';
  const grupos = new Map();

  items.forEach(item => {
    const atual = Number(item.saldo_atual !== undefined ? item.saldo_atual : (item.quantidade !== undefined ? item.quantidade : 0));
    const minimo = Number(item.estoque_minimo || 0);

    // Considera apenas itens em ponto de pedido (<= estoque_minimo)
    if (atual <= minimo) {
      const sugerida = calculateSuggestedPurchaseQuantity(atual, minimo);
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
export function formatSupplierWhatsAppOrder(supplierName, items = []) {
  const header = `☕ *Cafeteria do Teatro Univates — Pedido de Reposição*\n\nOlá, ${supplierName || 'Fornecedor'}!\nPrecisamos repor os seguintes itens para a nossa cafeteria:\n\n`;
  
  const lines = items.map(it => `• *${it.quantidadeSugerida} ${it.unidade}* — ${it.nome} _(estoque atual: ${it.saldoAtual})_`).join('\n');
  
  const footer = `\n\nPor favor, informe a confirmação dos itens e a previsão de entrega.\nMuito obrigado!`;

  return `${header}${lines}${footer}`;
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

if (typeof window !== 'undefined') {
  window.cafeteriaStockPurchase = {
    calculateSuggestedPurchaseQuantity,
    calculateUnitPrice,
    buildShoppingListBySupplier,
    formatSupplierWhatsAppOrder,
    getWhatsAppShareUrl,
    buildStockPayableExpensePayload
  };
}
