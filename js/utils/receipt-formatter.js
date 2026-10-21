/**
 * Receipt Formatter & Digital Sharing Utility (CAF-000066)
 * Generates formatted text receipts for WhatsApp, native Web Share, and clipboard.
 */

export function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  return digits;
}

export function formatCurrency(val) {
  const num = typeof val === 'number' ? val : parseFloat(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDigitalReceipt(options = {}) {
  const cafeteriaNome = options.cafeteriaNome || options.cafeteria_nome || 'Cafeteria do Teatro';
  const local = options.local !== undefined ? options.local : 'Teatro Univates · Lajeado, RS';
  const mesaCodigo = options.mesaCodigo || options.mesa_codigo || null;
  const numeroPedido = options.numeroPedido || options.numero_pedido || null;
  const clienteNome = options.clienteNome || options.cliente_nome || null;
  const clienteTelefone = options.clienteTelefone || options.cliente_telefone || null;
  const itens = options.itens || [];
  const subtotal = options.subtotal || 0;
  const desconto = options.desconto || 0;
  const taxaServico = options.taxaServico || options.taxa_servico || 0;
  const total = options.total || 0;
  const divisaoPessoas = options.divisaoPessoas || options.divisao_pessoas || 1;
  const formasPagamento = options.formasPagamento || options.formas_pagamento || [];
  const chavePix = options.chavePix || options.chave_pix || null;
  const pedidoId = options.pedidoId || options.pedido_id || options.id || null;
  const dataHora = options.dataHora || options.data_hora || null;
  const now = dataHora ? new Date(dataHora) : new Date();
  const dataFormatada = now.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const lines = [];
  lines.push(`☕ *${cafeteriaNome.toUpperCase()}*`);
  if (local) lines.push(`📍 ${local}`);
  lines.push('────────────────────────────');

  const ref = mesaCodigo && numeroPedido
    ? `Mesa ${mesaCodigo} (Pedido #${numeroPedido})`
    : (mesaCodigo ? `Mesa ${mesaCodigo}` : (numeroPedido ? `Pedido #${numeroPedido}` : 'Consumo'));
  lines.push(`*Identificação:* ${ref}`);
  if (clienteNome) lines.push(`*Cliente:* ${clienteNome}`);
  lines.push(`*Data/Hora:* ${dataFormatada}`);
  lines.push('');

  lines.push('*ITENS:*');
  if (Array.isArray(itens) && itens.length > 0) {
    itens.forEach(item => {
      const qtd = item.quantidade || 1;
      const nome = item.nome || item.nome_produto || 'Item';
      const precoTot = (item.preco_unitario || item.preco || 0) * qtd;
      lines.push(`• ${qtd}x ${nome} — ${formatCurrency(precoTot)}`);
      if (item.observacoes) {
        lines.push(`   _Obs: ${item.observacoes}_`);
      }
    });
  } else {
    lines.push('• (Nenhum item listado)');
  }

  lines.push('');
  lines.push('────────────────────────────');
  lines.push(`*Subtotal:* ${formatCurrency(subtotal || total)}`);
  if (taxaServico > 0) {
    lines.push(`*Taxa de Serviço:* ${formatCurrency(taxaServico)}`);
  }
  if (desconto > 0) {
    lines.push(`*Desconto:* -${formatCurrency(desconto)}`);
  }
  lines.push(`*TOTAL:* *${formatCurrency(total)}*`);

  const pessoas = parseInt(divisaoPessoas, 10) || 1;
  if (pessoas > 1 && total > 0) {
    const porPessoa = total / pessoas;
    lines.push(`*Divisão (${pessoas} pessoas):* ${formatCurrency(porPessoa)} por pessoa`);
  }

  if (Array.isArray(formasPagamento) && formasPagamento.length > 0) {
    const fStr = formasPagamento.map(f => {
      if (typeof f === 'string') return f.toUpperCase();
      return `${f.tipo?.toUpperCase() || 'PAGTO'}: ${formatCurrency(f.valor)}`;
    }).join(', ');
    lines.push(`*Forma de Pagamento:* ${fStr}`);
  } else if (chavePix) {
    lines.push(`*Chave Pix:* \`${chavePix}\``);
  }

  const host = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://cafeteriadoteatro.com.br';
  const urlAvaliar = `${host}/avaliar.html${pedidoId ? `?pedido=${pedidoId}` : ''}`;
  lines.push('');
  lines.push('⭐ *Avalie sua experiência:*');
  lines.push(urlAvaliar);
  lines.push('Obrigado pela preferência e bom espetáculo! 🎭');

  return lines.join('\n');
}

export const formatarComprovanteTexto = formatDigitalReceipt;

/**
 * Opens WhatsApp with the formatted receipt.
 */
export function openWhatsAppReceipt(receiptText, clienteTelefone = '') {
  const phone = normalizePhone(clienteTelefone);
  const encoded = encodeURIComponent(receiptText);
  const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
  return url;
}

/**
 * Shares via navigator.share or copies to clipboard with toast notification.
 */
export async function shareOrCopyReceipt(receiptText, { title = 'Comprovante Cafeteria do Teatro', onCopySuccess = null } = {}) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title,
        text: receiptText
      });
      return { shared: true, copied: false };
    } catch (err) {
      if (err.name === 'AbortError') return { cancelled: true };
    }
  }

  // Fallback to clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(receiptText);
    if (typeof onCopySuccess === 'function') {
      onCopySuccess('Comprovante copiado para a área de transferência!');
    }
    return { shared: false, copied: true };
  }

  return { shared: false, copied: false };
}

/**
 * Formata comprovante de depósito ou recebimento de conta do cliente (CAF-000083)
 */
export function formatComprovanteContaCliente({
  cafeteriaNome = 'Cafeteria do Teatro',
  clienteNome,
  clienteTelefone,
  tipo = 'deposito',
  formaPagamento = 'pix',
  saldoAnterior = 0,
  valor = 0,
  saldoNovo = 0,
  dataHora = null
} = {}) {
  const dataFormatada = dataHora
    ? (typeof window !== 'undefined' && window.datasSP?.formatarDataHoraSP ? window.datasSP.formatarDataHoraSP(dataHora) : new Date(dataHora).toLocaleString('pt-BR'))
    : (typeof window !== 'undefined' && window.datasSP?.formatarDataHoraSP ? window.datasSP.formatarDataHoraSP(new Date()) : new Date().toLocaleString('pt-BR'));

  const tipoTitulo = tipo === 'pagamento_fatura' ? 'PAGAMENTO DE CONTA' : 'CRÉDITO EM CONTA';
  const lines = [];
  lines.push(`☕ *${cafeteriaNome.toUpperCase()}*`);
  lines.push(`📋 *COMPROVANTE DE ${tipoTitulo}*`);
  lines.push('────────────────────────────');
  if (clienteNome) lines.push(`*Cliente:* ${clienteNome}`);
  lines.push(`*Data/Hora:* ${dataFormatada}`);
  lines.push(`*Forma:* ${String(formaPagamento).toUpperCase()}`);
  lines.push('────────────────────────────');
  lines.push(`*Saldo Anterior:* ${formatCurrency(saldoAnterior)}`);
  lines.push(`*Valor Lançado:* ${formatCurrency(valor)}`);
  lines.push(`*Novo Saldo:* ${formatCurrency(saldoNovo)}`);
  lines.push('────────────────────────────');
  lines.push('Agradecemos a sua preferência!');

  return lines.join('\n');
}

// Global browser attachment
if (typeof window !== 'undefined') {
  window.ReceiptFormatter = {
    normalizePhone,
    formatCurrency,
    formatDigitalReceipt,
    formatComprovanteContaCliente,
    openWhatsAppReceipt,
    shareOrCopyReceipt
  };
}
