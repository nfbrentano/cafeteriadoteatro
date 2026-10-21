import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000040 — Totem de autoatendimento no balcão
 */
describe('CAF-000040 — Totem de Autoatendimento', () => {
  const totemJs = fs.readFileSync('js/totem.js', 'utf8');
  const totemHtml = fs.readFileSync('totem.html', 'utf8');

  it('CA01 / CA12: totem.html possui estrutura de categorias, carrinho, tela de descanso e tela de sucesso', () => {
    expect(totemHtml).toMatch(/id="totem-idle-screen"/);
    expect(totemHtml).toMatch(/id="totem-cart-total"/);
    expect(totemHtml).toMatch(/id="totem-modal-checkout"/);
    expect(totemHtml).toMatch(/id="totem-success-screen"/);
    expect(totemHtml).toMatch(/id="totem-success-senha"/);
  });

  it('CA02 / CA12: gerencia inatividade com descanso em 60s e reset de carrinho em 90s', () => {
    expect(totemJs).toMatch(/IDLE_TIMEOUT_MS\s*=\s*60\s*\*\s*1000/);
    expect(totemJs).toMatch(/CLEAR_CART_TIMEOUT_MS\s*=\s*90\s*\*\s*1000/);
    expect(totemJs).toMatch(/limparCarrinhoSilencioso|fecharTodosModais/);
  });

  it('CA03 / CA12: bloqueia menu de contexto para modo quiosque seguro', () => {
    expect(totemJs).toMatch(/contextmenu/);
    expect(totemJs).toMatch(/preventDefault/);
  });
});
