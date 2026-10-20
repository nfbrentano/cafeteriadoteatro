/**
 * Swipe Action Utility (Touch gestures) - CAF-000067
 * Enables swipe-right gesture on cards to trigger quick actions (e.g. deliver order).
 */

export function bindSwipeRight(cardElement, onSwipeRight, { thresholdPx = 90, actionBgColor = '#22c55e' } = {}) {
  if (!cardElement || typeof onSwipeRight !== 'function') return null;

  let startX = 0;
  let startY = 0;
  let currentDeltaX = 0;
  let isSwiping = false;
  let isScrollingVertical = false;

  // Wrapper for background action hint
  cardElement.style.touchAction = 'pan-y';

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentDeltaX = 0;
    isSwiping = false;
    isScrollingVertical = false;
    cardElement.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (e.touches.length !== 1 || isScrollingVertical) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Detect direction early (first 15px)
    if (!isSwiping && !isScrollingVertical) {
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        isScrollingVertical = true;
        return;
      }
      if (deltaX > 10) {
        isSwiping = true;
      }
    }

    if (isSwiping && deltaX > 0) {
      // Swipe right only
      currentDeltaX = Math.min(deltaX, 160);
      cardElement.style.transform = `translateX(${currentDeltaX}px)`;
      if (currentDeltaX >= thresholdPx) {
        cardElement.style.boxShadow = `0 4px 14px ${actionBgColor}66`;
      } else {
        cardElement.style.boxShadow = '';
      }
    }
  }

  function onTouchEnd() {
    cardElement.style.transition = 'transform 0.25s ease-out, box-shadow 0.25s ease-out';
    cardElement.style.boxShadow = '';

    if (isSwiping && currentDeltaX >= thresholdPx) {
      cardElement.style.transform = `translateX(${cardElement.offsetWidth || 200}px)`;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([20, 40, 20]);
        }
      } catch (_) {}

      setTimeout(() => {
        cardElement.style.transform = '';
        cardElement.style.transition = '';
        onSwipeRight();
      }, 150);
    } else {
      cardElement.style.transform = '';
    }

    isSwiping = false;
    isScrollingVertical = false;
    currentDeltaX = 0;
  }

  cardElement.addEventListener('touchstart', onTouchStart, { passive: true });
  cardElement.addEventListener('touchmove', onTouchMove, { passive: true });
  cardElement.addEventListener('touchend', onTouchEnd, { passive: true });
  cardElement.addEventListener('touchcancel', onTouchEnd, { passive: true });

  return {
    destroy: () => {
      cardElement.removeEventListener('touchstart', onTouchStart);
      cardElement.removeEventListener('touchmove', onTouchMove);
      cardElement.removeEventListener('touchend', onTouchEnd);
      cardElement.removeEventListener('touchcancel', onTouchEnd);
    }
  };
}

if (typeof window !== 'undefined') {
  window.SwipeAction = {
    bindSwipeRight
  };
}
