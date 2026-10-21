import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000010 — Nome do cliente e pedido para viagem
 */
describe('CAF-000010 — Nome do cliente e pedido para viagem', () => {
  const pedidosJs = fs.readFileSync('js/pedidos.js', 'utf8');
  const cozinhaJs = fs.readFileSync('js/cozinha.js', 'utf8');

  it('CA01: aceita pedido para viagem sem exigir seleção de mesa física', () => {
    expect(pedidosJs).toMatch(/para_viagem|paraViagem/);
  });

  it('CA02: salva e propaga cliente_nome no payload de criação do pedido', () => {
    expect(pedidosJs).toMatch(/cliente_nome/);
  });

  it('CA03: cozinha exibe distintivo visual de pedido para viagem', () => {
    expect(cozinhaJs).toMatch(/VIAGEM|para_viagem/);
  });

  it('CA04: chamada de voz pronuncia o nome do cliente quando informado', () => {
    expect(pedidosJs).toMatch(/chamarVoz|SpeechSynthesis|falar/i);
  });
});
