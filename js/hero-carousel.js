/* =========================================================
   HERO-CAROUSEL.JS — Carrossel Cinematográfico "Galeria de Artes"
   Auto-rotate, crossfade (mobile), 3D side-by-side showcase (desktop),
   swipe, keyboard, nav buttons, progress bar
   ========================================================= */

(function () {
  'use strict';

  const AUTOPLAY_INTERVAL = 6000;     // 6s per slide
  const PROGRESS_STEP     = 50;       // update every 50ms
  const SWIPE_THRESHOLD   = 50;       // min px to trigger swipe

  // ─── DOM Elements ──────────────────────────────
  const carousel    = document.getElementById('hero-carousel');
  if (!carousel) return; // bail if not on home page

  const slides      = carousel.querySelectorAll('.hero-carousel__slide');
  const captionEl   = document.getElementById('carousel-caption');
  const captionText = captionEl?.querySelector('.hero-carousel__caption-text');
  const captionSub  = captionEl?.querySelector('.hero-carousel__caption-sub');
  const progressBar = document.getElementById('carousel-progress');
  const prevBtn     = document.getElementById('carousel-prev');
  const nextBtn     = document.getElementById('carousel-next');

  let current       = 0;
  let progressTimer = null;
  let progressValue = 0;
  let isPaused      = false;

  // ─── Desktop Multi-Card Showcase Positioning ────
  function updateDesktopSlides() {
    const isDesktop = window.innerWidth >= 1024;
    const N = slides.length;

    slides.forEach((slide, i) => {
      if (!isDesktop) {
        // Modo Mobile/Tablet: remove estilos inline para usar regras CSS padrão
        slide.style.transform = '';
        slide.style.opacity = '';
        slide.style.zIndex = '';
        slide.style.pointerEvents = '';
        slide.style.filter = '';
        return;
      }

      let diff = (i - current) % N;
      if (diff > N / 2) diff -= N;
      if (diff < -N / 2) diff += N;

      const absDiff = Math.abs(diff);

      if (diff === 0) {
        slide.style.opacity = '1';
        slide.style.pointerEvents = 'auto';
        slide.style.zIndex = '10';
        slide.style.filter = 'none';
        slide.style.transform = 'translate(-50%, -50%) scale(1)';
      } else if (absDiff === 1) {
        slide.style.opacity = '0.55';
        slide.style.pointerEvents = 'auto';
        slide.style.zIndex = '5';
        slide.style.filter = 'brightness(0.7) blur(0.5px)';
        slide.style.transform = `translate(calc(-50% + ${diff * 105}%), -50%) scale(0.88)`;
      } else if (absDiff === 2) {
        slide.style.opacity = '0.22';
        slide.style.pointerEvents = 'auto';
        slide.style.zIndex = '2';
        slide.style.filter = 'brightness(0.4) blur(1.5px)';
        slide.style.transform = `translate(calc(-50% + ${diff * 105}%), -50%) scale(0.76)`;
      } else {
        slide.style.opacity = '0';
        slide.style.pointerEvents = 'none';
        slide.style.zIndex = '1';
        slide.style.transform = `translate(calc(-50% + ${diff * 115}%), -50%) scale(0.65)`;
      }
    });
  }

  // ─── Core: Go to slide ─────────────────────────
  function goToSlide(index) {
    if (index === current) return;

    const prev = current;
    current = ((index % slides.length) + slides.length) % slides.length;

    // Crossfade classes
    slides[prev].classList.remove('hero-carousel__slide--active');
    slides[current].classList.add('hero-carousel__slide--active');

    // Posicionamento do showcase desktop
    updateDesktopSlides();

    // Animate caption
    updateCaption();

    // Reset progress
    resetProgress();
  }

  function nextSlide() {
    goToSlide(current + 1);
  }

  function prevSlide() {
    goToSlide(current - 1);
  }

  // ─── Caption animation ─────────────────────────
  function updateCaption() {
    if (!captionEl || !captionText || !captionSub) return;

    const slide = slides[current];
    const newCaption = slide.dataset.caption || '';
    const newSubtitle = slide.dataset.subtitle || '';

    // Fade out
    captionEl.classList.remove('fade-in');
    captionEl.classList.add('fade-out');

    setTimeout(() => {
      captionText.textContent = newCaption;
      captionSub.textContent = newSubtitle;

      // Fade in
      captionEl.classList.remove('fade-out');
      captionEl.classList.add('fade-in');
    }, 350);
  }

  // ─── Progress bar ──────────────────────────────
  function resetProgress() {
    progressValue = 0;
    if (progressBar) progressBar.style.width = '0%';
  }

  function tickProgress() {
    if (isPaused) return;
    progressValue += (PROGRESS_STEP / AUTOPLAY_INTERVAL) * 100;
    if (progressBar) {
      progressBar.style.width = Math.min(progressValue, 100) + '%';
    }
    if (progressValue >= 100) {
      nextSlide();
    }
  }

  // ─── Autoplay ──────────────────────────────────
  function startAutoplay() {
    stopAutoplay();
    resetProgress();
    progressTimer = setInterval(tickProgress, PROGRESS_STEP);
  }

  function stopAutoplay() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function pauseAutoplay() {
    isPaused = true;
  }

  function resumeAutoplay() {
    isPaused = false;
  }

  // ─── Event Listeners ──────────────────────────
  // Clique direto nas obras vizinhas para trazê-las ao centro no Desktop
  slides.forEach((slide, idx) => {
    slide.addEventListener('click', () => {
      if (window.innerWidth >= 1024 && idx !== current) {
        goToSlide(idx);
        startAutoplay();
      }
    });
  });

  // Botões de navegação lateral (Desktop)
  prevBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    prevSlide();
    startAutoplay();
  });

  nextBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    nextSlide();
    startAutoplay();
  });

  // Redimensionamento de janela
  let resizeDebounce = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(updateDesktopSlides, 100);
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    const hero = document.getElementById('home');
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    if (e.key === 'ArrowLeft') {
      prevSlide();
      startAutoplay();
    } else if (e.key === 'ArrowRight') {
      nextSlide();
      startAutoplay();
    }
  });

  // Touch/Swipe support (Mobile)
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;

  const heroSection = document.getElementById('home');

  if (heroSection) {
    heroSection.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      isSwiping = true;
      pauseAutoplay();
    }, { passive: true });

    heroSection.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      isSwiping = false;

      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD) {
        if (diffX > 0) {
          nextSlide();
        } else {
          prevSlide();
        }
      }

      resumeAutoplay();
      startAutoplay();
    }, { passive: true });
  }

  // Pause on hover (desktop)
  if (heroSection) {
    heroSection.addEventListener('mouseenter', pauseAutoplay);
    heroSection.addEventListener('mouseleave', () => {
      resumeAutoplay();
    });
  }

  // Pause when tab is not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAutoplay();
    } else {
      resumeAutoplay();
    }
  });

  // ─── Preload images ────────────────────────────
  function preloadSlideImages() {
    slides.forEach((slide) => {
      const imgDiv = slide.querySelector('.hero-carousel__img');
      if (imgDiv) {
        const bgUrl = imgDiv.style.backgroundImage;
        const match = bgUrl.match(/url\(['"]?([^'"()]+)['"]?\)/);
        if (match && match[1]) {
          const img = new Image();
          img.src = match[1];
        }
      }
    });
  }

  // ─── Initialize ────────────────────────────────
  preloadSlideImages();
  updateDesktopSlides();
  startAutoplay();

})();
