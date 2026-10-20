import { describe, it, expect, vi } from 'vitest';
import {
  isCashbackActive,
  calculateEligiblePaymentAmount,
  calculateCashback,
  getCashbackPrompt,
  formatCashbackNotification,
  processOrderCashback
} from '../js/utils/cashback.js';

describe('CAF-000063 — Fidelidade e Cashback Automático na Carteira', () => {
  describe('Opt-in Estrito (Desativado por Padrão)', () => {
    it('retorna false por padrão quando a configuração é vazia ou não informada', () => {
      expect(isCashbackActive(null)).toBe(false);
      expect(isCashbackActive({})).toBe(false);
      expect(isCashbackActive({ cashback_ativo: false })).toBe(false);
      expect(isCashbackActive({ ativo: false })).toBe(false);
    });

    it('retorna true somente quando explicitamente ativado pelo administrador', () => {
      expect(isCashbackActive({ cashback_ativo: true })).toBe(true);
      expect(isCashbackActive({ ativo: true })).toBe(true);
      expect(isCashbackActive({ cashback_ativo: 'true' })).toBe(true);
    });

    it('retorna null no prompt público quando o cashback está desativado (nenhuma menção ao cliente)', () => {
      expect(getCashbackPrompt({ cashback_ativo: false })).toBeNull();
      expect(getCashbackPrompt(null)).toBeNull();
    });

    it('retorna mensagem de convite no prompt público quando o cashback está ativo', () => {
      const prompt = getCashbackPrompt({ cashback_ativo: true, cashback_percentual: 5 });
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('5% de cashback');
      expect(prompt).toContain('WhatsApp');
    });
  });

  describe('Cálculo de Valor Elegível (Exclusão de Saldo e Fiado)', () => {
    it('soma apenas pagamentos elegíveis (Dinheiro, Pix, Cartão)', () => {
      const pagamentos = [
        { forma: 'pix', valor: 25.0 },
        { forma: 'dinheiro', valor: 15.0 },
        { forma: 'cartao_credito', valor: 10.0 }
      ];
      expect(calculateEligiblePaymentAmount(pagamentos)).toBe(50.0);
    });

    it('ignora pagamentos feitos com saldo da carteira, fiado ou cortesia', () => {
      const pagamentos = [
        { forma: 'saldo_cliente', valor: 15.0 },
        { forma: 'fiado', valor: 20.0 },
        { forma: 'cortesia', valor: 5.0 },
        { forma: 'pix', valor: 30.0 }
      ];
      expect(calculateEligiblePaymentAmount(pagamentos)).toBe(30.0);
    });
  });

  describe('Cálculo de Cashback', () => {
    it('retorna 0 quando o cashback está desativado, mesmo em pedidos de valor alto', () => {
      const config = { cashback_ativo: false, cashback_percentual: 10 };
      expect(calculateCashback(config, 100.0)).toBe(0);
    });

    it('retorna 0 quando o valor elegível está abaixo do mínimo exigido (ex: R$ 8 < R$ 10)', () => {
      const config = { cashback_ativo: true, cashback_percentual: 5, cashback_valor_minimo: 10 };
      expect(calculateCashback(config, 8.0)).toBe(0);
    });

    it('calcula 5% de cashback corretamente sobre R$ 50,00 (R$ 2,50)', () => {
      const config = { cashback_ativo: true, cashback_percentual: 5, cashback_valor_minimo: 10 };
      expect(calculateCashback(config, 50.0)).toBe(2.5);
    });

    it('em pagamento misto (R$ 10 Saldo + R$ 20 Cartão), calcula cashback apenas sobre os R$ 20 do cartão (R$ 1,00)', () => {
      const config = { cashback_ativo: true, cashback_percentual: 5, cashback_valor_minimo: 10 };
      const pagamentos = [
        { forma: 'saldo_cliente', valor: 10.0 },
        { forma: 'cartao_debito', valor: 20.0 }
      ];
      expect(calculateCashback(config, pagamentos)).toBe(1.0);
    });
  });

  describe('Notificação e Processamento de Cashback', () => {
    it('formata texto da notificação de ganho com saldo atualizado', () => {
      const text = formatCashbackNotification(2.5, 12.5);
      expect(text).toContain('R$ 2,50 de cashback');
      expect(text).toContain('Saldo da carteira: R$ 12,50');
    });

    it('chama RPC processar_cashback_pedido com parâmetros corretos', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { creditado: true, valor_cashback: 2.0, novo_saldo: 10.0 },
        error: null
      });
      const mockSupabase = { rpc: mockRpc };

      const res = await processOrderCashback(mockSupabase, 999, 'uuid-cliente-1', 40.0);
      expect(res.creditado).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('processar_cashback_pedido', {
        p_pedido_id: 999,
        p_cliente_id: 'uuid-cliente-1',
        p_valor_elegivel: 40.0
      });
    });
  });
});
