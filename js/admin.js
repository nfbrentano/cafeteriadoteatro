/* =========================================================
   ADMIN.JS — Lógica do Painel Administrativo
   Cafeteria do Teatro
   ========================================================= */

(function () {
  'use strict';

  /* ── Constantes ─────────────────────────────────────────── */
  const LS_KEY = 'cafeteria_cardapio';
  const LS_PASS_KEY = 'cafeteria_admin_pass';

  /* ── Estado em memória (sem localStorage para sessão) ───── */
  const session = {
    isLoggedIn: false,
    username: '',
    password: ''   // senha atual (pode ser alterada)
  };

  /* ── Credenciais padrão ─────────────────────────────────── */
  function getPassword() {
    // Senha pode ter sido alterada e salva em LS
    return localStorage.getItem(LS_PASS_KEY) || 'cafeteria2025';
  }

  /* ── Dados padrão (seed) ────────────────────────────────── */
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
      { id: 'espresso',       categoriaId: 'cafes',     nome: 'Espresso',                 descricao: 'Encorpado, aromático e concentrado. O clássico que nunca falha.',                        preco: 4.00,  imagemUrl: 'assets/images/produto-cafe.jpg',    badges: ['popular'], ativo: true, ordem: 1 },
      { id: 'cappuccino',     categoriaId: 'cafes',     nome: 'Cappuccino',               descricao: 'Espresso com leite vaporizado cremoso e leve toque de canela. Quente e reconfortante.',   preco: 9.00,  imagemUrl: 'assets/images/galeria-latte.jpg',   badges: ['popular'], ativo: true, ordem: 2 },
      { id: 'cafe-com-leite', categoriaId: 'cafes',     nome: 'Café com Leite',           descricao: 'O abraço quentinho da tarde. Café coado com leite integral vaporizado.',                  preco: 7.00,  imagemUrl: '',                                 badges: [],          ativo: true, ordem: 3 },
      { id: 'cafe-coado',     categoriaId: 'cafes',     nome: 'Café Coado',               descricao: 'Filtrado lentamente, preservando os melhores aromas do grão. Simples e honesto.',         preco: 5.00,  imagemUrl: '',                                 badges: [],          ativo: true, ordem: 4 },
      { id: 'latte',          categoriaId: 'cafes',     nome: 'Latte',                    descricao: 'Espresso suavizado com muito leite vaporizado sedoso. Delicado e equilibrado.',            preco: 10.00, imagemUrl: '',                                 badges: ['novo'],     ativo: true, ordem: 5 },
      { id: 'cafe-gelado',    categoriaId: 'geladas',   nome: 'Café Gelado',              descricao: 'Espresso sobre gelo com leite e espuma cremosa. Refrescante e encorpado ao mesmo tempo.', preco: 10.00, imagemUrl: 'assets/images/produto-gelado.jpg',  badges: ['popular'], ativo: true, ordem: 1 },
      { id: 'choc-gelado',    categoriaId: 'geladas',   nome: 'Chocolate Gelado',         descricao: 'Chocolate premium batido com gelo e leite. Uma indulgência que vale cada gole.',          preco: 10.00, imagemUrl: '',                                 badges: [],          ativo: true, ordem: 2 },
      { id: 'suco-natural',   categoriaId: 'geladas',   nome: 'Suco Natural',             descricao: 'Frutas da estação, espremidas na hora. Pergunte a opção do dia.',                         preco: 9.00,  imagemUrl: '',                                 badges: [],          ativo: true, ordem: 3 },
      { id: 'limonada',       categoriaId: 'geladas',   nome: 'Limonada',                 descricao: 'Limão espremido na hora com açúcar e menta. Ácida e refrescante — do jeito certo.',       preco: 9.00,  imagemUrl: '',                                 badges: [],          ativo: true, ordem: 4 },
      { id: 'bolo-dia',       categoriaId: 'doces',     nome: 'Bolo do Dia',              descricao: 'Feito diariamente, sempre fresquinho. Consulte a opção disponível hoje com a gente.',     preco: 9.00,  imagemUrl: 'assets/images/produto-doce.jpg',    badges: ['popular'], ativo: true, ordem: 1 },
      { id: 'brownie',        categoriaId: 'doces',     nome: 'Brownie',                  descricao: 'De chocolate intenso, crocante por fora e macio por dentro. O favorito de sempre.',       preco: 8.00,  imagemUrl: '',                                 badges: [],          ativo: true, ordem: 2 },
      { id: 'cheesecake',     categoriaId: 'doces',     nome: 'Cheesecake',               descricao: 'Cremoso, com base de biscoito e calda de frutas vermelhas. Uma fatia de prazer.',          preco: 12.00, imagemUrl: '',                                 badges: ['novo'],     ativo: true, ordem: 3 },
      { id: 'brigadeiro',     categoriaId: 'doces',     nome: 'Brigadeiro Gourmet',       descricao: 'Chocolate belga, coberto com granulado artesanal. O clássico elevado à sua melhor versão.',preco: 5.00,  imagemUrl: '',                                 badges: ['promo'],    ativo: true, ordem: 4 },
      { id: 'croissant',      categoriaId: 'salgados',  nome: 'Croissant de Queijo',      descricao: 'Folhado dourado, recheio de queijo derretido. Crocante por fora, macio por dentro.',      preco: 8.00,  imagemUrl: 'assets/images/produto-salgado.jpg', badges: ['popular'], ativo: true, ordem: 1 },
      { id: 'pao-queijo',     categoriaId: 'salgados',  nome: 'Pão de Queijo Artesanal',  descricao: 'Receita caseira, saído quentinho. Aquele cheiro e aquela textura impossíveis de resistir.', preco: 6.00, imagemUrl: '',                                badges: [],          ativo: true, ordem: 2 },
      { id: 'wrap-veg',       categoriaId: 'salgados',  nome: 'Wrap Vegetariano',         descricao: 'Tortilla integral com legumes frescos, cream cheese e temperos especiais. Leve e nutritivo.',preco: 14.00,imagemUrl: '',                                badges: ['novo'],     ativo: true, ordem: 3 },
      { id: 'sanduiche-nat',  categoriaId: 'salgados',  nome: 'Sanduíche Natural',        descricao: 'Pão artesanal com recheio fresco do dia. Peça para descobrir a combinação especial.',     preco: 13.00, imagemUrl: '',                                 badges: [],          ativo: true, ordem: 4 },
      { id: 'combo-pausa',    categoriaId: 'combos',    nome: 'Combo Pausa',              descricao: 'A pausa perfeita para recarregar as energias antes ou depois do espetáculo.',             preco: 14.00, imagemUrl: '',                                 badges: [],          ativo: true, ordem: 1, comboIcon: '☕🍰', comboItens: ['Café à escolha', 'Doce à escolha'], comboEconomia: 'Economize R$ 4,00' },
      { id: 'combo-cultura',  categoriaId: 'combos',    nome: 'Combo Cultura',            descricao: 'A combinação ideal para quem não quer parar — do estudo ao espetáculo.',                  preco: 15.00, imagemUrl: '',                                 badges: [],          ativo: true, ordem: 2, comboIcon: '🎭☕', comboItens: ['Café à escolha', 'Salgado à escolha'], comboEconomia: 'Economize R$ 3,00' },
      { id: 'combo-estudo',   categoriaId: 'combos',    nome: 'Combo Estudo',             descricao: 'Para as sessões longas de estudo — tudo o que você precisa para durar o dia.',            preco: 17.00, imagemUrl: '',                                 badges: [],          ativo: true, ordem: 3, comboIcon: '📚☕', comboItens: ['Café à escolha', 'Doce à escolha', 'Água mineral'], comboEconomia: 'Economize R$ 6,00' },
      { id: 'affogato',       categoriaId: 'especiais', nome: 'Affogato',                 descricao: 'Espresso duplo derramado sobre sorvete de creme. Quente e frio ao mesmo tempo — uma experiência.', preco: 14.00, imagemUrl: 'assets/images/produto-cafe.png',  badges: ['popular'], ativo: true, ordem: 1, especialBadgeLabel: '🔥 Favorito da Casa', especialBadgeClass: 'badge--popular' },
      { id: 'choc-quente',    categoriaId: 'especiais', nome: 'Chocolate Quente Premium', descricao: 'Chocolate belga 70% fundido com leite integral. Denso, aveludado e inesquecível nos dias frios.', preco: 12.00, imagemUrl: 'assets/images/produto-doce.png',  badges: [],          ativo: true, ordem: 2 },
      { id: 'chai-latte',     categoriaId: 'especiais', nome: 'Chai Latte',               descricao: 'Blend de especiarias indianas com leite vaporizado. Canela, cardamomo, gengibre e aconchego em cada gole.', preco: 11.00, imagemUrl: 'assets/images/galeria-latte.png', badges: ['novo'], ativo: true, ordem: 3 }
    ]
  };

  /* ════════════════════════════════════════════════════════
     DATA LAYER
  ═══════════════════════════════════════════════════════ */
  let appData = { categorias: [], produtos: [] };

  async function loadData() {
    try {
      const [cats, prods, hero, hours] = await Promise.all([
        window.cafeteriaDB.categories.all(),
        window.cafeteriaDB.products.all(),
        window.cafeteriaDB.hero.get(),
        window.cafeteriaDB.hours.get()
      ]);
      
      appData.categorias = cats;
      appData.produtos   = prods;
      appData.hero       = hero;
      appData.horarios   = hours;

      // Update local cache for offline fallback
      window.cafeteriaDB.cache.set('cafeteria_cardapio_cache', appData);
      
      // If we are currently viewing a page that needs rendering, call it
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderProdutos === 'function') renderProdutos();
      if (typeof renderCategorias === 'function') renderCategorias();
      if (typeof renderHero === 'function') renderHero();

    } catch (err) {
      console.error('Erro ao carregar dados do Supabase:', err);
      // Fallback to cache
      const cached = window.cafeteriaDB.cache.get('cafeteria_cardapio_cache');
      if (cached) {
        appData = cached;
      } else {
        appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
      }
      toast('Aviso', 'Carregado do cache local (offline).', 'warn');
    }
  }

  // Pre-load from cache for faster startup
  const cachedInitial = window.cafeteriaDB.cache.get('cafeteria_cardapio_cache');
  if (cachedInitial) appData = cachedInitial;

  function saveData() {
    // This is now handled per-action, but we keep this as a no-op 
    // or sync to local cache
    window.cafeteriaDB.cache.set('cafeteria_cardapio_cache', appData);
  }

  function generateId() {
    return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function slugify(str) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function dataURLtoBlob(dataurl) {
    if (!dataurl || !dataurl.startsWith('data:')) return null;
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--) { u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
  }

  /* ════════════════════════════════════════════════════════
     TOAST SYSTEM
  ═══════════════════════════════════════════════════════ */
  const toastContainer = document.getElementById('toast-container');

  function toast(title, msg, type = 'success', duration = 3500) {
    const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <span class="toast__icon">${icons[type] || '✅'}</span>
      <div class="toast__body">
        <div class="toast__title">${title}</div>
        ${msg ? `<div class="toast__msg">${msg}</div>` : ''}
      </div>`;
    toastContainer.appendChild(el);

    setTimeout(() => {
      el.classList.add('hide');
      el.addEventListener('animationend', () => el.remove());
    }, duration);
  }

  /* ════════════════════════════════════════════════════════
     CONFIRM DIALOG
  ═══════════════════════════════════════════════════════ */
  const confirmOverlay = document.getElementById('confirm-overlay');

  function confirm({ icon = '⚠️', title, msg, okLabel = 'Confirmar', okClass = 'btn--danger' }) {
    return new Promise(resolve => {
      document.getElementById('confirm-icon').textContent   = icon;
      document.getElementById('confirm-title').textContent  = title;
      document.getElementById('confirm-msg').textContent    = msg;
      const okBtn = document.getElementById('confirm-ok');
      okBtn.textContent = okLabel;
      okBtn.className   = `btn ${okClass}`;

      confirmOverlay.classList.add('open');

      const cleanup = (val) => {
        confirmOverlay.classList.remove('open');
        okBtn.replaceWith(okBtn.cloneNode(true));
        document.getElementById('confirm-cancel').replaceWith(
          document.getElementById('confirm-cancel').cloneNode(true)
        );
        resolve(val);
      };

      document.getElementById('confirm-ok').addEventListener('click', () => cleanup(true),   { once: true });
      document.getElementById('confirm-cancel').addEventListener('click', () => cleanup(false), { once: true });
    });
  }

  /* ════════════════════════════════════════════════════════
     MODAL HELPERS
  ═══════════════════════════════════════════════════════ */
  function openModal(overlayId) {
    document.getElementById(overlayId).classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(overlayId) {
    document.getElementById(overlayId).classList.remove('open');
    document.body.style.overflow = '';
  }

  // Close on overlay click
  ['modal-produto-overlay', 'modal-cat-overlay', 'modal-promo-overlay'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target.id === id) closeModal(id);
    });
  });

  /* ════════════════════════════════════════════════════════
     NAVIGATION
  ═══════════════════════════════════════════════════════ */
  const currentPage = { id: 'dashboard' };

  function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('active'));

    const page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');

    const navBtn = document.getElementById('nav-' + pageId);
    if (navBtn) navBtn.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      produtos: 'Produtos',
      categorias: 'Categorias',
      hero: 'Hero da Home',
      horarios: 'Horários',
      promocoes: 'Promoções',
      conteudo: 'Conteúdo Home',
      configuracoes: 'Configurações'
    };
    document.getElementById('topbar-title').textContent = titles[pageId] || '';

    currentPage.id = pageId;

    // Render page
    const renderers = {
      dashboard: renderDashboard,
      produtos:  renderProdutos,
      categorias: renderCategorias,
      hero:       renderHero,
      horarios:   renderHorarios,
      promocoes:  renderPromocoes,
      conteudo:   renderConteudo
    };

    if (renderers[pageId]) renderers[pageId]();
  }

  document.querySelectorAll('.sidebar__link[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  /* ════════════════════════════════════════════════════════
     AUTH
  ═══════════════════════════════════════════════════════ */
  const loginScreen = document.getElementById('login-screen');
  const adminApp    = document.getElementById('admin-app');
  const loginForm   = document.getElementById('login-form');
  const loginError  = document.getElementById('login-error');

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-user').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const btn   = document.getElementById('login-btn');
    let valid = true;

    if (!email) {
      showFieldError('login-user', 'err-login-user', 'Digite seu e-mail.');
      valid = false;
    }
    if (!pass) {
      showFieldError('login-pass', 'err-login-pass', 'Digite sua senha.');
      valid = false;
    }

    if (!valid) return;

    btn.disabled = true;
    btn.textContent = 'Autenticando...';

    const { data, error } = await window.cafeteriaSupabase.auth.signInWithPassword({
      email,
      password: pass
    });

    if (error) {
      console.error('Erro de autenticação:', error);
      const msg = error.message === 'Invalid login credentials' 
        ? 'E-mail ou senha incorretos. Verifique seus dados.' 
        : error.message;

      toast('Erro de Login', msg, 'error');
      loginError.textContent = msg;
      loginError.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Entrar no Painel';
      
      // Shake animation
      const card = document.querySelector('.login-card');
      card.style.animation = 'none';
      setTimeout(() => card.style.animation = 'shake 0.4s ease', 10);
      return;
    }

    // Success
    session.isLoggedIn = true;
    session.user = data.user;

    loginError.classList.remove('visible');
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');

    document.getElementById('user-name-display').textContent = data.user.email.split('@')[0];
    document.getElementById('user-avatar').textContent = data.user.email[0].toUpperCase();

    await loadData();
    navigateTo('dashboard');
  });

  // Add shake animation
  const style = document.createElement('style');
  style.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`;
  document.head.appendChild(style);

  async function logout() {
    await window.cafeteriaSupabase.auth.signOut();
    session.isLoggedIn = false;
    adminApp.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    document.getElementById('login-pass').value = '';
    loginError.classList.remove('visible');
    navigateTo('dashboard'); // reset state
  }

  // Check for session on load
  (async function checkSession() {
    const { data } = await window.cafeteriaSupabase.auth.getSession();
    if (data.session) {
      session.isLoggedIn = true;
      session.user = data.session.user;

      loginScreen.classList.add('hidden');
      adminApp.classList.remove('hidden');

      const user = data.session.user;
      document.getElementById('user-name-display').textContent = user.email.split('@')[0];
      document.getElementById('user-avatar').textContent = user.email[0].toUpperCase();

      await loadData();
      navigateTo('dashboard');
      
      // Setup Realtime subscription
      window.cafeteriaDB.subscribeToChanges(() => {
        loadData(); // Re-fetch on any change
      });
    }
  })();

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-logout-topbar').addEventListener('click', logout);

  /* ════════════════════════════════════════════════════════
     DASHBOARD RENDER
  ═══════════════════════════════════════════════════════ */
  function renderDashboard() {
    const total    = appData.produtos.length;
    const ativos   = appData.produtos.filter(p => p.ativo).length;
    const cats     = appData.categorias.filter(c => c.ativo).length;
    const populares = appData.produtos.filter(p => p.badges && p.badges.includes('popular')).length;

    document.getElementById('stat-total-produtos').textContent = total;
    document.getElementById('stat-ativos').textContent         = ativos;
    document.getElementById('stat-categorias').textContent     = cats;
    document.getElementById('stat-populares').textContent      = populares;

    // Tabela por categoria
    const tbody = document.getElementById('dash-cat-table');
    tbody.innerHTML = appData.categorias.map(c => {
      const count = appData.produtos.filter(p => p.categoriaId === c.id).length;
      return `<tr>
        <td class="td-name">${c.nome}</td>
        <td style="font-size:20px">${c.icone}</td>
        <td><strong style="color:var(--caramelo)">${count}</strong> produtos</td>
        <td>${c.ativo
          ? '<span class="status-pill status-pill--ativo">Ativa</span>'
          : '<span class="status-pill status-pill--inativo">Inativa</span>'
        }</td>
      </tr>`;
    }).join('');
  }

  /* ════════════════════════════════════════════════════════
     PRODUTOS RENDER
  ═══════════════════════════════════════════════════════ */
  function renderProdutos() {
    populateCategoryFilter('filter-categoria', true);
    populateCategorySelect('produto-categoria');
    renderProdutosTable();
  }

  function populateCategoryFilter(selectId, withAll = false) {
    const sel = document.getElementById(selectId);
    const cur = sel.value;
    const opts = withAll ? '<option value="">Todas as categorias</option>' : '<option value="">Selecione...</option>';
    sel.innerHTML = opts + appData.categorias.map(c =>
      `<option value="${c.id}" ${cur === c.id ? 'selected' : ''}>${c.icone} ${c.nome}</option>`
    ).join('');
  }

  function populateCategorySelect(selectId) {
    const sel = document.getElementById(selectId);
    const cur = sel.value;
    sel.innerHTML = '<option value="">Selecione...</option>' +
      appData.categorias.map(c =>
        `<option value="${c.id}" ${cur === c.id ? 'selected' : ''}>${c.icone} ${c.nome}</option>`
      ).join('');
  }

  function getFilteredProdutos() {
    const catFilter    = document.getElementById('filter-categoria').value;
    const statusFilter = document.getElementById('filter-status').value;
    const search       = (document.getElementById('search-produto').value || '').toLowerCase();

    return appData.produtos.filter(p => {
      if (catFilter    && p.categoriaId !== catFilter) return false;
      if (statusFilter === 'ativo'   && !p.ativo)  return false;
      if (statusFilter === 'inativo' &&  p.ativo)   return false;
      if (search && !p.nome.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function badgeMiniHTML(badges) {
    if (!badges || badges.length === 0) return '<span style="color:var(--admin-text-sub);font-size:12px">—</span>';
    const map = {
      popular: '<span class="badge-mini badge-mini--popular">🔥 Popular</span>',
      novo:    '<span class="badge-mini badge-mini--novo">🆕 Novo</span>',
      promo:   '<span class="badge-mini badge-mini--promo">🏷️ Promo</span>'
    };
    return badges.map(b => map[b] || '').filter(Boolean).join(' ');
  }

  function renderProdutosTable() {
    const tbody   = document.getElementById('produtos-table-body');
    const produtos = getFilteredProdutos();

    if (produtos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-state__icon">🍽️</div>
          <div class="empty-state__title">Nenhum produto encontrado</div>
          <div class="empty-state__sub">Tente ajustar os filtros ou adicione um novo produto.</div>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = produtos.map(p => {
      const cat = appData.categorias.find(c => c.id === p.categoriaId);
      const catLabel = cat ? `${cat.icone} ${cat.nome}` : p.categoriaId;
      const preco = Number(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      return `<tr>
        <td class="td-name">${p.nome}</td>
        <td><span style="color:var(--admin-text-dim)">${catLabel}</span></td>
        <td class="td-price">R$ ${preco}</td>
        <td><div class="td-badges">${badgeMiniHTML(p.badges)}</div></td>
        <td>${p.ativo
          ? '<span class="status-pill status-pill--ativo">Ativo</span>'
          : '<span class="status-pill status-pill--inativo">Inativo</span>'
        }</td>
        <td>
          <div class="td-actions">
            <button class="btn btn--icon btn--ghost btn-edit-produto"
                    data-id="${p.id}" title="Editar produto" aria-label="Editar ${p.nome}">✏️</button>
            <button class="btn btn--icon btn--danger btn-del-produto"
                    data-id="${p.id}" title="Excluir produto" aria-label="Excluir ${p.nome}">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Events
    tbody.querySelectorAll('.btn-edit-produto').forEach(btn => {
      btn.addEventListener('click', () => openProdutoModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-del-produto').forEach(btn => {
      btn.addEventListener('click', () => deleteProduto(btn.dataset.id));
    });
  }

  // Filters & search
  document.getElementById('filter-categoria').addEventListener('change', renderProdutosTable);
  document.getElementById('filter-status').addEventListener('change', renderProdutosTable);
  document.getElementById('search-produto').addEventListener('input', renderProdutosTable);

  /* ─── PRODUTO MODAL ──────────────────────────────────────── */
  document.getElementById('btn-novo-produto').addEventListener('click', () => openProdutoModal());
  document.getElementById('modal-produto-close').addEventListener('click', () => closeModal('modal-produto-overlay'));
  document.getElementById('modal-produto-cancel').addEventListener('click', () => closeModal('modal-produto-overlay'));

  /* ════════════════════════════════════════════════════════
     IMAGE UPLOAD — Canvas → WebP
  ═══════════════════════════════════════════════════════ */
  const MAX_SIDE   = 900;    // px max dimension
  const WEBP_QUAL  = 0.85;   // WebP quality 0–1

  // Elements (lazy-referenced so they're available after DOM parse)
  function uploadEls() {
    return {
      zone:        document.getElementById('upload-zone'),
      fileInput:   document.getElementById('produto-imagem-file'),
      idle:        document.getElementById('upload-idle'),
      previewWrap: document.getElementById('upload-preview-wrap'),
      previewImg:  document.getElementById('upload-preview-img'),
      info:        document.getElementById('upload-info'),
      infoDims:    document.getElementById('upload-info-dims'),
      infoSize:    document.getElementById('upload-info-size'),
      infoSaving:  document.getElementById('upload-info-saving'),
      dataInput:   document.getElementById('produto-imagem-data'),
      urlInput:    document.getElementById('produto-imagem'),
      btnChange:   document.getElementById('btn-change-img'),
      btnRemove:   document.getElementById('btn-remove-img'),
    };
  }

  function resetUploadUI() {
    const el = uploadEls();
    el.idle.classList.remove('hidden');
    el.previewWrap.classList.add('hidden');
    el.info.style.display = 'none';
    el.dataInput.value = '';
    el.urlInput.value  = '';
    el.fileInput.value = '';
    // Remove any progress overlay
    const prog = el.zone.querySelector('.upload-progress');
    if (prog) prog.remove();
  }

  function setUploadPreview(dataUrl, dims, origBytes, webpBytes) {
    const el = uploadEls();
    el.previewImg.src = dataUrl;
    el.idle.classList.add('hidden');
    el.previewWrap.classList.remove('hidden');
    el.dataInput.value = dataUrl;
    el.urlInput.value  = '';               // clear URL field — upload takes priority

    // Info bar
    const saved = origBytes > 0 ? Math.round((1 - webpBytes / origBytes) * 100) : 0;
    el.infoDims.textContent  = `${dims.w} × ${dims.h}px`;
    el.infoSize.textContent  = `${(webpBytes / 1024).toFixed(1)} KB`;
    el.infoSaving.textContent = origBytes > 0 && saved > 0
      ? `↓ ${saved}% menor que o original`
      : '';
    el.info.style.display = 'flex';
  }

  function showUploadProgress(zone) {
    const existing = zone.querySelector('.upload-progress');
    if (existing) return existing.querySelector('.upload-progress__bar');
    const div = document.createElement('div');
    div.className = 'upload-progress';
    div.innerHTML = `
      <div class="upload-progress__label">Convertendo para WebP...</div>
      <div class="upload-progress__bar-wrap">
        <div class="upload-progress__bar" id="upload-prog-bar"></div>
      </div>`;
    zone.appendChild(div);
    return div.querySelector('.upload-progress__bar');
  }

  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Arquivo inválido', 'Selecione uma imagem (PNG, JPG, WEBP, GIF).', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast('Arquivo muito grande', 'O limite é de 20 MB.', 'error');
      return;
    }

    const el      = uploadEls();
    const origSize = file.size;
    const bar     = showUploadProgress(el.zone);

    // Animate progress bar while reading
    let pct = 0;
    const ticker = setInterval(() => {
      pct = Math.min(pct + 8, 85);
      if (bar) bar.style.width = pct + '%';
    }, 60);

    const reader = new FileReader();
    reader.onload = evt => {
      const img = new Image();
      img.onload = () => {
        clearInterval(ticker);
        if (bar) bar.style.width = '90%';

        // --- Compute target dimensions (keep aspect ratio) ---
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX_SIDE || h > MAX_SIDE) {
          const ratio = Math.min(MAX_SIDE / w, MAX_SIDE / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        // --- Draw on canvas ---
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        if (bar) bar.style.width = '95%';

        // --- Convert to WebP (fallback to JPEG if unsupported) ---
        const mime = 'image/webp';
        canvas.toBlob(blob => {
          if (bar) bar.style.width = '100%';

          const reader2 = new FileReader();
          reader2.onload = e2 => {
            const dataUrl = e2.target.result;

            // Cleanup progress overlay
            setTimeout(() => {
              const prog = el.zone.querySelector('.upload-progress');
              if (prog) prog.remove();
            }, 300);

            // Check localStorage budget (keep under 4 MB per image)
            if (blob.size > 4 * 1024 * 1024) {
              toast('Imagem muito grande após conversão',
                'Tente uma imagem com menos detalhes ou menor resolução.', 'warn', 5000);
            }

            setUploadPreview(dataUrl, { w, h }, origSize, blob.size);
          };
          reader2.readAsDataURL(blob);
        }, mime, WEBP_QUAL);
      };
      img.onerror = () => {
        clearInterval(ticker);
        const prog = el.zone.querySelector('.upload-progress');
        if (prog) prog.remove();
        toast('Erro', 'Não foi possível ler a imagem.', 'error');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Wire up upload zone interactions (once — they persist across modal opens)
  (function wireUploadZone() {
    const el = uploadEls();

    // Click zone → open file picker
    el.zone.addEventListener('click', e => {
      if (e.target.closest('.upload-zone__change') ||
          e.target.closest('.upload-zone__remove')) return;
      el.fileInput.click();
    });

    // Keyboard: Enter / Space
    el.zone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.fileInput.click();
      }
    });

    // File input change
    el.fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) processImageFile(file);
      e.target.value = '';  // reset so same file can be re-selected
    });

    // Drag & drop
    el.zone.addEventListener('dragover', e => {
      e.preventDefault();
      el.zone.classList.add('drag-over');
    });
    el.zone.addEventListener('dragleave', () => el.zone.classList.remove('drag-over'));
    el.zone.addEventListener('drop', e => {
      e.preventDefault();
      el.zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) processImageFile(file);
    });

    // Trocar imagem
    el.btnChange.addEventListener('click', e => {
      e.stopPropagation();
      el.fileInput.click();
    });

    // Remover imagem
    el.btnRemove.addEventListener('click', e => {
      e.stopPropagation();
      resetUploadUI();
    });

    // URL input typed → clear upload data, show as URL
    el.urlInput.addEventListener('input', () => {
      const url = el.urlInput.value.trim();
      // If user is typing a URL, clear uploaded image
      if (url) {
        el.dataInput.value = url;
        el.idle.classList.remove('hidden');
        el.previewWrap.classList.add('hidden');
        el.info.style.display = 'none';
      } else {
        el.dataInput.value = '';
      }
    });
  })();

  /* ─── Open / populate modal ──────────────────────────────── */
  function openProdutoModal(id) {
    const isEdit = !!id;
    document.getElementById('modal-produto-title').textContent = isEdit ? 'Editar Produto' : 'Novo Produto';
    document.getElementById('produto-id').value = id || '';

    // Reset form + upload UI
    document.getElementById('form-produto').reset();
    clearFormErrors('form-produto');
    resetUploadUI();
    populateCategorySelect('produto-categoria');

    if (isEdit) {
      const p = appData.produtos.find(x => x.id === id);
      if (!p) return;

      document.getElementById('produto-nome').value      = p.nome;
      document.getElementById('produto-categoria').value = p.categoriaId;
      document.getElementById('produto-preco').value     = p.preco;
      document.getElementById('produto-descricao').value = p.descricao || '';
      document.getElementById('produto-ativo').checked   = !!p.ativo;

      // Badges
      ['popular','novo','promo'].forEach(b => {
        const cb = document.getElementById('badge-' + b);
        if (cb) cb.checked = p.badges && p.badges.includes(b);
      });

      // Restore image — detect base64 vs URL
      const img = p.imagemUrl || '';
      if (img) {
        if (img.startsWith('data:')) {
          // Stored base64 — restore preview (no size info available)
          const el = uploadEls();
          el.previewImg.src = img;
          el.idle.classList.add('hidden');
          el.previewWrap.classList.remove('hidden');
          el.dataInput.value = img;
          el.info.style.display = 'none';
        } else {
          // External URL
          document.getElementById('produto-imagem').value    = img;
          document.getElementById('produto-imagem-data').value = img;
        }
      }
    }

    openModal('modal-produto-overlay');
    setTimeout(() => document.getElementById('produto-nome').focus(), 100);
  }

  /* ─── Save produto ───────────────────────────────────────── */
  document.getElementById('btn-salvar-produto').addEventListener('click', saveProduto);
  document.getElementById('form-produto').addEventListener('submit', e => { e.preventDefault(); saveProduto(); });

  async function saveProduto() {
    clearFormErrors('form-produto');
    let valid = true;

    const nome        = document.getElementById('produto-nome').value.trim();
    const categoriaId = document.getElementById('produto-categoria').value;
    const precoRaw    = document.getElementById('produto-preco').value;
    const descricao   = document.getElementById('produto-descricao').value.trim();
    const ativo       = document.getElementById('produto-ativo').checked;
    const editId      = document.getElementById('produto-id').value;

    const dataVal = document.getElementById('produto-imagem-data').value.trim();
    const urlVal  = document.getElementById('produto-imagem').value.trim();
    
    // Check if it's a new upload (base64)
    const isNewUpload = dataVal.startsWith('data:');
    const imageBlob = isNewUpload ? dataURLtoBlob(dataVal) : null;
    let imagemUrl = isNewUpload ? '' : (dataVal || urlVal);

    if (!nome) {
      showFieldError('produto-nome', 'err-produto-nome', 'Nome é obrigatório.');
      valid = false;
    }
    if (!categoriaId) {
      showFieldError('produto-categoria', 'err-produto-categoria', 'Selecione uma categoria.');
      valid = false;
    }
    const preco = parseFloat(precoRaw);
    if (!precoRaw || isNaN(preco) || preco < 0) {
      document.getElementById('err-produto-preco').textContent = 'Informe um preço válido.';
      document.getElementById('err-produto-preco').classList.add('visible');
      valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('btn-salvar-produto');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const badges = ['popular','novo','promo'].filter(b => {
      const cb = document.getElementById('badge-' + b);
      return cb && cb.checked;
    });

    try {
      const id = editId || generateId();
      let ordem = 0;

      if (!editId) {
        ordem = appData.produtos
          .filter(p => p.categoria_id === categoriaId)
          .reduce((max, p) => Math.max(max, p.ordem || 0), 0) + 1;
      } else {
        const p = appData.produtos.find(x => x.id === editId);
        ordem = p ? (p.ordem || 0) : 0;
      }

      await window.cafeteriaDB.products.upsert({
        id,
        nome,
        categoria_id: categoriaId,
        preco,
        descricao,
        imagem_url: imagemUrl,
        badges,
        ativo,
        ordem
      }, imageBlob);

      toast(editId ? 'Produto atualizado' : 'Produto criado', `"${nome}" foi salvo com sucesso.`, 'success');
      
      closeModal('modal-produto-overlay');
      await loadData();
      renderProdutosTable();
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar', 'Não foi possível salvar os dados no servidor.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = editId ? 'Salvar Alterações' : 'Adicionar Produto';
    }
  }

  async function deleteProduto(id) {
    const p = appData.produtos.find(x => x.id === id);
    if (!p) return;

    const ok = await confirm({
      icon: '🗑️',
      title: 'Excluir produto?',
      msg: `"${p.nome}" será removido permanentemente do cardápio.`,
      okLabel: 'Excluir',
      okClass: 'btn--danger'
    });

    if (!ok) return;

    try {
      await window.cafeteriaDB.products.delete(id);
      toast('Produto excluído', `"${p.nome}" foi removido.`, 'warn');
      await loadData();
      renderProdutosTable();
    } catch (err) {
      console.error(err);
      toast('Erro ao excluir', 'Ocorreu um problema ao remover o produto.', 'error');
    }
  }

  /* ════════════════════════════════════════════════════════
     CATEGORIAS RENDER
  ═══════════════════════════════════════════════════════ */
  function renderCategorias() {
    const container = document.getElementById('cat-list-container');

    if (appData.categorias.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🏷️</div>
          <div class="empty-state__title">Nenhuma categoria cadastrada</div>
          <div class="empty-state__sub">Adicione categorias para organizar o cardápio.</div>
        </div>`;
      return;
    }

    container.innerHTML = appData.categorias.map(c => {
      const count = appData.produtos.filter(p => p.categoriaId === c.id).length;
      return `
        <div class="cat-item" data-id="${c.id}" draggable="true">
          <div class="cat-item__drag" title="Arrastar para reordenar" aria-hidden="true">⠿</div>
          <div class="cat-item__icon">${c.icone}</div>
          <div class="cat-item__info">
            <div class="cat-item__name">${c.nome}</div>
            <div class="cat-item__meta">${count} produto${count !== 1 ? 's' : ''}${c.descricao ? ' · ' + c.descricao : ''}</div>
          </div>
          ${c.ativo
            ? '<span class="status-pill status-pill--ativo">Ativa</span>'
            : '<span class="status-pill status-pill--inativo">Inativa</span>'
          }
          <div class="cat-item__actions">
            <button class="btn btn--icon btn--ghost btn-edit-cat" data-id="${c.id}" aria-label="Editar ${c.nome}">✏️</button>
            <button class="btn btn--icon btn--danger btn-del-cat" data-id="${c.id}" aria-label="Excluir ${c.nome}">🗑️</button>
          </div>
        </div>`;
    }).join('');

    // Bind button events
    container.querySelectorAll('.btn-edit-cat').forEach(btn => {
      btn.addEventListener('click', () => openCatModal(btn.dataset.id));
    });
    container.querySelectorAll('.btn-del-cat').forEach(btn => {
      btn.addEventListener('click', () => deleteCategoria(btn.dataset.id));
    });

    // ── Drag & Drop ──────────────────────────────────────────
    let dragSrc = null;   // the item being dragged
    let dragIdx = -1;     // its original index

    container.querySelectorAll('.cat-item').forEach(item => {

      item.addEventListener('dragstart', e => {
        dragSrc = item;
        dragIdx = [...container.querySelectorAll('.cat-item')].indexOf(item);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.id);
        // Slight delay so the ghost image renders before we dim the item
        requestAnimationFrame(() => item.classList.add('dragging'));
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        container.querySelectorAll('.cat-item').forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
        dragSrc = null;
        dragIdx = -1;
      });

      item.addEventListener('dragover', e => {
        if (!dragSrc || dragSrc === item) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Determine if cursor is on the top or bottom half
        const rect   = item.getBoundingClientRect();
        const midY   = rect.top + rect.height / 2;
        const isTop  = e.clientY < midY;

        item.classList.toggle('drag-over-top',    isTop);
        item.classList.toggle('drag-over-bottom', !isTop);
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      item.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragSrc || dragSrc === item) return;

        item.classList.remove('drag-over-top', 'drag-over-bottom');

        // Determine insertion position
        const rect   = item.getBoundingClientRect();
        const isTop  = e.clientY < rect.top + rect.height / 2;
        const items  = [...container.querySelectorAll('.cat-item')];
        let dropIdx  = items.indexOf(item);
        if (!isTop) dropIdx += 1;          // insert after
        if (dropIdx > dragIdx) dropIdx -= 1; // compensate for removed element

        // Reorder in-memory array
        const arr   = appData.categorias;
        const [moved] = arr.splice(dragIdx, 1);
        arr.splice(dropIdx, 0, moved);

        // Update orders in Supabase
        (async () => {
          try {
            await Promise.all(appData.categorias.map((c, i) => {
              return window.cafeteriaDB.categories.upsert({ ...c, ordem: i });
            }));
            toast('Ordem salva', `"${moved.nome}" movida para a posição ${dropIdx + 1}.`, 'success', 2000);
            await loadData();
          } catch (err) {
            console.error(err);
            toast('Erro ao ordenar', 'Não foi possível salvar a nova ordem.', 'error');
          }
        })();

        renderCategorias();
        if (currentPage.id === 'dashboard') renderDashboard();
      });
    });
  }


  /* ─── CATEGORIA MODAL ────────────────────────────────────── */
  document.getElementById('btn-nova-categoria').addEventListener('click', () => openCatModal());
  document.getElementById('modal-cat-close').addEventListener('click', () => closeModal('modal-cat-overlay'));
  document.getElementById('modal-cat-cancel').addEventListener('click', () => closeModal('modal-cat-overlay'));

  /* ── Emoji picker helper ─────────────────────────────────── */
  function selectEmoji(emoji) {
    // Atualiza hidden input
    document.getElementById('cat-icone').value = emoji;
    // Atualiza preview
    document.getElementById('cat-icone-preview').textContent = emoji;
    // Marca botão selecionado
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.emoji === emoji);
    });
    // Limpa campo custom se o emoji veio da grade
    const custom = document.getElementById('cat-icone-custom');
    if (custom && custom.value !== emoji) custom.value = '';
  }

  // Clique em botão da grade
  document.getElementById('modal-cat-overlay').addEventListener('click', e => {
    const btn = e.target.closest('.emoji-btn');
    if (btn) selectEmoji(btn.dataset.emoji);
  });

  // Digitação no campo custom
  document.getElementById('cat-icone-custom').addEventListener('input', e => {
    const val = e.target.value.trim();
    if (val) selectEmoji(val);
  });

  function openCatModal(id) {
    const isEdit = !!id;
    document.getElementById('modal-cat-title').textContent = isEdit ? 'Editar Categoria' : 'Nova Categoria';
    document.getElementById('cat-id').value = id || '';

    document.getElementById('form-categoria').reset();
    clearFormErrors('form-categoria');

    // Ícone padrão (nova categoria)
    let iconeInicial = '☕';

    if (isEdit) {
      const c = appData.categorias.find(x => x.id === id);
      if (!c) return;
      iconeInicial = c.icone;
      document.getElementById('cat-nome').value      = c.nome;
      document.getElementById('cat-descricao').value = c.descricao || '';
      document.getElementById('cat-ativo').checked   = !!c.ativo;
    }

    // Aplica ícone inicial ao picker
    selectEmoji(iconeInicial);

    openModal('modal-cat-overlay');
    setTimeout(() => document.getElementById('cat-nome').focus(), 100);
  }

  document.getElementById('btn-salvar-categoria').addEventListener('click', saveCategoria);
  document.getElementById('form-categoria').addEventListener('submit', e => { e.preventDefault(); saveCategoria(); });

  async function saveCategoria() {
    clearFormErrors('form-categoria');
    let valid = true;

    const nome      = document.getElementById('cat-nome').value.trim();
    const icone     = document.getElementById('cat-icone').value.trim() || '📦';
    const descricao = document.getElementById('cat-descricao').value.trim();
    const ativo     = document.getElementById('cat-ativo').checked;
    const editId    = document.getElementById('cat-id').value;

    if (!nome) {
      showFieldError('cat-nome', 'err-cat-nome', 'Nome é obrigatório.');
      valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('btn-salvar-categoria');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      const id = editId || (slugify(nome) || generateId());
      let ordem = 0;
      
      if (!editId) {
        ordem = appData.categorias.length;
      } else {
        const c = appData.categorias.find(x => x.id === editId);
        ordem = c ? (c.ordem || 0) : 0;
      }

      await window.cafeteriaDB.categories.upsert({
        id, nome, icone, descricao, ativo, ordem
      });

      toast(editId ? 'Categoria atualizada' : 'Categoria criada', `"${nome}" foi salva.`, 'success');
      closeModal('modal-cat-overlay');
      await loadData();
      renderCategorias();
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar', 'Não foi possível salvar a categoria no servidor.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = editId ? 'Salvar Alterações' : 'Adicionar Categoria';
    }
  }

  async function deleteCategoria(id) {
    const c = appData.categorias.find(x => x.id === id);
    if (!c) return;

    const prodCount = appData.produtos.filter(p => p.categoriaId === id).length;
    if (prodCount > 0) {
      toast('Não é possível excluir', `"${c.nome}" possui ${prodCount} produto(s). Remova-os primeiro.`, 'error', 5000);
      return;
    }

    const ok = await confirm({
      icon: '🗑️',
      title: 'Excluir categoria?',
      msg: `"${c.nome}" será removida permanentemente.`,
      okLabel: 'Excluir',
      okClass: 'btn--danger'
    });

    if (!ok) return;

    appData.categorias = appData.categorias.filter(x => x.id !== id);
    saveData();
    renderCategorias();
    toast('Categoria excluída', `"${c.nome}" foi removida.`, 'warn');
  }

  /* ════════════════════════════════════════════════════════
     CONFIGURAÇÕES
  ═══════════════════════════════════════════════════════ */

  // Alterar senha
  document.getElementById('form-alterar-senha').addEventListener('submit', e => {
    e.preventDefault();

    const atual      = document.getElementById('senha-atual').value;
    const nova       = document.getElementById('senha-nova').value;
    const confirmar  = document.getElementById('senha-confirmar').value;

    ['senha-atual','senha-nova','senha-confirmar'].forEach(id => {
      document.getElementById(id).classList.remove('error');
      document.getElementById('err-' + id).textContent = '';
      document.getElementById('err-' + id).classList.remove('visible');
    });

    let valid = true;

    if (atual !== getPassword()) {
      showFieldError('senha-atual', 'err-senha-atual', 'Senha atual incorreta.');
      valid = false;
    }
    if (nova.length < 6) {
      showFieldError('senha-nova', 'err-senha-nova', 'A nova senha deve ter pelo menos 6 caracteres.');
      valid = false;
    }
    if (nova !== confirmar) {
      showFieldError('senha-confirmar', 'err-senha-confirmar', 'As senhas não coincidem.');
      valid = false;
    }

    if (!valid) return;

    localStorage.setItem(LS_PASS_KEY, nova);
    session.password = nova;
    document.getElementById('form-alterar-senha').reset();
    toast('Senha alterada', 'Sua nova senha foi salva com sucesso.', 'success');
  });

  // Exportar JSON
  document.getElementById('btn-exportar').addEventListener('click', () => {
    const json = JSON.stringify(appData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cafeteria-cardapio-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exportado', 'Arquivo JSON baixado com sucesso.', 'success');
  });

  // Importar JSON
  document.getElementById('import-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!imported.produtos || !imported.categorias) {
          toast('Arquivo inválido', 'O JSON não contém produtos e categorias.', 'error');
          return;
        }

        const ok = await confirm({
          icon: '⬆️',
          title: 'Importar dados?',
          msg: 'Os dados atuais serão substituídos pelos dados do arquivo importado.',
          okLabel: 'Importar',
          okClass: 'btn--primary'
        });

        if (!ok) return;

        appData = imported;
        saveData();
        toast('Importado', `${imported.produtos.length} produtos importados.`, 'success');
        if (currentPage.id !== 'configuracoes') navigateTo(currentPage.id);
        else renderDashboard();
      } catch (_) {
        toast('Erro', 'Falha ao ler o arquivo JSON.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Resetar para padrão
  document.getElementById('btn-resetar').addEventListener('click', async () => {
    const ok = await confirm({
      icon: '⚠️',
      title: 'Resetar todos os dados?',
      msg: 'Todos os produtos e categorias editados serão perdidos e substituídos pelos dados originais. Esta ação não pode ser desfeita.',
      okLabel: 'Resetar Tudo',
      okClass: 'btn--danger'
    });

    if (!ok) return;

    appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveData();
    toast('Reset concluído', 'Dados restaurados para o padrão original.', 'warn');
    navigateTo('dashboard');
  });


  /* ════════════════════════════════════════════════════════
     HERO MANAGEMENT
  ═══════════════════════════════════════════════════════ */
  const HERO_LS_KEY = 'cafeteria_hero_home';
  const HERO_MAX_W  = 1920;
  const HERO_QUAL   = 0.82;

  function heroEls() {
    return {
      zone:        document.getElementById('hero-upload-zone'),
      fileInput:   document.getElementById('hero-image-file'),
      idle:        document.getElementById('hero-upload-idle'),
      previewWrap: document.getElementById('hero-upload-preview-wrap'),
      previewImg:  document.getElementById('hero-upload-preview-img'),
      info:        document.getElementById('hero-upload-info'),
      infoDims:    document.getElementById('hero-info-dims'),
      infoSize:    document.getElementById('hero-info-size'),
      infoSaving:  document.getElementById('hero-info-saving'),
      dataInput:   document.getElementById('hero-image-data'),
      altInput:    document.getElementById('hero-alt'),
      livePreviewBg: document.getElementById('hero-preview-bg'),
      livePreviewBadge: document.getElementById('hero-preview-badge'),
      btnSave:     document.getElementById('btn-save-hero'),
      btnReset:    document.getElementById('btn-reset-hero'),
      btnChange:   document.getElementById('btn-hero-change-img'),
      btnRemove:   document.getElementById('btn-hero-remove-img'),
    };
  }

  function renderHero() {
    const el = heroEls();
    if (!el.zone) return;

    const data = appData.hero;
    
    // 1. Atualizar Mini-Preview (Upload Zone)
    if (data && data.image_url) {
      el.previewImg.src = data.image_url;
      el.previewWrap.classList.remove('hidden');
      el.idle.classList.add('hidden');
      el.altInput.value = data.image_alt || '';
      el.info.style.display = 'block';

      // 2. Atualizar Mockup/Live Preview
      el.livePreviewBg.style.backgroundImage = `url(${data.image_url})`;
      el.livePreviewBadge.textContent = 'Personalizado';
      el.livePreviewBadge.classList.add('custom');
    } else {
      el.previewImg.src = '';
      el.previewWrap.classList.add('hidden');
      el.idle.classList.remove('hidden');
      el.altInput.value = '';
      el.info.style.display = 'none';

      // Reset Mockup
      resetHeroUI();
    }
    
    // Limpar estados internos de upload não-salvos
    el.dataInput.value = '';
    el.fileInput.value = '';
  }

  function resetHeroUI() {
    const el = heroEls();
    el.livePreviewBg.style.backgroundImage = "url('assets/images/hero-bg.jpg')";
    el.livePreviewBadge.textContent = 'Padrão';
    el.livePreviewBadge.classList.remove('custom');
    el.altInput.value = '';
  }

  function processHeroFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Formato inválido', 'Por favor, selecione uma imagem.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Arquivo muito grande', 'O limite é 10MB.', 'warn');
      return;
    }

    const el = heroEls();
    const reader = new FileReader();

    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (w < 1200) {
          toast('Resolução baixa', 'Uma imagem com menos de 1200px pode ficar borrada no Hero.', 'warn');
        }

        // Resize
        if (w > HERO_MAX_W) {
          const ratio = HERO_MAX_W / w;
          w = HERO_MAX_W;
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Try WebP then JPEG
        let mime = 'image/webp';
        let dataUrl = canvas.toDataURL(mime, HERO_QUAL);
        
        // If WebP is not supported or larger than expected, we could fallback, 
        // but dataURL with quality is usually enough.
        
        // Size estimation
        const head = dataUrl.split(',')[0];
        const bytes = Math.round((dataUrl.length - head.length) * 3 / 4);
        const originalSize = file.size;
        const saving = Math.round((1 - (bytes / originalSize)) * 100);

        // Show preview in widget
        el.previewImg.src = dataUrl;
        el.dataInput.value = dataUrl;
        el.idle.classList.add('hidden');
        el.previewWrap.classList.remove('hidden');

        // Show info
        el.infoDims.textContent = `${w} × ${h}px`;
        el.infoSize.textContent = `${(bytes / 1024).toFixed(0)} KB`;
        el.infoSaving.textContent = saving > 0 ? `↓ ${saving}% menor` : '';
        el.info.style.display = 'flex';

        // Show in mockup/live preview too
        el.livePreviewBg.style.backgroundImage = `url(${dataUrl})`;
        el.livePreviewBadge.textContent = 'Preview';
        el.livePreviewBadge.classList.add('custom');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Event Listeners for Hero Page
  (function initHeroEvents() {
    const el = heroEls();
    if (!el.zone) return; // Not loaded yet

    el.zone.addEventListener('click', e => {
      if (e.target.closest('.upload-zone__overlay')) return;
      el.fileInput.click();
    });

    el.fileInput.addEventListener('change', e => {
      if (e.target.files[0]) processHeroFile(e.target.files[0]);
    });

    el.btnChange.addEventListener('click', () => el.fileInput.click());
    el.btnRemove.addEventListener('click', () => {
      el.dataInput.value = '';
      el.previewWrap.classList.add('hidden');
      el.idle.classList.remove('hidden');
      el.info.style.display = 'none';
    });

    el.btnSave.addEventListener('click', async () => {
      const dataUrl = el.dataInput.value; // Nova imagem (DataURL)
      const alt = el.altInput.value.trim();
      const currentHero = appData.hero;

      // Só salva se houver nova imagem OU se o texto Alt mudou
      const hasNewImage = !!dataUrl;
      const altChanged = (currentHero?.image_alt || '') !== alt;

      if (!hasNewImage && !altChanged) {
          toast('Sem alterações', 'Nada foi modificado para salvar.', 'info');
          return;
      }

      el.btnSave.disabled = true;
      el.btnSave.textContent = 'Enviando...';

      try {
        let imageBlob = null;
        if (hasNewImage) {
          imageBlob = dataURLtoBlob(dataUrl);
        }

        // Se não tem nova imagem, passa null para o blob mas mantém o Alt
        await window.cafeteriaDB.hero.update(imageBlob, alt || 'Interior da Cafeteria do Teatro');
        
        toast('Salvo!', 'Configurações de Hero atualizadas.', 'success');
        
        // Limpar input de dados após salvar com sucesso
        el.dataInput.value = '';
        
        await loadData();
        renderHero();
      } catch (e) {
        console.error('Erro ao salvar Hero:', e);
        toast('Erro ao salvar', e.message || 'Não foi possível atualizar o Hero no servidor.', 'error');
      } finally {
        el.btnSave.disabled = false;
        el.btnSave.textContent = '💾 Salvar Alterações';
      }
    });

    el.btnReset.addEventListener('click', async () => {
      const ok = await confirm({
        icon: '🗑️',
        title: 'Remover imagem?',
        msg: 'A home voltará a usar a imagem padrão original.',
        okLabel: 'Remover',
        okClass: 'btn--danger'
      });
      if (ok) {
        try {
          await window.cafeteriaDB.hero.update(null, '');
          toast('Removido', 'Hero restaurado para o padrão.', 'info');
          await loadData();
          renderHero();
        } catch (e) {
          console.error(e);
          toast('Erro', 'Não foi possível restaurar o Hero.', 'error');
        }
      }
    });

  })();

  /* ════════════════════════════════════════════════════════
     HORÁRIOS MANAGEMENT
  ═══════════════════════════════════════════════════════ */
  const HORARIOS_LS_KEY = 'cafeteria_horarios';

  async function renderHorarios() {
    let data;
    try {
      data = await window.cafeteriaDB.hours.get();
      if (data) {
        window.cafeteriaDB.cache.set('cafeteria_horarios_cache', data);
      }
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

    // Fill form
    document.getElementById('h-seg-qui-abre').value = data.seg_qui.abre;
    document.getElementById('h-seg-qui-fecha').value = data.seg_qui.fecha;
    document.getElementById('h-sex-abre').value = data.sex.abre;
    document.getElementById('h-sex-fecha').value = data.sex.fecha;
    
    const sdAtivo = !!data.sab_dom.ativo;
    const sdCheck = document.getElementById('h-sab-dom-ativo');
    if (sdCheck) sdCheck.checked = sdAtivo;
    
    document.getElementById('h-sab-dom-abre').value = data.sab_dom.abre;
    document.getElementById('h-sab-dom-fecha').value = data.sab_dom.fecha;
    toggleSabDomFields(sdAtivo);

    document.getElementById('h-aviso').value = data.aviso || '';
  }

  function toggleSabDomFields(active) {
    const wrap = document.getElementById('wrap-sab-dom');
    if (!wrap) return;
    wrap.style.opacity = active ? '1' : '0.5';
    wrap.style.pointerEvents = active ? 'auto' : 'none';
  }

  document.getElementById('h-sab-dom-ativo')?.addEventListener('change', e => {
    toggleSabDomFields(e.target.checked);
  });

  document.getElementById('form-horarios')?.addEventListener('submit', async e => {
    e.preventDefault();
    
    const settings = {
      seg_qui: {
        abre: document.getElementById('h-seg-qui-abre').value,
        fecha: document.getElementById('h-seg-qui-fecha').value
      },
      sex: {
        abre: document.getElementById('h-sex-abre').value,
        fecha: document.getElementById('h-sex-fecha').value
      },
      sab_dom: {
        abre: document.getElementById('h-sab-dom-abre').value,
        fecha: document.getElementById('h-sab-dom-fecha').value,
        ativo: document.getElementById('h-sab-dom-ativo').checked
      },
      aviso: document.getElementById('h-aviso').value.trim()
    };

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      await window.cafeteriaDB.hours.update(settings);
      toast('Salvo!', 'Horários atualizados com sucesso.', 'success');
      window.cafeteriaDB.cache.set('cafeteria_horarios_cache', settings);
    } catch (err) {
      console.error(err);
      toast('Erro', 'Não foi possível salvar os horários no servidor.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Salvar Horários';
    }
  });

  /* ════════════════════════════════════════════════════════
     PROMOÇÕES MANAGEMENT
  ═══════════════════════════════════════════════════════ */
  const PROMO_LS_KEY = 'cafeteria_campanhas';

  async function renderPromocoes() {
    let campanhas;
    try {
      campanhas = await window.cafeteriaDB.promotions.all();
      window.cafeteriaDB.cache.set('cafeteria_promos_cache', campanhas);
    } catch (err) {
      campanhas = window.cafeteriaDB.cache.get('cafeteria_promos_cache') || [];
    }

    const filterStatus = document.getElementById('filter-promo-status').value;
    const body = document.getElementById('promo-table-body');
    if (!body) return;

    body.innerHTML = '';

    const sorted = [...campanhas];

    sorted.forEach(c => {
      // Filtragem simples
      if (filterStatus === 'ativos' && !isPromoActive(c)) return;
      if (filterStatus === 'encerrados' && isPromoEnded(c)) return;

      const row = document.createElement('tr');
      const statusInfo = getPromoStatus(c);
      
      row.innerHTML = `
        <td>
          <div style="display:flex; align-items:center; gap:12px">
            ${c.imageUrl ? `<img src="${c.imageUrl}" class="promo-table-image" alt="" />` : '<div class="promo-table-image"></div>'}
            <div>
              <div style="font-weight:600">${c.titulo}</div>
              <div style="font-size:0.75rem; color:var(--texto-claro)">${c.descricao.substring(0, 40)}${c.descricao.length > 40 ? '...' : ''}</div>
            </div>
          </div>
        </td>
        <td>${c.badge ? `<span class="promo-badge-preview">${c.badge}</span>` : '-'}</td>
        <td>
          <div style="font-size:0.813rem">
            ${formatLocaleDate(c.inicio)} <br/>
            <span style="color:var(--texto-claro)">até</span> ${formatLocaleDate(c.fim)}
          </div>
        </td>
        <td><span class="promo-status ${statusInfo.class}">${statusInfo.label}</span></td>
        <td>
          <div class="actions">
            <button class="btn-action btn-edit" title="Editar" onclick="window._adminObj.editPromo('${c.id}')">✏️</button>
            <button class="btn-action btn-delete" title="Excluir" onclick="window._adminObj.deletePromo('${c.id}')">🗑️</button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });

    if (sorted.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--texto-claro)">Nenhuma campanha cadastrada.</td></tr>';
    }
  }

  function isPromoActive(c) {
    if (!c.ativo) return false;
    const now = new Date();
    const start = new Date(c.inicio + 'T00:00:00');
    const end = new Date(c.fim + 'T23:59:59');
    return now >= start && now <= end;
  }

  function isPromoEnded(c) {
    const now = new Date();
    const end = new Date(c.fim + 'T23:59:59');
    return now > end;
  }

  function getPromoStatus(c) {
    if (!c.ativo) return { label: 'Inativo', class: 'promo-status--inactive' };
    const now = new Date();
    const start = new Date(c.inicio + 'T00:00:00');
    const end = new Date(c.fim + 'T23:59:59');

    if (now < start) return { label: 'Agendado', class: 'promo-status--scheduled' };
    if (now > end) return { label: 'Encerrado', class: 'promo-status--ended' };
    return { label: 'Ativo', class: 'promo-status--active' };
  }

  function formatLocaleDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // BINDING GLOBALS
  window._adminObj = window._adminObj || {};
  
  window._adminObj.editPromo = async (id) => {
    let campanhas = window.cafeteriaDB.cache.get('cafeteria_promos_cache') || [];
    const c = campanhas.find(camp => camp.id === id);
    if (!c) return;

    clearFormErrors('form-campanha');
    document.getElementById('modal-promo-title').textContent = 'Editar Campanha';
    document.getElementById('promo-id').value = c.id;
    document.getElementById('promo-titulo').value = c.titulo;
    document.getElementById('promo-desc').value = c.descricao;
    document.getElementById('promo-badge').value = c.badge || '';
    document.getElementById('promo-link').value = c.link || '';
    document.getElementById('promo-inicio').value = c.inicio;
    document.getElementById('promo-fim').value = c.fim;
    document.getElementById('promo-ativo').checked = c.ativo;

    if (c.imageUrl) {
      document.getElementById('promo-image-data').value = c.imageUrl;
      document.getElementById('promo-upload-preview-img').src = c.imageUrl;
      document.getElementById('promo-upload-preview-wrap').classList.remove('hidden');
      document.getElementById('promo-upload-idle').classList.add('hidden');
    } else {
      resetPromoUpload();
    }

    openModal('modal-promo-overlay');
  };

  window._adminObj.deletePromo = async (id) => {
    const ok = await confirm({
      title: 'Excluir Campanha?',
      msg: 'Esta campanha será removida permanentemente.',
      okLabel: 'Excluir'
    });
    if (!ok) return;

    try {
      await window.cafeteriaDB.promotions.delete(id);
      toast('Excluído', 'Campanha removida com sucesso.', 'info');
      await renderPromocoes();
    } catch (err) {
      console.error(err);
      toast('Erro', 'Não foi possível remover a campanha.', 'error');
    }
  };

  function resetPromoUpload() {
    document.getElementById('promo-image-data').value = '';
    document.getElementById('promo-upload-preview-img').src = '';
    document.getElementById('promo-upload-preview-wrap').classList.add('hidden');
    document.getElementById('promo-upload-idle').classList.remove('hidden');
    document.getElementById('promo-image-file').value = '';
  }

  // EVENT LISTENERS PROMOS
  document.getElementById('btn-nova-campanha')?.addEventListener('click', () => {
    clearFormErrors('form-campanha');
    document.getElementById('modal-promo-title').textContent = 'Nova Campanha';
    document.getElementById('promo-id').value = '';
    document.getElementById('form-campanha').reset();
    resetPromoUpload();
    
    // Set default dates (today to +7 days)
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    document.getElementById('promo-inicio').value = today;
    document.getElementById('promo-fim').value = nextWeek;
    
    openModal('modal-promo-overlay');
  });

  document.getElementById('modal-promo-close')?.addEventListener('click', () => closeModal('modal-promo-overlay'));
  document.getElementById('modal-promo-cancel')?.addEventListener('click', () => closeModal('modal-promo-overlay'));

  document.getElementById('filter-promo-status')?.addEventListener('change', renderPromocoes);

  // UPLOAD LOGIC FOR PROMOS
  const promoZone = document.getElementById('promo-upload-zone');
  const promoFileIn = document.getElementById('promo-image-file');

  promoZone?.addEventListener('click', () => promoFileIn.click());
  
  promoFileIn?.addEventListener('change', async e => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const dataUrl = await processPromoFile(file);
      if (dataUrl) {
        document.getElementById('promo-image-data').value = dataUrl;
        document.getElementById('promo-upload-preview-img').src = dataUrl;
        document.getElementById('promo-upload-preview-wrap').classList.remove('hidden');
        document.getElementById('promo-upload-idle').classList.add('hidden');
      }
    }
  });

  async function processPromoFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_W = 1200;
          let w = img.width;
          let h = img.height;
          if (w > MAX_W) {
            h = (MAX_W * h) / w;
            w = MAX_W;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/webp', 0.85));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('btn-promo-remove-img')?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetPromoUpload();
  });

  document.getElementById('btn-salvar-promo')?.addEventListener('click', async () => {
    const id = document.getElementById('promo-id').value;
    const titulo = document.getElementById('promo-titulo').value.trim();
    const desc = document.getElementById('promo-desc').value.trim();
    const inicio = document.getElementById('promo-inicio').value;
    const fim = document.getElementById('promo-fim').value;

    let valid = true;
    if (!titulo) { showFieldError('promo-titulo', 'err-promo-titulo', 'Obrigatório'); valid = false; }
    if (!desc) { showFieldError('promo-desc', 'err-promo-desc', 'Obrigatório'); valid = false; }
    if (!inicio || !fim) { toast('Erro', 'Datas são obrigatórias.', 'error'); valid = false; }

    if (!valid) return;

    const btn = document.getElementById('btn-salvar-promo');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const dataVal = document.getElementById('promo-image-data').value.trim();
    const isNewUpload = dataVal.startsWith('data:');
    const imageBlob = isNewUpload ? dataURLtoBlob(dataVal) : null;
    let imageUrl = isNewUpload ? '' : dataVal;

    const campData = {
      id: id || undefined, // undefined for new (let serial/uuid handle it if needed, but our helper uses upsert)
      titulo,
      descricao: desc,
      badge: document.getElementById('promo-badge').value.trim(),
      link: document.getElementById('promo-link').value.trim(),
      inicio,
      fim,
      ativo: document.getElementById('promo-ativo').checked,
      image_url: imageUrl,
      updated_at: new Date().toISOString()
    };

    try {
      await window.cafeteriaDB.promotions.upsert(campData, imageBlob);
      toast('Sucesso!', 'Campanha salva com sucesso.');
      closeModal('modal-promo-overlay');
      await renderPromocoes();
    } catch (err) {
      console.error(err);
      toast('Erro', 'Ocorreu um problema ao salvar no servidor.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Salvar Campanha';
    }
  });

  /* ════════════════════════════════════════════════════════
     CONTEÚDO HOME MANAGEMENT
  ═══════════════════════════════════════════════════════ */
  const TEXTOS_LS_KEY = 'cafeteria_textos_home';

  async function renderConteudo() {
    let data;
    try {
      data = await window.cafeteriaDB.settings.all();
      window.cafeteriaDB.cache.set('cafeteria_settings_cache', data);
    } catch (err) {
      data = window.cafeteriaDB.cache.get('cafeteria_settings_cache') || {};
    }

    document.getElementById('c-sobre-titulo').value = data.sobre_titulo || '';
    document.getElementById('c-sobre-texto').value = data.sobre_texto || '';
    document.getElementById('c-exp-subtitulo').value = data.exp_subtitulo || '';
    document.getElementById('c-galeria-subtitulo').value = data.galeria_subtitulo || '';
  }

  document.getElementById('form-conteudo')?.addEventListener('submit', async e => {
    e.preventDefault();
    
    const settings = {
      sobre_titulo: document.getElementById('c-sobre-titulo').value.trim(),
      sobre_texto: document.getElementById('c-sobre-texto').value.trim(),
      exp_subtitulo: document.getElementById('c-exp-subtitulo').value.trim(),
      galeria_subtitulo: document.getElementById('c-galeria-subtitulo').value.trim()
    };

    const btn = document.getElementById('btn-save-conteudo');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      await Promise.all(Object.entries(settings).map(([key, val]) => {
        return window.cafeteriaDB.settings.update(key, val);
      }));
      toast('Salvo!', 'Textos institucionais atualizados com sucesso.', 'success');
      window.cafeteriaDB.cache.set('cafeteria_settings_cache', settings);
    } catch (err) {
      console.error(err);
      toast('Erro', 'Não foi possível salvar os textos no servidor.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Salvar Textos';
    }
  });

  /* ════════════════════════════════════════════════════════
     FORM HELPERS
  ═══════════════════════════════════════════════════════ */
  function showFieldError(fieldId, errId, msg) {
    const field = document.getElementById(fieldId);
    const err   = document.getElementById(errId);
    if (field) field.classList.add('error');
    if (err)   { err.textContent = msg; err.classList.add('visible'); }
  }

  function clearFormErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('.field__input, .field__textarea, .field__select').forEach(el => {
      el.classList.remove('error');
    });
    form.querySelectorAll('.field__error-msg').forEach(el => {
      el.classList.remove('visible');
      el.textContent = '';
    });
  }

  // Live validation: clear error on input
  document.querySelectorAll('.field__input, .field__textarea, .field__select').forEach(el => {
    el.addEventListener('input', () => {
      el.classList.remove('error');
      const errId = el.id.replace(/^(produto-|cat-)/, 'err-$1');
      const err = document.getElementById('err-' + el.id);
      if (err) err.classList.remove('visible');
    });
  });

})();
