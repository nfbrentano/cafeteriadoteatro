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

      const iconEl = document.createElement('span');
      iconEl.className = 'toast__icon';
      iconEl.textContent = icons[type] || '✅';

      const bodyEl = document.createElement('div');
      bodyEl.className = 'toast__body';

      const titleEl = document.createElement('div');
      titleEl.className = 'toast__title';
      titleEl.textContent = title;
      bodyEl.appendChild(titleEl);

      if (msg) {
        const msgEl = document.createElement('div');
        msgEl.className = 'toast__msg';
        msgEl.textContent = msg;
        bodyEl.appendChild(msgEl);
      }

      el.appendChild(iconEl);
      el.appendChild(bodyEl);
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
    downloadCSV(filename, csvContent) {
      const bom = "\uFEFF";
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    downloadExcel(filename, xmlContent) {
      const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },

    // --- Permissões de Acesso por Página (CAF-000036 / CAF-000081) ---
    PAGE_PERMISSIONS: {
      dashboard: 'admin.relatorios',
      relatorios: 'admin.relatorios',
      pedidos: 'pdv.vender',
      mesas: 'pdv.vender',
      produtos: 'admin.cardapio',
      categorias: 'admin.cardapio',
      adicionais: 'admin.cardapio',
      hero: 'admin.cardapio',
      horarios: 'admin.cardapio',
      promocoes: 'admin.cardapio',
      conteudo: 'admin.cardapio',
      'menu-pdf': 'admin.cardapio',
      estoque: 'admin.estoque',
      clientes: 'admin.clientes',
      avaliacoes: 'admin.clientes',
      usuarios: 'admin.usuarios',
      configuracoes: 'admin.configuracoes',
      caixa: 'caixa.abrir_fechar',
      financeiro: 'admin.financeiro'
    },

    podeAcessarPagina(pageId) {
      if (!this.session.isLoggedIn) return false;
      const user = this.session.user;
      if (user?.role === 'admin' || user?.is_admin || this.session.isAdmin) return true;
      const permNecessaria = this.PAGE_PERMISSIONS[pageId];
      if (!permNecessaria) return true;
      if (!this.permissoes) return true;
      return this.permissoes.includes(permNecessaria);
    },

    async carregarPermissoes() {
      try {
        if (!window.cafeteriaDB?.cargos) return;
        const perms = await window.cafeteriaDB.cargos.getMinhasPermissoes();
        this.permissoes = Array.isArray(perms) ? perms : [];
        this.aplicarPermissoesSidebar();
      } catch (err) {
        console.warn('Erro ao carregar permissões do admin:', err);
      }
    },

    aplicarPermissoesSidebar() {
      document.querySelectorAll('.sidebar__link[data-page]').forEach(link => {
        const pageId = link.dataset.page;
        const pode = this.podeAcessarPagina(pageId);
        link.style.display = pode ? '' : 'none';
      });
    },

    // --- Navegação ---
    navigateTo(pageId) {
      if (!this.podeAcessarPagina(pageId)) {
        this.toast('Acesso restrito', 'Você não possui permissão para acessar esta seção.', 'warn');
        const permitida = Object.keys(this.PAGE_PERMISSIONS).find(p => this.podeAcessarPagina(p)) || 'dashboard';
        if (permitida !== pageId) {
          return this.navigateTo(permitida);
        }
        return;
      }

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
        adicionais: 'Adicionais',
        pedidos: 'Pedidos',
        mesas: 'Mesas',
        usuarios: 'Usuários',
        hero: 'Hero da Home',
        horarios: 'Horários',
        promocoes: 'Promoções',
        conteudo: 'Conteúdo Home',
        configuracoes: 'Configurações',
        'menu-pdf': 'Cardápio PDF',
        caixa: 'Caixa do Dia',
        estoque: 'Estoque de Produtos e Insumos',
        clientes: 'Gestão de Clientes',
        avaliacoes: 'Avaliações dos Clientes',
        financeiro: 'Financeiro & Fluxo de Caixa'
      };
      document.getElementById('topbar-title').textContent = titles[pageId] || '';
      
      // Dispatch render events if needed
      const renderers = {
        dashboard: 'renderDashboard',
        produtos:  'renderProdutos',
        categorias: 'renderCategorias',
        adicionais: 'renderAdicionais',
        pedidos:    'initAdminPedidos',
        mesas:      'initAdminMesas',
        usuarios:   'loadUsuarios',
        hero:       'renderHero',
        horarios:   'renderHorarios',
        promocoes:  'renderPromocoes',
        conteudo:   'renderConteudo',
        'menu-pdf': 'renderMenuPdf',
        caixa:      'initAdminCaixa',
        estoque:    'initAdminEstoque',
        clientes:   'initAdminClientes',
        avaliacoes: 'initAdminAvaliacoes',
        financeiro: 'initAdminFinanceiro'
      };
      if (renderers[pageId] && typeof window[renderers[pageId]] === 'function') {
        window[renderers[pageId]]();
      }
    },

    // --- Dados ---
    async loadData() {
      try {
        const [cats, adics, prods, hero, hours, promos, settings] = await Promise.all([
          window.cafeteriaDB.categories.all(),
          window.cafeteriaDB.adicionais.all(),
          window.cafeteriaDB.products.all(),
          window.cafeteriaDB.hero.get(),
          window.cafeteriaDB.hours.get(),
          window.cafeteriaDB.promotions.all(),
          window.cafeteriaDB.settings.all()
        ]);
        this.appData.categorias = cats;
        this.appData.adicionais = adics;
        this.appData.produtos   = prods;
        this.appData.hero       = hero;
        this.appData.horarios   = hours;
        this.appData.promotions = promos;
        this.appData.settings   = settings;

        try {
          if (window.cafeteriaDB.estoque) {
            this.appData.estoqueItens = await window.cafeteriaDB.estoque.allItens();
          }
        } catch (e) {
          this.appData.estoqueItens = [];
        }

        try {
          if (window.cafeteriaDB.fichasTecnicas) {
            this.appData.fichasTecnicas = await window.cafeteriaDB.fichasTecnicas.all();
          }
        } catch (e) {
          this.appData.fichasTecnicas = [];
        }

        this.refreshCurrentPage();
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        this.toast('Aviso', 'Erro ao sincronizar dados do servidor.', 'warn');
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
    formatBytes(bytes, decimals = 1) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    /**
     * Motor de Compressão e Otimização Inteligente para Web
     * Suporta Presets ('hero', 'sobre', 'product', 'banner') ou parâmetros manuais.
     */
    async compressImage(file, options = {}) {
      const PRESETS = {
        hero:    { maxWidth: 1600, maxHeight: 1000, quality: 0.78, maxSizeBytes: 130 * 1024, minQuality: 0.55 },
        sobre:   { maxWidth: 800,  maxHeight: 800,  quality: 0.78, maxSizeBytes: 65 * 1024,  minQuality: 0.55 },
        product: { maxWidth: 600,  maxHeight: 600,  quality: 0.78, maxSizeBytes: 42 * 1024,  minQuality: 0.55 },
        banner:  { maxWidth: 1200, maxHeight: 500,  quality: 0.78, maxSizeBytes: 85 * 1024,  minQuality: 0.55 }
      };

      const preset = typeof options === 'string' ? PRESETS[options] : (options.preset ? PRESETS[options.preset] : {});
      const config = {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.78,
        maxSizeBytes: 100 * 1024,
        minQuality: 0.55,
        ...preset,
        ...(typeof options === 'object' ? options : {})
      };

      return new Promise((resolve, reject) => {
        if (!file || !(file instanceof Blob || (typeof file.type === 'string' && file.type.startsWith('image/')))) {
          return reject(new Error('Arquivo não é uma imagem válida'));
        }

        const originalSizeBytes = file.size || 0;
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let srcW = img.naturalWidth || img.width;
            let srcH = img.naturalHeight || img.height;

            // 1. Calcula dimensões mantendo aspect ratio
            let targetW = srcW;
            let targetH = srcH;
            if (targetW > config.maxWidth || targetH > config.maxHeight) {
              const ratio = Math.min(config.maxWidth / targetW, config.maxHeight / targetH);
              targetW = Math.round(targetW * ratio);
              targetH = Math.round(targetH * ratio);
            }

            // 2. Stepped downscaling (redução em passos se for encolher mais de 50%)
            let curCanvas = document.createElement('canvas');
            curCanvas.width = srcW;
            curCanvas.height = srcH;
            let curCtx = curCanvas.getContext('2d');
            curCtx.drawImage(img, 0, 0, srcW, srcH);

            let curW = srcW;
            let curH = srcH;

            while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
              const nextW = Math.round(curW * 0.5);
              const nextH = Math.round(curH * 0.5);
              const nextCanvas = document.createElement('canvas');
              nextCanvas.width = nextW;
              nextCanvas.height = nextH;
              const nextCtx = nextCanvas.getContext('2d');
              nextCtx.imageSmoothingEnabled = true;
              nextCtx.imageSmoothingQuality = 'high';
              nextCtx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
              curCanvas = nextCanvas;
              curW = nextW;
              curH = nextH;
            }

            // Canvas final
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = targetW;
            finalCanvas.height = targetH;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            finalCtx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, targetW, targetH);

            // 3. Detecção de formato suportado (WebP priority, JPEG fallback)
            let mimeType = 'image/webp';
            let testData = finalCanvas.toDataURL('image/webp', 0.5);
            if (!testData.startsWith('data:image/webp')) {
              mimeType = 'image/jpeg'; // Evita fallback para PNG não comprimido
            }

            // 4. Compressão adaptativa por orçamento de bytes (target byte budget loop)
            let currentQuality = config.quality;
            let finalDataUrl = finalCanvas.toDataURL(mimeType, currentQuality);
            let finalBlob = admin.dataURLtoBlob(finalDataUrl);

            // Se exceder o orçamento de tamanho e houver margem de qualidade
            let iterations = 0;
            while (finalBlob.size > config.maxSizeBytes && currentQuality > config.minQuality && iterations < 5) {
              currentQuality = Math.max(config.minQuality, currentQuality - 0.08);
              finalDataUrl = finalCanvas.toDataURL(mimeType, currentQuality);
              finalBlob = admin.dataURLtoBlob(finalDataUrl);
              iterations++;
            }

            const optimizedSizeBytes = finalBlob.size;
            const savedBytes = Math.max(0, originalSizeBytes - optimizedSizeBytes);
            const savedPercentage = originalSizeBytes > 0 
              ? Math.round((savedBytes / originalSizeBytes) * 100) 
              : 0;

            const formatLabel = mimeType === 'image/webp' ? 'WebP' : 'JPEG';

            resolve({
              dataUrl: finalDataUrl,
              blob: finalBlob,
              width: targetW,
              height: targetH,
              mimeType,
              format: formatLabel,
              originalSizeBytes,
              optimizedSizeBytes,
              formattedOriginalSize: admin.formatBytes(originalSizeBytes),
              formattedOptimizedSize: admin.formatBytes(optimizedSizeBytes),
              savedPercentage: `-${savedPercentage}%`,
              summaryText: `${formatLabel} • ${targetW}×${targetH}px • ${admin.formatBytes(optimizedSizeBytes)} (${savedPercentage > 0 ? `-${savedPercentage}%` : 'Otimizado'})`
            });
          };
          img.onerror = () => reject(new Error('Erro ao carregar imagem no navegador'));
          img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem'));
        reader.readAsDataURL(file);
      });
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

      // Alerta de Contas a Vencer no Dashboard (CAF-000035)
      const dashAlerta = document.getElementById('dash-alerta-financeiro');
      const dashAlertaTexto = document.getElementById('dash-alerta-financeiro-texto');
      const dashAlertaIcon = document.getElementById('dash-alerta-financeiro-icon');
      const btnIrFinanceiro = document.getElementById('btn-dash-ir-financeiro');

      if (btnIrFinanceiro && !btnIrFinanceiro.dataset.bound) {
        btnIrFinanceiro.dataset.bound = 'true';
        btnIrFinanceiro.addEventListener('click', () => admin.navigateTo('financeiro'));
      }

      if (dashAlerta && window.cafeteriaDB?.financeiro?.getResumo) {
        window.cafeteriaDB.financeiro.getResumo().then(resumo => {
          if (!resumo) return;
          const vencidas = Number(resumo.qtd_vencidas) || 0;
          const vencem7d = Number(resumo.qtd_a_vencer_7d) || 0;
          const totalVencidas = Number(resumo.total_vencidas) || 0;
          const total7d = Number(resumo.total_a_vencer_7d) || 0;

          if (vencidas > 0) {
            dashAlerta.style.display = 'flex';
            dashAlerta.style.background = '#fef2f2';
            dashAlerta.style.borderColor = '#fecaca';
            dashAlerta.style.borderLeftColor = '#ef4444';
            dashAlerta.style.color = '#991b1b';
            if (dashAlertaIcon) dashAlertaIcon.textContent = '🔴';
            if (dashAlertaTexto) {
              const valorFormatado = totalVencidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              dashAlertaTexto.innerHTML = `<strong>Atenção:</strong> Você tem <strong>${vencidas} conta(s) vencida(s)</strong> totalizando <strong>${valorFormatado}</strong>.`;
            }
          } else if (vencem7d > 0) {
            dashAlerta.style.display = 'flex';
            dashAlerta.style.background = '#fffbeb';
            dashAlerta.style.borderColor = '#fde68a';
            dashAlerta.style.borderLeftColor = '#f59e0b';
            dashAlerta.style.color = '#92400e';
            if (dashAlertaIcon) dashAlertaIcon.textContent = '🟠';
            if (dashAlertaTexto) {
              const valorFormatado = total7d.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              dashAlertaTexto.innerHTML = `<strong>Aviso Financeiro:</strong> <strong>${vencem7d} conta(s)</strong> vencem esta semana (${valorFormatado}).`;
            }
          } else {
            dashAlerta.style.display = 'none';
          }
        }).catch(() => {
          if (dashAlerta) dashAlerta.style.display = 'none';
        });
      }
    }
  };

  // Bind renderDashboard to window so navigateTo can find it
  window.renderDashboard = () => admin.renderDashboard();

  // Exportar para window
  window.cafeteriaAdmin = admin;

  // Iniciar listeners globais
  document.addEventListener('DOMContentLoaded', () => {
    // Sidebar como gaveta no mobile
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    const setSidebarOpen = open => {
      sidebar?.classList.toggle('mobile-open', open);
      sidebarBackdrop?.classList.toggle('open', open);
      sidebarToggle?.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('sidebar-locked', open);
    };
    sidebarToggle?.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('mobile-open')));
    sidebarBackdrop?.addEventListener('click', () => setSidebarOpen(false));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sidebar?.classList.contains('mobile-open')) setSidebarOpen(false);
    });

    document.querySelectorAll('.sidebar__link').forEach(link => {
      link.addEventListener('click', () => setSidebarOpen(false));
    });
    document.querySelectorAll('.sidebar__link[data-page]').forEach(btn => {
      btn.addEventListener('click', () => admin.navigateTo(btn.dataset.page));
    });
    ['modal-produto-overlay', 'modal-cat-overlay', 'modal-promo-overlay', 'modal-mesa-overlay', 'modal-usuario-overlay', 'modal-movimento-caixa-overlay', 'modal-fechar-caixa-overlay', 'modal-estoque-item-overlay', 'modal-estoque-movimento-overlay', 'modal-estoque-extrato-overlay', 'modal-barcode-scanner-overlay'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', e => {
        if (e.target.id === id) admin.closeModal(id);
      });
    });
  });

})();
