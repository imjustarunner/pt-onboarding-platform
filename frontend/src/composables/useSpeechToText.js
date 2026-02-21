/**
 * Composable for live speech-to-text via Web Speech API.
 * Use for transcribing into task inputs, chat, etc.
 */
import { ref, onUnmounted } from 'vue';

export function useSpeechToText(options = {}) {
  const { onFinal } = options;
  const isListening = ref(false);
  const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const isSupported = !!SpeechRec;
  let recognition = null;

  function startListening() {
    if (!SpeechRec || isListening.value) return;
    try {
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator?.language || 'en-US';
      recognition.onresult = (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          const transcript = String(res?.[0]?.transcript || '').trim();
          if (transcript && res.isFinal) finalText += `${transcript} `;
        }
        if (finalText.trim() && typeof onFinal === 'function') {
          onFinal(finalText.trim());
        }
      };
      recognition.onerror = () => stopListening();
      recognition.onend = () => {
        isListening.value = false;
      };
      recognition.start();
      isListening.value = true;
    } catch {
      isListening.value = false;
    }
  }

  function stopListening() {
    try {
      recognition?.stop?.();
    } catch {
      // ignore
    }
    recognition = null;
    isListening.value = false;
  }

  onUnmounted(stopListening);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening
  };
}
