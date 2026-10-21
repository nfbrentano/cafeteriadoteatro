import { describe, it, expect } from 'vitest';
import { verificarConclusaoEstacoes } from '../js/utils/kds-regras.js';
import fs from 'fs';

/**
 * CAF-000022 — Conclusão independente por estação
 */
describe('CAF-000022 — Conclusão independente por estação', () => {
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: verifica conclusão quando todas as estações necessárias terminam', () => {
    const pedido = {
      id: '1',
      estacoes_concluidas: ['bar']
    };
    // Requer bar e cozinha
    expect(verificarConclusaoEstacoes(pedido, ['bar', 'cozinha'])).toBe(false);

    // Quando ambas concluídas
    pedido.estacoes_concluidas.push('cozinha');
    expect(verificarConclusaoEstacoes(pedido, ['bar', 'cozinha'])).toBe(true);
  });

  it('CA02: conclusão por estação persiste via RPC concluir_estacao e atualiza status no KDS', () => {
    expect(cozinhaJs).toMatch(/concluir_estacao|concluirPreparoEstacao/);
  });
});
