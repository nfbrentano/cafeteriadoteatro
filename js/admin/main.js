/* =========================================================
   ADMIN/MAIN.JS — Estado Global e Helpers do Painel
   ========================================================= */

(function () {
  'use strict';

  const admin = {
    // Estado compartilhado
    session: {
      isLoggedIn: false,
      user: null
    },
    appData: {
      categorias: [],
      produtos: [],
      hero: null,
      horarios: null,
      promotions: [],
      settings: {}
    },

    // --- Utilitários de UI ---
    toast(title, msg, type = 'success', duration = 3500) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
      const el = document.createElement('div');
      el.className = `toast toast--${type}`;
      el.innerHTML = `
        <span class="toast__icon">${icons[type] || '✅'}</span>
        <div class="toast__body">
          <div class="toast__title">${title}</div>
          ${msg ? `<div class="toast__msg">${msg}</div>` : ''}
        </div>`;
      container.appendChild(el);
      setTimeout(() => {
        el.classList.add('hide');
        el.addEventListener('animationend', () => el.remove());
      }, duration);
    },

    confirm({ icon = '⚠️', title, msg, okLabel = 'Confirmar', okClass = 'btn--danger' }) {
      const overlay = document.getElementById('confirm-overlay');
      return new Promise(resolve => {
        document.getElementById('confirm-icon').textContent   = icon;
        document.getElementById('confirm-title').textContent  = title;
        document.getElementById('confirm-msg').textContent    = msg;
        const okBtn = document.getElementById('confirm-ok');
        okBtn.textContent = okLabel;
        okBtn.className   = `btn ${okClass}`;
        overlay.classList.add('open');
        const cleanup = (val) => {
          overlay.classList.remove('open');
          okBtn.replaceWith(okBtn.cloneNode(true));
          document.getElementById('confirm-cancel').replaceWith(document.getElementById('confirm-cancel').cloneNode(true));
          resolve(val);
        };
        document.getElementById('confirm-ok').addEventListener('click', () => cleanup(true), { once: true });
        document.getElementById('confirm-cancel').addEventListener('click', () => cleanup(false), { once: true });
      });
    },

    openModal(overlayId) {
      document.getElementById(overlayId).classList.add('open');
      document.body.style.overflow = 'hidden';
    },

    closeModal(overlayId) {
      document.getElementById(overlayId).classList.remove('open');
      document.body.style.overflow = '';
    },

    // --- Navegação ---
    navigateTo(pageId) {
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
        configuracoes: 'Configurações',
        'menu-pdf': 'Cardápio PDF'
      };
      document.getElementById('topbar-title').textContent = titles[pageId] || '';
      
      // Dispatch render events if needed
      const renderers = {
        dashboard: 'renderDashboard',
        produtos:  'renderProdutos',
        categorias: 'renderCategorias',
        hero:       'renderHero',
        horarios:   'renderHorarios',
        promocoes:  'renderPromocoes',
        conteudo:   'renderConteudo',
        'menu-pdf': 'renderMenuPdf'
      };
      if (renderers[pageId] && typeof window[renderers[pageId]] === 'function') {
        window[renderers[pageId]]();
      }
    },

    // --- Dados ---
    async loadData() {
      try {
        const [cats, prods, hero, hours, promos, settings] = await Promise.all([
          window.cafeteriaDB.categories.all(),
          window.cafeteriaDB.products.all(),
          window.cafeteriaDB.hero.get(),
          window.cafeteriaDB.hours.get(),
          window.cafeteriaDB.promotions.all(),
          window.cafeteriaDB.settings.all()
        ]);
        this.appData.categorias = cats;
        this.appData.produtos   = prods;
        this.appData.hero       = hero;
        this.appData.horarios   = hours;
        this.appData.promotions = promos;
        this.appData.settings   = settings;
        window.cafeteriaDB.cache.set('cafeteria_cardapio_cache', this.appData);
        this.refreshCurrentPage();
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        const cached = window.cafeteriaDB.cache.get('cafeteria_cardapio_cache');
        if (cached) this.appData = cached;
        this.toast('Aviso', 'Erro ao sincronizar. Usando cache local.', 'warn');
      }
    },

    refreshCurrentPage() {
      const activeLink = document.querySelector('.sidebar__link.active');
      if (activeLink) this.navigateTo(activeLink.dataset.page);
    },

    // --- Helpers ---
    slugify(str) {
      return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    },
    dataURLtoBlob(dataurl) {
      if (!dataurl || !dataurl.startsWith('data:')) return null;
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while(n--) { u8arr[n] = bstr.charCodeAt(n); }
      return new Blob([u8arr], {type:mime});
    },
    showFieldError(inputId, errorId, msg) {
      const input = document.getElementById(inputId);
      const err   = document.getElementById(errorId);
      if (input) input.classList.add('field__input--error');
      if (err) { err.textContent = msg; err.classList.add('visible'); }
    },
    clearFieldError(inputId, errorId) {
      const input = document.getElementById(inputId);
      const err   = document.getElementById(errorId);
      if (input) input.classList.remove('field__input--error');
      if (err) { err.classList.remove('visible'); }
    },

    // --- Dashboard ---
    renderDashboard() {
      const total    = this.appData.produtos.length;
      const ativos   = this.appData.produtos.filter(p => p.ativo).length;
      const cats     = this.appData.categorias.length;
      const banners  = this.appData.promotions.filter(p => p.active).length;

      document.getElementById('stat-total-produtos').textContent = total;
      document.getElementById('stat-ativos').textContent         = ativos;
      document.getElementById('stat-categorias').textContent     = cats;
      document.getElementById('stat-populares').textContent      = banners;

      const tbody = document.getElementById('dash-cat-table');
      if (tbody) {
        tbody.innerHTML = this.appData.categorias.map(c => {
          const count = this.appData.produtos.filter(p => (p.categoria_id || p.categoriaId) === c.id).length;
          return `
            <tr>
              <td class="td-name">${c.nome}</td>
              <td style="font-size:20px">${c.icone}</td>
              <td><strong>${count}</strong> itens</td>
              <td>${c.ativo ? '<span class="status-pill status-pill--ativo">Ativa</span>' : '<span class="status-pill status-pill--inativo">Inativa</span>'}</td>
            </tr>`;
        }).join('');
      }
    }
  };

  // Bind renderDashboard to window so navigateTo can find it
  window.renderDashboard = () => admin.renderDashboard();

  // Exportar para window
  window.cafeteriaAdmin = admin;

  // Iniciar listeners globais
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sidebar__link[data-page]').forEach(btn => {
      btn.addEventListener('click', () => admin.navigateTo(btn.dataset.page));
    });
    ['modal-produto-overlay', 'modal-cat-overlay', 'modal-promo-overlay'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', e => {
        if (e.target.id === id) admin.closeModal(id);
      });
    });
  });

})();
