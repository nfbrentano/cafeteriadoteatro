// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  filtrarPedidosTransferiveisMesa,
  pedidoPertenceAoTurnoCaixa,
  calculateMesaTotals
} from '../js/utils/conta-mesa.js';
import { setupPedidosPage } from './helpers/pedidos-page.js';

describe('CAF-000108: Integridade Operacional — Transferência de Mesa, Fechamento Atômico e Corte de Caixa', () => {
  let page;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (page?.harness?.cleanup) {
      page.harness.cleanup();
    }
  });

  describe('CA01 e CA02: Transferência de pedidos já entregues na mesa preservando pedidos históricos pagos', () => {
    it('CA01: transfere pedidos em status entregue e em_preparo quando ambos estão com status_pagamento = pendente', () => {
      const pedidosMesa02 = [
        { id: 10, mesa_codigo: '02', status: 'entregue', status_pagamento: 'pendente', total: 25.0 },
        { id: 11, mesa_codigo: '02', status: 'em_preparo', status_pagamento: 'pendente', total: 15.0 }
      ];

      const transferiveis = filtrarPedidosTransferiveisMesa(pedidosMesa02, '02');
      expect(transferiveis).toHaveLength(2);
      expect(transferiveis.map(p => p.id)).toEqual([10, 11]);

      const totaisDestino = calculateMesaTotals(transferiveis);
      expect(Number(totaisDestino.total)).toBe(40.0);
    });

    it('CA02: preserva pedido antigo já pago (status_pagamento = pago) na mesa de origem e transfere apenas o pendente', () => {
      const pedidos = [
        { id: 8, mesa_codigo: '02', status: 'entregue', status_pagamento: 'pago', total: 32.0 },
        { id: 9, mesa_codigo: '02', status: 'cancelado', status_pagamento: 'pendente', total: 18.0 },
        { id: 10, mesa_codigo: '02', status: 'entregue', status_pagamento: 'pendente', total: 25.0 }
      ];

      const transferiveis = filtrarPedidosTransferiveisMesa(pedidos, '02');
      expect(transferiveis).toHaveLength(1);
      expect(transferiveis[0].id).toBe(10);
    });
  });

  describe('CA03 e CA04: Atomicidade e Idempotência no Débito da Conta do Cliente no Fechamento de Mesa', () => {
    it('CA03: não debita a Conta do Cliente em duplicidade quando fechar_conta_mesa falha na 1ª tentativa e sucede na 2ª', async () => {
      page = await setupPedidosPage();

      let chamadasDebito = 0;
      window.cafeteriaDB.clientes.lancarMovimento = vi.fn(async () => {
        chamadasDebito += 1;
        return { sucesso: true, novo_saldo: 50.0 };
      });

      let tentativaFechar = 0;
      const idempotencyKeysRecebidas = [];
      page.mockRpc('fechar_conta_mesa', async (args) => {
        tentativaFechar += 1;
        idempotencyKeysRecebidas.push(args.p_idempotency_key);
        if (tentativaFechar === 1) {
          return { data: null, error: new Error('Falha temporária de rede ao fechar mesa') };
        }
        return {
          data: { fechamento_id: 901, troco: 0, total: 50.0, idempotent: false },
          error: null
        };
      });

      const pedidosMesa03 = [
        {
          id: 301,
          mesa_codigo: '03',
          total: 50.0,
          status: 'entregue',
          status_pagamento: 'pendente',
          cliente_id: 'c_hab',
          itens: [{ id: 1, nome: 'Cappuccino', preco_unitario: 25.0, quantidade: 2 }]
        }
      ];

      await page.abrirModalFechamentoMesa('03', pedidosMesa03);
      page.avancarEtapaFechamento(2);
      page.configurarTaxaServico(false);
      page.avancarEtapaFechamento(3);
      page.adicionarPagamentoFechamento('conta_cliente', 50.0);

      // 1ª tentativa: fechar_conta_mesa falha
      await page.confirmarFechamento();
      expect(chamadasDebito).toBe(1);
      expect(tentativaFechar).toBe(1);

      // 2ª tentativa (retry do operador): fechar_conta_mesa sucede sem debitar novamente!
      await page.confirmarFechamento();
      expect(tentativaFechar).toBe(2);
      expect(chamadasDebito).toBe(1);
      expect(idempotencyKeysRecebidas[0]).toBeTruthy();
      expect(idempotencyKeysRecebidas[1]).toBe(idempotencyKeysRecebidas[0]);
    });

    it('CA04: recusa o fechamento e não chama fechar_conta_mesa quando o cliente não possui saldo/limite suficiente', async () => {
      page = await setupPedidosPage();

      window.cafeteriaDB.clientes.lancarMovimento = vi.fn(async () => ({
        sucesso: false,
        mensagem: 'Limite de crédito excedido.'
      }));

      let fechamentoChamado = false;
      page.mockRpc('fechar_conta_mesa', async () => {
        fechamentoChamado = true;
        return { data: { fechamento_id: 902 }, error: null };
      });

      const pedidosMesa03 = [
        {
          id: 302,
          mesa_codigo: '03',
          total: 80.0,
          status: 'entregue',
          status_pagamento: 'pendente',
          cliente_id: 'c_hab',
          itens: [{ id: 2, nome: 'Combo Teatro', preco_unitario: 80.0, quantidade: 1 }]
        }
      ];

      await page.abrirModalFechamentoMesa('03', pedidosMesa03);
      page.avancarEtapaFechamento(2);
      page.configurarTaxaServico(false);
      page.avancarEtapaFechamento(3);
      page.adicionarPagamentoFechamento('conta_cliente', 80.0);

      await page.confirmarFechamento();

      expect(window.cafeteriaDB.clientes.lancarMovimento).toHaveBeenCalledTimes(1);
      expect(fechamentoChamado).toBe(false);
      const ultimoToast = page.obterUltimoToast();
      expect(ultimoToast?.msg || '').toMatch(/Débito na conta recusado/i);
    });
  });

  describe('CA05 e CA06: Corte temporal de pagamento de pedidos no Caixa (pago_em)', () => {
    const caixaAbertoEm = '2026-10-29T14:00:00.000Z';
    const caixaFechadoEm = '2026-10-29T22:00:00.000Z';

    it('CA05: inclui pedido criado às 13:30 (antes de abrir o caixa) cujo pagamento foi confirmado às 15:00', () => {
      const pedidoAgendadoPagoNoTurno = {
        id: 501,
        status: 'entregue',
        status_pagamento: 'pago',
        total: 42.0,
        created_at: '2026-10-29T13:30:00.000Z',
        pago_em: '2026-10-29T15:00:00.000Z',
        updated_at: '2026-10-29T15:00:00.000Z'
      };

      expect(pedidoPertenceAoTurnoCaixa(pedidoAgendadoPagoNoTurno, caixaAbertoEm, caixaFechadoEm)).toBe(true);
    });

    it('CA06: exclui pedido criado e pago às 13:30 (antes da abertura do caixa das 14:00)', () => {
      const pedidoTurnoAnterior = {
        id: 500,
        status: 'entregue',
        status_pagamento: 'pago',
        total: 18.0,
        created_at: '2026-10-29T13:30:00.000Z',
        pago_em: '2026-10-29T13:30:00.000Z',
        updated_at: '2026-10-29T13:30:00.000Z'
      };

      expect(pedidoPertenceAoTurnoCaixa(pedidoTurnoAnterior, caixaAbertoEm, caixaFechadoEm)).toBe(false);
    });
  });
});
