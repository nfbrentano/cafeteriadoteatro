import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CAF-000070 — Performance & Mobile UX Tests (Maps Facade, Auto-scroll & Viewport)', () => {
  it('CA01: Index HTML uses map facade and loads Google Maps iframe only on demand', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');

    // Does not load iframe statically
    expect(html).not.toContain('<iframe src="https://www.google.com/maps/embed');

    // Has static image facade and interactive button
    expect(html).toContain('id="chegar-map-img"');
    expect(html).toContain('id="chegar-map-load-btn"');
    expect(html).toContain('mapa-estatico.webp');
  });

  it('CA02: Hero carousel supports touch/swipe gestures on mobile', () => {
    const js = fs.readFileSync(path.resolve(process.cwd(), 'js/hero-carousel.js'), 'utf-8');

    expect(js).toContain('touchstart');
    expect(js).toContain('touchend');
    expect(js).toContain('SWIPE_THRESHOLD');
    expect(js).toContain('nextSlide()');
    expect(js).toContain('prevSlide()');
  });

  it('CA03: Category buttons in cardapio.css meet minimum 44px touch target height for mobile WCAG 2.5.5', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'css/cardapio.css'), 'utf-8');

    // Check media query for mobile cat-nav__btn
    const mobileBtnBlockMatch = css.match(/\.cat-nav__btn\s*\{[^}]*min-height:\s*(\d+)px/);
    expect(mobileBtnBlockMatch).not.toBeNull();
    const minHeight = parseInt(mobileBtnBlockMatch[1], 10);
    expect(minHeight).toBeGreaterThanOrEqual(44);

    // Check that scrollIntoView is used for active category
    const dynamicJs = fs.readFileSync(path.resolve(process.cwd(), 'js/cardapio-dynamic.js'), 'utf-8');
    expect(dynamicJs).toContain('scrollIntoView');
    expect(dynamicJs).toContain("inline: 'center'");
  });

  it('CA04: All public entrypoints have viewport-fit=cover configured', () => {
    const files = ['index.html', 'cardapio.html', 'admin.html', 'pedidos.html', 'totem.html', 'cozinha.html', 'retirada.html'];
    files.forEach(file => {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      expect(content).toContain('viewport-fit=cover');
    });
  });
});
