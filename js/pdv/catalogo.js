/* =========================================================
   PDV — CATÁLOGO DE PRODUTOS, CATEGORIAS, BUSCA & ESTOQUE
   ========================================================= */

import { estadoPDV, escapeHtml } from './estado.js';

const TERMOS_RAPIDOS = [
  'expresso', 'espresso', 'cappuccino', 'pão de queijo', 'pao de queijo',
  'croissant', 'água', 'agua', 'cookie', 'latte', 'mocha', 'mate',
  'refrigerante', 'suco'
];

function isProdutoRapido(p) {
  if (!p) return false;
  const nome = (p.nome || '').toLowerCase();
  const desc = (p.descricao || '').toLowerCase();
  return TERMOS_RAPIDOS.some(t => nome.includes(t) || desc.includes(t));
}

export function registrarCatalogoPDV() {
  const { productSearch, categoriesTabs, productsGrid } = estadoPDV.refs;
  const showToast = (...args) => (window.showToast || estadoPDV.fn.showToast)?.(...args);

  async function loadPromocoes() {
    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('promocoes_do_dia');
      if (!error && data) {
        estadoPDV.activePromos = data;
        localStorage.setItem('cafeteria_cache_pdv_promos', JSON.stringify(data));
      } else {
        throw error || new Error('Falha ao carregar promoções');
      }
    } catch (e) {
      console.warn('[PDV Cache] Carregando promoções do cache local:', e);
      const cached = localStorage.getItem('cafeteria_cache_pdv_promos');
      if (cached) {
        try { estadoPDV.activePromos = JSON.parse(cached); } catch {}
      }
    }
  }

  async function loadAdicionais() {
    try {
      const [{ data, error: errAdic }, { data: vinculosData, error: errVinc }] = await Promise.all([
        window.cafeteriaSupabase
          .from('adicionais')
          .select('*')
          .eq('ativo', true)
          .order('ordem', { ascending: true }),
        window.cafeteriaSupabase
          .from('v_adicionais_produto')
          .select('*')
      ]);

      if (!errAdic && data) {
        estadoPDV.allAdicionais = data;
        localStorage.setItem('cafeteria_cache_pdv_adicionais', JSON.stringify(data));
      }
      if (!errVinc && vinculosData) {
        estadoPDV.allVinculosProduto = vinculosData;
        localStorage.setItem('cafeteria_cache_pdv_vinculos', JSON.stringify(vinculosData));
      }
    } catch (e) {
      console.warn('[PDV Cache] Carregando adicionais do cache local:', e);
      const cachedAdic = localStorage.getItem('cafeteria_cache_pdv_adicionais');
      if (cachedAdic) {
        try { estadoPDV.allAdicionais = JSON.parse(cachedAdic); } catch {}
      }
      const cachedVinc = localStorage.getItem('cafeteria_cache_pdv_vinculos');
      if (cachedVinc) {
        try { estadoPDV.allVinculosProduto = JSON.parse(cachedVinc); } catch {}
      }
    }
  }

  async function loadProdutos() {
    try {
      const { data: produtosData, error } = await window.cafeteriaSupabase
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (!error && produtosData) {
        estadoPDV.allProducts = produtosData.filter(p => !p.apenas_encomenda);
        localStorage.setItem('cafeteria_cache_pdv_produtos', JSON.stringify(estadoPDV.allProducts));
      } else {
        throw error || new Error('Falha ao carregar produtos');
      }
    } catch (e) {
      console.warn('[PDV Cache] Carregando produtos do cache local:', e);
      const cached = localStorage.getItem('cafeteria_cache_pdv_produtos');
      if (cached) {
        try { estadoPDV.allProducts = JSON.parse(cached).filter(p => !p.apenas_encomenda); } catch {}
      }
    }

    if (estadoPDV.allProducts && estadoPDV.allProducts.length > 0) {
      renderCategories();
      const firstCat = [...new Set(estadoPDV.allProducts.map(p => p.categoria_id))][0];
      if (firstCat && !estadoPDV.currentCategory) setCategory(firstCat);
      else renderProducts();
    }
  }

  function renderCategories() {
    if (!categoriesTabs) return;
    const catIds = [...new Set(estadoPDV.allProducts.map(p => p.categoria_id))];
    categoriesTabs.innerHTML = '';

    const btnRapidos = document.createElement('button');
    btnRapidos.className = 'cat-tab' + (estadoPDV.currentCategory === '__rapidos__' ? ' active' : '');
    btnRapidos.textContent = '⭐ Rápidos';
    btnRapidos.onclick = () => setCategory('__rapidos__');
    categoriesTabs.appendChild(btnRapidos);

    const btnTodos = document.createElement('button');
    btnTodos.className = 'cat-tab' + (estadoPDV.currentCategory === '' ? ' active' : '');
    btnTodos.textContent = '🌟 Todos';
    btnTodos.onclick = () => setCategory('');
    categoriesTabs.appendChild(btnTodos);

    const btnPromos = document.createElement('button');
    btnPromos.className = 'cat-tab' + (estadoPDV.currentCategory === '__promos__' ? ' active' : '');
    btnPromos.textContent = '🔥 Promos de hoje';
    btnPromos.onclick = () => setCategory('__promos__');
    categoriesTabs.appendChild(btnPromos);

    catIds.forEach(catId => {
      if (!catId) return;
      const btn = document.createElement('button');
      btn.className = 'cat-tab' + (estadoPDV.currentCategory === catId ? ' active' : '');
      btn.textContent = (catId.charAt(0).toUpperCase() + catId.slice(1)).replace(/-/g, ' ');
      btn.onclick = () => setCategory(catId);
      categoriesTabs.appendChild(btn);
    });
  }

  function setCategory(catId) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch (_) {}
    }
    estadoPDV.currentCategory = catId || '';
    document.querySelectorAll('.cat-tab').forEach(t => {
      if (estadoPDV.currentCategory === '__rapidos__') {
        t.classList.toggle('active', t.textContent.includes('Rápidos'));
      } else if (!estadoPDV.currentCategory) {
        t.classList.toggle('active', t.textContent.includes('Todos'));
      } else if (estadoPDV.currentCategory === '__promos__') {
        t.classList.toggle('active', t.textContent.includes('Promos'));
      } else {
        const textNorm = (t.textContent || '').toLowerCase().replace(/\s+/g, '-');
        t.classList.toggle('active', textNorm === estadoPDV.currentCategory.toLowerCase());
      }
    });
    renderProducts();
  }

  async function showEsgotadoMenu(produto) {
    const isEsgotado = produto.disponivel === false;
    const msg = isEsgotado
      ? `Deseja marcar "${produto.nome}" como DISPONÍVEL para pedidos?`
      : `Deseja marcar "${produto.nome}" como ESGOTADO no cardápio?`;

    const confirmar = await window.showConfirmBottomSheet({
      titulo: 'Disponibilidade do Produto',
      mensagem: msg,
      textoConfirmar: isEsgotado ? 'Sim, Disponibilizar' : 'Sim, Esgotar',
      textoCancelar: 'Cancelar',
      perigoso: !isEsgotado
    });

    if (confirmar) {
      try {
        const { error } = await window.cafeteriaSupabase.rpc('toggle_produto_disponivel', {
          p_produto_id: produto.id,
          p_disponivel: isEsgotado
        });
        if (error) throw error;
        produto.disponivel = isEsgotado;
        renderProducts();
        showToast(`"${produto.nome}" marcado como ${isEsgotado ? 'disponível' : 'esgotado'}.`, { tipo: 'success' });
      } catch (err) {
        console.error('Erro ao atualizar disponibilidade', err);
        showToast('Erro ao atualizar produto. Verifique suas permissões ou tente recarregar.', { tipo: 'error' });
      }
    }
  }

  function renderProducts() {
    if (!productsGrid) return;
    productsGrid.innerHTML = '';

    const { allProducts, activePromos, currentCategory, searchQuery, cart } = estadoPDV;
    let filtered = allProducts;

    if (currentCategory === '__rapidos__') {
      const rapidos = filtered.filter(p => isProdutoRapido(p));
      if (rapidos.length >= 4) {
        filtered = rapidos.slice(0, 14);
      } else {
        const simples = filtered.filter(p => !p.permite_adicionais && p.tipo_montagem !== 'meio_a_meio');
        filtered = [...new Set([...rapidos, ...simples])].slice(0, 14);
      }
    } else if (currentCategory === '__promos__') {
      filtered = filtered.filter(p => activePromos.some(promo => promo.produto_id === p.id || promo.categoria_id === p.categoria_id));
    } else if (currentCategory) {
      filtered = filtered.filter(p => p.categoria_id === currentCategory);
    }

    if (searchQuery) {
      if (window.SmartSearch && typeof window.SmartSearch.filterProducts === 'function') {
        filtered = window.SmartSearch.filterProducts(filtered, searchQuery);
      } else {
        filtered = filtered.filter(p => p.nome.toLowerCase().includes(searchQuery) || (p.descricao && p.descricao.toLowerCase().includes(searchQuery)));
      }
    }

    if (filtered.length === 0) {
      productsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: #888;">Nenhum produto encontrado.</div>';
      return;
    }

    filtered.forEach(p => {
      const card = document.createElement('div');
      const isSimples = !p.permite_adicionais && p.tipo_montagem !== 'meio_a_meio';

      const cartItemIndex = cart.findIndex(item =>
        item.produto.id === p.id &&
        (!item.adicionaisSelecionados || item.adicionaisSelecionados.length === 0) &&
        (!item.sabores || item.sabores.length === 0)
      );
      const totalQtdCarrinho = cart
        .filter(item => item.produto.id === p.id)
        .reduce((sum, item) => sum + (parseInt(item.quantidade, 10) || 1), 0);

      const itemQtyVal = cartItemIndex !== -1 ? (parseInt(cart[cartItemIndex].quantidade, 10) || 1) : 1;
      const totalQtyVal = parseInt(totalQtdCarrinho, 10) || 0;

      card.className = 'product-card' +
        (p.disponivel === false ? ' produto-esgotado' : '') +
        (totalQtyVal > 0 ? ' is-in-cart' : '');

      const descHtml = p.descricao ? `<p class="product-card__desc">${escapeHtml(p.descricao)}</p>` : '';
      const isPromo = activePromos.some(promo => promo.produto_id === p.id || promo.categoria_id === p.categoria_id);
      const promoBadgeHtml = isPromo ? `<span style="background:#e74c3c; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; vertical-align:middle;">PROMO</span>` : '';
      const stampHtml = p.disponivel === false ? `<div class="esgotado-stamp">ESGOTADO</div>` : '';

      let actionBadgeHtml = '';
      if (p.disponivel !== false) {
        if (isSimples && cartItemIndex !== -1) {
          actionBadgeHtml = `
            <div class="card-qty-controls">
              <button type="button" class="card-qty-btn minus" title="Diminuir quantidade">−</button>
              <span class="card-qty-val">${itemQtyVal}</span>
              <button type="button" class="card-qty-btn plus" title="Aumentar quantidade">+</button>
            </div>
          `;
        } else if (!isSimples && totalQtyVal > 0) {
          actionBadgeHtml = `<span class="card-cart-pill">${totalQtyVal} no carrinho</span>`;
        } else {
          actionBadgeHtml = `<span class="btn-add-badge">+ Adicionar</span>`;
        }
      }

      card.innerHTML = `
        <div class="product-card__header">
          <h4>${escapeHtml(p.nome)}${promoBadgeHtml}</h4>
          ${descHtml}
        </div>
        <div class="product-card__bottom">
          <span class="price">R$ ${Number(p.preco).toFixed(2).replace('.', ',')}</span>
          ${actionBadgeHtml}
        </div>
        ${stampHtml}
      `;

      const btnMinus = card.querySelector('.card-qty-btn.minus');
      const btnPlus = card.querySelector('.card-qty-btn.plus');

      if (btnMinus) {
        btnMinus.onclick = (e) => {
          e.stopPropagation();
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(12); } catch (_) {}
          }
          estadoPDV.fn.updateQuantity?.(cartItemIndex, -1);
          renderProducts();
        };
      }

      if (btnPlus) {
        btnPlus.onclick = (e) => {
          e.stopPropagation();
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(12); } catch (_) {}
          }
          estadoPDV.fn.updateQuantity?.(cartItemIndex, 1);
          renderProducts();
        };
      }

      card.onclick = () => {
        if (p.disponivel === false) return;
        if (isSimples) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(15); } catch (_) {}
          }
          if (cartItemIndex !== -1) {
            estadoPDV.fn.updateQuantity?.(cartItemIndex, 1);
          } else {
            estadoPDV.fn.addToCartFromMontagem?.({
              produto: p,
              adicionaisSelecionados: [],
              sabores: null,
              observacoes: ''
            });
          }
          renderProducts();
        } else {
          estadoPDV.fn.openMontagemModal?.(p);
        }
      };

      // Lógica de Esgotar (Pressionar e Segurar)
      let pressTimer;
      const startPress = (e) => {
        if (e.button && e.button !== 0) return;
        pressTimer = setTimeout(() => {
          showEsgotadoMenu(p);
        }, 800);
      };
      const cancelPress = () => clearTimeout(pressTimer);

      card.addEventListener('pointerdown', startPress);
      card.addEventListener('pointerup', cancelPress);
      card.addEventListener('pointerleave', cancelPress);
      card.addEventListener('pointercancel', cancelPress);
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        cancelPress();
        showEsgotadoMenu(p);
      });

      productsGrid.appendChild(card);
    });
  }

  function syncProductCardsWithCart() {
    if (estadoPDV.isRenderingProducts || !productsGrid || productsGrid.children.length === 0) return;
    estadoPDV.isRenderingProducts = true;
    renderProducts();
    estadoPDV.isRenderingProducts = false;
  }

  if (productSearch) {
    productSearch.addEventListener('input', (e) => {
      estadoPDV.searchQuery = e.target.value.toLowerCase().trim();
      renderProducts();
    });
  }

  estadoPDV.fn.loadPromocoes = loadPromocoes;
  estadoPDV.fn.loadAdicionais = loadAdicionais;
  estadoPDV.fn.loadProdutos = loadProdutos;
  estadoPDV.fn.renderCategories = renderCategories;
  estadoPDV.fn.setCategory = setCategory;
  estadoPDV.fn.showEsgotadoMenu = showEsgotadoMenu;
  estadoPDV.fn.renderProducts = renderProducts;
  estadoPDV.fn.syncProductCardsWithCart = syncProductCardsWithCart;
}
