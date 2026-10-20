import { describe, it, expect } from 'vitest';
import {
  parseTimeToMinutes,
  isTheaterModeActive,
  getTheaterIntervalInfo,
  formatIntervalBadge
} from '../js/utils/theater-mode.js';

describe('CAF-000062 — Modo Dia de Espetáculo e Reserva de Intervalo', () => {
  describe('parseTimeToMinutes', () => {
    it('converte horário HH:MM para minutos desde meia-noite', () => {
      expect(parseTimeToMinutes('21:00')).toBe(1260);
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('19:45')).toBe(1185);
    });

    it('retorna null para formatos inválidos', () => {
      expect(parseTimeToMinutes('invalido')).toBeNull();
      expect(parseTimeToMinutes('25:00')).toBeNull();
      expect(parseTimeToMinutes('')).toBeNull();
      expect(parseTimeToMinutes(null)).toBeNull();
    });
  });

  describe('isTheaterModeActive', () => {
    const today = new Date('2026-10-20T19:30:00'); // 19:30

    it('retorna true quando o espetáculo está ativo para a data de hoje e antes do intervalo', () => {
      const config = {
        espetaculo_ativo: true,
        espetaculo_nome: 'Concerto Orquestra Univates',
        espetaculo_data: '2026-10-20',
        espetaculo_horario_intervalo: '21:00'
      };

      expect(isTheaterModeActive(config, today)).toBe(true);
    });

    it('retorna false quando espetaculo_ativo é false', () => {
      const config = {
        espetaculo_ativo: false,
        espetaculo_nome: 'Stand-up Comedy',
        espetaculo_data: '2026-10-20',
        espetaculo_horario_intervalo: '21:00'
      };

      expect(isTheaterModeActive(config, today)).toBe(false);
    });

    it('retorna false quando a data configurada foi ontem (passado)', () => {
      const config = {
        espetaculo_ativo: true,
        espetaculo_nome: 'Peça de Teatro',
        espetaculo_data: '2026-10-19',
        espetaculo_horario_intervalo: '21:00'
      };

      expect(isTheaterModeActive(config, today)).toBe(false);
    });

    it('retorna false quando o horário atual ultrapassa 2 horas após o intervalo (23:15 vs 21:00)', () => {
      const lateTime = new Date('2026-10-20T23:15:00');
      const config = {
        espetaculo_ativo: true,
        espetaculo_nome: 'Show de Stand-up',
        espetaculo_data: '2026-10-20',
        espetaculo_horario_intervalo: '21:00'
      };

      expect(isTheaterModeActive(config, lateTime)).toBe(false);
    });

    it('permanece true logo após o início do intervalo (ex: 21:10 vs 21:00)', () => {
      const duringInterval = new Date('2026-10-20T21:10:00');
      const config = {
        espetaculo_ativo: true,
        espetaculo_nome: 'Show de Stand-up',
        espetaculo_data: '2026-10-20',
        espetaculo_horario_intervalo: '21:00'
      };

      expect(isTheaterModeActive(config, duringInterval)).toBe(true);
    });
  });

  describe('getTheaterIntervalInfo & formatIntervalBadge', () => {
    it('retorna banner e badge para espetáculo ativo', () => {
      const config = {
        espetaculo_ativo: true,
        espetaculo_nome: 'Show Renato Albani',
        espetaculo_data: '2026-10-20',
        espetaculo_horario_intervalo: '21:15'
      };

      const info = getTheaterIntervalInfo(config, new Date('2026-10-20T20:00:00'));
      expect(info.active).toBe(true);
      expect(info.badgeText).toBe('🎭 INTERVALO 21:15');
      expect(info.bannerHtml).toContain('Renato Albani');
      expect(info.bannerHtml).toContain('21:15');
    });

    it('formata badge visual para pedido de intervalo na cozinha', () => {
      const pedidoIntervalo = {
        id: 123,
        is_intervalo: true,
        horario_retirada: '21:15'
      };

      const badge = formatIntervalBadge(pedidoIntervalo);
      expect(badge).toContain('badge-intervalo-teatro');
      expect(badge).toContain('🎭 INTERVALO 21:15');
    });

    it('formata badge quando o pedido possui "intervalo" nas observações', () => {
      const pedidoObs = {
        id: 124,
        is_intervalo: false,
        horario_retirada: '20:30',
        observacoes: 'Retirar no intervalo do show'
      };

      const badge = formatIntervalBadge(pedidoObs);
      expect(badge).toContain('🎭 INTERVALO 20:30');
    });

    it('retorna string vazia para pedidos normais', () => {
      const pedidoNormal = {
        id: 125,
        is_intervalo: false,
        observacoes: 'Sem açúcar'
      };

      expect(formatIntervalBadge(pedidoNormal)).toBe('');
      expect(formatIntervalBadge(null)).toBe('');
    });
  });
});
