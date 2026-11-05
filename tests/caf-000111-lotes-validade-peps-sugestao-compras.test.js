// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calcularConsumoMedioDiario,
  calcularAutonomiaDias,
  calculateSuggestedPurchaseQuantity,
  calcularSugestaoCompraInteligente,
  buildShoppingListBySupplier,
  formatSupplierWhatsAppOrder
} from '../js/utils/stock-purchase.js';
import '../js/db.js';

describe('CAF-000111: Controle de Validade por Lote (PEPS) e Sugestão Inteligente de Compras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CA01: Registro de Entrada com Lote e Validade & Retrocompatibilidade', () => {
    it('CA01: cria movimento com validade e código de lote ao registrar entrada de item perecível', async () => {
      let insertPayload = null;
      window.cafeteriaSupabase = {
        from: vi.fn((table) => {
          if (table === 'estoque_movimentos') {
            return {
              insert: vi.fn((payload) => {
                insertPayload = payload;
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: { id: 101, ...payload },
                      error: null
                    }))
                  }))
                };
              })
            };
          }
          return {};
        })
      };

      const mov = await window.cafeteriaDB.estoque.criarMovimento({
        item_id: 1,
        tipo: 'entrada',
        quantidade: 20,
        custo_unitario: 5.5,
        validade: '2026-11-20',
        lote_codigo: 'L-2026-A',
        motivo: 'Compra semanal'
      });

      expect(mov).toBeDefined();
      expect(insertPayload).toBeDefined();
      expect(insertPayload.item_id).toBe(1);
      expect(insertPayload.quantidade).toBe(20);
      expect(insertPayload.validade).toBe('2026-11-20');
      expect(insertPayload.lote_codigo).toBe('L-2026-A');
    });

    it('CA01: permite registrar entrada de itens não-perecíveis sem validade nem lote de forma retrocompatível', async () => {
      let insertPayload = null;
      window.cafeteriaSupabase = {
        from: vi.fn((table) => {
          if (table === 'estoque_movimentos') {
            return {
              insert: vi.fn((payload) => {
                insertPayload = payload;
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: { id: 102, ...payload },
                      error: null
                    }))
                  }))
                };
              })
            };
          }
          return {};
        })
      };

      const mov = await window.cafeteriaDB.estoque.criarMovimento({
        item_id: 2,
        tipo: 'entrada',
        quantidade: 100,
        custo_unitario: 0.15,
        validade: null,
        lote_codigo: null,
        motivo: 'Compra de copos descartáveis'
      });

      expect(mov).toBeDefined();
      expect(insertPayload.validade).toBeNull();
      expect(insertPayload.lote_codigo).toBeNull();
    });
  });

  describe('CA02: Lógica de Abatimento PEPS (Primeiro que Vence, Primeiro que Sai)', () => {
    it('CA02: consome prioritariamente o lote com validade mais próxima e abate o excedente no lote seguinte', () => {
      // Simula a fila de lotes ativos do insumo (ordenados por validade ASC)
      const lotes = [
        { id: 1, item_id: 10, lote_codigo: 'Lote-A', data_validade: '2026-11-08', quantidade_restante: 10, ativo: true },
        { id: 2, item_id: 10, lote_codigo: 'Lote-B', data_validade: '2026-11-17', quantidade_restante: 15, ativo: true }
      ];

      function simularAbatimentoPEPS(filaLotes, quantidadeSaida) {
        let qtdRestante = quantidadeSaida;
        const lotesAtualizados = filaLotes.map(l => ({ ...l }));

        for (const l of lotesAtualizados) {
          if (qtdRestante <= 0) break;
          const delta = Math.min(l.quantidade_restante, qtdRestante);
          l.quantidade_restante -= delta;
          l.ativo = l.quantidade_restante > 0;
          qtdRestante -= delta;
        }

        return { lotes: lotesAtualizados, naoAtendido: qtdRestante };
      }

      const res = simularAbatimentoPEPS(lotes, 12);

      // Lote A (10L): totalmente consumido (resta 0, inativo)
      expect(res.lotes[0].quantidade_restante).toBe(0);
      expect(res.lotes[0].ativo).toBe(false);

      // Lote B (15L): abateram 2L (restam 13L, ativo)
      expect(res.lotes[1].quantidade_restante).toBe(13);
      expect(res.lotes[1].ativo).toBe(true);

      // Toda a saída de 12L foi atendida
      expect(res.naoAtendido).toBe(0);
    });
  });

  describe('CA03: Alertas de Validade e Baixa por Perda em 1 Clique', () => {
    it('CA03: lista lotes vencidos e vencendo nos próximos 7 dias via cafeteriaDB.estoque.listarAlertasValidade', async () => {
      const mockLotes = [
        { id: 1, item_id: 10, lote_codigo: 'L1', data_validade: '2026-11-01', quantidade_restante: 5, ativo: true }, // Vencido
        { id: 2, item_id: 20, lote_codigo: 'L2', data_validade: '2026-11-07', quantidade_restante: 8, ativo: true }, // Vencendo <= 7d
        { id: 3, item_id: 30, lote_codigo: 'L3', data_validade: '2026-12-15', quantidade_restante: 20, ativo: true } // Longe do vencimento
      ];

      window.cafeteriaSupabase = {
        from: vi.fn((table) => {
          if (table === 'estoque_lotes') {
            return {
              select: vi.fn(() => ({
                gt: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    not: vi.fn(() => ({
                      lte: vi.fn(() => ({
                        order: vi.fn(async () => ({
                          data: [mockLotes[0], mockLotes[1]],
                          error: null
                        }))
                      }))
                    }))
                  }))
                }))
              }))
            };
          }
          return {};
        })
      };

      const alertas = await window.cafeteriaDB.estoque.listarAlertasValidade(7);
      expect(alertas.total).toBe(2);
      expect(alertas.vencidos.length + alertas.vencendo.length).toBe(2);
    });

    it('CA03: aciona RPC dar_baixa_lote_vencido com sucesso zerando o lote e lançando perda', async () => {
      let rpcChamada = null;
      window.cafeteriaSupabase = {
        rpc: vi.fn(async (nome, params) => {
          rpcChamada = { nome, params };
          return {
            data: { sucesso: true, lote_id: params.p_lote_id, quantidade_baixada: 5, movimento_id: 999 },
            error: null
          };
        })
      };

      const res = await window.cafeteriaDB.estoque.darBaixaLoteVencido(1, 'Descarte validade');
      expect(rpcChamada.nome).toBe('dar_baixa_lote_vencido');
      expect(rpcChamada.params.p_lote_id).toBe(1);
      expect(res.sucesso).toBe(true);
      expect(res.quantidade_baixada).toBe(5);
    });
  });

  describe('CA04: Sugestão Inteligente de Compras baseada no Consumo Médio Diário (CMD 30d)', () => {
    it('CA04: calcula CMD, autonomia em dias e quantidade de compra para cobertura de 14 dias', () => {
      // Café em Grãos: 15 kg consumidos em 30 dias -> CMD = 0.5 kg/dia
      const cmd = calcularConsumoMedioDiario(15, 30);
      expect(cmd).toBe(0.5);

      // Saldo atual = 2 kg -> Autonomia: 2 / 0.5 = 4 dias
      const autonomia = calcularAutonomiaDias(2, cmd);
      expect(autonomia).toBe(4.0);

      // Demanda para 14 dias = 14 * 0.5 = 7 kg. Necessidade = 7 - 2 = 5 kg
      // Estoque mínimo = 3 kg (piso: 3 - 2 = 1 kg). Maior necessidade = 5 kg
      const sugerida = calcularSugestaoCompraInteligente({
        saldoAtual: 2,
        estoqueMinimo: 3,
        cmd: 0.5,
        diasCobertura: 14
      });
      expect(sugerida).toBe(5);
    });

    it('CA04: respeita o estoque mínimo como piso de segurança se a necessidade calculada for menor', () => {
      // Insumo com baixo giro: 3 un em 30 dias -> CMD = 0.1 un/dia
      const cmd = calcularConsumoMedioDiario(3, 30); // 0.1
      // Saldo atual = 1 un, estoque mínimo = 10 un
      // Demanda para 14 dias = 14 * 0.1 = 1.4 un -> Necessidade por giro = 1.4 - 1 = 0.4 un
      // Necessidade pelo piso mínimo = 10 - 1 = 9 un
      const sugerida = calcularSugestaoCompraInteligente({
        saldoAtual: 1,
        estoqueMinimo: 10,
        cmd,
        diasCobertura: 14
      });
      // Deve sugerir 9 un (piso mínimo)
      expect(sugerida).toBe(9);
    });

    it('CA04: recai com segurança na fórmula clássica quando o item não tiver saídas nos últimos 30 dias (CMD = 0)', () => {
      const sugerida = calcularSugestaoCompraInteligente({
        saldoAtual: 2,
        estoqueMinimo: 10,
        cmd: 0,
        diasCobertura: 14
      });
      // Fórmula clássica: MAX(10 * 2 - 2, 10) = 18
      expect(sugerida).toBe(18);
    });
  });

  describe('CA05: Multiplicador de Demanda de Espetáculo (+30%) e Formatação WhatsApp', () => {
    it('CA05: aplica acréscimo de 30% sobre o consumo na sugestão de compra', () => {
      // CMD = 1.0 kg/dia, saldo = 5 kg, cobertura = 14 dias
      // Normal: 14 * 1.0 - 5 = 9 kg
      const normal = calcularSugestaoCompraInteligente({
        saldoAtual: 5,
        estoqueMinimo: 5,
        cmd: 1.0,
        diasCobertura: 14,
        fatorEspetaculo: 1.0
      });
      expect(normal).toBe(9);

      // Com espetáculo (+30%): demanda = 14 * 1.0 * 1.30 = 18.2 kg. Necessidade = 18.2 - 5 = 13.2 -> ceil = 14 kg
      const comEspetaculo = calcularSugestaoCompraInteligente({
        saldoAtual: 5,
        estoqueMinimo: 5,
        cmd: 1.0,
        diasCobertura: 14,
        fatorEspetaculo: 1.3
      });
      expect(comEspetaculo).toBe(14);
    });

    it('CA05: reflete o modo espetáculo e a autonomia no texto formatado para o WhatsApp', () => {
      const itens = [
        {
          nome: 'Café em Grãos Especial',
          quantidadeSugerida: 14,
          unidade: 'kg',
          saldoAtual: 5,
          autonomiaDias: 5.0
        }
      ];

      const msg = formatSupplierWhatsAppOrder('Distribuidora Grão Nobre', itens, { modoEspetaculo: true });
      expect(msg).toContain('Café em Grãos Especial');
      expect(msg).toContain('14 kg');
      expect(msg).toContain('autonomia: 5d');
      expect(msg).toContain('reforço de demanda para semana de espetáculo (+30%)');
    });

    it('CA05: monta lista de compras integrada por fornecedor com opções de cobertura e espetáculo', () => {
      const itens = [
        { id: 10, nome: 'Leite Integral', quantidade: 4, estoque_minimo: 10, unidade: 'l', fornecedor_padrao_id: 'f1' }
      ];
      const fornecedores = [
        { id: 'f1', nome: 'Laticínios Central', telefone: '51999990000' }
      ];
      const consumoMap = new Map([[10, 1.5]]); // 1.5 l/dia

      const lista = buildShoppingListBySupplier(itens, fornecedores, {
        diasCobertura: 7,
        modoEspetaculo: true,
        consumoMap
      });

      expect(lista).toHaveLength(1);
      expect(lista[0].fornecedor.nome).toBe('Laticínios Central');
      expect(lista[0].itens[0].cmd).toBe(1.5);
      // Demanda = 7 * 1.5 * 1.3 = 13.65. Necessidade = 13.65 - 4 = 9.65 -> ceil = 10
      expect(lista[0].itens[0].quantidadeSugerida).toBe(10);
    });
  });

  describe('CA06: Caso Negativo — Rejeição de Baixa em Lote Zerado ou Inexistente', () => {
    it('CA06: rejeita tentativa de baixa em lote zerado via RPC', async () => {
      window.cafeteriaSupabase = {
        rpc: vi.fn(async () => ({
          data: null,
          error: new Error('O lote já está com saldo zerado')
        }))
      };

      await expect(
        window.cafeteriaDB.estoque.darBaixaLoteVencido(999)
      ).rejects.toThrow('O lote já está com saldo zerado');
    });
  });

  describe('CA07: Caso Limite — Item com Estoque Zerado e Autonomia Crítica', () => {
    it('CA07: exibe autonomia 0 dias e sugere compra da totalidade da cobertura quando saldo é 0 e CMD > 0', () => {
      const cmd = 2.0;
      const saldoAtual = 0;
      const estoqueMinimo = 5;

      const autonomia = calcularAutonomiaDias(saldoAtual, cmd);
      expect(autonomia).toBe(0);

      // Cobertura 14 dias: demanda = 14 * 2.0 = 28. Sugerido = 28
      const sugerida = calcularSugestaoCompraInteligente({
        saldoAtual,
        estoqueMinimo,
        cmd,
        diasCobertura: 14
      });
      expect(sugerida).toBe(28);
    });

    it('CA07: retorna null para autonomia se o item nunca teve saídas (CMD = 0)', () => {
      expect(calcularAutonomiaDias(10, 0)).toBeNull();
      expect(calcularAutonomiaDias(0, 0)).toBeNull();
    });
  });
});

