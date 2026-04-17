/* =========================================================
   CARDAPIO.JS — Navegação e Filtros do Cardápio Digital
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
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('open');
  });

    });
  });

  document.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('open');
    });
  });

  /* ── Promoções Dinâmicas ────────────────────────────────── */
  const loadActivePromos = () => {
    const PROMO_LS_KEY = 'cafeteria_campanhas';
    const raw = localStorage.getItem(PROMO_LS_KEY);
    if (!raw) return;

    try {
      const campanhas = JSON.parse(raw);
      const now = new Date();
      
      const ativas = campanhas.filter(c => {
        if (!c.ativo) return false;
        const start = new Date(c.inicio + 'T00:00:00');
        const end = new Date(c.fim + 'T23:59:59');
        return now >= start && now <= end;
      });

      if (ativas.length === 0) return;

      const promo = ativas.sort((a, b) => new Date(b.updatedAt || b.inicio) - new Date(a.updatedAt || a.inicio))[0];

      const barRoot = document.getElementById('promo-bar-root');
      if (barRoot) {
        barRoot.innerHTML = `
          <div class="promo-bar">
            <div class="container">
              ${promo.badge ? `<span class="promo-bar__badge">${promo.badge}</span>` : ''}
              <span>${promo.titulo}: ${promo.descricao}</span>
              ${promo.link ? `<a href="${promo.link}">Saiba mais →</a>` : ''}
            </div>
          </div>
        `;
      }
      
      const heroRoot = document.getElementById('promo-hero-root');
      if (heroRoot) {
        heroRoot.innerHTML = `
          <div class="promo-hero">
            ${promo.imageUrl ? `
              <div class="promo-hero__img">
                <img src="${promo.imageUrl}" alt="${promo.titulo}">
              </div>
            ` : ''}
            <div class="promo-hero__content">
              ${promo.badge ? `<span class="promo-hero__badge">${promo.badge}</span>` : ''}
              <h2 class="promo-hero__title">${promo.titulo}</h2>
              <p class="promo-hero__desc">${promo.descricao}</p>
              ${promo.link ? `
                <div class="promo-hero__cta">
                  <a href="${promo.link}" class="btn btn--primary">Aproveitar agora</a>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }
    } catch (e) {
      console.error('Erro ao carregar promoções:', e);
    }
  };

  loadActivePromos();

  /* ── Navegação sticky de categorias ─────────────────────── */
  const catBtns    = document.querySelectorAll('.cat-nav__btn');
  const catSections = document.querySelectorAll('.cat-section');
  const catNav     = document.querySelector('.cat-nav');

  // Scroll suave para categoria
  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-cat');
      const target   = document.getElementById(targetId);

      if (target) {
        const navH   = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--nav-height')) || 72;
        const catNavH = catNav ? catNav.offsetHeight : 56;
        const top = target.getBoundingClientRect().top + window.scrollY - navH - catNavH - 8;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // Highlight automático ao rolar
  const highlightCat = () => {
    const navH    = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--nav-height')) || 72;
    const catNavH = catNav ? catNav.offsetHeight : 56;
    const offset  = navH + catNavH + 20;

    let current = '';
    catSections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - offset) {
        current = sec.id;
      }
    });

    catBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-cat') === current);
    });

    // Scroll horizontal do catNav para mostrar ativo
    const activeBtn = document.querySelector(`.cat-nav__btn[data-cat="${current}"]`);
    if (activeBtn && catNav) {
      const inner = catNav.querySelector('.cat-nav__inner');
      if (inner) {
        const btnLeft  = activeBtn.offsetLeft;
        const btnWidth = activeBtn.offsetWidth;
        const innerW   = inner.offsetWidth;
        inner.scrollTo({ left: btnLeft - (innerW / 2) + (btnWidth / 2), behavior: 'smooth' });
      }
    }
  };

  window.addEventListener('scroll', highlightCat, { passive: true });
  highlightCat();

  /* ── Fade-in ────────────────────────────────────────────── */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  /* ── Contador ano ───────────────────────────────────────── */
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});
