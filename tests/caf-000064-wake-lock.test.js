import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isWakeLockSupported, requestWakeLock, releaseWakeLock, setupAutoWakeLock, initWakeLockToggle } from '../js/utils/wake-lock.js';

describe('CAF-000064 — Screen Wake Lock API Functional Tests', () => {
  let mockSentinel;

  beforeEach(() => {
    localStorage.clear();
    mockSentinel = {
      released: false,
      release: vi.fn(function () {
        this.released = true;
        this.onRelease?.();
        return Promise.resolve();
      }),
      addEventListener: vi.fn(function (event, cb) {
        if (event === 'release') this.onRelease = cb;
      }),
      removeEventListener: vi.fn()
    };

    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn(() => Promise.resolve(mockSentinel))
      },
      configurable: true,
      writable: true
    });
  });

  afterEach(async () => {
    await releaseWakeLock();
    vi.restoreAllMocks();
  });

  it('CA01: Checks support and automatically acquires wake lock when requested', async () => {
    expect(isWakeLockSupported()).toBe(true);
    const acquired = await requestWakeLock();
    expect(acquired).toBe(true);
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
  });

  it('CA02: Reacquires lock on visibilitychange when tab returns to visible', async () => {
    const manager = setupAutoWakeLock({ defaultActive: true });
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);

    // Simulate switching tabs (hidden)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Simulate returning to tab (visible)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(navigator.wakeLock.request).toHaveBeenCalled();
    manager.destroy();
  });

  it('CA03: Toggle button toggles state, persists in localStorage and updates UI', async () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    const toggle = initWakeLockToggle(btn, { storageKey: 'test_wake_lock' });
    expect(btn.classList.contains('active')).toBe(false);

    // Click to enable
    btn.click();
    await new Promise(r => setTimeout(r, 10));
    expect(localStorage.getItem('test_wake_lock')).toBe('true');
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.innerHTML).toContain('Tela acesa');

    // Click to disable
    btn.click();
    await new Promise(r => setTimeout(r, 10));
    expect(localStorage.getItem('test_wake_lock')).toBe('false');
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.innerHTML).toContain('Tela normal');

    toggle?.destroy?.();
    btn.remove();
  });

  it('CA04: Graceful degradation when navigator.wakeLock is not supported', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      configurable: true
    });

    expect(isWakeLockSupported()).toBe(false);
    const acquired = await requestWakeLock();
    expect(acquired).toBe(false);

    const btn = document.createElement('button');
    document.body.appendChild(btn);
    const toggle = initWakeLockToggle(btn);
    expect(btn.style.display).toBe('none');
    expect(toggle).toBeNull();
    btn.remove();
  });

  it('CA04 (Negative): Graceful degradation when wakeLock request rejects (e.g. low battery / permission denied)', async () => {
    navigator.wakeLock.request = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    const acquired = await requestWakeLock();
    expect(acquired).toBe(false);
  });
});
