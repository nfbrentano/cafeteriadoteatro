import { vi } from 'vitest';

// Polyfills and mocks for Web APIs in test environment
if (typeof window !== 'undefined') {
  // Clipboard mock if needed
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(() => Promise.resolve()),
        readText: vi.fn(() => Promise.resolve(''))
      },
      configurable: true
    });
  }

  // WakeLock mock
  if (!navigator.wakeLock) {
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn(() => Promise.resolve({
          released: false,
          release: vi.fn(() => Promise.resolve()),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        }))
      },
      configurable: true
    });
  }

  // Web Share mock
  if (!navigator.share) {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(() => Promise.resolve()),
      configurable: true
    });
  }

  // Speech Recognition mock
  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = 'pt-BR';
      this.onstart = null;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    }
    start() {
      if (this.onstart) this.onstart();
    }
    stop() {
      if (this.onend) this.onend();
    }
    abort() {
      if (this.onend) this.onend();
    }
  }

  window.SpeechRecognition = MockSpeechRecognition;
  window.webkitSpeechRecognition = MockSpeechRecognition;

  // Notification mock
  if (!window.Notification) {
    window.Notification = {
      permission: 'granted',
      requestPermission: vi.fn(() => Promise.resolve('granted'))
    };
  }

  // escapeHtml global (presente em js/supabase-client.js)
  if (!window.escapeHtml) {
    window.escapeHtml = function(unsafe) {
      if (!unsafe) return '';
      return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
  }
}
