/* =========================================================
   CARDAPIO-PDF-VIEWER.JS — Flipbook Interativo
   PDF.js + StPageFlip + Fullscreen + Fallbacks
   ========================================================= */

(function () {
  'use strict';

  const CFG = {
    RENDER_SCALE: 2.0,
    INITIAL_PAGES: 4,
    FLIP_DURATION: 600,
    MOBILE_BREAKPOINT: 768,
    AUTO_HIDE_DELAY: 3000,
    SWIPE_THRESHOLD: 40
  };

  let pdfDoc       = null;
  let pageFlip     = null;
  let totalPages   = 0;
  let currentPage  = 1;
  let isMobile     = window.innerWidth <= CFG.MOBILE_BREAKPOINT;
  let isFullscreen = false;
  let pdfUrl       = null;
  let rendering    = false;
  let autoHideTimer = null;
  let swipeHintShown = false;

  // Touch tracking for swipe gestures
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwiping = false;

  /* ── Seletores ─────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  /* ── Helpers ─────────────────────────────────────────────── */
  function showState(state) {
    ['pdf-viewer-loading','pdf-viewer-error','pdf-viewer-empty',
     'pdf-flipbook-wrap','pdf-fallback-wrap'].forEach(id => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    const map = {
      loading: 'pdf-viewer-loading', error: 'pdf-viewer-error',
      empty: 'pdf-viewer-empty', flipbook: 'pdf-flipbook-wrap',
      fallback: 'pdf-fallback-wrap'
    };
    const target = $(map[state]);
    if (target) target.style.display = '';
  }

  /* ── Progress Dots ──────────────────────────────────────── */
  function buildProgressDots() {
    const container = $('pdf-fs-progress');
    if (!container) return;
    container.innerHTML = '';
    // Show dots only for reasonable page counts (≤ 30)
    if (totalPages > 30 || totalPages <= 1) return;
    for (let i = 1; i <= totalPages; i++) {
      const dot = document.createElement('div');
      dot.className = 'pdf-fs-progress-dot' + (i === currentPage ? ' active' : '');
      container.appendChild(dot);
    }
  }

  function updateProgressDots() {
    const container = $('pdf-fs-progress');
    if (!container) return;
    const dots = container.querySelectorAll('.pdf-fs-progress-dot');
    dots.forEach((d, idx) => {
      d.classList.toggle('active', idx + 1 === currentPage);
    });
  }

  function updateUI() {
    const text = `${currentPage} / ${totalPages}`;
    // Todos os indicadores
    ['pdf-page-indicator', 'pdf-page-indicator-fb', 'pdf-page-indicator-modal', 'pdf-page-indicator-bottom'].forEach(id => {
      const el = $(id);
      if (el) el.textContent = text;
    });
    // Todos os botões prev
    ['pdf-btn-prev', 'pdf-btn-prev-fb', 'pdf-fs-prev', 'pdf-fs-prev-bottom'].forEach(id => {
      const el = $(id);
      if (el) el.disabled = currentPage <= 1;
    });
    // Todos os botões next
    ['pdf-btn-next', 'pdf-btn-next-fb', 'pdf-fs-next', 'pdf-fs-next-bottom'].forEach(id => {
      const el = $(id);
      if (el) el.disabled = currentPage >= totalPages;
    });
    updateProgressDots();
  }

  /* ── Navegação ─────────────────────────────────────────── */
  function goPrev() {
    if (currentPage <= 1) return;
    if (pageFlip && !isMobile) {
      pageFlip.flipPrev();
    } else {
      currentPage--;
      updateUI();
      renderCurrentFallbackPage();
    }
  }

  function goNext() {
    if (currentPage >= totalPages) return;
    if (pageFlip && !isMobile) {
      pageFlip.flipNext();
    } else {
      currentPage++;
      updateUI();
      renderCurrentFallbackPage();
    }
  }

  /* ── Hint "Toque para expandir" ─────────────────────────── */
  function injectTapHint(container) {
    if (!container || container.querySelector('.pdf-tap-hint')) return;
    const hint = document.createElement('div');
    hint.className = 'pdf-tap-hint';
    hint.innerHTML = '<span class="pdf-tap-hint__icon">👆</span> Toque para expandir';
    container.appendChild(hint);
  }

  /* ── Swipe Hint (FS mobile, first time only) ───────────── */
  function showSwipeHint() {
    if (swipeHintShown || !isMobile || !isFullscreen) return;
    swipeHintShown = true;
    const modal = $('pdf-viewer-modal');
    if (!modal) return;
    // Remove any existing hint
    const existing = modal.querySelector('.pdf-swipe-hint');
    if (existing) existing.remove();
    const hint = document.createElement('div');
    hint.className = 'pdf-swipe-hint';
    hint.innerHTML = '<span class="pdf-swipe-hint__icon">👈 👉</span>Deslize para navegar';
    modal.appendChild(hint);
    // Auto-remove after 3s
    setTimeout(() => {
      hint.style.transition = 'opacity 0.4s ease';
      hint.style.opacity = '0';
      setTimeout(() => hint.remove(), 400);
    }, 3000);
  }

  /* ── Auto-hide header & bottom bar FS ──────────────────── */
  function resetAutoHide() {
    const header = $('pdf-modal-header');
    const bottomBar = $('pdf-fs-bottom-bar');
    if (!isFullscreen) return;
    if (header) header.classList.remove('auto-hidden');
    if (bottomBar) bottomBar.classList.remove('auto-hidden');
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      if (isFullscreen) {
        if (header) header.classList.add('auto-hidden');
        if (bottomBar) bottomBar.classList.add('auto-hidden');
      }
    }, CFG.AUTO_HIDE_DELAY);
  }

  /* ── Swipe gestures (FS mobile) ────────────────────────── */
  function setupSwipeGestures() {
    const modal = $('pdf-viewer-modal');
    if (!modal) return;

    modal.addEventListener('touchstart', (e) => {
      if (!isFullscreen || !isMobile) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
      isSwiping = false;
    }, { passive: true });

    modal.addEventListener('touchmove', (e) => {
      if (!isFullscreen || !isMobile) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      // Horizontal swipe detected
      if (dx > 10 && dx > dy) {
        isSwiping = true;
      }
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
      if (!isFullscreen || !isMobile || !isSwiping) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const elapsed = Date.now() - touchStartTime;
      // Must be a quick swipe (< 400ms) or long enough distance
      if (Math.abs(dx) >= CFG.SWIPE_THRESHOLD && (elapsed < 400 || Math.abs(dx) > 80)) {
        if (dx < 0) goNext();
        else goPrev();
        resetAutoHide();
      }
      isSwiping = false;
    }, { passive: true });
  }

  /* ── Fullscreen ────────────────────────────────────────── */
  async function openFullscreen() {
    const modal = $('pdf-viewer-modal');
    if (!modal) return;
    isFullscreen = true;
    modal.classList.remove('is-closing');
    modal.classList.add('is-fullscreen');
    document.body.classList.add('pdf-fs-open');
    const header = $('pdf-modal-header');
    if (header) header.style.display = 'flex';
    buildProgressDots();
    resetAutoHide();
    try {
      if (modal.requestFullscreen) await modal.requestFullscreen();
      else if (modal.webkitRequestFullscreen) await modal.webkitRequestFullscreen();
    } catch (e) {}
    setTimeout(() => {
      refreshViewer();
      showSwipeHint();
    }, 300);
  }

  function closeFullscreen() {
    const modal = $('pdf-viewer-modal');
    if (!modal || !isFullscreen) return;
    isFullscreen = false;
    clearTimeout(autoHideTimer);
    modal.classList.add('is-closing');
    setTimeout(() => {
      modal.classList.remove('is-fullscreen', 'is-closing');
      document.body.classList.remove('pdf-fs-open');
      const header = $('pdf-modal-header');
      if (header) { header.style.display = 'none'; header.classList.remove('auto-hidden'); }
      const bottomBar = $('pdf-fs-bottom-bar');
      if (bottomBar) bottomBar.classList.remove('auto-hidden');
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
      // Remove swipe hint if present
      const hint = modal.querySelector('.pdf-swipe-hint');
      if (hint) hint.remove();
      refreshViewer();
    }, 200);
  }

  function refreshViewer() {
    if (!pdfUrl || !pdfDoc) return;
    const width = isFullscreen ? window.innerWidth : ($('cardapio-digital')?.clientWidth || window.innerWidth);
    isMobile = width <= CFG.MOBILE_BREAKPOINT;
    if (isMobile) initFallbackMode();
    else initFlipbook();
  }

  /* ── Renderização ────────────────────────────────────────── */
  async function renderPageToCanvas(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: CFG.RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
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

  /* ── Fallback (single page) ────────────────────────────── */
  async function renderCurrentFallbackPage() {
    const canvas = $('pdf-fallback-canvas');
    if (!canvas || !pdfDoc) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: CFG.RENDER_SCALE });
    const container = canvas.parentElement;
    const ratio = vp.width / vp.height;
    let maxW, maxH;
    if (isFullscreen) {
      // Mobile FS: Use virtually all available space
      // Account for safe areas and a small padding
      const safeTop = 12;
      const safeBottom = 12;
      maxW = window.innerWidth - 8;    // Nearly edge-to-edge
      maxH = window.innerHeight - safeTop - safeBottom;
    } else {
      maxW = container.clientWidth || 360;
      maxH = window.innerHeight * 0.7;
    }
    let finalW = maxW, finalH = finalW / ratio;
    if (finalH > maxH) { finalH = maxH; finalW = finalH * ratio; }
    canvas.style.width = finalW + 'px';
    canvas.style.height = finalH + 'px';
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }

  async function initFallbackMode() {
    showState('fallback');
    await renderCurrentFallbackPage();
    updateUI();
    const canvas = $('pdf-fallback-canvas');
    if (canvas && !isFullscreen) {
      canvas.style.cursor = 'zoom-in';
      canvas.onclick = () => openFullscreen();
      injectTapHint($('pdf-fallback-wrap'));
    } else if (canvas) {
      canvas.style.cursor = 'default';
      canvas.onclick = () => resetAutoHide();
    }
  }

  /* ── Flipbook (desktop) ────────────────────────────────── */
  async function initFlipbook() {
    if (typeof PageFlip === 'undefined') { await initFallbackMode(); return; }
    const container = $('pdf-flipbook');
    if (!container) { await initFallbackMode(); return; }
    showState('loading');

    const firstBatch = Math.min(CFG.INITIAL_PAGES, totalPages);
    const pages = [];
    for (let i = 1; i <= firstBatch; i++) {
      try { pages.push(buildPageElement(await renderPageToCanvas(i), i)); } catch {}
    }
    container.innerHTML = '';
    pages.forEach(p => container.appendChild(p));

    let pageW, pageH;
    if (isFullscreen) {
      pageW = Math.min(Math.floor(window.innerWidth / 2) - 40, 600);
      pageH = Math.min(Math.round(pageW * 1.414), window.innerHeight - 100);
    } else {
      const cw = $('pdf-flipbook-wrap')?.clientWidth || window.innerWidth;
      pageW = Math.min(Math.floor(cw / 2) - 20, 500);
      pageH = Math.round(pageW * 1.414);
    }

    try {
      if (pageFlip) { try { pageFlip.destroy(); } catch {} pageFlip = null; }
      pageFlip = new PageFlip(container, {
        width: pageW, height: pageH, size: 'fixed',
        drawShadow: true, flippingTime: CFG.FLIP_DURATION,
        usePortrait: false, startPage: Math.max(0, currentPage - 1),
        showCover: false, mobileScrollSupport: true,
        clickEventForward: true, useMouseEvents: true,
        swipeDistance: 30, showPageCorners: true
      });
      pageFlip.loadFromHTML(container.querySelectorAll('.pdf-page-leaf'));
      pageFlip.on('flip', (e) => {
        currentPage = e.data + 1;
        updateUI();
        if (isFullscreen) resetAutoHide();
        if (currentPage + 4 <= totalPages)
          renderRemainingPages(currentPage + 2, Math.min(currentPage + 6, totalPages));
      });
      showState('flipbook');
      updateUI();
      if (totalPages > firstBatch)
        setTimeout(() => renderRemainingPages(firstBatch + 1, totalPages), 500);
      if (!isFullscreen) injectTapHint($('pdf-flipbook-wrap'));
    } catch (err) { await initFallbackMode(); }
  }

  async function renderRemainingPages(from, to) {
    if (rendering) return;
    rendering = true;
    const container = $('pdf-flipbook');
    if (!container) { rendering = false; return; }
    for (let i = from; i <= to; i++) {
      if (container.querySelector(`[data-page="${i}"]`)) continue;
      try {
        container.appendChild(buildPageElement(await renderPageToCanvas(i), i));
        if (pageFlip) try { pageFlip.loadFromHTML(container.querySelectorAll('.pdf-page-leaf')); } catch {}
        await new Promise(r => setTimeout(r, 100));
      } catch {}
    }
    rendering = false;
  }

  async function loadPDF(url) {
    showState('loading');
    pdfUrl = url;
    try {
      const pdfjs = window.pdfjsLib;
      if (!pdfjs) return;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      pdfDoc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
      totalPages = pdfDoc.numPages;
      refreshViewer();
    } catch { showState('error'); }
  }

  async function init() {
    const section = $('cardapio-digital');
    if (!section || !window.cafeteriaDB) return;
    showState('loading');
    try {
      const meta = await window.cafeteriaDB.menuPdf.get();
      const rootMenu = $('cardapio-root');
      const catNav = $('cat-nav-container');
      if (!meta || !meta.active || !meta.pdfUrl) {
        section.style.display = 'none';
        if (rootMenu) rootMenu.style.display = 'block';
        if (catNav) catNav.style.display = 'block';
        return;
      }
      window.cafeteriaPdfActive = true;
      if (rootMenu) rootMenu.style.display = 'none';
      if (catNav) catNav.style.display = 'none';
      await loadPDF(meta.pdfUrl);
    } catch { showState('error'); }
  }

  /* ── Eventos ────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    // Retry
    const btnRetry = $('pdf-btn-retry');
    if (btnRetry) btnRetry.onclick = () => pdfUrl ? loadPDF(pdfUrl) : init();

    // Navegação — todos os botões prev/next
    ['pdf-btn-prev', 'pdf-btn-prev-fb', 'pdf-fs-prev', 'pdf-fs-prev-bottom'].forEach(id => {
      const el = $(id);
      if (el) el.onclick = (e) => { e.stopPropagation(); goPrev(); if (isFullscreen) resetAutoHide(); };
    });
    ['pdf-btn-next', 'pdf-btn-next-fb', 'pdf-fs-next', 'pdf-fs-next-bottom'].forEach(id => {
      const el = $(id);
      if (el) el.onclick = (e) => { e.stopPropagation(); goNext(); if (isFullscreen) resetAutoHide(); };
    });

    // Fullscreen toggles
    ['pdf-btn-expand', 'pdf-btn-expand-fb'].forEach(id => {
      const el = $(id);
      if (el) el.onclick = openFullscreen;
    });
    const btnClose = $('pdf-btn-close-fs');
    if (btnClose) btnClose.onclick = closeFullscreen;

    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFullscreen) closeFullscreen();
    });

    // Setas do teclado
    document.addEventListener('keydown', (e) => {
      if (!pdfDoc) return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    });

    // Native FS change
    const onFsChange = () => {
      if (!(document.fullscreenElement || document.webkitFullscreenElement) && isFullscreen)
        closeFullscreen();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // Auto-hide no FS
    document.addEventListener('mousemove', () => { if (isFullscreen) resetAutoHide(); });
    document.addEventListener('touchstart', () => { if (isFullscreen) resetAutoHide(); }, { passive: true });

    // Setup swipe gestures for mobile FS
    setupSwipeGestures();

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
      timer = setTimeout(() => { if (pdfDoc) refreshViewer(); }, 400);
    });
  });

})();
