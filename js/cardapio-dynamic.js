/* =========================================================
   CARDAPIO-DYNAMIC.JS — Renderização Dinâmica do Cardápio
   ========================================================= */

(function () {
  'use strict';

  // Fallback em caso de falha TOTAL de conexão
  const FALLBACK_DATA = {
    categorias: [{ id: 'cafes', nome: 'Cafés', icone: '☕', ativo: true, ordem: 0, descricao: 'Nossos cafés especiais.' }],
    produtos: [{ id: '1', nome: 'Café Espresso', preco: 5.0, categoria_id: 'cafes', ativo: true }]
  };

  async function loadAndRender() {
    // Se o PDF estiver ativo, não faz nada
    if (window.cafeteriaPdfActive) {
      console.log('[dynamic] PDF ativo detectado. Abortando carga de itens individuais.');
      return;
    }

    const root = document.getElementById('cardapio-root');
    const nav = document.getElementById('dyn-cat-nav');

    try {
      const [cats, prods] = await Promise.all([
        window.cafeteriaDB.categories.all(),
        window.cafeteriaDB.products.all()
      ]);

      const data = { 
        categorias: cats.filter(c => c.ativo).sort((a, b) => a.ordem - b.ordem), 
        produtos: prods.filter(p => p.ativo) 
      };

      if (data.categorias.length === 0) {
        root.innerHTML = `<div class="container text-center" style="padding:100px 0"><h3>Opa! O cardápio está em manutenção.</h3><p>Volte em instantes.</p></div>`;
        return;
      }

      renderNav(data.categorias, nav);
      renderContent(data.categorias, data.produtos, root);
      setupScrollSpy();
    } catch (err) {
      console.error('Erro na carga dinâmica:', err);
      // Opcional: carregar do cache se falhar
    }
  }

  function renderNav(cats, container) {
    if (!container) return;
    container.innerHTML = cats.map((c, i) => `
      <button class="cat-nav__btn ${i === 0 ? 'active' : ''}" data-cat="${c.id}">
        <span class="cat-nav__icon">${c.icone}</span> ${c.nome}
      </button>
    `).join('');

    // Eventos de clique
    container.querySelectorAll('.cat-nav__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.cat;
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          const offset = 120; // Compensar sticky nav
          window.scrollTo({
            top: targetEl.offsetTop - offset,
            behavior: 'smooth'
          });
        }
      });
    });
  }

  function renderContent(cats, products, container) {
    if (!container) return;
    
    container.innerHTML = cats.map(cat => {
      const catProducts = products.filter(p => (p.categoria_id || p.categoriaId) === cat.id);
      if (catProducts.length === 0) return '';

      const isCombo = cat.id === 'combos' || cat.nome.toLowerCase().includes('combo');
      const isEspecial = cat.id === 'especiais' || cat.nome.toLowerCase().includes('especial');
      
      const gridClass = isCombo ? 'combo-grid' : 'produto-grid';
      const sectionClass = isCombo ? 'cat-section section--dark' : 'cat-section';

      return `
        <section class="${sectionClass}" id="${cat.id}">
          <div class="container">
            <div class="cat-section__header fade-in">
              <div class="cat-section__title-group">
                <div class="cat-section__icon">${cat.icone}</div>
                <h2 class="cat-section__title ${isCombo ? 'section-title--light' : ''}">${cat.nome}</h2>
              </div>
              <p class="cat-section__description" ${isCombo ? 'style="color:rgba(237,224,196,0.6)"' : ''}>
                ${cat.descricao || ''}
              </p>
            </div>
            <div class="${gridClass}">
              ${catProducts.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(p => {
                if (isCombo) return renderComboCard(p);
                return renderProductCard(p, cat.icone);
              }).join('')}
            </div>
          </div>
        </section>
      `;
    }).join('');

    // Trigger animations
    setTimeout(() => {
      document.querySelectorAll('.fade-in').forEach(el => el.classList.add('visible'));
    }, 100);
  }

  function renderProductCard(p, catIcone) {
    const price = Number(p.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const imgUrl = p.imagem_url || p.imagemUrl;
    
    let badgeHTML = '';
    if (p.badges && Array.isArray(p.badges)) {
        badgeHTML = p.badges.map(b => {
            if (b === 'popular') return '<span class="badge badge--popular">🔥 Mais Pedido</span>';
            if (b === 'novo') return '<span class="badge badge--novo">🆕 Novidade</span>';
            return '';
        }).join('');
    }

    return `
      <article class="produto-card fade-in" aria-label="${p.nome}">
        <div class="produto-card__image-wrap">
          ${imgUrl 
            ? `<img src="${imgUrl}" alt="${p.nome}" class="produto-card__image" width="400" height="400" loading="lazy">`
            : `<div class="produto-card__image-placeholder"><span class="placeholder-icon">${catIcone || '☕'}</span><span>Foto em breve</span></div>`
          }
          <div class="produto-card__badges">${badgeHTML}</div>
        </div>
        <div class="produto-card__body">
          <h3 class="produto-card__name">${p.nome}</h3>
          <p class="produto-card__desc">${p.descricao || ''}</p>
          <div class="produto-card__footer">
            <div class="produto-card__price"><span class="produto-card__price-label">R$</span>${price}</div>
          </div>
        </div>
      </article>
    `;
  }

  function renderComboCard(p) {
    const price = Number(p.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const itens = p.combo_items || p.comboItens || [];
    const tagsHTML = Array.isArray(itens) ? itens.map(i => `<span class="combo-card__item-tag">${i}</span>`).join('') : '';

    return `
      <article class="combo-card fade-in">
        <div class="combo-card__icon">${p.combo_icon || '🎁'}</div>
        <div class="combo-card__content">
          <h3 class="combo-card__name">${p.nome}</h3>
          <div class="combo-card__items">${tagsHTML}</div>
          <p class="combo-card__desc">${p.descricao || ''}</p>
        </div>
        <div class="combo-card__price-wrap">
          <div class="combo-card__price">R$ ${price}</div>
          ${p.combo_savings ? `<div class="combo-card__savings">${p.combo_savings}</div>` : ''}
        </div>
      </article>
    `;
  }

  function setupScrollSpy() {
    const sections = document.querySelectorAll('.cat-section');
    const navBtns = document.querySelectorAll('.cat-nav__btn');

    window.addEventListener('scroll', () => {
      let current = '';
      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (pageYOffset >= sectionTop - 150) {
          current = section.getAttribute('id');
        }
      });

      navBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.cat === current) {
          btn.classList.add('active');
        }
      });
    });
  }

  // --- Realtime & Initial Load ---
  document.addEventListener('DOMContentLoaded', () => {
    loadAndRender();
    window.cafeteriaDB.subscribeToChanges(() => loadAndRender());
  });

})();
