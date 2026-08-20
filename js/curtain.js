/**
 * CURTAIN.JS
 * Manages the theater curtain entrance animation.
 */

function initCurtain() {
  const wrapper = document.querySelector('.curtain-wrapper');
  if (!wrapper) return;

  // Disable scrolling while curtains are closed
  document.body.style.overflow = 'hidden';

  // Double rAF ensures the closed curtain is painted before transition starts
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        wrapper.classList.add('is-opening');

        // Cleanup after animation completes (duration is 1.8s in CSS)
        setTimeout(() => {
          wrapper.style.display = 'none';
          document.body.style.overflow = '';

          // Trigger a custom event in case other components need to know
          window.dispatchEvent(new CustomEvent('curtainOpened'));
        }, 1900);
      }, 350); // Dramatic entrance pause
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCurtain);
} else {
  initCurtain();
}

