/* =========================================================
   CARDAPIO-PDF-VIEWER.JS — Flipbook Interativo
   PDF.js + StPageFlip + Fullscreen + Fallbacks
   ========================================================= */

(function () {
  'use strict';

  /* ── Configuração ───────────────────────────────────────── */
  const CFG = {
    RENDER_SCALE: 2.0,        // 2x para nitidez em HiDPI
    INITIAL_PAGES: 4,         // Páginas renderizadas imediatamente
    FLIP_DURATION: 600,       // ms para animação de virada
    MOBILE_BREAKPOINT: 768    // px — abaixo disso: modo single-page (fallback)
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

  /* ── Seletores de UI ────────────────────────────────────── */
  const sel = {
    section:      () => document.getElementById('cardapio-digital'),
    modal:        () => document.getElementById('pdf-viewer-modal'),
    modalHeader:  () => document.getElementById('pdf-modal-header'),
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
    const elNormal = sel.pageIndicator();
    const elModal  = sel.pageIndModal();
    const text = `${page} / ${total}`;
    if (elNormal) elNormal.textContent = text;
    if (elModal)  elModal.textContent  = text;
    
    const elFb = document.getElementById('pdf-page-indicator-fb');
    if (elFb) elFb.textContent = text;
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

  /* ── Lógica de Fullscreen ───────────────────────────────── */
  async function openFullscreen() {
    const modal = sel.modal();
    if (!modal) return;
    isFullscreen = true;
    modal.classList.add('is-fullscreen');
    document.body.classList.add('pdf-fs-open');
    sel.modalHeader().style.display = 'flex';
    try {
      if (modal.requestFullscreen) await modal.requestFullscreen();
      else if (modal.webkitRequestFullscreen) await modal.webkitRequestFullscreen();
    } catch (e) {}
    refreshViewer();
  }

  function closeFullscreen() {
    const modal = sel.modal();
    if (!modal) return;
    isFullscreen = false;
    modal.classList.remove('is-fullscreen');
    document.body.classList.remove('pdf-fs-open');
    sel.modalHeader().style.display = 'none';
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    refreshViewer();
  }

  function refreshViewer() {
    if (!pdfUrl) return;
    const width = isFullscreen ? window.innerWidth : (sel.section()?.clientWidth || window.innerWidth);
    isMobile = width <= CFG.MOBILE_BREAKPOINT;
    if (isMobile) initFallbackMode();
    else initFlipbook();
  }

  /* ── Renderização ────────────────────────────────────────── */
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
      let maxH = window.innerHeight - 120;
      let maxW = container.clientWidth || 360;
      if (isFullscreen) maxW = window.innerWidth - 40;
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
    canvas.onclick = () => { if(!isFullscreen) openFullscreen(); };
  }

  async function initFlipbook() {
    if (typeof PageFlip === 'undefined') {
      await initFallbackMode();
      return;
    }
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
    const winW = isFullscreen ? window.innerWidth : (sel.flipWrap()?.clientWidth || window.innerWidth);
    const winH = isFullscreen ? window.innerHeight - 100 : 600;
    const pageW = Math.min(Math.floor(winW / 2) - 40, 500);
    const pageH = Math.min(Math.round(pageW * 1.414), winH - 40);

    try {
      if (pageFlip) { try { pageFlip.destroy(); } catch {} pageFlip = null; }
      pageFlip = new PageFlip(container, {
        width: pageW, height: pageH, size: 'fixed',
        drawShadow: true, flippingTime: CFG.FLIP_DURATION,
        usePortrait: isMobile, startPage: currentPage - 1,
        showCover: false, mobileScrollSupport: true,
        clickEventForward: true, useMouseEvents: true,
        swipeDistance: 30, showPageCorners: true
      });
      pageFlip.loadFromHTML(container.querySelectorAll('.pdf-page-leaf'));
      pageFlip.on('flip', (e) => {
        currentPage = e.data + 1;
        updateIndicator(currentPage, totalPages);
        updateNavButtons();
        if (currentPage + 4 <= totalPages) renderRemainingPages(currentPage + 2, Math.min(currentPage + 6, totalPages));
      });
      showState('flipbook');
      updateIndicator(currentPage, totalPages);
      updateNavButtons();
      if (totalPages > firstBatch) setTimeout(() => renderRemainingPages(firstBatch + 1, totalPages), 500);
      container.onclick = () => { if(!isFullscreen) openFullscreen(); };
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
        const loadingTask = pdfjs.getDocument({ url, withCredentials: false });
        pdfDoc = await loadingTask.promise;
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

  document.addEventListener('DOMContentLoaded', () => {
    const btnRetry = sel.btnRetry();
    if (btnRetry) btnRetry.onclick = () => pdfUrl ? loadPDF(pdfUrl) : init();
    [sel.btnExpand(), sel.btnExpandFb()].forEach(btn => { if (btn) btn.onclick = openFullscreen; });
    const btnCloseFs = sel.btnCloseFs();
    if (btnCloseFs) btnCloseFs.onclick = closeFullscreen;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isFullscreen) closeFullscreen(); });
    const onFsChange = () => {
      const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isNativeFs && isFullscreen) closeFullscreen();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    const btnPrevFb = document.getElementById('pdf-btn-prev-fb');
    const btnNextFb = document.getElementById('pdf-btn-next-fb');
    if (btnPrevFb) btnPrevFb.onclick = () => { if (currentPage > 1) { currentPage--; refreshViewer(); } };
    if (btnNextFb) btnNextFb.onclick = () => { if (currentPage < totalPages) { currentPage++; refreshViewer(); } };
    
    let attempts = 0;
    const tryInit = () => {
      if (window.pdfjsLib || attempts++ > 20) init();
      else setTimeout(tryInit, 300);
    };
    tryInit();
    let timer;
    window.onresize = () => { clearTimeout(timer); timer = setTimeout(refreshViewer, 400); };
  });

})();
