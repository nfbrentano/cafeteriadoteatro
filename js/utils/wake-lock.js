/**
 * Screen Wake Lock Utility
 * Keeps the screen awake during operational shifts (KDS, TV, Totem, PDV).
 * Automatically re-acquires the lock on document visibilitychange.
 */

let wakeLockSentinel = null;
let isEnabled = false;
let listenersBound = false;
let onStatusChangeCallbacks = [];

export function isWakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof navigator.wakeLock?.request === 'function';
}

function notifyStatus(active) {
  onStatusChangeCallbacks.forEach(cb => {
    try { cb(active); } catch (e) { console.error('WakeLock status callback error:', e); }
  });
}

export async function requestWakeLock() {
  if (!isWakeLockSupported()) return false;
  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return true;
    }
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
      notifyStatus(false);
    });
    notifyStatus(true);
    return true;
  } catch (err) {
    // Graceful degradation: NotAllowedError, low battery mode, etc.
    wakeLockSentinel = null;
    notifyStatus(false);
    return false;
  }
}

export async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch (_) {}
    wakeLockSentinel = null;
  }
  notifyStatus(false);
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && isEnabled) {
    requestWakeLock();
  }
}

/**
 * Automatically keeps screen awake as long as enabled is true.
 * Attaches to visibilitychange to re-acquire whenever returning to tab.
 */
export function setupAutoWakeLock({ defaultActive = true, onStatusChange = null } = {}) {
  if (typeof onStatusChange === 'function') {
    onStatusChangeCallbacks.push(onStatusChange);
  }

  isEnabled = defaultActive;

  if (!listenersBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // User interaction fallback for browsers requiring a user gesture
    const tryFirstGesture = () => {
      if (isEnabled && (!wakeLockSentinel || wakeLockSentinel.released)) {
        requestWakeLock();
      }
      window.removeEventListener('pointerdown', tryFirstGesture);
      window.removeEventListener('keydown', tryFirstGesture);
    };
    window.addEventListener('pointerdown', tryFirstGesture, { once: true });
    window.addEventListener('keydown', tryFirstGesture, { once: true });
    listenersBound = true;
  }

  if (isEnabled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
    requestWakeLock();
  }

  return {
    enable: async () => {
      isEnabled = true;
      return await requestWakeLock();
    },
    disable: async () => {
      isEnabled = false;
      await releaseWakeLock();
    },
    isActive: () => !!wakeLockSentinel && !wakeLockSentinel.released,
    isEnabled: () => isEnabled,
    destroy: () => {
      isEnabled = false;
      releaseWakeLock();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      listenersBound = false;
      onStatusChangeCallbacks = [];
    }
  };
}

/**
 * Initializes a toggle button in the UI (e.g. PDV Mobile header).
 */
export function initWakeLockToggle(buttonElement, { storageKey = 'caf_wake_lock_enabled', defaultOnMobile = true } = {}) {
  if (!buttonElement) return null;

  if (!isWakeLockSupported()) {
    buttonElement.style.display = 'none';
    return null;
  }

  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const savedPref = localStorage.getItem(storageKey);
  const shouldBeActive = savedPref !== null ? savedPref === 'true' : (defaultOnMobile && isTouchDevice);

  const manager = setupAutoWakeLock({
    defaultActive: shouldBeActive,
    onStatusChange: (active) => {
      updateUi(active);
    }
  });

  function updateUi(active) {
    if (active) {
      buttonElement.classList.add('active');
      buttonElement.setAttribute('aria-pressed', 'true');
      buttonElement.title = 'Tela sempre ligada (ativa). Toque para desligar';
      buttonElement.innerHTML = '🔆 <span class="wake-lock-label">Tela acesa</span>';
    } else {
      buttonElement.classList.remove('active');
      buttonElement.setAttribute('aria-pressed', 'false');
      buttonElement.title = 'Tela sempre ligada (desativada). Toque para ativar';
      buttonElement.innerHTML = '🌙 <span class="wake-lock-label">Tela normal</span>';
    }
  }

  buttonElement.addEventListener('click', async () => {
    if (manager.isEnabled()) {
      await manager.disable();
      localStorage.setItem(storageKey, 'false');
      updateUi(false);
    } else {
      const ok = await manager.enable();
      localStorage.setItem(storageKey, 'true');
      updateUi(ok);
    }
  });

  updateUi(shouldBeActive);
  return manager;
}

if (typeof window !== 'undefined') {
  window.WakeLockUtil = {
    isWakeLockSupported,
    requestWakeLock,
    releaseWakeLock,
    setupAutoWakeLock,
    initWakeLockToggle
  };
}
