/* =========================================================
   MAIN.JS — Interações da Landing Institucional
   Navbar scroll · Fade-in · Galeria
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Navbar scroll ──────────────────────────────────────── */
  const navbar = document.getElementById('navbar');

  const updateNavbar = () => {
    if (window.scrollY > 60) {
      navbar.classList.remove('navbar--transparent');
      navbar.classList.add('navbar--solid');
    } else {
      navbar.classList.add('navbar--transparent');
      navbar.classList.remove('navbar--solid');
    }
  };

  window.addEventListener('scroll', updateNavbar, { passive: true });
  updateNavbar();

  /* ── Menu mobile ────────────────────────────────────────── */
  const hamburger   = document.getElementById('hamburger');
  const mobileMenu  = document.getElementById('mobile-menu');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('open');
  });

  // Fechar ao clicar em link
  document.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('open');
    });
  });

  /* ── Hero parallax leve ─────────────────────────────────── */
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg) {
    // Aplicar Hero dinâmico se configurado no Admin
    const HERO_LS_KEY = 'cafeteria_hero_home';
    const savedHero = localStorage.getItem(HERO_LS_KEY);
    
    if (savedHero) {
      try {
        const data = JSON.parse(savedHero);
        if (data.imageDataUrl) {
          heroBg.style.backgroundImage = `url(${data.imageDataUrl})`;
          if (data.alt) heroBg.setAttribute('aria-label', data.alt);
        }
      } catch (e) {
        console.error('Erro ao carregar Hero dinâmico:', e);
      }
    }

    heroBg.classList.add('loaded');

    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      if (scrolled < window.innerHeight) {
        heroBg.style.transform = `scale(1) translateY(${scrolled * 0.25}px)`;
      }
    }, { passive: true });
  }

  /* ── Fade-in no scroll ──────────────────────────────────── */
  const fadeEls = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  fadeEls.forEach(el => observer.observe(el));

  /* ── Scroll suave para âncoras ──────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const navH = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--nav-height')) || 72;
        const top = target.getBoundingClientRect().top + window.scrollY - navH;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ── Active link no scroll ──────────────────────────────── */
  const sections  = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.navbar__link[href^="#"]');

  const highlightNav = () => {
    const scrollMid = window.scrollY + window.innerHeight / 3;
    sections.forEach(sec => {
      const top    = sec.offsetTop;
      const bottom = top + sec.offsetHeight;
      if (scrollMid >= top && scrollMid < bottom) {
        navLinks.forEach(l => l.classList.remove('nav-active'));
        const active = document.querySelector(`.navbar__link[href="#${sec.id}"]`);
        active?.classList.add('nav-active');
      }
    });
  };

  window.addEventListener('scroll', highlightNav, { passive: true });

  /* ── Galeria lightbox simples ───────────────────────────── */
  const galeriaItems = document.querySelectorAll('.galeria__item');

  if (galeriaItems.length) {
    // Criar overlay
    const overlay = document.createElement('div');
    overlay.id = 'lightbox';
    overlay.innerHTML = `
      <div class="lightbox__backdrop"></div>
      <button class="lightbox__close" aria-label="Fechar">✕</button>
      <img class="lightbox__img" src="" alt="">
    `;
    overlay.style.cssText = `
      display:none; position:fixed; inset:0; z-index:1000;
      align-items:center; justify-content:center;
    `;
    document.body.appendChild(overlay);

    // Estilo inline para o lightbox
    const style = document.createElement('style');
    style.textContent = `
      #lightbox { display: none; }
      #lightbox.open {
        display: flex !important;
        animation: lbFadeIn 0.3s ease;
      }
      .lightbox__backdrop {
        position: absolute; inset: 0;
        background: rgba(28, 16, 8, 0.9);
        backdrop-filter: blur(8px);
      }
      .lightbox__close {
        position: absolute; top: 20px; right: 24px;
        color: #FAF6EE; font-size: 24px; z-index: 2;
        cursor: pointer; background: none; border: none;
        padding: 8px; transition: opacity 0.2s;
      }
      .lightbox__close:hover { opacity: 0.7; }
      .lightbox__img {
        position: relative; z-index: 2;
        max-width: 90vw; max-height: 88vh;
        object-fit: contain; border-radius: 6px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.6);
      }
      @keyframes lbFadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);

    galeriaItems.forEach(item => {
      item.addEventListener('click', () => {
        const img = item.querySelector('img');
        if (img) {
          overlay.querySelector('.lightbox__img').src = img.src;
          overlay.querySelector('.lightbox__img').alt = img.alt;
          overlay.classList.add('open');
          document.body.style.overflow = 'hidden';
        }
      });
    });

    overlay.querySelector('.lightbox__backdrop').addEventListener('click', closeLightbox);
    overlay.querySelector('.lightbox__close').addEventListener('click', closeLightbox);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    function closeLightbox() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  /* ── Contador ano no footer ─────────────────────────────── */
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});
