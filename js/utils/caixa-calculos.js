/**
 * js/utils/caixa-calculos.js
 * Utilitários para cálculos de caixa, taxas por forma de pagamento, conferência cega e sangria/suprimento (CAF-000089).
 */

/**
 * Normaliza uma forma de pagamento para chave de taxa.
 * @param {string} forma
 * @returns {'dinheiro'|'debito'|'credito'|'pix'|'outro'}
 */
export function normalizarFormaPagamento(forma) {
  const f = String(forma || '').toLowerCase().trim();
  if (f.includes('dinheiro')) return 'dinheiro';
  if (f.includes('débito') || f.includes('debito')) return 'debito';
  if (f.includes('crédito') || f.includes('credito')) return 'credito';
  if (f.includes('pix')) return 'pix';
  return 'outro';
}

/**
 * Calcula totais por forma de pagamento aplicando taxas percentuais e deduzindo o valor líquido.
 * @param {Array<{forma_pagamento: string, valor: number}>} pagamentos
 * @param {Record<string, number>} [taxasConfig] Ex: { debito: 1.99, credito: 3.49, pix: 0, dinheiro: 0 }
 * @returns {{
 *   bruto: number,
 *   taxas: number,
 *   liquido: number,
 *   porForma: Record<string, { bruto: number, taxa: number, liquido: number, taxaPercentual: number, quantidade: number }>
 * }}
 */
export function calcularTotaisCaixa(pagamentos = [], taxasConfig = {}) {
  const defaultTaxas = {
    dinheiro: 0,
    debito: 1.99,
    credito: 3.49,
    pix: 0,
    outro: 0,
    ...taxasConfig
  };

  const porForma = {
    dinheiro: { bruto: 0, taxa: 0, liquido: 0, taxaPercentual: Number(defaultTaxas.dinheiro) || 0, quantidade: 0 },
    debito: { bruto: 0, taxa: 0, liquido: 0, taxaPercentual: Number(defaultTaxas.debito) || 0, quantidade: 0 },
    credito: { bruto: 0, taxa: 0, liquido: 0, taxaPercentual: Number(defaultTaxas.credito) || 0, quantidade: 0 },
    pix: { bruto: 0, taxa: 0, liquido: 0, taxaPercentual: Number(defaultTaxas.pix) || 0, quantidade: 0 },
    outro: { bruto: 0, taxa: 0, liquido: 0, taxaPercentual: Number(defaultTaxas.outro) || 0, quantidade: 0 }
  };

  let totalBrutoCents = 0;
  let totalTaxasCents = 0;

  for (const pag of pagamentos) {
    const valor = Number(pag.valor) || 0;
    if (valor <= 0) continue;

    const valorCents = Math.round(valor * 100);
    const chave = normalizarFormaPagamento(pag.forma_pagamento);
    const sub = porForma[chave] || porForma.outro;

    const taxaPct = sub.taxaPercentual;
    const taxaCents = Math.round((valorCents * taxaPct) / 100);
    const liquidoCents = valorCents - taxaCents;

    sub.bruto += valorCents;
    sub.taxa += taxaCents;
    sub.liquido += liquidoCents;
    sub.quantidade += 1;

    totalBrutoCents += valorCents;
    totalTaxasCents += taxaCents;
  }

  // Converter de centavos para reais com 2 casas
  const resPorForma = {};
  for (const [k, v] of Object.entries(porForma)) {
    resPorForma[k] = {
      bruto: v.bruto / 100,
      taxa: v.taxa / 100,
      liquido: v.liquido / 100,
      taxaPercentual: v.taxaPercentual,
      quantidade: v.quantidade
    };
  }

  return {
    bruto: totalBrutoCents / 100,
    taxas: totalTaxasCents / 100,
    liquido: (totalBrutoCents - totalTaxasCents) / 100,
    porForma: resPorForma
  };
}

/**
 * Calcula a diferença entre o saldo físico apurado (contagem cega) e o saldo esperado pelo sistema.
 * @param {number} saldoInicial
 * @param {number} vendasDinheiro
 * @param {number} totalSuprimentos
 * @param {number} totalSangrias
 * @param {number} contagemCegaDinheiro
 * @returns {{
 *   saldoEsperado: number,
 *   contagemFisica: number,
 *   diferenca: number,
 *   status: 'exato'|'sobra'|'falta'
 * }}
 */
export function calcularDiferencaCaixaCego(saldoInicial, vendasDinheiro, totalSuprimentos, totalSangrias, contagemCegaDinheiro) {
  const siCents = Math.round((Number(saldoInicial) || 0) * 100);
  const vdCents = Math.round((Number(vendasDinheiro) || 0) * 100);
  const supCents = Math.round((Number(totalSuprimentos) || 0) * 100);
  const sangCents = Math.round((Number(totalSangrias) || 0) * 100);
  const cfCents = Math.round((Number(contagemCegaDinheiro) || 0) * 100);

  const saldoEsperadoCents = siCents + vdCents + supCents - sangCents;
  const diferencaCents = cfCents - saldoEsperadoCents;

  let status = 'exato';
  if (diferencaCents > 0) status = 'sobra';
  else if (diferencaCents < 0) status = 'falta';

  return {
    saldoEsperado: saldoEsperadoCents / 100,
    contagemFisica: cfCents / 100,
    diferenca: diferencaCents / 100,
    status
  };
}
