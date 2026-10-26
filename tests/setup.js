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

  // Audio mock
  if (!window.Audio) {
    window.Audio = class {
      play() { return Promise.resolve(); }
      pause() {}
      load() {}
      addEventListener() {}
      removeEventListener() {}
    };
  }

  // matchMedia mock
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
  }

  // Supabase mock padrão para carregar o cliente real
  if (!window.supabase) {
    window.supabase = {
      createClient: vi.fn(() => ({
        auth: {
          getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
          signOut: vi.fn(() => Promise.resolve({ error: null })),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          then: (resolve) => resolve({ data: [], error: null })
        })),
        rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
        channel: vi.fn(() => ({
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
        }))
      }))
    };
  }

  // Importa e executa supabase-client.js real (fornece window.escapeHtml real - RF05)
  await import('../js/supabase-client.js');
}

