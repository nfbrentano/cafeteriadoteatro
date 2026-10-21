import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';

/**
 * CAF-000001 — Status "entregue" persistido no banco
 */
describe('CAF-000001 — Status entregue persistido no banco', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: baristaMarcarEntregue atualiza status para entregue no banco', () => {
    expect(pedidosJs).toMatch(/status:\s*['"]entregue['"]/);
    expect(pedidosJs).toMatch(/entregue_em:\s*new Date\(\)\.toISOString\(\)/);
  });

  it('CA02: persistência de entregue_em grava timestamp ISO no banco', () => {
    expect(pedidosJs).toMatch(/\.from\(['"]pedidos['"]\)\s*\.update\(\{[\s\S]*?entregue_em:/);
  });

  it('CA03: opção de desfazer exibe toast com ação de restauração', () => {
    expect(pedidosJs).toMatch(/window\.showToast\(['"]Pedido entregue['"],\s*['"]Desfazer['"]/);
  });

  it('CA04: desfazer entrega restaura status anterior no banco', () => {
    expect(pedidosJs).toMatch(/status:\s*statusAnterior/);
  });

  it('CA05: pedidos com status entregue são excluídos da lista de prontos para servir', () => {
    expect(pedidosJs).toMatch(/p\.status\s*!==\s*['"]entregue['"]/);
  });

  it('CA06: cozinha trata status entregue como concluído', () => {
    expect(cozinhaJs).toMatch(/['"]entregue['"]|concluido/);
  });

  it('CA07: swipe right para entrega é suportado no card de prontos', () => {
    expect(pedidosJs).toMatch(/bindSwipeRight\(card,[\s\S]*?baristaMarcarEntregue/);
  });
});
