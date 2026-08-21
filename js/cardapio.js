/* =========================================================
   CARDAPIO.JS — Navegação e Filtros do Cardápio Digital
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Navbar scroll ──────────────────────────────────────── */
  const navbar = document.getElementById('navbar');
  let isNavbarSolid = null;

  const updateNavbar = () => {
    if (!navbar) return;
    const shouldBeSolid = window.scrollY > 60;
    if (shouldBeSolid !== isNavbarSolid) {
      isNavbarSolid = shouldBeSolid;
      if (shouldBeSolid) {
        navbar.classList.remove('navbar--transparent');
        navbar.classList.add('navbar--solid');
      } else {
        navbar.classList.add('navbar--transparent');
        navbar.classList.remove('navbar--solid');
      }
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
              <img src="${promo.image_url}" alt="${promo.titulo || 'Promoção'}" loading="lazy" decoding="async" onerror="this.parentElement.style.display='none'" />
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
      if (!hero) return;

      // 1. Aplica o blur placeholder imediatamente
      if (hero.blur_data_url) {
        document.documentElement.style.setProperty('--hero-blur-bg', `url(${hero.blur_data_url})`);
      }

      if (hero.image_url) {
        // 2. Precarrega a imagem HD
        const imgHD = new Image();
        imgHD.onload = () => {
          // 3. Aplica a HD
          document.documentElement.style.setProperty('--dynamic-hero-bg', `url(${hero.image_url})`);
        };
        imgHD.src = hero.image_url;

        // Atualiza cache para próxima carga instantânea
        window.cafeteriaDB.cache.set('cafeteria_hero_cache', hero);
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
  const catBtns     = document.querySelectorAll('.cat-nav__btn');
  const catSections = document.querySelectorAll('.cat-section');
  const catNav      = document.querySelector('.cat-nav');

  // Scroll suave para categoria
  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-cat');
      const target   = document.getElementById(targetId);

      if (target) {
        const navH    = 72;
        const catNavH = catNav ? 56 : 0;
        const top     = target.getBoundingClientRect().top + window.scrollY - navH - catNavH - 8;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // Highlight automático usando IntersectionObserver (Zero Reflow)
  if (catSections.length && catBtns.length) {
    let activeCatId = '';
    const catObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          if (id && id !== activeCatId) {
            activeCatId = id;
            catBtns.forEach(btn => {
              btn.classList.toggle('active', btn.getAttribute('data-cat') === id);
            });
            const activeBtn = document.querySelector(`.cat-nav__btn[data-cat="${id}"]`);
            if (activeBtn) {
              activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
          }
        }
      });
    }, {
      rootMargin: '-30% 0px -60% 0px',
      threshold: 0
    });

    catSections.forEach(sec => catObserver.observe(sec));
  }

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
