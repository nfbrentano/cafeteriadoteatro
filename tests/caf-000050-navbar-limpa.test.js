import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000050 — Navbar limpa e sem botões redundantes
 */
describe('CAF-000050 — Navbar Limpa', () => {
  const indexHtml = fs.readFileSync('index.html', 'utf8');

  it('CA01 / CA02: navbar superior não possui o botão redundante nav-btn-cardapio', () => {
    expect(indexHtml).not.toMatch(/id="nav-btn-cardapio"/);
  });

  it('CA02: links principais da navbar possuem navegação semântica', () => {
    expect(indexHtml).toMatch(/<nav[^>]*class="[^"]*nav[^"]*"[^>]*>/i);
  });
});
