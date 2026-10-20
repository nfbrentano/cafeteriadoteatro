import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSpeechRecognitionSupported,
  createSpeechRecognitionInstance,
  bindVoiceDictation
} from '../js/utils/voice-dictation.js';
import { bindSwipeRight } from '../js/utils/swipe-action.js';

describe('CAF-000067 — Voice Dictation & Swipe Action Functional Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('CA01: Voice dictation transcribes speech into input with proper formatting', () => {
    let capturedRecognition;
    class FakeRecognition {
      constructor() {
        this.lang = 'pt-BR';
        this.onstart = null;
        this.onresult = null;
        this.onend = null;
        capturedRecognition = this;
      }
      start() {
        if (this.onstart) this.onstart();
      }
      stop() {
        if (this.onend) this.onend();
      }
    }
    window.SpeechRecognition = FakeRecognition;

    const btn = document.createElement('button');
    const input = document.createElement('input');
    input.value = 'Sem açúcar';

    const handler = bindVoiceDictation(btn, input);
    btn.click(); // Start recording

    expect(btn.classList.contains('is-listening')).toBe(true);

    // Simulate speech recognition result
    capturedRecognition.onresult({
      results: [[{ transcript: 'bem quente' }]]
    });

    expect(input.value).toBe('Sem açúcar, bem quente');
    handler.stop();
    expect(btn.classList.contains('is-listening')).toBe(false);
  });

  it('CA02: When SpeechRecognition is not supported, button is hidden gracefully', () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;

    const btn = document.createElement('button');
    const input = document.createElement('input');

    const handler = bindVoiceDictation(btn, input);
    expect(handler).toBeNull();
    expect(btn.style.display).toBe('none');
  });

  it('CA03: Swiping card to the right past threshold triggers callback', async () => {
    const card = document.createElement('div');
    document.body.appendChild(card);
    const onSwipe = vi.fn();

    const handler = bindSwipeRight(card, onSwipe, { thresholdPx: 80 });

    // Simulate touchstart
    card.dispatchEvent(new TouchEvent('touchstart', {
      touches: [{ clientX: 10, clientY: 50 }]
    }));

    // Simulate touchmove (horizontal swipe 100px)
    card.dispatchEvent(new TouchEvent('touchmove', {
      touches: [{ clientX: 110, clientY: 52 }]
    }));

    // Simulate touchend
    card.dispatchEvent(new TouchEvent('touchend'));

    // Wait for the animation timeout
    await new Promise(r => setTimeout(r, 200));

    expect(onSwipe).toHaveBeenCalledTimes(1);
    handler.destroy();
    card.remove();
  });

  it('CA05: Vertical scrolling does not trigger horizontal swipe callback', async () => {
    const card = document.createElement('div');
    document.body.appendChild(card);
    const onSwipe = vi.fn();

    const handler = bindSwipeRight(card, onSwipe, { thresholdPx: 80 });

    // Touch start
    card.dispatchEvent(new TouchEvent('touchstart', {
      touches: [{ clientX: 20, clientY: 20 }]
    }));

    // Touch move predominantly vertical (Y delta = 60, X delta = 5)
    card.dispatchEvent(new TouchEvent('touchmove', {
      touches: [{ clientX: 25, clientY: 80 }]
    }));

    // Touch end
    card.dispatchEvent(new TouchEvent('touchend'));
    await new Promise(r => setTimeout(r, 200));

    expect(onSwipe).not.toHaveBeenCalled();
    handler.destroy();
    card.remove();
  });
});
