import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  agruparPorEstacao,
  calcularSemaforo,
  verificarConclusaoEstacoes,
  ordenarFilaKDS,
  consolidarProducao
} from '../js/utils/kds-regras.js';
import { ImpressaoTrava } from '../js/utils/impressao-trava.js';

// Setup de ambiente global para pedido-print.js
if (!globalThis.window) {
  globalThis.window = globalThis;
}
window.escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

import '../js/pedido-print.js';

/**
 * CAF-000096 — Cobertura de Testes Unitários: KDS da Cozinha, Bar e Impressão Térmica
 */
describe('CAF-000096 — KDS da Cozinha, Bar e Impressão Térmica', () => {
  let printSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Filtragem e Segregação de Estações de Produção', () => {
    const pedidoMisto = {
      id: 501,
      itens: [
        { id: 1, nome: 'Cappuccino Italiano', estacao: 'bar', quantidade: 1, status: 'pendente' },
        { id: 2, nome: 'Omelete de Queijo e Bacon', estacao: 'cozinha', quantidade: 1, status: 'pendente' },
        { id: 3, nome: 'Soda Italiana Maçã Verde', estacao: 'bar', quantidade: 2, status: 'pendente' }
      ]
    };

    it('CA01 / RF01: filtragem para a estação "Bar" exibe apenas itens de bar', () => {
      const grupos = agruparPorEstacao(pedidoMisto.itens);
      expect(grupos.bar).toHaveLength(2);
      expect(grupos.bar.map(i => i.nome)).toEqual(['Cappuccino Italiano', 'Soda Italiana Maçã Verde']);
      expect(grupos.bar.every(i => i.estacao === 'bar')).toBe(true);
    });

    it('CA02 / RF01: filtragem para a estação "Cozinha" exibe apenas itens de cozinha', () => {
      const grupos = agruparPorEstacao(pedidoMisto.itens);
      expect(grupos.cozinha).toHaveLength(1);
      expect(grupos.cozinha[0].nome).toBe('Omelete de Queijo e Bacon');
      expect(grupos.cozinha[0].estacao).toBe('cozinha');
    });

    it('CA03 / RF02: transição de status item a item de pendente -> preparando -> pronto', () => {
      const item = {
        id: 10,
        nome: 'Croissant Recheado',
        status: 'pendente',
        iniciado_em: null,
        pronto_em: null
      };

      function transitarStatusItem(itemRef, novoStatus, timestamp = new Date().toISOString()) {
        const transicoesValidas = {
          pendente: ['preparando', 'cancelado'],
          preparando: ['pronto', 'cancelado'],
          pronto: ['entregue']
        };

        const permitidos = transicoesValidas[itemRef.status] || [];
        if (!permitidos.includes(novoStatus)) {
          throw new Error(`Transição inválida de ${itemRef.status} para ${novoStatus}`);
        }

        itemRef.status = novoStatus;
        if (novoStatus === 'preparando') itemRef.iniciado_em = timestamp;
        if (novoStatus === 'pronto') itemRef.pronto_em = timestamp;
        return itemRef;
      }

      // Transita para preparando
      transitarStatusItem(item, 'preparando', '2026-10-22T10:00:00Z');
      expect(item.status).toBe('preparando');
      expect(item.iniciado_em).toBe('2026-10-22T10:00:00Z');
      expect(item.pronto_em).toBeNull();

      // Transita para pronto
      transitarStatusItem(item, 'pronto', '2026-10-22T10:08:00Z');
      expect(item.status).toBe('pronto');
      expect(item.pronto_em).toBe('2026-10-22T10:08:00Z');

      // Tentar voltar para pendente deve falhar
      expect(() => transitarStatusItem(item, 'pendente')).toThrow('Transição inválida');
    });

    it('CA04 / RF03: pedido misto só vai para pronto quando todas as suas estações concluírem', () => {
      const pedido = {
        id: 'PED-999',
        estacoes_concluidas: ['bar'],
        status: 'em_preparo'
      };

      const estacoesExigidas = ['bar', 'cozinha'];

      // Apenas o bar terminou: pedido ainda NÃO está concluído
      expect(verificarConclusaoEstacoes(pedido, estacoesExigidas)).toBe(false);

      function atualizarStatusPedido(p, estacoes) {
        const pronto = verificarConclusaoEstacoes(p, estacoes);
        p.status = pronto ? 'pronto_para_servir' : 'em_preparo';
        return p.status;
      }

      expect(atualizarStatusPedido(pedido, estacoesExigidas)).toBe('em_preparo');

      // Cozinha conclui sua estação
      pedido.estacoes_concluidas.push('cozinha');
      expect(verificarConclusaoEstacoes(pedido, estacoesExigidas)).toBe(true);
      expect(atualizarStatusPedido(pedido, estacoesExigidas)).toBe('pronto_para_servir');
    });

    it('CA05 / RF04: semáforo de tempo alvo sinaliza verde, amarelo e vermelho (estourado)', () => {
      const agora = new Date('2026-10-22T12:00:00Z').getTime();
      const tempoAlvoMin = 15;

      // 1. Lançado há 5 minutos (< 70% de 15 min = < 10.5 min) => Verde
      const criado5MinAtras = new Date(agora - 5 * 60000).toISOString();
      const sVerde = calcularSemaforo(criado5MinAtras, tempoAlvoMin, { agora });
      expect(sVerde.cor).toBe('verde');
      expect(sVerde.atrasado).toBe(false);
      expect(sVerde.decorridoMin).toBe(5);

      // 2. Lançado há 12 minutos (entre 10.5 e 15 min) => Amarelo
      const criado12MinAtras = new Date(agora - 12 * 60000).toISOString();
      const sAmarelo = calcularSemaforo(criado12MinAtras, tempoAlvoMin, { agora });
      expect(sAmarelo.cor).toBe('amarelo');
      expect(sAmarelo.atrasado).toBe(false);
      expect(sAmarelo.decorridoMin).toBe(12);

      // 3. Lançado há 17 minutos (> 15 min) => Vermelho e atrasado
      const criado17MinAtras = new Date(agora - 17 * 60000).toISOString();
      const sVermelho = calcularSemaforo(criado17MinAtras, tempoAlvoMin, { agora });
      expect(sVermelho.cor).toBe('vermelho');
      expect(sVermelho.atrasado).toBe(true);
      expect(sVermelho.decorridoMin).toBe(17);
    });
  });

  describe('2. Formatação de Impressão Térmica e Trava de Duplicidade', () => {
    it('CA06 / RF05 / RNF01: formatação de comanda térmica para 80mm com cabeçalho e mesa/viagem', () => {
      expect(window.cafeteriaPrint).toBeDefined();

      const pedidoViagem = {
        id: 77,
        numero_pedido: 104,
        mesa_codigo: 'BALCAO',
        para_viagem: true,
        cliente_nome: 'Mariana Lima',
        total: 32.50,
        status_pagamento: 'pago',
        forma_pagamento: 'pix'
      };

      const itens = [
        {
          quantidade: 2,
          nome_produto: 'Pão de Queijo Canastra',
          preco_unitario: 6.50
        },
        {
          quantidade: 1,
          nome_produto: 'Café Coado V60',
          preco_unitario: 12.00
        }
      ];

      // Espiona o método interno ou renderiza simulando o print
      let capturedHtml = '';
      const iframeMock = {
        contentWindow: {
          document: {
            open: vi.fn(),
            write: vi.fn((html) => { capturedHtml = html; }),
            close: vi.fn()
          },
          focus: vi.fn(),
          print: vi.fn()
        }
      };

      vi.spyOn(document, 'getElementById').mockReturnValue(iframeMock);

      window.cafeteriaPrint.printPedido(pedidoViagem, itens, { estacao: 'cozinha' });

      expect(capturedHtml).toContain('CAFETERIA DO TEATRO');
      expect(capturedHtml).toContain('COMANDA — COZINHA');
      expect(capturedHtml).toContain('🥡 VIAGEM');
      expect(capturedHtml).toContain('Mariana Lima');
      expect(capturedHtml).toContain('#104');
      expect(capturedHtml).toContain('Pão de Queijo Canastra');
      expect(capturedHtml).toContain('Café Coado V60');
      expect(capturedHtml).toContain('PAGO ✅');
    });

    it('CA07 / RF05: itens com adicionais e observações aparecem indentados na comanda', () => {
      const pedido = {
        id: 88,
        numero_pedido: 105,
        mesa_codigo: 'MESA 02',
        para_viagem: false,
        total: 18.00,
        status_pagamento: 'pendente'
      };

      const itens = [
        {
          quantidade: 1,
          nome_produto: 'Latte Macchiato',
          preco_unitario: 14.00,
          pedido_item_adicionais: [
            { nome_adicional: 'Xarope de Baunilha' }
          ],
          observacoes: 'Extra quente e sem canela'
        }
      ];

      let capturedHtml = '';
      const iframeMock = {
        contentWindow: {
          document: {
            open: vi.fn(),
            write: vi.fn((html) => { capturedHtml = html; }),
            close: vi.fn()
          },
          focus: vi.fn(),
          print: vi.fn()
        }
      };

      vi.spyOn(document, 'getElementById').mockReturnValue(iframeMock);

      window.cafeteriaPrint.printPedido(pedido, itens, { estacao: 'bar' });

      expect(capturedHtml).toContain('COMANDA — BAR');
      expect(capturedHtml).toContain('+ Xarope de Baunilha');
      expect(capturedHtml).toContain('↳ Obs: Extra quente e sem canela');
    });

    it('CA08 / RF06: trava de impressão impede impressão automática duplicada na mesma estação', () => {
      const trava = new ImpressaoTrava();
      const pedidoId = 1234;

      // Primeira tentativa na estação Bar -> DEVE imprimir
      expect(trava.deveImprimirAutomatico(pedidoId, 'bar')).toBe(true);
      expect(trava.estaImpresso(pedidoId, 'bar')).toBe(true);

      // Segunda tentativa automática na estação Bar -> DEVE BLOQUEAR
      expect(trava.deveImprimirAutomatico(pedidoId, 'bar')).toBe(false);

      // Estação Cozinha para o mesmo pedido ainda não foi impressa -> DEVE imprimir
      expect(trava.estaImpresso(pedidoId, 'cozinha')).toBe(false);
      expect(trava.deveImprimirAutomatico(pedidoId, 'cozinha')).toBe(true);

      // Reimprissão manual forçada -> DEVE PERMITIR
      expect(trava.deveImprimirAutomatico(pedidoId, 'bar', true)).toBe(true);

      // Limpeza da trava permite nova impressão automática
      trava.limpar(pedidoId, 'bar');
      expect(trava.estaImpresso(pedidoId, 'bar')).toBe(false);
      expect(trava.deveImprimirAutomatico(pedidoId, 'bar')).toBe(true);
    });
  });
});
