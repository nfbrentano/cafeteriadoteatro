import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000021 — Fachada interativa com carregamento sob demanda do Google Maps
 */
describe('CAF-000021 — Mapa Fachada', () => {
  const indexHtml = fs.readFileSync('index.html', 'utf8');

  it('CA01 / CA12: não inclui iframe pesado do Google Maps no carregamento inicial da página', () => {
    // Iframe não pode estar hardcoded no HTML inicial
    expect(indexHtml).not.toMatch(/<iframe[^>]*google\.com\/maps/i);
  });

  it('CA02 / CA12: possui container e botão interativo para carregar o mapa interativo sob demanda', () => {
    expect(indexHtml).toMatch(/chegar-map-container|chegar-map-load-btn/);
  });
});
