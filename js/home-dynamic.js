/* =========================================================
   HOME-DYNAMIC.JS — Renderização Dinâmica da Home
   ========================================================= */

(function () {
  'use strict';

  async function loadHomeData() {
    try {
      const [hero, hours, promos, settings] = await Promise.all([
        window.cafeteriaDB.hero.get(),
        window.cafeteriaDB.hours.get(),
        window.cafeteriaDB.promotions.all(),
        window.cafeteriaDB.settings.all()
      ]);

      renderHero(hero);
      renderHours(hours);
      renderPromos(promos);
      renderSettings(settings);
    } catch (err) {
      console.error('Erro ao carregar dados da Home:', err);
    }
  }

  function renderHero(hero) {
    if (!hero) return;
    const bg = document.querySelector('.hero__bg');
    
    // 1. Aplica o blur placeholder imediatamente (se existir no objeto vindo do DB/cache)
    if (hero.blur_data_url) {
      document.documentElement.style.setProperty('--hero-blur-bg', `url(${hero.blur_data_url})`);
    }

    if (hero.image_url) {
      // 2. Precarrega a imagem HD em background
      const imgHD = new Image();
      imgHD.onload = () => {
        // 3. Quando carregar, troca a variável que o CSS usa
        document.documentElement.style.setProperty('--dynamic-hero-bg', `url(${hero.image_url})`);
      };
      imgHD.src = hero.image_url;
      
      bg.setAttribute('aria-label', hero.image_alt || 'Interior da Cafeteria do Teatro');
    }
  }

  function renderSettings(s) {
    if (!s) return;
    const sobreT = document.getElementById('dyn-sobre-titulo');
    const sobreX = document.getElementById('dyn-sobre-texto');
    const expS   = document.getElementById('dyn-exp-subtitulo');
    const galS   = document.getElementById('dyn-galeria-subtitulo');

    if (s.sobre_titulo) sobreT.textContent = s.sobre_titulo;
    if (s.sobre_texto)  sobreX.innerHTML   = s.sobre_texto.replace(/\n/g, '<br>');
    if (s.exp_subtitulo) expS.textContent   = s.exp_subtitulo;
    if (s.galeria_subtitulo) galS.textContent = s.galeria_subtitulo;

    if (s.sobre_imagem_url) {
      const sobreImg = document.getElementById('dyn-sobre-img');
      if (sobreImg) {
        document.documentElement.style.setProperty('--dynamic-sobre-bg', `url(${s.sobre_imagem_url})`);
      }
    }
  }

  function renderHours(h) {
    if (!h) return;
    const segQui = document.getElementById('txt-seg-qui');
    const sex    = document.getElementById('txt-sex');
    const sabDom = document.getElementById('box-sab-dom');
    const txtSD  = document.getElementById('txt-sab-dom');
    const aviso  = document.getElementById('txt-aviso-horario');

    if (segQui) segQui.textContent = `${h.seg_qui_abre} – ${h.seg_qui_fecha}`;
    if (sex)    sex.textContent    = `${h.sex_abre} – ${h.sex_fecha}`;
    
    if (sabDom) {
      if (h.sab_dom_ativo) {
        sabDom.classList.remove('hidden');
        txtSD.textContent = `${h.sab_dom_abre} – ${h.sab_dom_fecha}`;
      } else {
        sabDom.classList.add('hidden');
      }
    }

    if (aviso && h.aviso_especial) {
      aviso.textContent = `⚠️ ${h.aviso_especial}`;
    }

    // Atualiza o footer também se existir o ID
    const footerH = document.getElementById('txt-footer-horarios');
    if (footerH) {
      let fText = `Seg–Qui: ${h.seg_qui_abre} às ${h.seg_qui_fecha} · Sex: ${h.sex_abre} às ${h.sex_fecha}`;
      if (h.sab_dom_ativo) fText += ` · Sáb-Dom: ${h.sab_dom_abre} às ${h.sab_dom_fecha}`;
      footerH.textContent = fText;
    }
  }

  function renderPromos(promos) {
    const bar = document.getElementById('promo-bar-root');
    if (!bar) return;

    const active = promos.filter(p => p.active);
    if (active.length === 0) {
      bar.innerHTML = '';
      return;
    }

    // Renderiza apenas a canpanha mais recente ativa
    const p = active[0];
    bar.innerHTML = `
      <div class="promo-bar">
        <div class="container promo-bar__inner">
          <span class="promo-bar__badge">${p.badge_text || 'PROMO'}</span>
          <span class="promo-bar__text">${p.title}: <strong>${p.description}</strong></span>
          ${p.link ? `<a href="${p.link}" class="promo-bar__link">Ver mais →</a>` : ''}
        </div>
      </div>
    `;
  }

  // --- Realtime & Start ---
  document.addEventListener('DOMContentLoaded', () => {
    loadHomeData();
    window.cafeteriaDB.subscribeToChanges(() => loadHomeData());
  });

})();
