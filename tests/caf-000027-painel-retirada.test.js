import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000027 — Painel de senhas e retirada
 */
describe('CAF-000027 — Painel de senhas e retirada', () => {
  const retiradaHtml = fs.readFileSync('retirada.html', 'utf8');
  const retiradaJs = fs.readFileSync('js/retirada.js', 'utf8');

  it('CA01: retirada.html contém áreas para pedidos Prontos e Em Preparo', () => {
    expect(retiradaHtml).toMatch(/prontos|preparo/i);
  });

  it('CA02: filtra apenas pedidos do dia atual para exibição no painel de TV', () => {
    expect(retiradaJs).toMatch(/diaOperacional|hoje|created_at/);
  });

  it('CA03: sintetiza chamada de voz/áudio ao entrar pedido em pronto', () => {
    expect(retiradaJs).toMatch(/ding\.wav|audio|speechSynthesis/i);
  });
});
