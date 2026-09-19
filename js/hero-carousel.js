/* =========================================================
   HERO-CAROUSEL.JS — Carrossel Cinematográfico "Galeria de Artes"
   Auto-rotate, crossfade, swipe, keyboard, progress bar
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
  const dots        = document.querySelectorAll('.hero-carousel__dot');
  const prevBtn     = document.getElementById('carousel-prev');
  const nextBtn     = document.getElementById('carousel-next');
  const captionEl   = document.getElementById('carousel-caption');
  const captionText = captionEl?.querySelector('.hero-carousel__caption-text');
  const captionSub  = captionEl?.querySelector('.hero-carousel__caption-sub');
  const progressBar = document.getElementById('carousel-progress');

  let current       = 0;
  let autoplayTimer = null;
  let progressTimer = null;
  let progressValue = 0;
  let isPaused      = false;

  // ─── Core: Go to slide ─────────────────────────
  function goToSlide(index, direction) {
    if (index === current) return;

    const prev = current;
    current = ((index % slides.length) + slides.length) % slides.length;

    // Crossfade slides
    slides[prev].classList.remove('hero-carousel__slide--active');
    slides[current].classList.add('hero-carousel__slide--active');

    // Update dots
    dots.forEach((dot, i) => {
      dot.classList.toggle('hero-carousel__dot--active', i === current);
      dot.setAttribute('aria-selected', i === current ? 'true' : 'false');
    });

    // Animate caption
    updateCaption();

    // Reset progress
    resetProgress();
  }

  function nextSlide() {
    goToSlide(current + 1, 'next');
  }

  function prevSlide() {
    goToSlide(current - 1, 'prev');
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
    }, 400);
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
    clearInterval(progressTimer);
    progressTimer = null;
  }

  function pauseAutoplay() {
    isPaused = true;
  }

  function resumeAutoplay() {
    isPaused = false;
  }

  // ─── Event Listeners ──────────────────────────
  // Navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      prevSlide();
      startAutoplay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      nextSlide();
      startAutoplay();
    });
  }

  // Dot navigation
  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const slideIndex = parseInt(dot.dataset.slide, 10);
      goToSlide(slideIndex);
      startAutoplay();
    });
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    // Only respond when hero is in viewport
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

  // Touch/Swipe support
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
  startAutoplay();

})();
