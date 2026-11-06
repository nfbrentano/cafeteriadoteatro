/**
 * js/utils/dre-calculos.js
 * Utilitários puros para DRE Gerencial, Projeção de Recebíveis e Metas Operacionais (CAF-000113)
 */

/**
 * Formata um valor numérico para a moeda brasileira (R$ 0,00)
 */
export function formatarMoeda(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata uma data YYYY-MM-DD para DD/MM/YYYY
 */
export function formatarData(dtStr) {
  if (!dtStr) return '--';
  const partes = String(dtStr).substring(0, 10).split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dtStr;
}

/**
 * Calcula a estrutura do DRE Gerencial com Análise Vertical (% sobre Receita Bruta)
 * @param {Object} params
 * @param {number} params.faturamentoBruto
 * @param {number} params.descontos
 * @param {number} params.taxasPagamento
 * @param {number} params.cmvItens
 * @param {number} params.perdasEstoque
 * @param {Array<{nome: string, tipo: 'fixa'|'variavel', total: number}>} params.despesas
 * @param {string} [params.regime='caixa']
 */
export function calcularDRE({
  faturamentoBruto = 0,
  descontos = 0,
  taxasPagamento = 0,
  cmvItens = 0,
  perdasEstoque = 0,
  despesas = [],
  regime = 'caixa'
} = {}) {
  const bruto = Math.max(0, Number(faturamentoBruto) || 0);
  const desc = Math.max(0, Number(descontos) || 0);
  const taxas = Math.max(0, Number(taxasPagamento) || 0);
  const cmvProd = Math.max(0, Number(cmvItens) || 0);
  const cmvPerdas = Math.max(0, Number(perdasEstoque) || 0);
  const cmvTotal = Math.round((cmvProd + cmvPerdas) * 100) / 100;

  // Receita Líquida
  const receitaLiquida = Math.round((bruto - desc - taxas) * 100) / 100;

  // Margem de Contribuição
  const margemContribuicao = Math.round((receitaLiquida - cmvTotal) * 100) / 100;

  // Despesas Operacionais (separadas em fixas e variáveis)
  let totalFixas = 0;
  let totalVariaveis = 0;
  const categoriasProcessadas = [];

  for (const d of despesas) {
    const nome = d.categoria || d.nome || 'Outros';
    const tipo = (d.tipo === 'variavel') ? 'variavel' : 'fixa';
    const total = Math.round((Number(d.total || d.valor || d.valor_pago) || 0) * 100) / 100;

    // Ignora taxas de pagamento para evitar dupla contagem com a linha de taxas
    const nomeLower = nome.toLowerCase();
    if (nomeLower.includes('taxa') || nomeLower.includes('maquininha') || nomeLower.includes('meios de pagamento')) {
      continue;
    }

    if (tipo === 'variavel') {
      totalVariaveis += total;
    } else {
      totalFixas += total;
    }

    const pctCat = bruto > 0 ? Math.round((total / bruto) * 1000) / 10 : 0;
    categoriasProcessadas.push({
      nome,
      tipo,
      total,
      percentual: pctCat
    });
  }

  totalFixas = Math.round(totalFixas * 100) / 100;
  totalVariaveis = Math.round(totalVariaveis * 100) / 100;
  const totalDespesas = Math.round((totalFixas + totalVariaveis) * 100) / 100;

  // Resultado Operacional Líquido
  const resultadoLiquido = Math.round((margemContribuicao - totalDespesas) * 100) / 100;

  // Percentuais Verticais
  const calcPct = (val) => (bruto > 0 ? Math.round((val / bruto) * 1000) / 10 : 0);

  return {
    regime,
    faturamentoBruto: bruto,
    faturamentoBrutoPct: 100.0,
    descontos: desc,
    descontosPct: calcPct(desc),
    taxasPagamento: taxas,
    taxasPagamentoPct: calcPct(taxas),
    receitaLiquida,
    receitaLiquidaPct: calcPct(receitaLiquida),
    cmvItens: cmvProd,
    cmvPerdas: cmvPerdas,
    cmvTotal,
    cmvTotalPct: calcPct(cmvTotal),
    margemContribuicao,
    margemContribuicaoPct: calcPct(margemContribuicao),
    despesasFixas: totalFixas,
    despesasFixasPct: calcPct(totalFixas),
    despesasVariaveis: totalVariaveis,
    despesasVariaveisPct: calcPct(totalVariaveis),
    despesasTotal: totalDespesas,
    despesasTotalPct: calcPct(totalDespesas),
    despesasCategorias: categoriasProcessadas,
    resultadoLiquido,
    resultadoLiquidoPct: calcPct(resultadoLiquido)
  };
}

/**
 * Projeta recebíveis a partir de pagamentos realizados e prazos de liquidação
 * @param {Array<{data_venda: string, forma: string, valor: number, taxa_valor?: number, valor_liquido?: number}>} pagamentos
 * @param {Object} [prazosConfig] Mapeamento de forma -> dias de compensação
 * @param {string} [dataBaseStr] Data base YYYY-MM-DD (padrão: hoje)
 */
export function projetarRecebiveis(pagamentos = [], prazosConfig = {}, dataBaseStr = null) {
  const prazosPadrao = {
    pix: 0,
    dinheiro: 0,
    cartao_debito: 1,
    debito: 1,
    cartao_credito: 30,
    credito: 30,
    outros: 0,
    conta_cliente: 0,
    ...prazosConfig
  };

  const hoje = dataBaseStr ? new Date(`${dataBaseStr}T00:00:00`) : new Date();
  const hojeYMD = dataBaseStr || hoje.toISOString().substring(0, 10);
  const dataHojeMs = new Date(`${hojeYMD}T00:00:00`).getTime();

  let totalHoje = 0;
  let total7d = 0;
  let total30d = 0;
  const lista = [];

  for (const p of pagamentos) {
    const formaNorm = (p.forma || 'outros').toLowerCase();
    const prazoDias = prazosPadrao[formaNorm] ?? 0;
    const dtVendaStr = (p.data_venda || hojeYMD).substring(0, 10);
    const dtVenda = new Date(`${dtVendaStr}T00:00:00`);

    const dtPrevista = new Date(dtVenda.getTime() + prazoDias * 24 * 60 * 60 * 1000);
    const dtPrevistaStr = dtPrevista.toISOString().substring(0, 10);

    const valorBruto = Math.round((Number(p.valor || p.valor_bruto) || 0) * 100) / 100;
    const taxaValor = Math.round((Number(p.taxa_valor) || 0) * 100) / 100;
    const valorLiquido = Math.round((Number(p.valor_liquido ?? (valorBruto - taxaValor))) * 100) / 100;

    const diffDias = Math.round((dtPrevista.getTime() - dataHojeMs) / (24 * 60 * 60 * 1000));

    if (diffDias === 0) {
      totalHoje += valorLiquido;
    }
    if (diffDias >= 0 && diffDias <= 7) {
      total7d += valorLiquido;
    }
    if (diffDias >= 0 && diffDias <= 30) {
      total30d += valorLiquido;
    }

    lista.push({
      dataVenda: dtVendaStr,
      dataPrevista: dtPrevistaStr,
      forma: formaNorm,
      prazoDias,
      valorBruto,
      taxaValor,
      valorLiquido
    });
  }

  lista.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));

  return {
    dataBase: hojeYMD,
    totalHoje: Math.round(totalHoje * 100) / 100,
    total7dias: Math.round(total7d * 100) / 100,
    total30dias: Math.round(total30d * 100) / 100,
    recebiveis: lista
  };
}

/**
 * Calcula o atingimento da meta diária de vendas (normal ou espetáculo)
 */
export function calcularProgressoMeta({
  vendasHoje = 0,
  metaNormal = 1500,
  metaEspetaculo = 3000,
  isEspetaculo = false
} = {}) {
  const meta = isEspetaculo ? Number(metaEspetaculo) : Number(metaNormal);
  const metaValida = meta > 0 ? meta : 1500;
  const vendas = Math.max(0, Number(vendasHoje) || 0);

  const percentual = Math.round((vendas / metaValida) * 1000) / 10;
  const falta = Math.max(0, Math.round((metaValida - vendas) * 100) / 100);

  return {
    isEspetaculo,
    metaValor: metaValida,
    vendasHoje: vendas,
    percentualAtingido: percentual,
    faltaParaMeta: falta
  };
}

/**
 * Gera string CSV com UTF-8 BOM para exportação do DRE Gerencial
 */
export function gerarCSVDRE(dre) {
  const linhas = [
    ['Estrutura do DRE Gerencial', 'Valor (R$)', 'AV (%)'],
    ['(+) Faturamento Bruto', (dre.faturamentoBruto || 0).toFixed(2).replace('.', ','), '100,0%'],
    ['(-) Descontos Concedidos', `-${(dre.descontos || 0).toFixed(2).replace('.', ',')}`, `${(dre.descontosPct || 0).toFixed(1).replace('.', ',')}%`],
    ['(-) Taxas de Meios de Pagamento', `-${(dre.taxasPagamento || 0).toFixed(2).replace('.', ',')}`, `${(dre.taxasPagamentoPct || 0).toFixed(1).replace('.', ',')}%`],
    ['(=) Receita Operacional Líquida', (dre.receitaLiquida || 0).toFixed(2).replace('.', ','), `${(dre.receitaLiquidaPct || 0).toFixed(1).replace('.', ',')}%`],
    ['(-) CMV Total (Mercadorias + Perdas)', `-${(dre.cmvTotal || 0).toFixed(2).replace('.', ',')}`, `${(dre.cmvTotalPct || 0).toFixed(1).replace('.', ',')}%`],
    ['   • CMV Produtos Vendidos', (dre.cmvItens || 0).toFixed(2).replace('.', ','), ''],
    ['   • Perdas de Estoque', (dre.cmvPerdas || 0).toFixed(2).replace('.', ','), ''],
    ['(=) Margem de Contribuição Bruta', (dre.margemContribuicao || 0).toFixed(2).replace('.', ','), `${(dre.margemContribuicaoPct || 0).toFixed(1).replace('.', ',')}%`],
    ['(-) Despesas Operacionais Totais', `-${(dre.despesasTotal || 0).toFixed(2).replace('.', ',')}`, `${(dre.despesasTotalPct || 0).toFixed(1).replace('.', ',')}%`],
    ['   • Despesas Fixas', `-${(dre.despesasFixas || 0).toFixed(2).replace('.', ',')}`, `${(dre.despesasFixasPct || 0).toFixed(1).replace('.', ',')}%`],
    ['   • Despesas Variáveis (sem taxas)', `-${(dre.despesasVariaveis || 0).toFixed(2).replace('.', ',')}`, `${(dre.despesasVariaveisPct || 0).toFixed(1).replace('.', ',')}%`]
  ];

  if (Array.isArray(dre.despesasCategorias) && dre.despesasCategorias.length > 0) {
    linhas.push(['--- Detalhamento por Categoria de Despesa ---', '', '']);
    dre.despesasCategorias.forEach(cat => {
      linhas.push([
        `   [${cat.tipo === 'fixa' ? 'Fixa' : 'Variável'}] ${cat.nome}`,
        `-${(cat.total || 0).toFixed(2).replace('.', ',')}`,
        `${(cat.percentual || 0).toFixed(1).replace('.', ',')}%`
      ]);
    });
  }

  linhas.push([
    '(=) Resultado Operacional Líquido',
    (dre.resultadoLiquido || 0).toFixed(2).replace('.', ','),
    `${(dre.resultadoLiquidoPct || 0).toFixed(1).replace('.', ',')}%`
  ]);

  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  return '\uFEFF' + csv;
}

export default {
  formatarMoeda,
  formatarData,
  calcularDRE,
  projetarRecebiveis,
  calcularProgressoMeta,
  gerarCSVDRE
};

