/* =========================================================
   ANALYTICS.JS — Rastreamento de Eventos Personalizados (GA4)
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // Função auxiliar para disparar o evento
  function trackEvent(eventName, params) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
      console.log('GA4 Event:', eventName, params);
    }
  }

  // 1. Cliques no Google Maps
  const mapsBtns = document.querySelectorAll('a[href*="maps.google.com"]');
  mapsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      trackEvent('click_google_maps', { button_id: btn.id || 'link_mapas' });
    });
  });

  // 2. Cliques em "Avaliar no Google"
  const reviewBtns = document.querySelectorAll('a[href*="g.page/r/"]');
  reviewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      trackEvent('click_google_review', { button_id: btn.id || 'link_review' });
    });
  });

  // 3. Cliques no Instagram
  const igBtns = document.querySelectorAll('a[href*="instagram.com"]');
  igBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      trackEvent('click_instagram', { button_id: btn.id || 'link_instagram' });
    });
  });

  // 4. Cliques no Linktree
  const linktreeBtns = document.querySelectorAll('a[href*="linktr.ee"]');
  linktreeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      trackEvent('click_linktree', { button_id: btn.id || 'link_linktree' });
    });
  });

  // 5. Cliques nos CTAs de "Ver Cardápio" (Apenas os botões em destaque)
  const cardapioBtns = document.querySelectorAll('a[href="cardapio.html"]');
  cardapioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('btn')) {
        trackEvent('click_ver_cardapio', { button_id: btn.id || 'cta_cardapio' });
      }
    });
  });

  // 6. Carregar mapa interativo
  const mapLoadBtn = document.getElementById('chegar-map-load-btn');
  if (mapLoadBtn) {
    mapLoadBtn.addEventListener('click', () => {
      trackEvent('load_interactive_map', { button_id: mapLoadBtn.id });
    });
  }
});
