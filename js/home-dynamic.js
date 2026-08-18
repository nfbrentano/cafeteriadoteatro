/* =========================================================
   HOME-DYNAMIC.JS — Renderização Dinâmica da Home (Supabase)
   ========================================================= */

(function () {
  'use strict';

  async function loadHomeData() {
    if (!window.cafeteriaDB) return;

    try {
      const [hero, hours, promos, settings] = await Promise.all([
        window.cafeteriaDB.hero.get().catch(() => null),
        window.cafeteriaDB.hours.get().catch(() => null),
        window.cafeteriaDB.promotions.all().catch(() => []),
        window.cafeteriaDB.settings.all().catch(() => ({}))
      ]);

      if (hero) renderHero(hero);
      if (hours) renderHours(hours);
      if (promos) renderPromos(promos);
      if (settings) renderSettings(settings);
    } catch (err) {
      console.error('Erro ao carregar dados dinâmicos da Home:', err);
    }
  }

  function renderHero(hero) {
    if (!hero) return;
    const bg = document.querySelector('.hero__bg');
    if (!bg) return;
    
    // 1. Aplica o blur placeholder imediatamente se existir
    if (hero.blur_data_url) {
      document.documentElement.style.setProperty('--hero-blur-bg', `url(${hero.blur_data_url})`);
    }

    if (hero.image_url) {
      // 2. Precarrega a imagem HD em background
      const imgHD = new Image();
      imgHD.onload = () => {
        document.documentElement.style.setProperty('--dynamic-hero-bg', `url(${hero.image_url})`);
        bg.classList.add('loaded');
      };
      imgHD.onerror = () => {
        bg.classList.add('loaded');
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

    if (s.sobre_titulo && sobreT) sobreT.textContent = s.sobre_titulo;
    if (s.sobre_texto && sobreX)  {
      sobreX.innerHTML = s.sobre_texto.split('\n').filter(p => p.trim() !== '').map(p => `<p>${p.trim()}</p>`).join('');
    }
    if (s.exp_subtitulo && expS) expS.textContent = s.exp_subtitulo;
    if (s.galeria_subtitulo && galS) galS.textContent = s.galeria_subtitulo;

    if (s.sobre_imagem_url) {
      const sobreImg = document.getElementById('dyn-sobre-img');
      if (sobreImg) {
        sobreImg.src = s.sobre_imagem_url;
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

    const segQuiAbre = h.seg_qui_abre || (h.seg_qui && h.seg_qui.abre) || '14:30';
    const segQuiFecha = h.seg_qui_fecha || (h.seg_qui && h.seg_qui.fecha) || '22:00';
    const sexAbre = h.sex_abre || (h.sex && h.sex.abre) || '14:30';
    const sexFecha = h.sex_fecha || (h.sex && h.sex.fecha) || '20:00';
    const sabDomAtivo = h.sab_dom_ativo !== undefined ? h.sab_dom_ativo : (h.sab_dom && h.sab_dom.ativo);
    const sabDomAbre = h.sab_dom_abre || (h.sab_dom && h.sab_dom.abre) || '14:30';
    const sabDomFecha = h.sab_dom_fecha || (h.sab_dom && h.sab_dom.fecha) || '20:00';
    const avisoMsg = h.aviso_especial || h.aviso || '';

    if (segQui) segQui.textContent = `${segQuiAbre.replace(':','h')} – ${segQuiFecha.replace(':','h')}`;
    if (sex)    sex.textContent    = `${sexAbre.replace(':','h')} – ${sexFecha.replace(':','h')}`;
    
    if (sabDom) {
      if (sabDomAtivo) {
        sabDom.classList.remove('hidden');
        if (txtSD) txtSD.textContent = `${sabDomAbre.replace(':','h')} – ${sabDomFecha.replace(':','h')}`;
      } else {
        sabDom.classList.add('hidden');
      }
    }

    if (aviso) {
      aviso.textContent = avisoMsg ? `⚠️ ${avisoMsg}` : '';
    }

    // Atualiza o footer também se existir o ID
    const footerH = document.getElementById('txt-footer-horarios');
    if (footerH) {
      let fText = `Seg–Qui: ${segQuiAbre.replace(':','h')} às ${segQuiFecha.replace(':','h')} · Sex: ${sexAbre.replace(':','h')} às ${sexFecha.replace(':','h')}`;
      if (sabDomAtivo) fText += ` · Sáb-Dom: ${sabDomAbre.replace(':','h')} às ${sabDomFecha.replace(':','h')}`;
      footerH.textContent = fText;
    }

    // Atualizar status "Aberto Agora"
    updateOpenStatus({
      seg_qui: { abre: segQuiAbre, fecha: segQuiFecha },
      sex: { abre: sexAbre, fecha: sexFecha },
      sab_dom: { abre: sabDomAbre, fecha: sabDomFecha, ativo: !!sabDomAtivo }
    });
  }

  function updateOpenStatus(hoursConfig) {
    const statusContainer = document.getElementById('status-funcionamento');
    if (!statusContainer) return;

    const now = new Date();
    const day = now.getDay(); // 0=Dom, 1=Seg...
    const currentTime = now.getHours() * 100 + now.getMinutes();

    let openRange = null;

    if (day >= 1 && day <= 4) { // Seg a Qui
      openRange = hoursConfig.seg_qui;
    } else if (day === 5) { // Sex
      openRange = hoursConfig.sex;
    } else if (hoursConfig.sab_dom && hoursConfig.sab_dom.ativo) { // Sab ou Dom (se ativo)
      openRange = hoursConfig.sab_dom;
    }

    let isOpen = false;
    if (openRange && openRange.abre && openRange.fecha) {
      const start = parseInt(openRange.abre.replace(':', ''), 10);
      const end   = parseInt(openRange.fecha.replace(':', ''), 10);
      if (currentTime >= start && currentTime < end) {
        isOpen = true;
      }
    }

    statusContainer.innerHTML = isOpen 
      ? `<span class="badge-status badge-status--open">🟢 Aberto agora</span>`
      : `<span class="badge-status badge-status--closed">🔴 Fechado no momento</span>`;
  }

  function renderPromos(promos) {
    const bar = document.getElementById('promo-bar-root');
    if (!bar) return;

    if (!Array.isArray(promos)) {
      bar.innerHTML = '';
      return;
    }

    const now = new Date();
    const active = promos.filter(p => {
      if (!p.ativo && !p.active) return false;
      if (p.inicio && p.fim) {
        const start = new Date(p.inicio + 'T00:00:00');
        const end = new Date(p.fim + 'T23:59:59');
        return now >= start && now <= end;
      }
      return true;
    });

    if (active.length === 0) {
      bar.innerHTML = '';
      return;
    }

    // Renderiza a campanha mais recente ativa
    const p = active.sort((a, b) => new Date(b.updated_at || b.inicio || 0) - new Date(a.updated_at || a.inicio || 0))[0];
    const badge = p.badge_text || p.badge || 'PROMO';
    const titulo = p.title || p.titulo || '';
    const descricao = p.description || p.descricao || '';
    const link = p.link || '';

    bar.innerHTML = `
      <div class="promo-bar">
        <div class="container promo-bar__inner">
          <span class="promo-bar__badge">${badge}</span>
          <span class="promo-bar__text">${titulo ? `${titulo}: ` : ''}<strong>${descricao}</strong></span>
          ${link ? `<a href="${link}" class="promo-bar__link">Ver mais →</a>` : ''}
        </div>
      </div>
    `;
  }

  // --- Realtime & Start ---
  document.addEventListener('DOMContentLoaded', () => {
    loadHomeData();
    if (window.cafeteriaDB && typeof window.cafeteriaDB.subscribeToChanges === 'function') {
      window.cafeteriaDB.subscribeToChanges(() => loadHomeData());
    }
  });

})();
