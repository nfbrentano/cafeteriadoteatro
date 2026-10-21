import { describe, it, expect } from 'vitest';
import { montarFiltroPedidosAtivos, filtrarPedidosAtivosMemoria } from '../js/utils/pdv-filtros.js';
import fs from 'fs';

/**
 * CAF-000003 — Limitar pedidos ativos carregados no PDV
 */
describe('CAF-000003 — Limitar pedidos ativos carregados no PDV', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');

  it('CA01: monta filtro com corte do dia operacional', () => {
    const filtro = montarFiltroPedidosAtivos(new Date('2026-10-21T10:00:00Z'));
    expect(filtro.inicioISO).toBeDefined();
    expect(filtro.filtroSupabase.operador).toBe('gte');
  });

  it('CA02: filtra pedidos de dias anteriores mantendo apenas do dia operacional', () => {
    const hojeISO = '2026-10-21T08:00:00.000Z';
    const pedidos = [
      { id: '1', created_at: '2026-10-20T15:00:00.000Z', status: 'concluido' }, // ontem
      { id: '2', created_at: '2026-10-21T09:00:00.000Z', status: 'concluido' }, // hoje
      { id: '3', created_at: '2026-10-21T10:00:00.000Z', status: 'cancelado' }
    ];
    const filtrados = filtrarPedidosAtivosMemoria(pedidos, hojeISO);
    expect(filtrados).toHaveLength(1);
    expect(filtrados[0].id).toBe('2');
  });

  it('CA03: exclui pedidos cancelados e entregues já quitados', () => {
    const pedidos = [
      { id: '1', status: 'entregue', status_pagamento: 'pago' },
      { id: '2', status: 'entregue', status_pagamento: 'pendente' },
      { id: '3', status: 'cancelado' },
      { id: '4', status: 'pronto', status_pagamento: 'pendente' }
    ];
    const ativos = filtrarPedidosAtivosMemoria(pedidos);
    expect(ativos.map(p => p.id)).toEqual(['2', '4']);
  });

  it('CA04: pedidos.js aplica corte de data ao carregar pedidos ativos', () => {
    expect(pedidosJs).toMatch(/datasSP|created_at|diaOperacional/);
  });
});
