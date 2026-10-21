import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000020A — Menu flutuante do WhatsApp (Acessibilidade, link wa.me)
 */
describe('CAF-000020A — Menu Flutuante WhatsApp', () => {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const cardapioHtml = fs.readFileSync('cardapio.html', 'utf8');

  it('CA01 / CA08: botão flutuante existe em index.html com link wa.me normalizado e acessível', () => {
    expect(indexHtml).toMatch(/id="fab-whatsapp"/);
    expect(indexHtml).toMatch(/href="https:\/\/wa\.me\/55\d+/);
    expect(indexHtml).toMatch(/aria-label="Falar conosco no WhatsApp"/);
  });

  it('CA02 / CA08: botão flutuante existe em cardapio.html com link wa.me e target blank seguro', () => {
    expect(cardapioHtml).toMatch(/id="fab-whatsapp"/);
    expect(cardapioHtml).toMatch(/href="https:\/\/wa\.me\/55\d+/);
    expect(cardapioHtml).toMatch(/rel="noopener noreferrer"/);
  });
});
