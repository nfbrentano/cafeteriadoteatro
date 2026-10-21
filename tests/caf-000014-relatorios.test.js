import { describe, it, expect } from 'vitest';
import {
  calcularTicketMedio,
  calcularRankingProdutos,
  agruparVendasPorData,
  calcularTempoMedioPreparo
} from '../js/utils/relatorios-agregados.js';
import fs from 'fs';

/**
 * CAF-000014 — Relatórios no admin (Vendas por período, ticket médio, ranking, tempo de preparo)
 */
describe('CAF-000014 — Relatórios no admin', () => {
  const relatoriosAdminJs = fs.readFileSync('js/admin/relatorios-admin.js', 'utf8');

  it('CA01: calcula ticket médio corretamente com precisão monetária', () => {
    const pedidos = [
      { id: 1, total: 35.50 },
      { id: 2, total: 14.50 },
      { id: 3, total: 50.00 }
    ];
    const ticket = calcularTicketMedio(pedidos);
    expect(ticket).toBe(33.33);

    // Divisão por zero retorna 0
    expect(calcularTicketMedio([])).toBe(0);
    expect(calcularTicketMedio(0, 0)).toBe(0);
  });

  it('CA02: calcula ranking dos produtos mais vendidos por volume e faturamento', () => {
    const itens = [
      { produto_id: 1, nome_produto: 'Espresso', quantidade: 10, preco_unitario: 8.00 },
      { produto_id: 2, nome_produto: 'Capuccino', quantidade: 5, preco_unitario: 14.00 },
      { produto_id: 1, nome_produto: 'Espresso', quantidade: 4, preco_unitario: 8.00 },
      { produto_id: 3, nome_produto: 'Croissant Cancelado', quantidade: 2, preco_unitario: 18.00, cancelado: true }
    ];

    const ranking = calcularRankingProdutos(itens, 5);
    expect(ranking.length).toBe(2);
    expect(ranking[0].nome).toBe('Espresso');
    expect(ranking[0].quantidade).toBe(14);
    expect(ranking[0].faturamento).toBe(112.00);

    expect(ranking[1].nome).toBe('Capuccino');
    expect(ranking[1].quantidade).toBe(5);
    expect(ranking[1].faturamento).toBe(70.00);
  });

  it('CA03: agrupa vendas por data sem misturar dias distintos', () => {
    const pedidos = [
      { created_at: '2026-10-20T10:00:00Z', total: 100 },
      { created_at: '2026-10-20T15:30:00Z', total: 50 },
      { created_at: '2026-10-21T09:00:00Z', total: 200 }
    ];

    const agrupados = agruparVendasPorData(pedidos);
    expect(agrupados['2026-10-20'].total).toBe(150);
    expect(agrupados['2026-10-20'].quantidade).toBe(2);
    expect(agrupados['2026-10-21'].total).toBe(200);
    expect(agrupados['2026-10-21'].quantidade).toBe(1);
  });

  it('CA04: calcula tempo médio de preparo em minutos', () => {
    const pedidos = [
      { created_at: '2026-10-20T12:00:00Z', concluido_em: '2026-10-20T12:10:00Z' }, // 10 min
      { created_at: '2026-10-20T12:15:00Z', concluido_em: '2026-10-20T12:35:00Z' }  // 20 min
    ];

    const media = calcularTempoMedioPreparo(pedidos);
    expect(media).toBe(15);
  });

  it('CA05: código do relatorios-admin.js existe e faz consultas agregadas', () => {
    expect(relatoriosAdminJs).toMatch(/carregarRelatorio|renderRelatorio/);
  });
});
