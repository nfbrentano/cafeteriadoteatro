/**
 * Utilitários de Data e Hora no fuso America/Sao_Paulo (Horário de Brasília)
 * CAF-000080 — Fuso horário consistente e corte do dia operacional
 */

export const FUSO_SP = 'America/Sao_Paulo';

/**
 * Extrai ano, mês e dia no fuso de São Paulo
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {{ ano: string, mes: string, dia: string, ymd: string }}
 */
export function getPartesDataSP(dateInput = new Date()) {
  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj.getTime())) {
    throw new Error('Data inválida fornecida para getPartesDataSP');
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_SP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(dateObj);
  const ano = parts.find(p => p.type === 'year')?.value || '1970';
  const mes = parts.find(p => p.type === 'month')?.value || '01';
  const dia = parts.find(p => p.type === 'day')?.value || '01';
  const ymd = `${ano}-${mes}-${dia}`;

  return { ano, mes, dia, ymd };
}

/**
 * Retorna a data atual (ou da data informada) em formato civil 'YYYY-MM-DD' no fuso de SP
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {string} 'YYYY-MM-DD'
 */
export function hojeSP(dateInput = new Date()) {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  return getPartesDataSP(dateInput).ymd;
}

/**
 * Retorna a string ISO (em UTC) correspondente às 00:00:00.000 no fuso de São Paulo (-03:00)
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {string} ISO string
 */
export function inicioDoDiaSP(dateInput = new Date()) {
  let ymd;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    ymd = dateInput.trim();
  } else {
    ymd = getPartesDataSP(dateInput).ymd;
  }
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}

/**
 * Retorna a string ISO (em UTC) correspondente às 23:59:59.999 no fuso de São Paulo (-03:00)
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {string} ISO string
 */
export function fimDoDiaSP(dateInput = new Date()) {
  let ymd;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    ymd = dateInput.trim();
  } else {
    ymd = getPartesDataSP(dateInput).ymd;
  }
  return new Date(`${ymd}T23:59:59.999-03:00`).toISOString();
}

/**
 * Retorna o dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado) no fuso de SP
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {number} 0 a 6
 */
export function diaSemanaSP(dateInput = new Date()) {
  const ymd = hojeSP(dateInput);
  // Meio-dia em SP para evitar qualquer problema de borda
  const dt = new Date(`${ymd}T12:00:00-03:00`);
  return dt.getDay();
}

/**
 * Formata data e hora no fuso de São Paulo
 * @param {Date|string|number} dateInput
 * @param {boolean} [incluirSegundos=true]
 * @returns {string} 'DD/MM/YYYY HH:mm:ss' ou 'DD/MM/YYYY HH:mm'
 */
export function formatarDataHoraSP(dateInput, incluirSegundos = true) {
  if (!dateInput) return '';
  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj.getTime())) return '';

  const d = formatarDataSP(dateObj);
  const h = formatarHoraSP(dateObj, incluirSegundos);
  return `${d} ${h}`;
}

/**
 * Formata apenas a data civil no fuso de São Paulo
 * @param {Date|string|number} dateInput
 * @returns {string} 'DD/MM/YYYY'
 */
export function formatarDataSP(dateInput) {
  if (!dateInput) return '';
  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_SP,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(dateObj);
}

/**
 * Formata apenas a hora no fuso de São Paulo
 * @param {Date|string|number} dateInput
 * @param {boolean} [incluirSegundos=false]
 * @returns {string} 'HH:mm' ou 'HH:mm:ss'
 */
export function formatarHoraSP(dateInput, incluirSegundos = false) {
  if (!dateInput) return '';
  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_SP,
    hour: '2-digit',
    minute: '2-digit',
    second: incluirSegundos ? '2-digit' : undefined,
    hour12: false
  }).format(dateObj);
}

// Registro global no browser se aplicável
if (typeof window !== 'undefined') {
  window.datasSP = {
    FUSO_SP,
    getPartesDataSP,
    hojeSP,
    inicioDoDiaSP,
    fimDoDiaSP,
    diaSemanaSP,
    formatarDataHoraSP,
    formatarDataSP,
    formatarHoraSP
  };
  window.getInicioDoDiaSaoPaulo = () => inicioDoDiaSP();
}
