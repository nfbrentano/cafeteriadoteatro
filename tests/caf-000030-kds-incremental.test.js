import { describe, it, expect } from 'vitest';
import { calcularDiffKDS } from '../js/utils/kds-patch.js';

/**
 * CAF-000030 — Atualização incremental do KDS
 */
describe('CAF-000030 — Atualização incremental do KDS', () => {
  it('CA01: identifica cards inseridos, atualizados e removidos sem re-renderizar todos', () => {
    const antigos = [
      { id: '1', status: 'em_preparo', itens: [1, 2] },
      { id: '2', status: 'pendente', itens: [1] }
    ];

    const novos = [
      { id: '1', status: 'concluido', itens: [1, 2] }, // mudou status
      { id: '3', status: 'pendente', itens: [1] }        // inserido (pedido 2 removido)
    ];

    const diff = calcularDiffKDS(antigos, novos);
    expect(diff.inseridos).toHaveLength(1);
    expect(diff.inseridos[0].id).toBe('3');

    expect(diff.atualizados).toHaveLength(1);
    expect(diff.atualizados[0].id).toBe('1');

    expect(diff.removidos).toHaveLength(1);
    expect(diff.removidos[0].id).toBe('2');
  });

  it('CA02: detecta que nada mudou quando arrays são idênticos', () => {
    const pedidos = [{ id: '1', status: 'pendente', itens: [1] }];
    const diff = calcularDiffKDS(pedidos, pedidos);
    expect(diff.inseridos).toHaveLength(0);
    expect(diff.atualizados).toHaveLength(0);
    expect(diff.removidos).toHaveLength(0);
    expect(diff.totalSemMudanca).toBe(1);
  });
});
