// CAF-000117: Pré-renderização de cache do Hero no Cardápio para conformidade com CSP
(function() {
  try {
    const raw = localStorage.getItem('cafeteria_hero_cache');
    if (raw) {
      let hero = null;
      try {
        hero = JSON.parse(decodeURIComponent(atob(raw)));
      } catch {
        hero = JSON.parse(raw);
      }
      if (hero && hero.image_url) {
        document.documentElement.style.setProperty('--dynamic-hero-bg', 'url(' + hero.image_url + ')');
      }
      if (hero && hero.blur_data_url) {
        document.documentElement.style.setProperty('--hero-blur-bg', 'url(' + hero.blur_data_url + ')');
      }
    }
  } catch(e) {}
})();

