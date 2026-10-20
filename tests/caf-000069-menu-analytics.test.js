import { describe, it, expect, vi } from 'vitest';
import {
  calculateConversionRate,
  buildFunnelData,
  calculateProductConversionMetrics,
  trackMenuEvent
} from '../js/utils/menu-analytics.js';

describe('CAF-000069: Menu Analytics — Funil de Conversão e Desempenho de Produtos', () => {
  describe('Cálculo de taxa de conversão', () => {
    it('deve calcular a taxa percentual corretamente', () => {
      expect(calculateConversionRate(50, 100)).toBe(50);
      expect(calculateConversionRate(1, 3)).toBe(33.3);
      expect(calculateConversionRate(10, 20)).toBe(50);
    });

    it('deve retornar 0 quando base ou converted forem zero ou negativos', () => {
      expect(calculateConversionRate(0, 100)).toBe(0);
      expect(calculateConversionRate(50, 0)).toBe(0);
      expect(calculateConversionRate(-10, 50)).toBe(0);
    });
  });

  describe('Agregação do funil de conversão (CA01, CA03)', () => {
    const mockEventos = [
      { tipo_evento: 'sessao_cardapio', total_eventos: 1000 },
      { tipo_evento: 'view_item', total_eventos: 600 },
      { tipo_evento: 'add_to_cart', total_eventos: 300 },
      { tipo_evento: 'begin_checkout', total_eventos: 180 },
      { tipo_evento: 'purchase', total_eventos: 150 }
    ];

    it('deve montar as 5 etapas com totais e taxas de passagem', () => {
      const funnel = buildFunnelData(mockEventos);

      expect(funnel.etapas).toHaveLength(5);
      expect(funnel.etapas[0].chave).toBe('sessao_cardapio');
      expect(funnel.etapas[0].total).toBe(1000);
      expect(funnel.etapas[0].taxaPasso).toBe(100);

      expect(funnel.etapas[1].chave).toBe('view_item');
      expect(funnel.etapas[1].total).toBe(600);
      expect(funnel.etapas[1].taxaPasso).toBe(60); // 600 / 1000 = 60%

      expect(funnel.etapas[2].chave).toBe('add_to_cart');
      expect(funnel.etapas[2].total).toBe(300);
      expect(funnel.etapas[2].taxaPasso).toBe(50); // 300 / 600 = 50%

      expect(funnel.etapas[3].chave).toBe('begin_checkout');
      expect(funnel.etapas[3].total).toBe(180);
      expect(funnel.etapas[3].taxaPasso).toBe(60); // 180 / 300 = 60%

      expect(funnel.etapas[4].chave).toBe('purchase');
      expect(funnel.etapas[4].total).toBe(150);
      expect(funnel.etapas[4].taxaPasso).toBe(83.3); // 150 / 180 = 83.3%

      expect(funnel.conversaoGeral).toBe(15); // 150 / 1000 = 15%
    });

    it('deve lidar com lista de eventos vazia com segurança', () => {
      const funnel = buildFunnelData([]);
      expect(funnel.etapas[0].total).toBe(0);
      expect(funnel.conversaoGeral).toBe(0);
    });
  });

  describe('Desempenho de produtos e diagnóstico de conversão (CA04)', () => {
    const produtos = [
      { id: 1, nome: 'Café Espresso', categoria_nome: 'Cafés' },
      { id: 2, nome: 'Torta de Nozes Especial', categoria_nome: 'Doces' },
      { id: 3, nome: 'Suco Natural', categoria_nome: 'Bebidas' },
      { id: 4, nome: 'Croissant Recheado', categoria_nome: 'Salgados' }
    ];

    const eventos = [
      // Café Espresso: 10 views, 6 adds (60% conversao) -> Alta conversao
      { tipo_evento: 'view_item', produto_id: 1, total_eventos: 10 },
      { tipo_evento: 'add_to_cart', produto_id: 1, total_eventos: 6 },

      // Torta de Nozes: 20 views, 2 adds (10% conversao) -> Muito visto, pouco comprado
      { tipo_evento: 'view_item', produto_id: 2, total_eventos: 20 },
      { tipo_evento: 'add_to_cart', produto_id: 2, total_eventos: 2 },

      // Suco Natural: 10 views, 3 adds (30% conversao) -> Equilibrado
      { tipo_evento: 'view_item', produto_id: 3, total_eventos: 10 },
      { tipo_evento: 'add_to_cart', produto_id: 3, total_eventos: 3 },

      // Croissant: 2 views, 1 add -> Pouca amostragem
      { tipo_evento: 'view_item', produto_id: 4, total_eventos: 2 },
      { tipo_evento: 'add_to_cart', produto_id: 4, total_eventos: 1 }
    ];

    it('deve diagnosticar alta conversão para produtos com taxa >= 50%', () => {
      const metrics = calculateProductConversionMetrics(eventos, produtos);
      const espresso = metrics.find(p => p.id === 1);
      expect(espresso.taxaConversao).toBe(60);
      expect(espresso.status).toBe('alta_conversao');
      expect(espresso.statusLabel).toContain('Alta conversão');
    });

    it('deve diagnosticar "Muito visto, pouco comprado" para itens com muitas views e taxa < 20%', () => {
      const metrics = calculateProductConversionMetrics(eventos, produtos);
      const torta = metrics.find(p => p.id === 2);
      expect(torta.views).toBe(20);
      expect(torta.taxaConversao).toBe(10);
      expect(torta.status).toBe('muito_visto_pouco_comprado');
      expect(torta.statusLabel).toContain('Muito visto, pouco comprado');
    });

    it('deve diagnosticar itens equilibrados e pouca amostragem', () => {
      const metrics = calculateProductConversionMetrics(eventos, produtos);
      const suco = metrics.find(p => p.id === 3);
      expect(suco.status).toBe('equilibrado');

      const croissant = metrics.find(p => p.id === 4);
      expect(croissant.status).toBe('pouca_amostragem');
    });
  });

  describe('Disparo não-bloqueante de telemetria (CA01, RNF01)', () => {
    it('deve chamar RPC sem interromper se o supabase responder com sucesso', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: null })
      };

      await trackMenuEvent(mockSupabase, {
        canal: 'totem',
        tipoEvento: 'view_item',
        produtoId: 42,
        produtoNome: 'Capuccino'
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('registrar_evento_cardapio', {
        p_canal: 'totem',
        p_tipo_evento: 'view_item',
        p_produto_id: 42,
        p_data: expect.any(String)
      });
    });

    it('não deve lançar erro nem interromper fluxo caso o Supabase falhe ou esteja offline (RNF01)', async () => {
      const mockSupabaseErro = {
        rpc: vi.fn().mockRejectedValue(new Error('Network offline or adblocker'))
      };

      // Não deve lançar exceção
      await expect(
        trackMenuEvent(mockSupabaseErro, {
          canal: 'mesa',
          tipoEvento: 'add_to_cart',
          produtoId: 99
        })
      ).resolves.not.toThrow();
    });

    it('deve funcionar mesmo se o cliente supabase for nulo', async () => {
      await expect(
        trackMenuEvent(null, {
          canal: 'vitrine',
          tipoEvento: 'sessao_cardapio'
        })
      ).resolves.not.toThrow();
    });
  });
});
