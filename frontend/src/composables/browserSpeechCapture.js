/**
 * Web Speech API helper for live meeting transcripts.
 * Each client only hears its own mic — remote audio cannot be fed in.
 * Vonage + iPad often abort with audio-capture; retry instead of giving up.
 */

const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed']);
const RETRY_DELAY_MS = {
  'audio-capture': 2000,
  network: 1500,
  aborted: 400,
  'no-speech': 250
};

export function createBrowserSpeechCapture({
  onTranscript,
  onHint,
  onCapturing
} = {}) {
  let recognition = null;
  let wanted = false;
  let restartTimer = null;
  let audioCaptureAttempts = 0;

  function setCapturing(on) {
    try { onCapturing?.(!!on); } catch { /* ignore */ }
  }

  function setHint(text) {
    try { onHint?.(String(text || '')); } catch { /* ignore */ }
  }

  function clearRestart() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function stop() {
    wanted = false;
    clearRestart();
    audioCaptureAttempts = 0;
    const rec = recognition;
    recognition = null;
    setCapturing(false);
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try { rec.stop(); } catch { /* ignore */ }
    try { rec.abort(); } catch { /* ignore */ }
  }

  function scheduleRestart(delayMs) {
    if (!wanted) return;
    clearRestart();
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!wanted || recognition) return;
      start();
    }, Math.max(200, Number(delayMs) || 800));
  }

  function start() {
    if (recognition) return true;
    const SR = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    if (!SR) {
      setHint('Live transcript needs Chrome or Safari speech recognition (mic permission).');
      setCapturing(false);
      return false;
    }
    wanted = true;
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (event) => {
        try {
          const result = event?.results?.[event.resultIndex];
          const text = String(result?.[0]?.transcript || '').trim();
          if (text) onTranscript?.(text);
        } catch { /* ignore */ }
      };
      rec.onerror = (event) => {
        if (recognition === rec) recognition = null;
        const code = String(event?.error || '').toLowerCase();
        if (FATAL_ERRORS.has(code)) {
          wanted = false;
          setCapturing(false);
          setHint('Microphone permission is needed to capture this person’s speech in the transcript.');
          return;
        }
        setCapturing(false);
        if (code === 'audio-capture') {
          audioCaptureAttempts += 1;
          if (audioCaptureAttempts >= 8) {
            setHint('This browser could not capture speech for the transcript. Chrome on a computer is more reliable.');
            return;
          }
        }
        const delay = RETRY_DELAY_MS[code] ?? 800;
        scheduleRestart(delay);
      };
      rec.onend = () => {
        if (recognition !== rec) return;
        recognition = null;
        if (!wanted) {
          setCapturing(false);
          return;
        }
        scheduleRestart(350);
      };
      recognition = rec;
      rec.start();
      audioCaptureAttempts = 0;
      setCapturing(true);
      setHint('Listening for live transcript…');
      return true;
    } catch {
      recognition = null;
      setCapturing(false);
      setHint('Could not start live transcript capture.');
      if (wanted) scheduleRestart(1200);
      return false;
    }
  }

  return { start, stop };
}
