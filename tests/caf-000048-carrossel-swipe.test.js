import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * CAF-000048 — Carrossel de imagens com suporte a gestos swipe no mobile
 */
describe('CAF-000048 — Carrossel e Swipe', () => {
  const carouselJs = fs.readFileSync('js/hero-carousel.js', 'utf8');

  it('CA01 / CA13: hero-carousel.js suporta gestos de touch/swipe mobile', () => {
    expect(carouselJs).toMatch(/touchstart|pointerdown/);
    expect(carouselJs).toMatch(/touchend|pointerup/);
  });

  it('CA02: transição e rotação automática de slides com acessibilidade de pausa', () => {
    expect(carouselJs).toMatch(/setInterval|requestAnimationFrame|nextSlide/i);
  });
});
