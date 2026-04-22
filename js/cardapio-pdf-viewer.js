/* =========================================================
   CARDAPIO-PDF-VIEWER.JS — Flipbook Interativo
   PDF.js + StPageFlip + Fallbacks
   ========================================================= */

(function () {
  'use strict';

  /* ── Configuração ───────────────────────────────────────── */
  const CFG = {
    RENDER_SCALE: 2.0,        // 2x para nitidez em HiDPI
    INITIAL_PAGES: 4,         // Páginas renderizadas imediatamente
    FLIP_DURATION: 600,       // ms para animação de virada
    MOBILE_BREAKPOINT: 640    // px — abaixo disso: modo single-page
  };

  /* ── Estado ─────────────────────────────────────────────── */
  let pdfDoc      = null;
  let pageFlip    = null;
  let totalPages  = 0;
  let currentPage = 1;
  let isMobile    = window.innerWidth <= CFG.MOBILE_BREAKPOINT;
  let pdfUrl      = null;
  let rendering   = false;

  /* ── Seletores de UI ────────────────────────────────────── */
  const sel = {
    section:      () => document.getElementById('cardapio-digital'),
    loading:      () => document.getElementById('pdf-viewer-loading'),
    errorState:   () => document.getElementById('pdf-viewer-error'),
    emptyState:   () => document.getElementById('pdf-viewer-empty'),
    flipWrap:     () => document.getElementById('pdf-flipbook-wrap'),
    flipContainer:() => document.getElementById('pdf-flipbook'),
    fallbackWrap: () => document.getElementById('pdf-fallback-wrap'),
    fallbackCanvas:()=> document.getElementById('pdf-fallback-canvas'),
    pageIndicator:() => document.getElementById('pdf-page-indicator'),
    btnPrev:      () => document.getElementById('pdf-btn-prev'),
    btnNext:      () => document.getElementById('pdf-btn-next'),
    btnOpen:      () => document.getElementById('pdf-btn-open'),
    btnDownload:  () => document.getElementById('pdf-btn-download'),
    btnRetry:     () => document.getElementById('pdf-btn-retry'),
  };

  /* ── Helpers ─────────────────────────────────────────────── */
  function showState(state) {
    // state: 'loading' | 'error' | 'empty' | 'flipbook' | 'fallback'
    const all = ['pdf-viewer-loading','pdf-viewer-error','pdf-viewer-empty',
                  'pdf-flipbook-wrap','pdf-fallback-wrap'];
    all.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const map = {
      loading:  'pdf-viewer-loading',
      error:    'pdf-viewer-error',
      empty:    'pdf-viewer-empty',
      flipbook: 'pdf-flipbook-wrap',
      fallback: 'pdf-fallback-wrap'
    };
    const target = document.getElementById(map[state]);
    if (target) target.style.display = '';
  }

  function updateIndicator(page, total) {
    const el = sel.pageIndicator();
    if (el) el.textContent = `${page} / ${total}`;
  }

  function updateNavButtons() {
    const prev = sel.btnPrev();
    const next = sel.btnNext();
    if (prev) prev.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages;
  }

  /* ── Renderizar uma página com PDF.js ───────────────────── */
  async function renderPageToCanvas(pageNum) {
    const page   = await pdfDoc.getPage(pageNum);
    const vp     = page.getViewport({ scale: CFG.RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }

  /* ── Construir elemento de página para StPageFlip ─────────── */
  function buildPageElement(canvas, pageNum) {
    const div = document.createElement('div');
    div.className = 'pdf-page-leaf';
    div.dataset.page = pageNum;
    // Converte canvas → img para melhor compatibilidade com StPageFlip
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.92);
    img.alt = `Página ${pageNum}`;
    div.appendChild(img);
    return div;
  }

  /* ── Modo fallback: uma página por vez (mobile / sem StPageFlip) ── */
  async function initFallbackMode() {
    showState('fallback');

    const canvas = sel.fallbackCanvas();
    if (!canvas) return;

    // Sincronizar botões de link do fallback com os links reais
    if (pdfUrl) {
      const openFb = document.getElementById('pdf-btn-open-fb');
      const dlFb   = document.getElementById('pdf-btn-download-fb');
      if (openFb) openFb.href = pdfUrl;
      if (dlFb) { dlFb.href = pdfUrl; }
    }

    function updateFallbackIndicator(page, total) {
      const el = document.getElementById('pdf-page-indicator-fb');
      if (el) el.textContent = `${page} / ${total}`;
    }

    function updateFallbackNav(page, total) {
      const prev = document.getElementById('pdf-btn-prev-fb');
      const next = document.getElementById('pdf-btn-next-fb');
      if (prev) prev.disabled = page <= 1;
      if (next) next.disabled = page >= total;
    }

    async function renderFallbackPage(num) {
      currentPage = num;
      updateFallbackIndicator(num, totalPages);
      updateFallbackNav(num, totalPages);

      const page = await pdfDoc.getPage(num);
      const vp   = page.getViewport({ scale: CFG.RENDER_SCALE });

      // Redimensiona canvas ao tamanho disponível
      const container = canvas.parentElement;
      const ratio = vp.width / vp.height;
      const maxW  = container.clientWidth || 360;
      canvas.style.width  = maxW + 'px';
      canvas.style.height = (maxW / ratio) + 'px';
      canvas.width  = vp.width;
      canvas.height = vp.height;

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }

    await renderFallbackPage(1);

    // Botões do modo fallback
    document.getElementById('pdf-btn-prev-fb')?.addEventListener('click', async () => {
      if (currentPage > 1) await renderFallbackPage(currentPage - 1);
    });
    document.getElementById('pdf-btn-next-fb')?.addEventListener('click', async () => {
      if (currentPage < totalPages) await renderFallbackPage(currentPage + 1);
    });
  }


  /* ── Inicializar StPageFlip ─────────────────────────────── */
  async function initFlipbook() {
    if (typeof PageFlip === 'undefined') {
      console.warn('[pdf-viewer] StPageFlip não carregado. Usando fallback.');
      await initFallbackMode();
      return;
    }

    const container = sel.flipContainer();
    if (!container) { await initFallbackMode(); return; }

    showState('loading');

    // Renderizar primeiras páginas imediatamente
    const firstBatch = Math.min(CFG.INITIAL_PAGES, totalPages);
    const pages = [];

    for (let i = 1; i <= firstBatch; i++) {
      try {
        const canvas = await renderPageToCanvas(i);
        pages.push(buildPageElement(canvas, i));
      } catch (err) {
        console.error(`[pdf-viewer] Erro renderizando página ${i}:`, err);
      }
    }

    // Adicionar páginas ao container antes de inicializar
    container.innerHTML = '';
    pages.forEach(p => container.appendChild(p));

    // Calcular dimensões do livro
    const containerW = sel.flipWrap()?.clientWidth || window.innerWidth;
    const pageW = Math.min(Math.floor(containerW / 2) - 20, 560);
    const pageH = Math.round(pageW * 1.414); // proporção A4

    try {
      // Destruir instância anterior se existir
      if (pageFlip) {
        try { pageFlip.destroy(); } catch {}
        pageFlip = null;
      }

      pageFlip = new PageFlip(container, {
        width:       pageW,
        height:      pageH,
        size:        'fixed',
        drawShadow:  true,
        flippingTime: CFG.FLIP_DURATION,
        usePortrait: isMobile,
        startPage:   0,
        showCover:   false,
        mobileScrollSupport: true,
        clickEventForward: true,
        useMouseEvents: true,
        swipeDistance: 30,
        showPageCorners: true,
        disableFlipByClick: false
      });

      pageFlip.loadFromHTML(container.querySelectorAll('.pdf-page-leaf'));

      // Eventos de navegação
      pageFlip.on('flip', (e) => {
        currentPage = e.data + 1;
        updateIndicator(currentPage, totalPages);
        updateNavButtons();

        // Pré-renderizar próximas páginas em background
        if (currentPage + 4 <= totalPages) {
          renderRemainingPages(currentPage + 2, Math.min(currentPage + 6, totalPages));
        }
      });

      showState('flipbook');
      updateIndicator(1, totalPages);
      updateNavButtons();

      // Botões de navegação
      sel.btnPrev()?.addEventListener('click', () => {
        if (pageFlip) {
          pageFlip.flipPrev();
        }
      });
      sel.btnNext()?.addEventListener('click', () => {
        if (pageFlip) {
          pageFlip.flipNext();
        }
      });

      // Renderizar páginas restantes em background
      if (totalPages > firstBatch) {
        setTimeout(() => renderRemainingPages(firstBatch + 1, totalPages), 500);
      }

    } catch (err) {
      console.error('[pdf-viewer] StPageFlip falhou:', err);
      await initFallbackMode();
    }
  }

  /* ── Renderização em background das páginas restantes ──── */
  async function renderRemainingPages(from, to) {
    if (rendering) return;
    rendering = true;

    const container = sel.flipContainer();
    if (!container) { rendering = false; return; }

    for (let i = from; i <= to; i++) {
      // Verificar se a página já foi renderizada
      if (container.querySelector(`[data-page="${i}"]`)) continue;

      try {
        const canvas = await renderPageToCanvas(i);
        const pageEl = buildPageElement(canvas, i);
        container.appendChild(pageEl);

        // Adicionar ao flipbook se ele já estiver inicializado
        if (pageFlip) {
          try {
            pageFlip.loadFromHTML(container.querySelectorAll('.pdf-page-leaf'));
          } catch {}
        }

        // Pausa para não travar a UI
        await new Promise(r => setTimeout(r, 80));
      } catch (err) {
        console.warn(`[pdf-viewer] Não foi possível renderizar página ${i}:`, err);
      }
    }

    rendering = false;
  }

  /* ── Carregar o PDF ─────────────────────────────────────── */
  async function loadPDF(url) {
    showState('loading');
    pdfUrl = url;

    try {
      // Configura o worker do PDF.js
      if (window.pdfjsLib) {
        const pdfjs = window.pdfjsLib;
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }

        const loadingTask = pdfjs.getDocument({ url, withCredentials: false });
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;

        if (isMobile || typeof PageFlip === 'undefined') {
          await initFallbackMode();
        } else {
          await initFlipbook();
        }
      } else {
        throw new Error('PDF.js não disponível');
      }
    } catch (err) {
      console.error('[pdf-viewer] Erro ao carregar PDF:', err);
      showState('error');
    }
  }

  /* ── Inicialização pública ──────────────────────────────── */
  async function init() {
    const section = sel.section();
    if (!section) return; // Seção não existe na página

    // Verifica se Supabase está disponível
    if (!window.cafeteriaDB) {
      console.warn('[pdf-viewer] cafeteriaDB não disponível. Abortando.');
      return;
    }

    showState('loading');

    try {
      const meta = await window.cafeteriaDB.menuPdf.get();
      const rootMenu = document.getElementById('cardapio-root');

      if (!meta || !meta.active || !meta.pdfUrl) {
        // Nenhum PDF ativo — ocultar a seção do livro e garantir que o cardápio normal apareça
        section.style.display = 'none';
        if (rootMenu) rootMenu.style.display = 'block';
        return;
      }

      // PDF ativo — Ocultar o cardápio de itens individuais
      if (rootMenu) rootMenu.style.display = 'none';

      // Configurar botões de link/download
      sel.btnOpen()?.setAttribute('href', meta.pdfUrl);
      sel.btnDownload()?.setAttribute('href', meta.pdfUrl);
      sel.btnDownload()?.setAttribute('download', meta.fileName || 'cardapio.pdf');

      // Checar responsividade
      isMobile = window.innerWidth <= CFG.MOBILE_BREAKPOINT;

      await loadPDF(meta.pdfUrl);

    } catch (err) {
      console.error('[pdf-viewer] Erro na inicialização:', err);
      showState('error');
    }
  }

  /* ── Retry ──────────────────────────────────────────────── */
  function handleRetry() {
    if (pdfUrl) {
      loadPDF(pdfUrl);
    } else {
      init();
    }
  }

  /* ── Bootstrap ───────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    sel.btnRetry()?.addEventListener('click', handleRetry);

    // Aguarda libs externas (PDF.js + StPageFlip via CDN)
    // Tentativas com delay caso os scripts ainda estejam carregando
    let attempts = 0;
    const tryInit = () => {
      attempts++;
      if (window.pdfjsLib || attempts > 20) {
        init();
      } else {
        setTimeout(tryInit, 300);
      }
    };
    tryInit();

    // Adaptar ao resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nowMobile = window.innerWidth <= CFG.MOBILE_BREAKPOINT;
        if (nowMobile !== isMobile && pdfUrl) {
          isMobile = nowMobile;
          if (pageFlip) {
            try { pageFlip.destroy(); } catch {}
            pageFlip = null;
          }
          loadPDF(pdfUrl);
        }
      }, 500);
    });
  });

})();
