/* =========================================================
   CARDAPIO-PDF-VIEWER.JS — Flipbook Interativo
   PDF.js + StPageFlip + Fullscreen + Fallbacks
   ========================================================= */

(function () {
  'use strict';

  /* ── Configuração ───────────────────────────────────────── */
  const CFG = {
    RENDER_SCALE: 2.0,
    INITIAL_PAGES: 4,
    FLIP_DURATION: 600,
    MOBILE_BREAKPOINT: 768
  };

  /* ── Estado ─────────────────────────────────────────────── */
  let pdfDoc       = null;
  let pageFlip     = null;
  let totalPages   = 0;
  let currentPage  = 1;
  let isMobile     = window.innerWidth <= CFG.MOBILE_BREAKPOINT;
  let isFullscreen = false;
  let pdfUrl       = null;
  let rendering    = false;
  let autoHideTimer = null;

  /* ── Seletores de UI ────────────────────────────────────── */
  const sel = {
    section:      () => document.getElementById('cardapio-digital'),
    modal:        () => document.getElementById('pdf-viewer-modal'),
    modalHeader:  () => document.getElementById('pdf-modal-header'),
    modalContent: () => document.getElementById('pdf-modal-content'),
    loading:      () => document.getElementById('pdf-viewer-loading'),
    errorState:   () => document.getElementById('pdf-viewer-error'),
    emptyState:   () => document.getElementById('pdf-viewer-empty'),
    flipWrap:     () => document.getElementById('pdf-flipbook-wrap'),
    flipContainer:() => document.getElementById('pdf-flipbook'),
    fallbackWrap: () => document.getElementById('pdf-fallback-wrap'),
    fallbackCanvas:()=> document.getElementById('pdf-fallback-canvas'),
    pageIndicator:() => document.getElementById('pdf-page-indicator'),
    pageIndModal: () => document.getElementById('pdf-page-indicator-modal'),
    btnPrev:      () => document.getElementById('pdf-btn-prev'),
    btnNext:      () => document.getElementById('pdf-btn-next'),
    btnPrevFb:    () => document.getElementById('pdf-btn-prev-fb'),
    btnNextFb:    () => document.getElementById('pdf-btn-next-fb'),
    btnExpand:    () => document.getElementById('pdf-btn-expand'),
    btnExpandFb:  () => document.getElementById('pdf-btn-expand-fb'),
    btnCloseFs:   () => document.getElementById('pdf-btn-close-fs'),
    btnRetry:     () => document.getElementById('pdf-btn-retry'),
  };

  /* ── Helpers ─────────────────────────────────────────────── */
  function showState(state) {
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
    const text = `${page} / ${total}`;
    const elNormal = sel.pageIndicator();
    const elModal  = sel.pageIndModal();
    const elFb = document.getElementById('pdf-page-indicator-fb');
    if (elNormal) elNormal.textContent = text;
    if (elModal)  elModal.textContent  = text;
    if (elFb)     elFb.textContent     = text;

    // Badge flutuante no FS
    const badge = document.getElementById('pdf-fs-page-badge');
    if (badge) badge.textContent = text;
  }

  function updateNavButtons() {
    const prev = sel.btnPrev();
    const next = sel.btnNext();
    if (prev) prev.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages;
    const prevFb = sel.btnPrevFb();
    const nextFb = sel.btnNextFb();
    if (prevFb) prevFb.disabled = currentPage <= 1;
    if (nextFb) nextFb.disabled = currentPage >= totalPages;
  }

  /* ── Hint "Toque para expandir" ─────────────────────────── */
  function injectTapHint(container) {
    if (!container || container.querySelector('.pdf-tap-hint')) return;
    const hint = document.createElement('div');
    hint.className = 'pdf-tap-hint';
    hint.innerHTML = '<span class="pdf-tap-hint__icon">👆</span> Toque para expandir';
    container.appendChild(hint);
  }

  /* ── Auto-hide do header no FS ──────────────────────────── */
  function resetAutoHide() {
    const header = sel.modalHeader();
    if (!header || !isFullscreen) return;
    header.classList.remove('auto-hidden');
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      if (isFullscreen) header.classList.add('auto-hidden');
    }, 3000);
  }

  /* ── Badge flutuante de página no FS ────────────────────── */
  function ensureFsBadge() {
    const content = sel.modalContent();
    if (!content || document.getElementById('pdf-fs-page-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'pdf-fs-page-badge';
    badge.className = 'pdf-fs-page-badge';
    badge.textContent = `${currentPage} / ${totalPages}`;
    content.appendChild(badge);
  }

  function removeFsBadge() {
    const badge = document.getElementById('pdf-fs-page-badge');
    if (badge) badge.remove();
  }

  /* ── Lógica de Fullscreen ───────────────────────────────── */
  async function openFullscreen() {
    const modal = sel.modal();
    if (!modal) return;
    isFullscreen = true;
    modal.classList.remove('is-closing');
    modal.classList.add('is-fullscreen');
    document.body.classList.add('pdf-fs-open');

    const header = sel.modalHeader();
    if (header) header.style.display = 'flex';

    ensureFsBadge();
    resetAutoHide();

    // API nativa
    try {
      if (modal.requestFullscreen) await modal.requestFullscreen();
      else if (modal.webkitRequestFullscreen) await modal.webkitRequestFullscreen();
    } catch (e) {}

    // Esperar animação de entrada antes de rebuildar
    setTimeout(() => refreshViewer(), 350);
  }

  function closeFullscreen() {
    const modal = sel.modal();
    if (!modal || !isFullscreen) return;
    isFullscreen = false;
    clearTimeout(autoHideTimer);

    // Animação de saída
    modal.classList.add('is-closing');

    setTimeout(() => {
      modal.classList.remove('is-fullscreen', 'is-closing');
      document.body.classList.remove('pdf-fs-open');
      const header = sel.modalHeader();
      if (header) {
        header.style.display = 'none';
        header.classList.remove('auto-hidden');
      }
      removeFsBadge();

      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }

      refreshViewer();
    }, 250);
  }

  function refreshViewer() {
    if (!pdfUrl || !pdfDoc) return;
    const width = isFullscreen ? window.innerWidth : (sel.section()?.clientWidth || window.innerWidth);
    isMobile = width <= CFG.MOBILE_BREAKPOINT;
    if (isMobile) initFallbackMode();
    else initFlipbook();
  }

  /* ── Renderização ────────────────────────────────────────── */
  async function renderPageToCanvas(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const vp   = page.getViewport({ scale: CFG.RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }

  function buildPageElement(canvas, pageNum) {
    const div = document.createElement('div');
    div.className = 'pdf-page-leaf';
    div.dataset.page = pageNum;
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.92);
    img.alt = `Página ${pageNum}`;
    div.appendChild(img);
    return div;
  }

  async function initFallbackMode() {
    showState('fallback');
    const canvas = sel.fallbackCanvas();
    if (!canvas) return;

    async function renderFallbackPage(num) {
      currentPage = num;
      updateIndicator(num, totalPages);
      updateNavButtons();
      const page = await pdfDoc.getPage(num);
      const vp   = page.getViewport({ scale: CFG.RENDER_SCALE });
      const container = canvas.parentElement;
      const ratio = vp.width / vp.height;

      // No FS: maximizar área disponível
      let maxW, maxH;
      if (isFullscreen) {
        maxW = window.innerWidth - 100;   // espaço para setas
        maxH = window.innerHeight - 40;
      } else {
        maxW = container.clientWidth || 360;
        maxH = window.innerHeight * 0.7;
      }

      let finalW = maxW;
      let finalH = finalW / ratio;
      if (finalH > maxH) {
        finalH = maxH;
        finalW = finalH * ratio;
      }

      canvas.style.width  = finalW + 'px';
      canvas.style.height = finalH + 'px';
      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }

    await renderFallbackPage(currentPage);

    // Hint + tap-to-expand
    if (!isFullscreen) {
      const wrap = sel.fallbackWrap();
      injectTapHint(wrap);
      canvas.style.cursor = 'zoom-in';
      canvas.onclick = () => openFullscreen();
    } else {
      canvas.style.cursor = 'default';
      canvas.onclick = () => resetAutoHide();
    }
  }

  async function initFlipbook() {
    if (typeof PageFlip === 'undefined') { await initFallbackMode(); return; }
    const container = sel.flipContainer();
    if (!container) { await initFallbackMode(); return; }

    showState('loading');
    const firstBatch = Math.min(CFG.INITIAL_PAGES, totalPages);
    const pages = [];
    for (let i = 1; i <= firstBatch; i++) {
      try {
        const canvas = await renderPageToCanvas(i);
        pages.push(buildPageElement(canvas, i));
      } catch (err) {}
    }

    container.innerHTML = '';
    pages.forEach(p => container.appendChild(p));

    // Dimensões inteligentes baseadas no contexto
    let pageW, pageH;
    if (isFullscreen) {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      pageW = Math.min(Math.floor(winW / 2) - 60, 600);
      pageH = Math.min(Math.round(pageW * 1.414), winH - 60);
    } else {
      const containerW = sel.flipWrap()?.clientWidth || window.innerWidth;
      pageW = Math.min(Math.floor(containerW / 2) - 20, 500);
      pageH = Math.round(pageW * 1.414);
    }

    try {
      if (pageFlip) { try { pageFlip.destroy(); } catch {} pageFlip = null; }
      pageFlip = new PageFlip(container, {
        width: pageW, height: pageH, size: 'fixed',
        drawShadow: true, flippingTime: CFG.FLIP_DURATION,
        usePortrait: isMobile, startPage: Math.max(0, currentPage - 1),
        showCover: false, mobileScrollSupport: true,
        clickEventForward: true, useMouseEvents: true,
        swipeDistance: 30, showPageCorners: true
      });

      pageFlip.loadFromHTML(container.querySelectorAll('.pdf-page-leaf'));

      pageFlip.on('flip', (e) => {
        currentPage = e.data + 1;
        updateIndicator(currentPage, totalPages);
        updateNavButtons();
        if (isFullscreen) resetAutoHide();
        if (currentPage + 4 <= totalPages) {
          renderRemainingPages(currentPage + 2, Math.min(currentPage + 6, totalPages));
        }
      });

      showState('flipbook');
      updateIndicator(currentPage, totalPages);
      updateNavButtons();

      // Nav buttons do flipbook mode
      const prevBtn = sel.btnPrev();
      const nextBtn = sel.btnNext();
      if (prevBtn) prevBtn.onclick = () => { if (pageFlip) pageFlip.flipPrev(); };
      if (nextBtn) nextBtn.onclick = () => { if (pageFlip) pageFlip.flipNext(); };

      if (totalPages > firstBatch) {
        setTimeout(() => renderRemainingPages(firstBatch + 1, totalPages), 500);
      }

      // Hint + tap-to-expand (apenas inline)
      if (!isFullscreen) {
        const wrap = sel.flipWrap();
        injectTapHint(wrap);
      }

    } catch (err) { await initFallbackMode(); }
  }

  async function renderRemainingPages(from, to) {
    if (rendering) return;
    rendering = true;
    const container = sel.flipContainer();
    if (!container) { rendering = false; return; }
    for (let i = from; i <= to; i++) {
      if (container.querySelector(`[data-page="${i}"]`)) continue;
      try {
        const canvas = await renderPageToCanvas(i);
        const pageEl = buildPageElement(canvas, i);
        container.appendChild(pageEl);
        if (pageFlip) { try { pageFlip.loadFromHTML(container.querySelectorAll('.pdf-page-leaf')); } catch {} }
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {}
    }
    rendering = false;
  }

  async function loadPDF(url) {
    showState('loading');
    pdfUrl = url;
    try {
      if (window.pdfjsLib) {
        const pdfjs = window.pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        pdfDoc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
        totalPages = pdfDoc.numPages;
        refreshViewer();
      }
    } catch (err) { showState('error'); }
  }

  async function init() {
    const section = sel.section();
    if (!section || !window.cafeteriaDB) return;
    showState('loading');
    try {
      const meta = await window.cafeteriaDB.menuPdf.get();
      const rootMenu = document.getElementById('cardapio-root');
      const catNav   = document.getElementById('cat-nav-container');
      if (!meta || !meta.active || !meta.pdfUrl) {
        section.style.display = 'none';
        if (rootMenu) rootMenu.style.display = 'block';
        if (catNav)   catNav.style.display = 'block';
        return;
      }
      window.cafeteriaPdfActive = true;
      if (rootMenu) rootMenu.style.display = 'none';
      if (catNav)   catNav.style.display   = 'none';
      await loadPDF(meta.pdfUrl);
    } catch (err) { showState('error'); }
  }

  /* ── Eventos ────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    const btnRetry = sel.btnRetry();
    if (btnRetry) btnRetry.onclick = () => pdfUrl ? loadPDF(pdfUrl) : init();

    // Fullscreen toggles
    [sel.btnExpand(), sel.btnExpandFb()].forEach(btn => {
      if (btn) btn.onclick = openFullscreen;
    });
    const btnCloseFs = sel.btnCloseFs();
    if (btnCloseFs) btnCloseFs.onclick = closeFullscreen;

    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFullscreen) closeFullscreen();
    });

    // Native fullscreen change
    const onFsChange = () => {
      const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isNativeFs && isFullscreen) closeFullscreen();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // Auto-hide: mostrar header ao mover mouse / tocar
    document.addEventListener('mousemove', () => { if (isFullscreen) resetAutoHide(); });
    document.addEventListener('touchstart', () => { if (isFullscreen) resetAutoHide(); }, { passive: true });

    // Nav Fallback
    const btnPrevFb = document.getElementById('pdf-btn-prev-fb');
    const btnNextFb = document.getElementById('pdf-btn-next-fb');
    if (btnPrevFb) btnPrevFb.onclick = () => { if (currentPage > 1) { currentPage--; refreshViewer(); } };
    if (btnNextFb) btnNextFb.onclick = () => { if (currentPage < totalPages) { currentPage++; refreshViewer(); } };

    // Bootstrap
    let attempts = 0;
    const tryInit = () => {
      if (window.pdfjsLib || attempts++ > 20) init();
      else setTimeout(tryInit, 300);
    };
    tryInit();

    // Resize
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (pdfUrl && pdfDoc) refreshViewer(); }, 400);
    });
  });

})();
