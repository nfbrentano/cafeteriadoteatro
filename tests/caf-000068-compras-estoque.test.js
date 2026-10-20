import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateSuggestedPurchaseQuantity,
  calculateUnitPrice,
  buildShoppingListBySupplier,
  formatSupplierWhatsAppOrder,
  getWhatsAppShareUrl,
  buildStockPayableExpensePayload
} from '../js/utils/stock-purchase.js';

describe('CAF-000068: Lista de Compras por Fornecedor e Entrada Integrada ao Contas a Pagar', () => {
  describe('Cálculo de quantidade sugerida de reposição', () => {
    it('deve calcular MAX(minimo * 2 - atual, minimo) quando estoque <= minimo', () => {
      // Ex: minimo 10, atual 2 -> 10 * 2 - 2 = 18
      expect(calculateSuggestedPurchaseQuantity(2, 10)).toBe(18);

      // Ex: minimo 10, atual 0 -> 10 * 2 - 0 = 20
      expect(calculateSuggestedPurchaseQuantity(0, 10)).toBe(20);

      // Ex: minimo 5, atual 5 -> 5 * 2 - 5 = 5
      expect(calculateSuggestedPurchaseQuantity(5, 5)).toBe(5);
    });

    it('deve retornar 0 quando estoque está acima do mínimo', () => {
      expect(calculateSuggestedPurchaseQuantity(12, 10)).toBe(0);
      expect(calculateSuggestedPurchaseQuantity(25, 5)).toBe(0);
    });

    it('deve lidar com valores negativos ou zerados com segurança', () => {
      expect(calculateSuggestedPurchaseQuantity(-3, 10)).toBe(20);
      expect(calculateSuggestedPurchaseQuantity(0, 0)).toBe(1);
    });
  });

  describe('Cálculo de custo unitário', () => {
    it('deve calcular o custo unitário corretamente', () => {
      // 10 kg por R$ 650,00 -> R$ 65,00/kg
      expect(calculateUnitPrice(650, 10)).toBe(65);
      // 3 unidades por R$ 10,00 -> R$ 3,33/un
      expect(calculateUnitPrice(10, 3)).toBe(3.33);
    });

    it('deve retornar 0 quando quantidade ou custo forem inválidos', () => {
      expect(calculateUnitPrice(0, 10)).toBe(0);
      expect(calculateUnitPrice(100, 0)).toBe(0);
      expect(calculateUnitPrice(-50, 5)).toBe(0);
    });
  });

  describe('Agrupamento da lista de compras por fornecedor (CA01, CA02)', () => {
    const fornecedores = [
      { id: 'forn-1', nome: 'Distribuidora Grão Nobre', telefone: '51999991111' },
      { id: 'forn-2', nome: 'Laticínios da Serra', telefone: '51988882222' }
    ];

    const itens = [
      { id: 1, nome: 'Café Especial Grãos', saldo_atual: 2, estoque_minimo: 10, unidade_medida: 'kg', fornecedor_padrao_id: 'forn-1' },
      { id: 2, nome: 'Leite Integral Tipo A', saldo_atual: 3, estoque_minimo: 12, unidade_medida: 'l', fornecedor_padrao_id: 'forn-2' },
      { id: 3, nome: 'Copo Descartável 180ml', saldo_atual: 50, estoque_minimo: 100, unidade_medida: 'un', fornecedor_padrao_id: null },
      { id: 4, nome: 'Açúcar Orgânico', saldo_atual: 20, estoque_minimo: 5, unidade_medida: 'kg', fornecedor_padrao_id: 'forn-1' } // Estoque ok, não deve entrar
    ];

    it('deve filtrar itens com estoque <= estoque_minimo e agrupar por fornecedor', () => {
      const shoppingList = buildShoppingListBySupplier(itens, fornecedores);

      expect(shoppingList).toHaveLength(3);

      const grupoGrao = shoppingList.find(g => g.fornecedor.id === 'forn-1');
      expect(grupoGrao).toBeDefined();
      expect(grupoGrao.itens).toHaveLength(1);
      expect(grupoGrao.itens[0].nome).toBe('Café Especial Grãos');
      expect(grupoGrao.itens[0].quantidadeSugerida).toBe(18); // 10 * 2 - 2

      const grupoLaticinios = shoppingList.find(g => g.fornecedor.id === 'forn-2');
      expect(grupoLaticinios).toBeDefined();
      expect(grupoLaticinios.itens[0].nome).toBe('Leite Integral Tipo A');
      expect(grupoLaticinios.itens[0].quantidadeSugerida).toBe(21); // 12 * 2 - 3

      const grupoSemFornecedor = shoppingList.find(g => !g.fornecedor.id);
      expect(grupoSemFornecedor).toBeDefined();
      expect(grupoSemFornecedor.itens[0].nome).toBe('Copo Descartável 180ml');
    });
  });

  describe('Formatação de mensagem para WhatsApp do fornecedor (CA02)', () => {
    it('deve montar texto claro com nome, quantidades e unidades', () => {
      const items = [
        { nome: 'Café Especial Grãos', quantidadeSugerida: 18, unidade: 'kg', saldoAtual: 2 },
        { nome: 'Café Descafeinado', quantidadeSugerida: 5, unidade: 'kg', saldoAtual: 0 }
      ];

      const text = formatSupplierWhatsAppOrder('Distribuidora Grão Nobre', items);
      expect(text).toContain('Cafeteria do Teatro Univates');
      expect(text).toContain('Distribuidora Grão Nobre');
      expect(text).toContain('18 kg');
      expect(text).toContain('Café Especial Grãos');
      expect(text).toContain('5 kg');
    });

    it('deve gerar link wa.me com número e texto codificado', () => {
      const url = getWhatsAppShareUrl('51 99999-1111', 'Olá pedido');
      expect(url).toContain('https://wa.me/51999991111?text=Ol%C3%A1%20pedido');
    });
  });

  describe('Construção de despesa em Contas a Pagar na Entrada de Estoque (CA03, CA04, CA05)', () => {
    it('deve construir payload completo de despesa quando marcado para lançar no financeiro', () => {
      const payload = buildStockPayableExpensePayload({
        itemNome: 'Café em Grãos',
        quantidade: 10,
        unidade: 'kg',
        custoTotal: 650.00,
        fornecedorId: 'forn-1',
        vencimento: '2026-11-05',
        pagoHoje: false,
        categoriaId: 8,
        estoqueMovimentoId: 101
      });

      expect(payload.descricao).toBe('Entrada Estoque: 10 kg - Café em Grãos');
      expect(payload.valor).toBe(650.00);
      expect(payload.fornecedor_id).toBe('forn-1');
      expect(payload.categoria_id).toBe(8);
      expect(payload.vencimento).toBe('2026-11-05');
      expect(payload.pago_em).toBeNull();
      expect(payload.origem).toBe('estoque');
      expect(payload.estoque_movimento_id).toBe(101);
    });

    it('deve registrar pago_em e valor_pago se o gestor já pagou hoje', () => {
      const payload = buildStockPayableExpensePayload({
        itemNome: 'Leite',
        quantidade: 12,
        unidade: 'l',
        custoTotal: 72.00,
        pagoHoje: true
      });

      expect(payload.pago_em).not.toBeNull();
      expect(payload.valor_pago).toBe(72.00);
      expect(payload.forma_pagamento).toBe('pix');
    });
  });
});
