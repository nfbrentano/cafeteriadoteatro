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

  document.querySelectorAll('.navbar__mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('active');
      mobileMenu?.classList.remove('open');
    });
  });

  /* ── Promoções Dinâmicas (Supabase) ─────────────────────── */
  const loadActivePromos = async () => {
    try {
      const campanhas = await window.cafeteriaDB.promotions.all();
      window.cafeteriaDB.cache.set('cafeteria_promos_cache', campanhas);
      renderPromos(campanhas);
    } catch (err) {
      console.error('Erro ao carregar promoções no cardápio:', err);
      const cached = window.cafeteriaDB.cache.get('cafeteria_promos_cache') || [];
      renderPromos(cached);
    }
  };

  const renderPromos = (campanhas) => {
    const now = new Date();
    const ativas = campanhas.filter(c => {
      if (!c.ativo) return false;
      const start = new Date(c.inicio + 'T00:00:00');
      const end = new Date(c.fim + 'T23:59:59');
      return now >= start && now <= end;
    });

    const barRoot = document.getElementById('promo-bar-root');
    const heroRoot = document.getElementById('promo-hero-root');

    if (ativas.length === 0) {
      if (barRoot) barRoot.innerHTML = '';
      if (heroRoot) heroRoot.innerHTML = '';
      return;
    }

    const promo = ativas.sort((a, b) => new Date(b.updated_at || b.inicio) - new Date(a.updated_at || a.inicio))[0];

    // Renderizar Promo Bar
    if (barRoot) {
      barRoot.innerHTML = `
        <div class="promo-bar">
          <div class="container" style="display:flex;align-items:center;justify-content:center;gap:12px;width:100%">
            ${promo.badge ? `<span class="promo-bar__badge" style="background:var(--primaria);color:#fff;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase">${promo.badge}</span>` : ''}
            <span>${promo.titulo}: ${promo.descricao}</span>
            ${promo.link ? `<a href="${promo.link}" class="promo-bar__link" style="color:#fff;text-decoration:underline;font-weight:600">Confira</a>` : ''}
          </div>
        </div>
      `;
    }

    // Renderizar Promo Hero (Banner no cardápio)
    if (heroRoot) {
      heroRoot.innerHTML = `
        <div class="promo-hero fade-in">
          <div class="promo-hero__content">
            ${promo.badge ? `<span class="promo-hero__badge">${promo.badge}</span>` : ''}
            <h2 class="promo-hero__title">${promo.titulo}</h2>
            <p class="promo-hero__desc">${promo.descricao}</p>
            ${promo.link ? `<a href="${promo.link}" class="btn btn--primary">Aproveitar Agora</a>` : ''}
          </div>
          ${promo.image_url ? `
            <div class="promo-hero__image">
              <img src="${promo.image_url}" alt="${promo.titulo}" />
            </div>
          ` : ''}
        </div>
      `;
    }
  };

  loadActivePromos();
  
  /* ── Hero Dinâmico (Supabase) ───────────────────────────── */
  const loadDynamicHero = async () => {
    try {
      const hero = await window.cafeteriaDB.hero.get();
      if (hero && hero.image_url) {
        document.documentElement.style.setProperty('--dynamic-hero-bg', `url(${hero.image_url})`);
      }
    } catch (err) {
      console.error('Erro ao carregar hero no cardápio:', err);
    }
  };

  loadDynamicHero();

  /* ── Sincronização em Tempo Real ────────────────────────── */
  window.cafeteriaDB.subscribeToChanges(() => {
    loadActivePromos();
    loadDynamicHero();
  });

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
