/**
 * Order Calculator Utility (CAF-000086)
 * Pure functions for calculating item subtotals, order total with discount and service fee, and cash change.
 */

export function calculateSubtotal(items = []) {
  if (!Array.isArray(items)) return 0;
  const sub = items.reduce((acc, item) => {
    const qty = Number(item.quantidade) || 0;
    const price = Number(item.preco_unitario !== undefined ? item.preco_unitario : item.preco) || 0;
    return acc + (qty * price);
  }, 0);
  return Math.round((sub + Number.EPSILON) * 100) / 100;
}

export function calculateOrderTotal(subtotal, { desconto = 0, taxaServico = 0 } = {}) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const desc = Math.max(0, Number(desconto) || 0);
  const taxa = Math.max(0, Number(taxaServico) || 0);

  const total = Math.max(0, sub - desc + taxa);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function calculateChange(valorPago, total) {
  const pago = Number(valorPago) || 0;
  const tot = Number(total) || 0;
  const troco = Math.max(0, pago - tot);
  return Math.round((troco + Number.EPSILON) * 100) / 100;
}

if (typeof window !== 'undefined') {
  window.cafeteriaOrderCalculator = {
    calculateSubtotal,
    calculateOrderTotal,
    calculateChange
  };
}
