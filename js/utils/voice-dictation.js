/**
 * Voice Dictation Utility (Web Speech API) - CAF-000067
 * Attaches speech-to-text (pt-BR) to observation inputs/textareas.
 */

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognitionInstance({ lang = 'pt-BR' } = {}) {
  if (!isSpeechRecognitionSupported()) return null;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRec();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  return recognition;
}

export function bindVoiceDictation(buttonElement, targetInputElement, { onResult = null, onError = null } = {}) {
  if (!buttonElement || !targetInputElement) return null;

  if (!isSpeechRecognitionSupported()) {
    buttonElement.style.display = 'none';
    return null;
  }

  let recognition = null;
  let isListening = false;

  function setListeningState(listening) {
    isListening = listening;
    if (listening) {
      buttonElement.classList.add('is-listening');
      buttonElement.setAttribute('aria-pressed', 'true');
      buttonElement.title = 'Ouvindo... Fale agora em português';
      buttonElement.textContent = '🔴 Gravando...';
    } else {
      buttonElement.classList.remove('is-listening');
      buttonElement.setAttribute('aria-pressed', 'false');
      buttonElement.title = 'Ditar observação por voz (pt-BR)';
      buttonElement.textContent = '🎤 Ditar';
    }
  }

  buttonElement.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isListening && recognition) {
      try { recognition.stop(); } catch (_) {}
      setListeningState(false);
      return;
    }

    try {
      recognition = createSpeechRecognitionInstance();
      if (!recognition) return;

      recognition.onstart = () => {
        setListeningState(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript.trim()) {
          const currentVal = targetInputElement.value.trim();
          const separator = currentVal ? ', ' : '';
          targetInputElement.value = `${currentVal}${separator}${transcript.trim()}`;
          targetInputElement.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof onResult === 'function') {
            onResult(transcript);
          }
        }
      };

      recognition.onerror = (err) => {
        setListeningState(false);
        if (typeof onError === 'function') {
          onError(err);
        }
      };

      recognition.onend = () => {
        setListeningState(false);
      };

      recognition.start();
    } catch (err) {
      setListeningState(false);
      if (typeof onError === 'function') onError(err);
    }
  });

  return {
    isListening: () => isListening,
    stop: () => {
      if (recognition && isListening) {
        recognition.stop();
        setListeningState(false);
      }
    }
  };
}

if (typeof window !== 'undefined') {
  window.VoiceDictation = {
    isSpeechRecognitionSupported,
    createSpeechRecognitionInstance,
    bindVoiceDictation
  };
}
