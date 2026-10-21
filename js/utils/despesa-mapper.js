/**
 * CAF-000078 — Mapeador de Contrato Front ↔ Banco para Despesas (Contas a Pagar)
 * Centraliza a tradução de formulários para linhas do banco e de linhas para a view.
 */

export function getHojeYMD() {
  const agora = new Date();
  const spOffset = -3 * 60; // America/Sao_Paulo (UTC-3)
  const localTime = new Date(agora.getTime() + (agora.getTimezoneOffset() + spOffset) * 60000);
  return localTime.toISOString().slice(0, 10);
}

export function deriveDespesaStatus(despesa, hojeYMD = null) {
  if (!despesa) return 'aberto';
  const hoje = hojeYMD || getHojeYMD();
  const pagoEm = despesa.pago_em || despesa.data_pagamento;

  if (pagoEm) {
    return 'pago';
  }

  const vencimento = despesa.vencimento;
  if (vencimento && vencimento < hoje) {
    return 'vencida';
  }

  return 'aberto';
}

export function normalizeDespesaFromDB(d, hojeYMD = null) {
  if (!d) return null;
  const hoje = hojeYMD || getHojeYMD();
  const valor = Number(d.valor !== undefined && d.valor !== null ? d.valor : (d.valor_total || 0));
  const pagoEm = d.pago_em || d.data_pagamento || null;
  const valorPago = d.valor_pago !== null && d.valor_pago !== undefined ? Number(d.valor_pago) : null;
  const status = deriveDespesaStatus(d, hoje);

  return {
    ...d,
    id: d.id,
    descricao: d.descricao || '',
    fornecedor_id: d.fornecedor_id || null,
    categoria_id: d.categoria_id ? Number(d.categoria_id) : null,
    valor,
    valor_total: valor, // compatibilidade
    vencimento: d.vencimento,
    pago_em: pagoEm,
    data_pagamento: pagoEm, // compatibilidade
    valor_pago: valorPago,
    forma_pagamento: d.forma_pagamento || null,
    recorrencia: d.recorrencia === 'mensal' ? 'mensal' : 'nenhuma',
    origem: d.origem || 'manual',
    observacoes: d.observacoes || '',
    documento: d.documento || d.documento_numero || '',
    anexo_url: d.anexo_url || null,
    status
  };
}

export function buildDespesaPayload(formValues) {
  if (!formValues) throw new Error('Dados da despesa não informados');

  const descricao = (formValues.descricao || '').trim();
  if (!descricao) {
    throw new Error('Descrição da despesa é obrigatória');
  }

  const valorRaw = formValues.valor !== undefined && formValues.valor !== null ? formValues.valor : formValues.valor_total;
  const valor = parseFloat(valorRaw);
  if (isNaN(valor) || valor <= 0) {
    throw new Error('Valor da despesa deve ser um número positivo');
  }

  const vencimento = formValues.vencimento;
  if (!vencimento) {
    throw new Error('Data de vencimento é obrigatória');
  }

  const recorrencia = formValues.recorrencia === 'mensal' ? 'mensal' : 'nenhuma';
  const jaPaga = Boolean(formValues.jaPaga || formValues.pago_em || formValues.data_pagamento || formValues.status === 'pago');

  let pago_em = null;
  let valor_pago = null;
  let forma_pagamento = formValues.forma_pagamento || null;

  if (jaPaga) {
    pago_em = formValues.pago_em || formValues.data_pagamento || getHojeYMD();
    const vpRaw = formValues.valor_pago !== undefined && formValues.valor_pago !== null ? formValues.valor_pago : valor;
    valor_pago = parseFloat(vpRaw);
    if (isNaN(valor_pago) || valor_pago <= 0) {
      valor_pago = valor;
    }
    if (!forma_pagamento) {
      forma_pagamento = 'pix';
    }
  }

  const documento = formValues.documento || formValues.documento_numero || null;
  const observacoes = formValues.observacoes ? String(formValues.observacoes).trim() : null;

  const payload = {
    descricao,
    categoria_id: Number(formValues.categoria_id),
    fornecedor_id: formValues.fornecedor_id || null,
    valor,
    vencimento,
    pago_em,
    valor_pago,
    forma_pagamento,
    recorrencia,
    origem: formValues.origem || 'manual',
    observacoes,
    documento,
    anexo_url: formValues.anexo_url || null
  };

  if (formValues.id) {
    payload.id = formValues.id;
  }

  return payload;
}

export const mapearPayloadDespesaParaBanco = buildDespesaPayload;

if (typeof window !== 'undefined') {
  window.cafeteriaDespesaMapper = {
    getHojeYMD,
    deriveDespesaStatus,
    normalizeDespesaFromDB,
    buildDespesaPayload,
    mapearPayloadDespesaParaBanco
  };
}
