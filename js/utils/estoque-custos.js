/**
 * js/utils/estoque-custos.js
 * Utilitários para cálculo de custo médio ponderado, ficha técnica, margem e CMV (CAF-000089).
 */

/**
 * Calcula o novo custo médio ponderado após uma entrada de estoque.
 * Fórmula: ((qtdAtual * custoMedioAtual) + (qtdEntrada * custoEntrada)) / (qtdAtual + qtdEntrada)
 * @param {number} qtdAtual
 * @param {number} custoMedioAtual
 * @param {number} qtdEntrada
 * @param {number} custoEntrada
 * @param {number} casasDecimais Padrão: 4 casas conforme banco de dados
 * @returns {number}
 */
export function calcularCustoMedioPonderado(qtdAtual, custoMedioAtual, qtdEntrada, custoEntrada, casasDecimais = 4) {
  const qAtual = Math.max(0, Number(qtdAtual) || 0);
  const cAtual = Math.max(0, Number(custoMedioAtual) || 0);
  const qEntrada = Math.max(0, Number(qtdEntrada) || 0);
  const cEntrada = Math.max(0, Number(custoEntrada) || 0);

  const totalQtd = qAtual + qEntrada;
  if (totalQtd <= 0) return 0;

  const valorTotal = (qAtual * cAtual) + (qEntrada * cEntrada);
  const custoMedio = valorTotal / totalQtd;

  const fator = Math.pow(10, casasDecimais);
  return Math.round(custoMedio * fator) / fator;
}

/**
 * Calcula o custo total de um produto a partir de sua ficha técnica e do mapa de custos dos insumos.
 * @param {Array<{insumo_id: any, quantidade: number}>} fichaTecnica
 * @param {Record<string, number>|Map<any, number>} mapaCustosInsumos
 * @returns {number}
 */
export function calcularCustoFichaTecnica(fichaTecnica, mapaCustosInsumos) {
  if (!Array.isArray(fichaTecnica) || fichaTecnica.length === 0) return 0;

  let totalCusto = 0;
  for (const item of fichaTecnica) {
    const qtd = Number(item.quantidade) || 0;
    let custoUnit = 0;
    if (mapaCustosInsumos instanceof Map) {
      custoUnit = Number(mapaCustosInsumos.get(item.insumo_id)) || 0;
    } else if (mapaCustosInsumos && typeof mapaCustosInsumos === 'object') {
      custoUnit = Number(mapaCustosInsumos[item.insumo_id]) || 0;
    }
    totalCusto += qtd * custoUnit;
  }

  return Math.round(totalCusto * 100) / 100;
}

/**
 * Calcula a margem de lucro percentual com base no preço de venda e no custo total.
 * @param {number} precoVenda
 * @param {number} custoTotal
 * @returns {number} Percentual de margem (ex: 60 para 60%)
 */
export function calcularMargemLucro(precoVenda, custoTotal) {
  const venda = Number(precoVenda) || 0;
  const custo = Number(custoTotal) || 0;

  if (venda <= 0) return 0;
  const lucro = venda - custo;
  const margem = (lucro / venda) * 100;
  return Math.round(margem * 100) / 100;
}

/**
 * Calcula o Custo da Mercadoria Vendida (CMV).
 * CMV = Estoque Inicial + Compras - Estoque Final
 * @param {number} estoqueInicial
 * @param {number} compras
 * @param {number} estoqueFinal
 * @returns {number}
 */
export function calcularCmv(estoqueInicial, compras, estoqueFinal) {
  const ei = Number(estoqueInicial) || 0;
  const c = Number(compras) || 0;
  const ef = Number(estoqueFinal) || 0;

  return Math.round((ei + c - ef) * 100) / 100;
}
