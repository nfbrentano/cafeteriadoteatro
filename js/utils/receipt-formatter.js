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

export function formatDigitalReceipt({
  cafeteriaNome = 'Cafeteria do Teatro',
  local = 'Teatro Univates · Lajeado, RS',
  mesaCodigo = null,
  numeroPedido = null,
  clienteNome = null,
  clienteTelefone = null,
  itens = [],
  subtotal = 0,
  desconto = 0,
  taxaServico = 0,
  total = 0,
  divisaoPessoas = 1,
  formasPagamento = [],
  chavePix = null,
  pedidoId = null,
  dataHora = null
} = {}) {
  const now = dataHora ? new Date(dataHora) : new Date();
  const dataFormatada = now.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const lines = [];
  lines.push(`☕ *${cafeteriaNome.toUpperCase()}*`);
  if (local) lines.push(`📍 ${local}`);
  lines.push('────────────────────────────');

  const ref = mesaCodigo ? `Mesa ${mesaCodigo}` : (numeroPedido ? `Pedido #${numeroPedido}` : 'Consumo');
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

// Global browser attachment
if (typeof window !== 'undefined') {
  window.ReceiptFormatter = {
    normalizePhone,
    formatCurrency,
    formatDigitalReceipt,
    openWhatsAppReceipt,
    shareOrCopyReceipt
  };
}
