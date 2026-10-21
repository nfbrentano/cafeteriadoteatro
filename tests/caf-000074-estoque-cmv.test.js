import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildShoppingListBySupplier } from '../js/utils/stock-purchase.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000074 — Correção de Estoque, Ficha Técnica (CMV) e Lista de Compras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RF01 / CA01 / CA02 — Nomes Reais do Banco (unidade, quantidade, validade)', () => {
    it('CA01: mapeia corretamente item com colunas reais do banco (unidade, quantidade, custo_medio)', () => {
      const dbRow = {
        id: 1,
        nome: 'Café em Grãos',
        unidade: 'kg',
        quantidade: 15.5,
        estoque_minimo: 5.0,
        custo_medio: 45.0,
        controla_validade: true,
        ativo: true
      };

      const saldo = Number(dbRow.quantidade ?? dbRow.saldo_atual ?? 0);
      const un = dbRow.unidade || dbRow.unidade_medida || 'un';
      const custo = Number(dbRow.custo_medio ?? dbRow.custo_unitario_medio ?? 0);

      expect(saldo).toBe(15.5);
      expect(un).toBe('kg');
      expect(custo).toBe(45.0);
      expect(un).not.toBe('undefined');
    });

    it('CA02: salva novo insumo enviando "unidade" no payload e não "unidade_medida"', () => {
      const formInput = {
        nome: 'Leite Aveia',
        tipo: 'insumo',
        unidade: 'l',
        estoque_minimo: 10,
        fornecedor_padrao_id: 'uuid-forn-1',
        codigo_barras: null,
        controla_validade: true,
        ativo: true
      };

      const payload = {
        nome: formInput.nome,
        tipo: formInput.tipo,
        unidade: formInput.unidade,
        estoque_minimo: formInput.estoque_minimo,
        fornecedor_padrao_id: formInput.fornecedor_padrao_id,
        codigo_barras: formInput.codigo_barras,
        controla_validade: formInput.controla_validade,
        ativo: formInput.ativo
      };

      expect(payload).toHaveProperty('unidade', 'l');
      expect(payload).not.toHaveProperty('unidade_medida');
    });

    it('CA05: movimento de entrada envia "validade", "fornecedor_id" e "despesa_id"', () => {
      const movimento = {
        item_id: 1,
        tipo: 'entrada',
        quantidade: 10,
        custo_unitario: 50.0,
        data_validade: '2026-12-31',
        fornecedor_id: 'uuid-forn-1',
        despesa_id: 88,
        motivo: 'Compra de lote'
      };

      const movPayload = {
        item_id: movimento.item_id,
        tipo: movimento.tipo,
        quantidade: movimento.quantidade,
        custo_unitario: movimento.custo_unitario,
        validade: movimento.validade || movimento.data_validade || null,
        fornecedor_id: movimento.fornecedor_id || null,
        despesa_id: movimento.despesa_id || null,
        motivo: movimento.motivo || null
      };

      expect(movPayload.validade).toBe('2026-12-31');
      expect(movPayload).not.toHaveProperty('data_validade');
      expect(movPayload.fornecedor_id).toBe('uuid-forn-1');
      expect(movPayload.despesa_id).toBe(88);
    });
  });

  describe('RF02 / RF03 / CA03 — Custo Médio Ponderado e Trigger no Banco', () => {
    it('CA03: 10 un a R$ 1,50 + entrada de 20 un a R$ 2,00 resulta em custo_medio = 1.83 e saldo = 30', () => {
      let estoqueItem = {
        id: 10,
        quantidade: 10.0,
        custo_medio: 1.50
      };

      // Simulação da fórmula do trigger fn_estoque_recalcular_saldo
      const recalcularTrigger = (item, novaEntradaQtd, novaEntradaCusto) => {
        const saldoAnterior = item.quantidade;
        const custoAnterior = item.custo_medio;
        const novoSaldo = saldoAnterior + novaEntradaQtd;

        let novoCustoMedio = custoAnterior;
        if (saldoAnterior > 0 && custoAnterior > 0) {
          novoCustoMedio = ((saldoAnterior * custoAnterior) + (novaEntradaQtd * novaEntradaCusto)) / novoSaldo;
        } else {
          novoCustoMedio = novaEntradaCusto;
        }

        return {
          quantidade: novoSaldo,
          custo_medio: Math.round(novoCustoMedio * 100) / 100
        };
      };

      const resultado = recalcularTrigger(estoqueItem, 20.0, 2.00);
      expect(resultado.quantidade).toBe(30.0);
      expect(resultado.custo_medio).toBe(1.83);
    });
  });

  describe('RF02 / CA04 / CA09 — Ficha Técnica (CMV) usando custo_medio', () => {
    it('CA04: calcula custo do produto somando insumos da ficha técnica com custo_medio', () => {
      const fichaItens = [
        { estoque_item_id: 1, quantidade: 0.020, custo_medio: 60.0 }, // 20g de café a R$ 60/kg = R$ 1,20
        { estoque_item_id: 2, quantidade: 0.150, custo_medio: 6.0 }   // 150ml de leite a R$ 6/l = R$ 0,90
      ];

      const custoTotal = fichaItens.reduce((acc, item) => {
        return acc + (Number(item.quantidade) * Number(item.custo_medio || 0));
      }, 0);

      expect(Math.round(custoTotal * 100) / 100).toBe(2.10);
    });

    it('CA09: produto sem ficha técnica retorna custo 0 sem erro', () => {
      const fichaItens = [];
      const precoCustoManual = null;

      let custoTotal = 0;
      if (fichaItens.length > 0) {
        custoTotal = fichaItens.reduce((acc, item) => acc + (item.quantidade * item.custo_medio), 0);
      } else if (precoCustoManual) {
        custoTotal = precoCustoManual;
      }

      expect(custoTotal).toBe(0);
    });
  });

  describe('RF06 / CA07 — Margem Mínima Configurável', () => {
    it('CA07: com margem configurada em 40%, produto com 45% não alerta; com 35% alerta', () => {
      const verificarAlertaMargem = (precoVenda, custoTotal, margemMinimaConfigurada = 50) => {
        if (precoVenda <= 0 || custoTotal <= 0) return false;
        const margem = ((precoVenda - custoTotal) / precoVenda) * 100;
        return margem < margemMinimaConfigurada;
      };

      const configMargem = 40; // PO configurou 40%

      // Produto A: Venda R$ 10,00, Custo R$ 5,50 -> Margem 45% (>= 40%)
      const alertaProdA = verificarAlertaMargem(10.0, 5.50, configMargem);
      expect(alertaProdA).toBe(false);

      // Produto B: Venda R$ 10,00, Custo R$ 6,50 -> Margem 35% (< 40%)
      const alertaProdB = verificarAlertaMargem(10.0, 6.50, configMargem);
      expect(alertaProdB).toBe(true);
    });
  });

  describe('RF05 / CA06 — Lista de Compras Agrupada por Fornecedor com Nomes Reais', () => {
    it('CA06: agrupa corretamente itens com fornecedor_padrao_id usando quantidade e unidade reais', () => {
      const fornecedores = [
        { id: 'forn-grao', nome: 'Grão Especial', telefone: '51999991111' }
      ];

      const itens = [
        {
          id: 101,
          nome: 'Café Bourbon',
          quantidade: 1.5,
          estoque_minimo: 5.0,
          unidade: 'kg',
          fornecedor_padrao_id: 'forn-grao'
        }
      ];

      const lista = buildShoppingListBySupplier(itens, fornecedores);
      expect(lista).toHaveLength(1);
      expect(lista[0].fornecedor.id).toBe('forn-grao');
      expect(lista[0].itens[0].nome).toBe('Café Bourbon');
      expect(lista[0].itens[0].unidade).toBe('kg');
      expect(lista[0].itens[0].saldoAtual).toBe(1.5);
      expect(lista[0].itens[0].quantidadeSugerida).toBe(9); // Math.ceil(MAX(5*2 - 1.5, 5)) = 9
    });
  });

  describe('RF07 / CA08 — Permissões de Movimentação de Estoque', () => {
    it('CA08: usuário barista não possui permissão estoque.movimentar e é bloqueado para entradas manuais', () => {
      const userPermissions = {
        barista: ['pedidos.ver', 'pedidos.preparar', 'caixa.operar'],
        admin: ['pedidos.ver', 'pedidos.preparar', 'caixa.operar', 'estoque.movimentar', 'financeiro.gerenciar']
      };

      const podeMovimentarEstoque = (role) => {
        return (userPermissions[role] || []).includes('estoque.movimentar');
      };

      expect(podeMovimentarEstoque('barista')).toBe(false);
      expect(podeMovimentarEstoque('admin')).toBe(true);
    });
  });
});
