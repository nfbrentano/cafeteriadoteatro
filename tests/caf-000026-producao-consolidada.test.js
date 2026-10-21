import { describe, it, expect } from 'vitest';
import { consolidarProducao } from '../js/utils/kds-regras.js';

/**
 * CAF-000026 — Visão consolidada de produção
 */
describe('CAF-000026 — Visão consolidada de produção', () => {
  it('CA01: consolida quantidades totais por produto de pedidos ativos', () => {
    const pedidos = [
      {
        id: '1',
        status: 'em_preparo',
        itens: [
          { produto_nome: 'Cappuccino', quantidade: 2 },
          { produto_nome: 'Pão de Queijo', quantidade: 1 }
        ]
      },
      {
        id: '2',
        status: 'pendente',
        itens: [
          { produto_nome: 'Cappuccino', quantidade: 1 }
        ]
      }
    ];

    const consolidado = consolidarProducao(pedidos);
    expect(consolidado).toHaveLength(2);
    expect(consolidado[0].nome).toBe('Cappuccino');
    expect(consolidado[0].quantidade).toBe(3);
    expect(consolidado[0].pedidos).toEqual(['1', '2']);
  });

  it('CA02: ignora itens já prontos ou cancelados na consolidação', () => {
    const pedidos = [
      {
        id: '1',
        status: 'em_preparo',
        itens: [
          { produto_nome: 'Espresso', quantidade: 2, cancelado: true },
          { produto_nome: 'Espresso', quantidade: 1, pronto_em: '2026-10-21T10:00:00Z' },
          { produto_nome: 'Espresso', quantidade: 3, cancelado: false, pronto_em: null }
        ]
      }
    ];

    const consolidado = consolidarProducao(pedidos);
    expect(consolidado).toHaveLength(1);
    expect(consolidado[0].quantidade).toBe(3);
  });
});
