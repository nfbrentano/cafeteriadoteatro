/* =========================================================
   MAIN.JS — Interações da Interface Institucional
   Navbar scroll · Menu mobile · Lightbox · Animações
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Navbar scroll ──────────────────────────────────────── */
  const navbar = document.getElementById('navbar');

  const updateNavbar = () => {
    if (!navbar) return;
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
    const isExpanded = hamburger.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', isExpanded);
    mobileMenu?.classList.toggle('open');
  });

  // Fechar ao clicar em link
  document.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('active');
      hamburger?.setAttribute('aria-expanded', 'false');
      mobileMenu?.classList.remove('open');
    });
  });

  /* ── Hero Parallax Leve ─────────────────────────────────── */
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg) {
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      if (scrolled < window.innerHeight) {
        heroBg.style.transform = `scale(1) translateY(${scrolled * 0.2}px)`;
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
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  fadeEls.forEach(el => observer.observe(el));

  /* ── Scroll suave para âncoras ──────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetSelector = anchor.getAttribute('href');
      if (targetSelector === '#' || !targetSelector) return;
      
      const target = document.querySelector(targetSelector);
      if (target) {
        e.preventDefault();
        const navH = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--nav-height'), 10) || 72;
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
    let overlay = document.getElementById('lightbox');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lightbox';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Visualização de imagem ampliada');
      overlay.setAttribute('aria-modal', 'true');
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

      const style = document.createElement('style');
      style.textContent = `
        #lightbox { display: none; }
        #lightbox.open {
          display: flex !important;
          animation: lbFadeIn 0.25s ease forwards;
        }
        .lightbox__backdrop {
          position: absolute; inset: 0;
          background: rgba(28, 16, 8, 0.92);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .lightbox__close {
          position: absolute; top: 16px; right: 16px;
          color: #FAF6EE; font-size: 20px; z-index: 10;
          cursor: pointer;
          background: rgba(250, 246, 238, 0.18);
          border: 1px solid rgba(250, 246, 238, 0.25);
          width: 48px; height: 48px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.2s ease, background 0.2s ease;
          touch-action: manipulation;
        }
        .lightbox__close:active {
          transform: scale(0.9);
          background: rgba(250, 246, 238, 0.3);
        }
        @media (hover: hover) {
          .lightbox__close:hover {
            background: rgba(250, 246, 238, 0.3);
            transform: rotate(90deg);
          }
        }
        .lightbox__img {
          position: relative; z-index: 2;
          max-width: 92vw; max-height: 85vh;
          object-fit: contain; border-radius: 8px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.7);
          animation: lbImgScale 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes lbFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lbImgScale { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
      `;
      document.head.appendChild(style);

      overlay.querySelector('.lightbox__backdrop')?.addEventListener('click', closeLightbox);
      overlay.querySelector('.lightbox__close')?.addEventListener('click', closeLightbox);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
          closeLightbox();
        }
      });
    }

    galeriaItems.forEach(item => {
      item.addEventListener('click', () => {
        const img = item.querySelector('img');
        if (img && overlay) {
          const lightboxImg = overlay.querySelector('.lightbox__img');
          if (lightboxImg) {
            lightboxImg.src = img.src;
            lightboxImg.alt = img.alt || 'Imagem da Cafeteria do Teatro';
          }
          overlay.classList.add('open');
          document.body.style.overflow = 'hidden';
        }
      });
    });

    function closeLightbox() {
      if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }
    }
  }

  /* ── Contador ano no footer ─────────────────────────────── */
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});
