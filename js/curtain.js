/**
 * CURTAIN.JS
 * Manages the theater curtain entrance animation.
 */

document.addEventListener('DOMContentLoaded', () => {
  const wrapper = document.querySelector('.curtain-wrapper');
  
  if (!wrapper) return;

  // Add a small delay to ensure everything is ready
  setTimeout(() => {
    wrapper.classList.add('is-opening');
    
    // Disable scrolling while curtains are closed
    document.body.style.overflow = 'hidden';

    // Cleanup after animation completes (duration is 1.8s in CSS)
    setTimeout(() => {
      wrapper.style.display = 'none';
      document.body.style.overflow = '';
      
      // Trigger a custom event in case other components need to know
      window.dispatchEvent(new CustomEvent('curtainOpened'));
      
      // Optionally remove from DOM
      // wrapper.remove();
    }, 2000);
  }, 500); // 500ms initial pause for dramatic effect
});
