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

  /* ── Hero dinâmico do Supabase ─────────────────────────── */
  const heroBg = document.querySelector('.hero__bg');
  const loadHero = async () => {
    if (!heroBg) return;
    try {
      const data = await window.cafeteriaDB.hero.get();
      if (data && data.image_url) {
        heroBg.style.backgroundImage = `url(${data.image_url})`;
        if (data.image_alt) heroBg.setAttribute('aria-label', data.image_alt);
        window.cafeteriaDB.cache.set('cafeteria_hero_cache', data);
      }
    } catch (err) {
      const cached = window.cafeteriaDB.cache.get('cafeteria_hero_cache');
      if (cached && cached.image_url) {
        heroBg.style.backgroundImage = `url(${cached.image_url})`;
      }
    }
    heroBg.classList.add('loaded');
  };

  if (heroBg) {
    loadHero();
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      if (scrolled < window.innerHeight) {
        heroBg.style.transform = `scale(1) translateY(${scrolled * 0.25}px)`;
      }
    }, { passive: true });
  }

  /* ── Promoções Dinâmicas (Supabase) ─────────────────────── */
  const loadActivePromos = async () => {
    try {
      const campanhas = await window.cafeteriaDB.promotions.all();
      window.cafeteriaDB.cache.set('cafeteria_promos_cache', campanhas);
      renderPromos(campanhas);
    } catch (err) {
      console.error('Erro ao carregar promoções:', err);
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

  /* ── Textos Institucionais (Supabase) ───────────────────── */
  const applyHomeTexts = async () => {
    let data;
    try {
      data = await window.cafeteriaDB.settings.all();
      window.cafeteriaDB.cache.set('cafeteria_settings_cache', data);
    } catch (err) {
      data = window.cafeteriaDB.cache.get('cafeteria_settings_cache') || {};
    }
    
    const elSobreTitulo    = document.getElementById('dyn-sobre-titulo');
    const elSobreTexto     = document.getElementById('dyn-sobre-texto');
    const elExpSubtitulo   = document.getElementById('dyn-exp-subtitulo');
    const elGaleriaSub     = document.getElementById('dyn-galeria-subtitulo');

    if (data.sobre_titulo && elSobreTitulo) elSobreTitulo.textContent = data.sobre_titulo;
    if (data.sobre_texto && elSobreTexto) {
      elSobreTexto.innerHTML = data.sobre_texto.split('\n').filter(p => p.trim() !== '').map(p => `<p>${p.trim()}</p>`).join('');
    }
    if (data.exp_subtitulo && elExpSubtitulo) elExpSubtitulo.textContent = data.exp_subtitulo;
    if (data.galeria_subtitulo && elGaleriaSub) elGaleriaSub.textContent = data.galeria_subtitulo;
  };

  applyHomeTexts();

  /* ── Horários Dinâmicos (Supabase) ───────────────────────── */
  const applyHorarios = async () => {
    let data;
    try {
      data = await window.cafeteriaDB.hours.get();
      if (data) window.cafeteriaDB.cache.set('cafeteria_horarios_cache', data);
    } catch (err) {
      data = window.cafeteriaDB.cache.get('cafeteria_horarios_cache');
    }

    if (!data) {
      data = {
        seg_qui: { abre: '14:30', fecha: '22:00' },
        sex:     { abre: '14:30', fecha: '20:00' },
        sab_dom: { abre: '14:30', fecha: '20:00', ativo: false },
        aviso:   'Horários sujeitos à programação do Teatro. Acompanhe nossas redes para atualizações.'
      };
    }

    // Atualizar textos na seção Horários
    const txtSegQui = document.getElementById('txt-seg-qui');
    const txtSex    = document.getElementById('txt-sex');
    const txtSabDom = document.getElementById('txt-sab-dom');
    const boxSabDom = document.getElementById('box-sab-dom');
    const txtAviso  = document.getElementById('txt-aviso-horario');

    if (txtSegQui) txtSegQui.textContent = `${data.seg_qui.abre.replace(':','h')} – ${data.seg_qui.fecha.replace(':','h')}`;
    if (txtSex)    txtSex.textContent    = `${data.sex.abre.replace(':','h')} – ${data.sex.fecha.replace(':','h')}`;
    
    if (boxSabDom) {
      if (data.sab_dom.ativo) {
        boxSabDom.classList.remove('hidden');
        if (txtSabDom) txtSabDom.textContent = `${data.sab_dom.abre.replace(':','h')} – ${data.sab_dom.fecha.replace(':','h')}`;
      } else {
        boxSabDom.classList.add('hidden');
      }
    }

    if (txtAviso) txtAviso.textContent = data.aviso ? `⚠️ ${data.aviso}` : '';

    // Atualizar rodapé/contato
    const txtFooter = document.getElementById('txt-footer-horarios');
    if (txtFooter) {
      let footerText = `Seg–Qui: ${data.seg_qui.abre.replace(':','h')} às ${data.seg_qui.fecha.replace(':','h')} · Sex: ${data.sex.abre.replace(':','h')} às ${data.sex.fecha.replace(':','h')}`;
      if (data.sab_dom.ativo) {
        footerText += ` · Sáb/Dom: ${data.sab_dom.abre.replace(':','h')} às ${data.sab_dom.fecha.replace(':','h')}`;
      }
      txtFooter.textContent = footerText;
    }

    // Calcular status "Aberto Agora"
    updateOpenStatus(data);
  };

  const updateOpenStatus = (data) => {
    const statusContainer = document.getElementById('status-funcionamento');
    if (!statusContainer) return;

    const now = new Date();
    const day = now.getDay(); // 0=Dom, 1=Seg...
    const currentTime = now.getHours() * 100 + now.getMinutes();

    let openRange = null;

    if (day >= 1 && day <= 4) { // Seg a Qui
      openRange = data.seg_qui;
    } else if (day === 5) { // Sex
      openRange = data.sex;
    } else if (data.sab_dom.ativo) { // Sab ou Dom (se ativo)
      openRange = data.sab_dom;
    }

    let isOpen = false;
    if (openRange) {
      const start = parseInt(openRange.abre.replace(':', ''));
      const end   = parseInt(openRange.fecha.replace(':', ''));
      if (currentTime >= start && currentTime < end) {
        isOpen = true;
      }
    }

    statusContainer.innerHTML = isOpen 
      ? `<span class="badge-status badge-status--open">🟢 Aberto agora</span>`
      : `<span class="badge-status badge-status--closed">🔴 Fechado no momento</span>`;
  };

  applyHorarios();

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
