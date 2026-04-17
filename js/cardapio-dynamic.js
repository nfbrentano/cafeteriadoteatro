/* =========================================================
   CARDAPIO-DYNAMIC.JS — Renderização Dinâmica do Cardápio
   Lê dados do localStorage ou usa fallback hardcoded
   ========================================================= */

(function () {
  'use strict';

  /* ── Dados padrão (seed / fallback) ─────────────────────── */
  const DEFAULT_DATA = {
    categorias: [
      { id: 'cafes',     nome: 'Cafés',           icone: '☕', ativo: true, descricao: 'Preparados com cuidado, grão a grão, chícara a xícara.' },
      { id: 'geladas',   nome: 'Bebidas Geladas',  icone: '🧊', ativo: true, descricao: 'Para os dias que pedem frescor — sem abrir mão do sabor.' },
      { id: 'doces',     nome: 'Doces',            icone: '🍰', ativo: true, descricao: 'Artesanais, com carinho — companheiros perfeitos do seu café.' },
      { id: 'salgados',  nome: 'Salgados',         icone: '🥐', ativo: true, descricao: 'Para quando a fome bater antes ou depois do espetáculo.' },
      { id: 'combos',    nome: 'Combos',           icone: '🎁', ativo: true, descricao: 'Feitos para quem quer mais — e pagar menos.' },
      { id: 'especiais', nome: 'Especiais',        icone: '✨', ativo: true, descricao: 'Da nossa cozinha com carinho — criações exclusivas da Casa.' }
    ],
    produtos: [
      // Cafés
      { id: 'espresso',         categoriaId: 'cafes',     nome: 'Espresso',               descricao: 'Encorpado, aromático e concentrado. O clássico que nunca falha.',                              preco: 4.00,  imagemUrl: 'assets/images/produto-cafe.png',   badges: ['popular'], ativo: true, ordem: 1  },
      { id: 'cappuccino',       categoriaId: 'cafes',     nome: 'Cappuccino',             descricao: 'Espresso com leite vaporizado cremoso e leve toque de canela. Quente e reconfortante.',         preco: 9.00,  imagemUrl: 'assets/images/galeria-latte.png',  badges: ['popular'], ativo: true, ordem: 2  },
      { id: 'cafe-com-leite',   categoriaId: 'cafes',     nome: 'Café com Leite',         descricao: 'O abraço quentinho da tarde. Café coado com leite integral vaporizado.',                        preco: 7.00,  imagemUrl: '',                                badges: [],          ativo: true, ordem: 3  },
      { id: 'cafe-coado',       categoriaId: 'cafes',     nome: 'Café Coado',             descricao: 'Filtrado lentamente, preservando os melhores aromas do grão. Simples e honesto.',               preco: 5.00,  imagemUrl: '',                                badges: [],          ativo: true, ordem: 4  },
      { id: 'latte',            categoriaId: 'cafes',     nome: 'Latte',                  descricao: 'Espresso suavizado com muito leite vaporizado sedoso. Delicado e equilibrado.',                  preco: 10.00, imagemUrl: '',                                badges: ['novo'],     ativo: true, ordem: 5  },
      // Geladas
      { id: 'cafe-gelado',      categoriaId: 'geladas',   nome: 'Café Gelado',            descricao: 'Espresso sobre gelo com leite e espuma cremosa. Refrescante e encorpado ao mesmo tempo.',       preco: 10.00, imagemUrl: 'assets/images/produto-gelado.png', badges: ['popular'], ativo: true, ordem: 1  },
      { id: 'choc-gelado',      categoriaId: 'geladas',   nome: 'Chocolate Gelado',       descricao: 'Chocolate premium batido com gelo e leite. Uma indulgência que vale cada gole.',                preco: 10.00, imagemUrl: '',                                badges: [],          ativo: true, ordem: 2  },
      { id: 'suco-natural',     categoriaId: 'geladas',   nome: 'Suco Natural',           descricao: 'Frutas da estação, espremidas na hora. Pergunte a opção do dia.',                               preco: 9.00,  imagemUrl: '',                                badges: [],          ativo: true, ordem: 3  },
      { id: 'limonada',         categoriaId: 'geladas',   nome: 'Limonada',               descricao: 'Limão espremido na hora com açúcar e menta. Ácida e refrescante — do jeito certo.',             preco: 9.00,  imagemUrl: '',                                badges: [],          ativo: true, ordem: 4  },
      // Doces
      { id: 'bolo-dia',         categoriaId: 'doces',     nome: 'Bolo do Dia',            descricao: 'Feito diariamente, sempre fresquinho. Consulte a opção disponível hoje com a gente.',           preco: 9.00,  imagemUrl: 'assets/images/produto-doce.png',   badges: ['popular'], ativo: true, ordem: 1  },
      { id: 'brownie',          categoriaId: 'doces',     nome: 'Brownie',                descricao: 'De chocolate intenso, crocante por fora e macio por dentro. O favorito de sempre.',             preco: 8.00,  imagemUrl: '',                                badges: [],          ativo: true, ordem: 2  },
      { id: 'cheesecake',       categoriaId: 'doces',     nome: 'Cheesecake',             descricao: 'Cremoso, com base de biscoito e calda de frutas vermelhas. Uma fatia de prazer.',                preco: 12.00, imagemUrl: '',                                badges: ['novo'],     ativo: true, ordem: 3  },
      { id: 'brigadeiro',       categoriaId: 'doces',     nome: 'Brigadeiro Gourmet',     descricao: 'Chocolate belga, coberto com granulado artesanal. O clássico elevado à sua melhor versão.',     preco: 5.00,  imagemUrl: '',                                badges: ['promo'],    ativo: true, ordem: 4  },
      // Salgados
      { id: 'croissant',        categoriaId: 'salgados',  nome: 'Croissant de Queijo',    descricao: 'Folhado dourado, recheio de queijo derretido. Crocante por fora, macio por dentro.',            preco: 8.00,  imagemUrl: 'assets/images/produto-salgado.png', badges: ['popular'], ativo: true, ordem: 1 },
      { id: 'pao-queijo',       categoriaId: 'salgados',  nome: 'Pão de Queijo Artesanal',descricao: 'Receita caseira, saído quentinho. Aquele cheiro e aquela textura impossíveis de resistir.',    preco: 6.00,  imagemUrl: '',                                badges: [],          ativo: true, ordem: 2  },
      { id: 'wrap-veg',         categoriaId: 'salgados',  nome: 'Wrap Vegetariano',       descricao: 'Tortilla integral com legumes frescos, cream cheese e temperos especiais. Leve e nutritivo.',   preco: 14.00, imagemUrl: '',                                badges: ['novo'],     ativo: true, ordem: 3  },
      { id: 'sanduiche-nat',    categoriaId: 'salgados',  nome: 'Sanduíche Natural',      descricao: 'Pão artesanal com recheio fresco do dia. Peça para descobrir a combinação especial.',           preco: 13.00, imagemUrl: '',                                badges: [],          ativo: true, ordem: 4  },
      // Combos
      { id: 'combo-pausa',      categoriaId: 'combos',    nome: 'Combo Pausa',            descricao: 'A pausa perfeita para recarregar as energias antes ou depois do espetáculo.',                   preco: 14.00, imagemUrl: '',                                badges: [],          ativo: true, ordem: 1, comboIcon: '☕🍰', comboItens: ['Café à escolha', 'Doce à escolha'],                       comboEconomia: 'Economize R$ 4,00' },
      { id: 'combo-cultura',    categoriaId: 'combos',    nome: 'Combo Cultura',          descricao: 'A combinação ideal para quem não quer parar — do estudo ao espetáculo.',                        preco: 15.00, imagemUrl: '',                                badges: [],          ativo: true, ordem: 2, comboIcon: '🎭☕', comboItens: ['Café à escolha', 'Salgado à escolha'],                    comboEconomia: 'Economize R$ 3,00' },
      { id: 'combo-estudo',     categoriaId: 'combos',    nome: 'Combo Estudo',           descricao: 'Para as sessões longas de estudo — tudo o que você precisa para durar o dia.',                  preco: 17.00, imagemUrl: '',                                badges: [],          ativo: true, ordem: 3, comboIcon: '📚☕', comboItens: ['Café à escolha', 'Doce à escolha', 'Água mineral'],       comboEconomia: 'Economize R$ 6,00' },
      // Especiais
      { id: 'affogato',         categoriaId: 'especiais', nome: 'Affogato',               descricao: 'Espresso duplo derramado sobre sorvete de creme. Quente e frio ao mesmo tempo — uma experiência.', preco: 14.00, imagemUrl: 'assets/images/produto-cafe.png',  badges: ['popular'], ativo: true, ordem: 1, especialBadgeLabel: '🔥 Favorito da Casa', especialBadgeClass: 'badge--popular' },
      { id: 'choc-quente',      categoriaId: 'especiais', nome: 'Chocolate Quente Premium', descricao: 'Chocolate belga 70% fundido com leite integral. Denso, aveludado e inesquecível nos dias frios.', preco: 12.00, imagemUrl: 'assets/images/produto-doce.png',  badges: [],          ativo: true, ordem: 2 },
      { id: 'chai-latte',       categoriaId: 'especiais', nome: 'Chai Latte',             descricao: 'Blend de especiarias indianas com leite vaporizado. Canela, cardamomo, gengibre e aconchego em cada gole.', preco: 11.00, imagemUrl: 'assets/images/galeria-latte.png', badges: ['novo'], ativo: true, ordem: 3 }
    ]
  };

  const LS_KEY = 'cafeteria_cardapio';

  /* ── Carregar dados (Supabase) ──────────────────────────── */
  async function loadDataAndRender() {
    try {
      const [cats, prods] = await Promise.all([
        window.cafeteriaDB.categories.all(),
        window.cafeteriaDB.products.all()
      ]);
      
      const appData = { categorias: cats, produtos: prods };
      window.cafeteriaDB.cache.set('cafeteria_cardapio_cache', appData);
      renderCardapio(appData);
    } catch (err) {
      console.error('Erro ao carregar cardápio do Supabase:', err);
      const cached = window.cafeteriaDB.cache.get('cafeteria_cardapio_cache');
      if (cached) renderCardapio(cached);
      else renderCardapio(DEFAULT_DATA);
    }
  }

  /* ── Utilitários de formatação ──────────────────────────── */
  function formatPrice(preco) {
    return Number(preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ── Gerar badge HTML ───────────────────────────────────── */
  function badgeHTML(badges) {
    if (!badges || badges.length === 0) return '';
    const map = {
      popular: '<span class="badge badge--popular">🔥 Mais Pedido</span>',
      novo:    '<span class="badge badge--novo">🆕 Novidade</span>',
      promo:   '<span class="badge badge--promo">🏷️ Promoção</span>'
    };
    const html = badges.map(b => map[b] || '').filter(Boolean).join('\n          ');
    if (!html) return '';
    return `<div class="produto-card__badges">${html}</div>`;
  }

  /* ── Gerar imagem/placeholder ───────────────────────────── */
  function imageHTML(produto, catIcone) {
    if (produto.imagem_url) {
      return `<img src="${produto.imagem_url}" alt="${produto.nome} — Cafeteria do Teatro"
               class="produto-card__image" loading="lazy" />`;
    }
    return `<div class="produto-card__image-placeholder">
              <span class="placeholder-icon">${catIcone || '☕'}</span>
              <span>Foto em breve</span>
            </div>`;
  }

  /* ── Render: produto-card (padrão) ──────────────────────── */
  function renderProdutoCard(produto, catIcone) {
    return `
      <article class="produto-card fade-in" aria-label="${produto.nome}">
        <div class="produto-card__image-wrap">
          ${imageHTML(produto, catIcone)}
          ${badgeHTML(produto.badges)}
        </div>
        <div class="produto-card__body">
          <h3 class="produto-card__name">${produto.nome}</h3>
          <p class="produto-card__desc">${produto.descricao || ''}</p>
          <div class="produto-card__footer">
            <div class="produto-card__price">
              <span class="produto-card__price-label">R$</span>${formatPrice(produto.preco)}
            </div>
          </div>
        </div>
      </article>`;
  }

  /* ── Render: combo-card ─────────────────────────────────── */
  function renderComboCard(produto) {
    const icon  = produto.comboIcon  || '🎁';
    const itens = produto.comboItens || [];
    const econ  = produto.comboEconomia || '';
    const tagsHTML = itens.map(i =>
      `<span class="combo-card__item-tag">${i}</span>`
    ).join('\n            ');

    return `
      <article class="combo-card fade-in" aria-label="${produto.nome}">
        <div class="combo-card__icon" aria-hidden="true">${icon}</div>
        <div class="combo-card__content">
          <h3 class="combo-card__name">${produto.nome}</h3>
          <div class="combo-card__items">
            ${tagsHTML}
          </div>
          <p class="combo-card__desc">${produto.descricao || ''}</p>
        </div>
        <div class="combo-card__price-wrap">
          <div class="combo-card__price">R$ ${formatPrice(produto.preco)}</div>
          ${econ ? `<div class="combo-card__savings">${econ}</div>` : ''}
        </div>
      </article>`;
  }

  /* ── Render: especial-card ──────────────────────────────── */
  function renderEspecialCard(produto) {
    const imgSrc = produto.image_url || produto.imagem_url || '';
    const imgEl  = imgSrc
      ? `<img src="${imgSrc}" alt="${produto.nome} — Cafeteria do Teatro" class="especial-card__image" loading="lazy" />`
      : `<div class="especial-card__image" style="background:var(--cafe);display:flex;align-items:center;justify-content:center;font-size:4rem">✨</div>`;

    // Badge especial: para especiais, verificar se há badge definida explicitamente
    let badgeEl = '';
    if (produto.especialBadgeLabel) {
      badgeEl = `<div class="produto-card__badges" style="position:static; flex-direction:row; margin-bottom: 8px">
                   <span class="badge ${produto.especialBadgeClass || 'badge--popular'}">${produto.especialBadgeLabel}</span>
                 </div>`;
    } else if (produto.badges && produto.badges.length > 0) {
      const map = {
        popular: { label: '🔥 Mais Pedido',   cls: 'badge--popular' },
        novo:    { label: '🆕 Novidade',       cls: 'badge--novo' },
        promo:   { label: '🏷️ Promoção',      cls: 'badge--promo' }
      };
      const b = produto.badges[0];
      if (map[b]) {
        badgeEl = `<div class="produto-card__badges" style="position:static; flex-direction:row; margin-bottom: 8px">
                     <span class="badge ${map[b].cls}">${map[b].label}</span>
                   </div>`;
      }
    }

    return `
      <article class="especial-card fade-in" aria-label="${produto.nome}">
        ${imgEl}
        <div class="especial-card__body">
          ${badgeEl}
          <h3 class="especial-card__name">${produto.nome}</h3>
          <p class="especial-card__desc">${produto.descricao || ''}</p>
          <div class="especial-card__footer">
            <div class="especial-card__price">R$ ${formatPrice(produto.preco)}</div>
          </div>
        </div>
      </article>`;
  }

  /* ── Render seção de categoria ──────────────────────────── */
  function renderSection(cat, produtos) {
    const isCombo    = cat.id === 'combos';
    const isEspecial = cat.id === 'especiais';
    const isDark     = isCombo;

    const gridClass  = isCombo ? 'combo-grid' : 'produto-grid';

    const cardHTML = produtos
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .map(p => {
        if (isCombo)    return renderComboCard(p);
        if (isEspecial) return renderEspecialCard(p);
        return renderProdutoCard(p, cat.icone);
      }).join('');

    const darkHeaderStyle = isDark ? 'style="border-bottom-color:rgba(245,236,215,0.1)"' : '';
    const darkDescStyle   = isDark ? 'style="color:rgba(237,224,196,0.6);text-align:right"' : '';
    const titleClass      = isDark ? 'cat-section__title section-title--light' : 'cat-section__title';
    const sectionClass    = isDark ? 'cat-section section--dark' : 'cat-section';

    return `
  <section class="${sectionClass}" id="${cat.id}" aria-labelledby="titulo-${cat.id}">
    <div class="container">
      <div class="cat-section__header fade-in" ${darkHeaderStyle}>
        <div class="cat-section__title-group">
          <div class="cat-section__icon" aria-hidden="true">${cat.icone}</div>
          <h2 class="${titleClass}" id="titulo-${cat.id}">${cat.nome}</h2>
        </div>
        <p class="cat-section__description" ${darkDescStyle}>${cat.descricao || ''}</p>
      </div>
      <div class="${gridClass}">
        ${cardHTML}
      </div>
    </div>
  </section>`;
  }

  /* ── Render category nav buttons ────────────────────────── */
  function renderCatNav(categorias) {
    const catNav = document.querySelector('.cat-nav__inner');
    if (!catNav) return;

    catNav.innerHTML = categorias
      .filter(c => c.ativo)
      .map((c, i) => `
        <button class="cat-nav__btn${i === 0 ? ' active' : ''}" data-cat="${c.id}" id="cat-btn-${c.id}">
          <span class="cat-nav__icon">${c.icone}</span> ${c.nome}
        </button>`
      ).join('');
  }

  /* ── Substituir o conteúdo estático do <main> ───────────── */
  function renderCardapio(data) {
    const categorias = data.categorias.filter(c => c.ativo);
    const produtos   = data.produtos.filter(p => p.ativo);

    // Atualiza nav de categorias
    renderCatNav(categorias);

    // Encontrar o contêiner das seções
    const main = document.querySelector('main');
    if (!main) return;

    // Remove seções de categorias existentes (mantém hero, catNav, CTA)
    const existing = main.querySelectorAll('.cat-section');
    existing.forEach(s => s.remove());

    // Posição de inserção: após a nav de categorias
    const catNav = main.querySelector('.cat-nav');
    const cta    = main.querySelector('.cardapio-cta');
    const refBefore = cta || null;

    const fragment = document.createDocumentFragment();
    const tempDiv  = document.createElement('div');

    categorias.forEach(cat => {
      const prods = produtos.filter(p => (p.categoria_id || p.categoriaId) === cat.id);
      if (prods.length === 0) return;
      tempDiv.innerHTML = renderSection(cat, prods);
      while (tempDiv.firstChild) fragment.appendChild(tempDiv.firstChild);
    });

    if (refBefore) {
      main.insertBefore(fragment, refBefore);
    } else {
      main.appendChild(fragment);
    }

    // Re-registra observer para fade-in nos novos elementos
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });

    main.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
  }

  /* ── Init ───────────────────────────────────────────────── */
  function init() {
    // 1. Render immediately from cache if available
    const cached = window.cafeteriaDB.cache.get('cafeteria_cardapio_cache');
    if (cached) renderCardapio(cached);
    else renderCardapio(DEFAULT_DATA);

    // 2. Load fresh from Supabase
    loadDataAndRender();

    // 3. Realtime updates
    window.cafeteriaDB.subscribeToChanges(() => {
      loadDataAndRender();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
