// CAF-000117: Pré-renderização de cache do Hero e Sobre na Home para conformidade com CSP
(function() {
  function getCached(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(decodeURIComponent(atob(raw)));
      } catch {
        return JSON.parse(raw);
      }
    } catch (e) {
      return null;
    }
  }

  // 1. Hero Image
  const h = getCached('cafeteria_hero_cache');
  if (h) {
    if (h.blur_data_url) document.documentElement.style.setProperty('--hero-blur-bg', 'url(' + h.blur_data_url + ')');
    if (h.image_url) document.documentElement.style.setProperty('--dynamic-hero-bg', 'url(' + h.image_url + ')');
  }

  // 2. Sobre Image
  const s = getCached('cafeteria_settings_cache');
  if (s && s.sobre_imagem_url) {
    document.documentElement.style.setProperty('--dynamic-sobre-bg', 'url(' + s.sobre_imagem_url + ')');
  }
})();

