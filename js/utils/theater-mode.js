/**
 * CAF-000062 — Modo Dia de Espetáculo e Reserva Antecipada para o Intervalo
 * Utilitário compartilhado para Cardápio, Totem, Cozinha KDS e PDV
 */

export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return (h * 60) + m;
}

export function isTheaterModeActive(config, referenceDate = new Date()) {
  if (!config || typeof config !== 'object') return false;

  const ativo = config.ativo === true || config.espetaculo_ativo === true || config.espetaculo_ativo === 'true';
  if (!ativo) return false;

  const nome = (config.nome || config.espetaculo_nome || '').trim();
  if (!nome) return false;

  const horarioStr = (config.horario_intervalo || config.espetaculo_horario_intervalo || '21:00').trim();
  const intervalMins = parseTimeToMinutes(horarioStr);
  if (intervalMins === null) return false;

  // Verificação de data
  const dataConfig = (config.data || config.espetaculo_data || '').trim();
  const refYear = referenceDate.getFullYear();
  const refMonth = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const refDay = String(referenceDate.getDate()).padStart(2, '0');
  const todayStr = `${refYear}-${refMonth}-${refDay}`;

  if (dataConfig && dataConfig !== todayStr) {
    // Se a data configurada for no passado (ex: ontem), desativa
    if (dataConfig < todayStr) return false;
  }

  // Verificação de horário: desativa se passou mais de 2 horas (120 min) após o intervalo
  const currentMins = (referenceDate.getHours() * 60) + referenceDate.getMinutes();
  if (dataConfig === todayStr || !dataConfig) {
    if (currentMins > intervalMins + 120) {
      return false;
    }
  }

  return true;
}

export function getTheaterIntervalInfo(config, referenceDate = new Date()) {
  const active = isTheaterModeActive(config, referenceDate);
  const nome = (config?.nome || config?.espetaculo_nome || 'Espetáculo').trim();
  const horario = (config?.horario_intervalo || config?.espetaculo_horario_intervalo || '21:00').trim();

  return {
    active,
    nome,
    horario,
    badgeText: `🎭 INTERVALO ${horario}`,
    bannerHtml: active
      ? `🎭 <strong>Hoje no Teatro:</strong> ${window.escapeHtml ? window.escapeHtml(nome) : nome}! Garanta seu lanche para o intervalo das <strong>${horario}</strong> sem fila.`
      : ''
  };
}

export function formatIntervalBadge(pedido) {
  if (!pedido) return '';
  const isIntervalo = pedido.is_intervalo === true ||
    (pedido.observacoes && String(pedido.observacoes).toLowerCase().includes('intervalo')) ||
    (pedido.modo_retirada && String(pedido.modo_retirada).toLowerCase().includes('intervalo'));

  if (!isIntervalo) return '';

  const horario = pedido.horario_retirada || '21:00';
  return `<span class="badge-intervalo-teatro" style="background:#7c3aed; color:#fff; font-weight:800; font-size:11px; padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; margin-left:6px;">🎭 INTERVALO ${horario}</span>`;
}

if (typeof window !== 'undefined') {
  window.theaterMode = {
    parseTimeToMinutes,
    isTheaterModeActive,
    getTheaterIntervalInfo,
    formatIntervalBadge
  };
}
