/**
 * Utilitário de Divisão Igualitária de Conta (CAF-000073)
 * Divide o valor total entre N pessoas em centavos inteiros,
 * garantindo que a soma das partes seja 100% exata (sem erros de arredondamento em float).
 */

export function dividirConta(total, numPessoas) {
  const tot = Math.max(0, Number(total) || 0);
  const n = Math.max(1, parseInt(numPessoas, 10) || 1);

  if (tot === 0) {
    return Array(n).fill(0.00);
  }

  const totalCentavos = Math.round(tot * 100);
  const baseCentavos = Math.floor(totalCentavos / n);
  const sobraCentavos = totalCentavos % n;

  const partes = [];
  for (let i = 0; i < n; i++) {
    // As primeiras `sobraCentavos` partes recebem 1 centavo extra
    const centavos = baseCentavos + (i < sobraCentavos ? 1 : 0);
    partes.push(centavos / 100);
  }

  return partes;
}

if (typeof window !== 'undefined') {
  window.cafeteriaDivisaoConta = {
    dividirConta
  };
}
