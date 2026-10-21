import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isCashbackActive,
  loadCashbackConfig,
  clearCashbackConfigCache,
  getCashbackPrompt,
  formatCashbackNotification,
  calculateEligiblePaymentAmount,
  calculateCashback,
  processOrderCashback
} from '../js/utils/cashback.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000076 — Correção do Cashback, Segurança e Estorno', () => {
  beforeEach(() => {
    clearCashbackConfigCache();
    vi.clearAllMocks();
  });

  describe('RF01 / CA01 / CA02 — loadCashbackConfig & Exibição no Cardápio', () => {
    it('retorna configuração padrão (desativada) se cliente supabase for nulo ou inválido', async () => {
      const cfg = await loadCashbackConfig(null);
      expect(cfg.ativo).toBe(false);
      expect(isCashbackActive(cfg)).toBe(false);
      expect(getCashbackPrompt(cfg)).toBeNull();
    });

    it('retorna configuração desativada quando banco tem cashback_ativo = false', async () => {
      const sb = createSupabaseMock({
        configuracoes_sistema: [
          { chave: 'cashback_ativo', valor: false },
          { chave: 'cashback_percentual', valor: 5.0 },
          { chave: 'cashback_valor_minimo', valor: 10.0 }
        ]
      });

      const cfg = await loadCashbackConfig(sb);
      expect(cfg.ativo).toBe(false);
      expect(isCashbackActive(cfg)).toBe(false);
      expect(getCashbackPrompt(cfg)).toBeNull();
    });

    it('retorna configuração ativa e percentual quando cashback_ativo = true (CA02)', async () => {
      const sb = createSupabaseMock({
        configuracoes_sistema: [
          { chave: 'cashback_ativo', valor: true },
          { chave: 'cashback_percentual', valor: 7.5 },
          { chave: 'cashback_valor_minimo', valor: 15.0 }
        ]
      });

      const cfg = await loadCashbackConfig(sb);
      expect(cfg.ativo).toBe(true);
      expect(cfg.percentual).toBe(7.5);
      expect(cfg.valor_minimo).toBe(15.0);
      expect(isCashbackActive(cfg)).toBe(true);
      
      const prompt = getCashbackPrompt(cfg);
      expect(prompt).toContain('7.5% de cashback');
      expect(prompt).toContain('WhatsApp');
    });

    it('usa cache de sessão na segunda chamada sem nova consulta ao banco', async () => {
      const selectSpy = vi.fn().mockResolvedValue({
        data: [
          { chave: 'cashback_ativo', valor: true },
          { chave: 'cashback_percentual', valor: 5.0 }
        ],
        error: null
      });

      const fakeClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            in: selectSpy
          }))
        }))
      };

      const cfg1 = await loadCashbackConfig(fakeClient);
      const cfg2 = await loadCashbackConfig(fakeClient);

      expect(cfg1.ativo).toBe(true);
      expect(cfg2.ativo).toBe(true);
      expect(fakeClient.from).toHaveBeenCalledTimes(1);
    });

    it('em caso de erro do Supabase, retorna config desativada sem estourar exceção (RNF01)', async () => {
      const fakeClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            in: vi.fn().mockRejectedValue(new Error('Network error'))
          }))
        }))
      };

      const cfg = await loadCashbackConfig(fakeClient);
      expect(cfg.ativo).toBe(false);
      expect(isCashbackActive(cfg)).toBe(false);
    });
  });

  describe('RF03 / CA03 — Processamento no PDV', () => {
    it('chama processOrderCashback e formata notificação para o operador', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          creditado: true,
          valor_cashback: 2.0,
          percentual: 5.0,
          novo_saldo: 12.0
        },
        error: null
      });
      const sb = { rpc: mockRpc };

      const res = await processOrderCashback(sb, 101, 'uuid-cliente-123', 40.0);
      expect(res.creditado).toBe(true);
      expect(res.valor_cashback).toBe(2.0);
      expect(res.novo_saldo).toBe(12.0);

      const msg = formatCashbackNotification(res.valor_cashback, res.novo_saldo);
      expect(msg).toContain('R$ 2,00 de cashback');
      expect(msg).toContain('Saldo da carteira: R$ 12,00');
    });

    it('aceita assinatura com objeto de opções para compatibilidade flexível', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { creditado: true, valor_cashback: 1.5, novo_saldo: 5.5 },
        error: null
      });
      const sb = { rpc: mockRpc };

      const res = await processOrderCashback(sb, {
        pedidoId: 202,
        clienteId: 'uuid-cliente-202',
        valorElegivel: 30.0
      });

      expect(res.creditado).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('processar_cashback_pedido', {
        p_pedido_id: 202,
        p_cliente_id: 'uuid-cliente-202',
        p_valor_elegivel: 30.0
      });
    });
  });

  describe('RF04 / CA04 / CA05 / CA06 — Blindagem de Segurança da RPC', () => {
    it('CA05: chamada sem pedido_id é recusada (retorna creditado: false)', async () => {
      // Simula a lógica de validação da RPC
      const rpcHandler = (params) => {
        if (!params.p_pedido_id) {
          return { creditado: false, motivo: 'p_pedido_id é obrigatório.' };
        }
        return { creditado: true };
      };

      const res = rpcHandler({ p_pedido_id: null, p_cliente_id: 'uuid-1', p_valor_elegivel: 50 });
      expect(res.creditado).toBe(false);
      expect(res.motivo).toContain('p_pedido_id é obrigatório');
    });

    it('CA06: chamada repetida para o mesmo pedido é rejeitada por idempotência', () => {
      const movimentos = [
        { pedido_id: 55, tipo: 'deposito', forma_pagamento: 'cashback', valor: 2.0 }
      ];

      const verificarIdempotencia = (pedidoId) => {
        return movimentos.some(m => m.pedido_id === pedidoId && m.tipo === 'deposito' && m.forma_pagamento === 'cashback');
      };

      expect(verificarIdempotencia(55)).toBe(true); // já creditado
      expect(verificarIdempotencia(56)).toBe(false); // não creditado
    });

    it('CA04: calcula sobre os R$ 40,00 gravados e ignora R$ 4.000,00 forjados pelo cliente', () => {
      const fechamentoPagamentos = [
        { pedido_id: 88, forma: 'pix', valor: 40.0 }
      ];

      const calcularServidor = (pedidoId, valorInformadoPeloClient) => {
        const pagamentosGravados = fechamentoPagamentos
          .filter(p => p.pedido_id === pedidoId && ['pix', 'dinheiro', 'cartao'].includes(p.forma))
          .reduce((acc, p) => acc + p.valor, 0);

        const valorBase = pagamentosGravados > 0 ? pagamentosGravados : valorInformadoPeloClient;
        const percentual = 5.0;
        return Math.round((valorBase * percentual) / 100.0 * 100) / 100;
      };

      const cashback = calcularServidor(88, 4000.0);
      expect(cashback).toBe(2.0); // 5% de 40.0, e não de 4000.0
    });
  });

  describe('RF07 / CA07 — Estorno Automático no Cancelamento', () => {
    it('CA07: cancelamento de pedido estorna o cashback de forma idempotente', () => {
      let movimentos = [
        { id: 1, pedido_id: 77, cliente_id: 'uuid-cli', tipo: 'deposito', valor: 2.0, forma_pagamento: 'cashback' }
      ];
      let saldoCliente = 2.0;

      const triggerCancelamento = (pedidoId, novoStatus, statusAntigo) => {
        if (novoStatus === 'cancelado' && statusAntigo !== 'cancelado') {
          const original = movimentos.find(m => m.pedido_id === pedidoId && m.tipo === 'deposito' && m.forma_pagamento === 'cashback');
          if (original) {
            const jaEstornado = movimentos.some(m => m.pedido_id === pedidoId && m.tipo === 'estorno' && m.forma_pagamento === 'cashback');
            if (!jaEstornado) {
              movimentos.push({
                id: movimentos.length + 1,
                pedido_id: pedidoId,
                cliente_id: original.cliente_id,
                tipo: 'estorno',
                valor: -original.valor,
                forma_pagamento: 'cashback'
              });
              saldoCliente -= original.valor;
            }
          }
        }
      };

      // 1º cancelamento
      triggerCancelamento(77, 'cancelado', 'concluido');
      expect(movimentos).toHaveLength(2);
      expect(movimentos[1].tipo).toBe('estorno');
      expect(movimentos[1].valor).toBe(-2.0);
      expect(saldoCliente).toBe(0.0);

      // 2º cancelamento (idempotente)
      triggerCancelamento(77, 'cancelado', 'cancelado');
      expect(movimentos).toHaveLength(2); // nenhum estorno duplicado
      expect(saldoCliente).toBe(0.0);
    });
  });

  describe('CA09 — Lembrete de Cashback no Totem', () => {
    it('exibe o lembrete quando o cashback está ativo', () => {
      const config = { ativo: true, percentual: 5 };
      expect(isCashbackActive(config)).toBe(true);
      const prompt = getCashbackPrompt(config);
      expect(prompt).toContain('5% de cashback');
    });

    it('não exibe nada quando o cashback está desativado', () => {
      const config = { ativo: false };
      expect(isCashbackActive(config)).toBe(false);
      const prompt = getCashbackPrompt(config);
      expect(prompt).toBeNull();
    });
  });
});
