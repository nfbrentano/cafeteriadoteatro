import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeCouponCode,
  calculateDiscount,
  validateCouponLocally,
  validateCouponWithSupabase,
  registerCouponUsage
} from '../js/utils/coupon-validator.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000061 — Cupons de Desconto no Autoatendimento e PDV', () => {
  it('normaliza o código do cupom removendo espaços e convertendo para maiúsculo', () => {
    expect(normalizeCouponCode('  teatro10  ')).toBe('TEATRO10');
    expect(normalizeCouponCode('Cafe-Vip ')).toBe('CAFE-VIP');
    expect(normalizeCouponCode('')).toBe('');
    expect(normalizeCouponCode(null)).toBe('');
  });

  describe('Cálculo de Desconto', () => {
    it('calcula desconto percentual corretamente', () => {
      expect(calculateDiscount('percentual', 10, 50.0)).toBe(5.0);
      expect(calculateDiscount('percent', 15, 33.33)).toBe(5.0);
      expect(calculateDiscount('%', 50, 100.0)).toBe(50.0);
    });

    it('calcula desconto de valor fixo corretamente', () => {
      expect(calculateDiscount('valor_fixo', 7.5, 30.0)).toBe(7.5);
      expect(calculateDiscount('valor', 15.0, 45.0)).toBe(15.0);
    });

    it('não permite que o desconto ultrapasse o subtotal do pedido', () => {
      expect(calculateDiscount('valor_fixo', 50.0, 20.0)).toBe(20.0);
      expect(calculateDiscount('percentual', 150, 40.0)).toBe(40.0);
    });
  });

  describe('Validação Local de Cupom (Regras de Negócio)', () => {
    it('aprova cupom ativo que atinge o pedido mínimo', () => {
      const cupom = {
        id: 1,
        nome: 'Campanha Retorno',
        cupom_codigo: 'VOLTEI10',
        tipo_desconto: 'percentual',
        valor_desconto: 10,
        valor_minimo_pedido: 20,
        ativa: true
      };

      const res = validateCouponLocally(cupom, 50.0);
      expect(res.valid).toBe(true);
      expect(res.desconto_calculado).toBe(5.0);
      expect(res.total_com_desconto).toBe(45.0);
      expect(res.cupom_codigo).toBe('VOLTEI10');
    });

    it('rejeita cupom quando o subtotal está abaixo do valor mínimo', () => {
      const cupom = {
        id: 2,
        nome: 'Combo Teatro',
        cupom_codigo: 'TEATRO20',
        tipo_desconto: 'valor_fixo',
        valor_desconto: 5,
        valor_minimo_pedido: 30,
        ativa: true
      };

      const res = validateCouponLocally(cupom, 25.0);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('Pedido mínimo de R$ 30,00');
    });

    it('rejeita cupom inativo', () => {
      const cupom = {
        id: 3,
        cupom_codigo: 'EXPIRADO',
        tipo_desconto: 'percentual',
        valor_desconto: 20,
        ativa: false
      };

      const res = validateCouponLocally(cupom, 60.0);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('não está mais ativo');
    });
  });

  describe('Integração com Supabase (Validação e Rastreamento de Uso)', () => {
    let mockSupabase;

    beforeEach(() => {
      mockSupabase = createSupabaseMock({
        campanhas: [
          {
            id: 101,
            nome: 'Boas Vindas 10%',
            cupom_codigo: 'BEMVINDO10',
            tipo_desconto: 'percentual',
            valor_desconto: 10,
            valor_minimo_pedido: 15,
            ativa: true,
            usos_registrados: 2,
            receita_atribuida: 80.0
          },
          {
            id: 102,
            nome: 'Festa Inativa',
            cupom_codigo: 'FESTA',
            tipo_desconto: 'valor_fixo',
            valor_desconto: 10,
            ativa: false
          }
        ]
      });
    });

    it('valida cupom existente no banco case-insensitively', async () => {
      const res = await validateCouponWithSupabase(mockSupabase, '  bemvindo10 ', 40.0);
      expect(res.valid).toBe(true);
      expect(res.desconto_calculado).toBe(4.0);
      expect(res.total_com_desconto).toBe(36.0);
    });

    it('rejeita código inexistente no banco', async () => {
      const res = await validateCouponWithSupabase(mockSupabase, 'CUPOMNAOEXISTE', 50.0);
      expect(res.valid).toBe(false);
      expect(res.message).toContain('inválido ou não encontrado');
    });

    it('incrementa os usos registrados e receita atribuída na campanha', async () => {
      await registerCouponUsage(mockSupabase, 101, 36.0);
      const camp = mockSupabase._tables.campanhas.find(c => c.id === 101);
      expect(camp.usos_registrados).toBe(3);
      expect(camp.receita_atribuida).toBe(116.0);
    });
  });
});
