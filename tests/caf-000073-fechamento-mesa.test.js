import { describe, it, expect, vi } from 'vitest';
import { dividirConta } from '../js/utils/divisao-conta.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000073 — Fechamento de Conta de Mesa (Cálculos, RPC e Idempotência)', () => {
  describe('Divisão igualitária em centavos inteiros (CA05)', () => {
    it('divide R$ 100,00 entre 3 pessoas sem dízimas e com soma exata de 100,00', () => {
      const partes = dividirConta(100.00, 3);
      expect(partes).toEqual([33.34, 33.33, 33.33]);
      const soma = partes.reduce((a, b) => a + b, 0);
      expect(Math.round(soma * 100) / 100).toBe(100.00);
    });

    it('divide R$ 10,00 entre 3 pessoas com soma exata de 10,00', () => {
      const partes = dividirConta(10.00, 3);
      expect(partes).toEqual([3.34, 3.33, 3.33]);
      const soma = partes.reduce((a, b) => a + b, 0);
      expect(Math.round(soma * 100) / 100).toBe(10.00);
    });

    it('divide R$ 0,01 entre 2 pessoas sem valor negativo', () => {
      const partes = dividirConta(0.01, 2);
      expect(partes).toEqual([0.01, 0.00]);
      const soma = partes.reduce((a, b) => a + b, 0);
      expect(Math.round(soma * 100) / 100).toBe(0.01);
    });

    it('divide conta de 1 pessoa retornando o valor integral', () => {
      const partes = dividirConta(75.50, 1);
      expect(partes).toEqual([75.50]);
    });

    it('trata valor zero ou pessoas inválidas com segurança', () => {
      expect(dividirConta(0, 3)).toEqual([0, 0, 0]);
      expect(dividirConta(50, 0)).toEqual([50]);
    });
  });

  describe('Regras de Negócio e RPC fechar_conta_mesa (CA01, CA02, CA03, CA04, CA06)', () => {
    function setupMesaMock() {
      return createSupabaseMock({
        pedidos: [
          { id: 101, mesa_codigo: 'MESA-01', total: 30.00, status: 'entregue', status_pagamento: 'pendente' },
          { id: 102, mesa_codigo: 'MESA-01', total: 20.00, status: 'entregue', status_pagamento: 'pendente' },
          { id: 103, mesa_codigo: 'MESA-01', total: 15.00, status: 'cancelado', status_pagamento: 'pendente' }
        ],
        fechamentos: [],
        fechamento_pagamentos: [],
        fechamento_pedidos: [],
        campanhas: [
          { id: 1, cupom_codigo: 'PROMO10', usos_registrados: 0, receita_atribuida: 0 }
        ]
      }, {
        rpcHandlers: {
          fechar_conta_mesa: (args, tables) => {
            const { p_mesa_codigo, p_pagamentos, p_taxa_servico = 0, p_desconto_manual = 0, p_idempotency_key, p_cupom_codigo, p_campanha_id } = args;

            // Idempotência
            if (p_idempotency_key) {
              const existing = tables.fechamentos.find(f => f.idempotency_key === p_idempotency_key);
              if (existing) {
                return {
                  data: {
                    fechamento_id: existing.id,
                    troco: existing.troco,
                    total: existing.total_conta,
                    idempotent: true
                  },
                  error: null
                };
              }
            }

            // Exclui pedidos cancelados (CA02)
            const pedidosMesa = tables.pedidos.filter(p => p.mesa_codigo === p_mesa_codigo && p.status !== 'cancelado' && p.status_pagamento !== 'pago');
            if (pedidosMesa.length === 0) {
              return { data: null, error: { message: 'Mesa sem pedidos em aberto.' } };
            }

            const subtotal = pedidosMesa.reduce((acc, p) => acc + p.total, 0);
            if (p_desconto_manual > subtotal) {
              return { data: null, error: { message: 'Desconto maior que o subtotal.' } };
            }

            const totalAPagar = (subtotal - p_desconto_manual) + p_taxa_servico;
            const totalPago = (p_pagamentos || []).reduce((acc, p) => acc + Number(p.valor || 0), 0);

            if (totalPago < (totalAPagar - 0.01)) {
              return { data: null, error: { message: 'Pagamento insuficiente.' } };
            }

            const troco = Math.max(0, totalPago - totalAPagar);
            const fechamentoId = `fech-${Date.now()}`;

            tables.fechamentos.push({
              id: fechamentoId,
              mesa_codigo: p_mesa_codigo,
              total_conta: totalAPagar,
              troco,
              idempotency_key: p_idempotency_key,
              cupom_codigo: p_cupom_codigo,
              campanha_id: p_campanha_id
            });

            pedidosMesa.forEach(p => {
              p.status_pagamento = 'pago';
              tables.fechamento_pedidos.push({ fechamento_id: fechamentoId, pedido_id: p.id });
            });

            if (p_campanha_id) {
              const camp = tables.campanhas.find(c => c.id === p_campanha_id);
              if (camp) {
                camp.usos_registrados += 1;
                camp.receita_atribuida += totalAPagar;
              }
            }

            return {
              data: {
                fechamento_id: fechamentoId,
                troco,
                total: totalAPagar,
                idempotent: false
              },
              error: null
            };
          }
        }
      });
    }

    it('ignora estritamente pedidos cancelados no cálculo da conta (CA02)', async () => {
      const mock = setupMesaMock();
      const res = await mock.rpc('fechar_conta_mesa', {
        p_mesa_codigo: 'MESA-01',
        p_pagamentos: [{ forma: 'pix', valor: 50.00 }]
      });

      expect(res.error).toBeNull();
      expect(res.data.total).toBe(50.00); // 30 + 20 (ignora os 15 cancelados)
    });

    it('protege contra repetição e chamadas paralelas via idempotency_key (CA03)', async () => {
      const mock = setupMesaMock();
      const key = '550e8400-e29b-41d4-a716-446655440000';

      const res1 = await mock.rpc('fechar_conta_mesa', {
        p_mesa_codigo: 'MESA-01',
        p_pagamentos: [{ forma: 'pix', valor: 50.00 }],
        p_idempotency_key: key
      });
      expect(res1.data.idempotent).toBe(false);

      const res2 = await mock.rpc('fechar_conta_mesa', {
        p_mesa_codigo: 'MESA-01',
        p_pagamentos: [{ forma: 'pix', valor: 50.00 }],
        p_idempotency_key: key
      });
      expect(res2.data.idempotent).toBe(true);
      expect(res2.data.fechamento_id).toBe(res1.data.fechamento_id);
      expect(mock._tables.fechamentos).toHaveLength(1);
    });

    it('rejeita fechamento quando pagamento é insuficiente (CA04)', async () => {
      const mock = setupMesaMock();
      const res = await mock.rpc('fechar_conta_mesa', {
        p_mesa_codigo: 'MESA-01',
        p_pagamentos: [{ forma: 'pix', valor: 40.00 }]
      });

      expect(res.error).not.toBeNull();
      expect(res.error.message).toContain('Pagamento insuficiente');
      expect(mock._tables.fechamentos).toHaveLength(0);
    });

    it('rejeita desconto maior que o subtotal da mesa (CA04)', async () => {
      const mock = setupMesaMock();
      const res = await mock.rpc('fechar_conta_mesa', {
        p_mesa_codigo: 'MESA-01',
        p_desconto_manual: 60.00,
        p_pagamentos: [{ forma: 'pix', valor: 50.00 }]
      });

      expect(res.error).not.toBeNull();
      expect(res.error.message).toContain('Desconto maior que o subtotal');
    });

    it('persiste cupom_codigo e campanha_id no fechamento e atualiza usos da campanha (CA06)', async () => {
      const mock = setupMesaMock();
      const res = await mock.rpc('fechar_conta_mesa', {
        p_mesa_codigo: 'MESA-01',
        p_pagamentos: [{ forma: 'pix', valor: 50.00 }],
        p_cupom_codigo: 'PROMO10',
        p_campanha_id: 1
      });

      expect(res.error).toBeNull();
      const fech = mock._tables.fechamentos[0];
      expect(fech.cupom_codigo).toBe('PROMO10');
      expect(fech.campanha_id).toBe(1);

      const camp = mock._tables.campanhas[0];
      expect(camp.usos_registrados).toBe(1);
      expect(camp.receita_atribuida).toBe(50.00);
    });
  });
});
