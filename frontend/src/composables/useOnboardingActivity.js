import { ref, watch, onMounted, onBeforeUnmount } from 'vue';

export function isOnboardingActive({ visible, focused, lastInputAt, now, playingVideo = false }) {
  return visible && focused && (playingVideo || now - lastInputAt < 120000);
}

// Time comes from the server. The browser reports only attention and a replay sequence.
export function useOnboardingActivity({ enabled, token, http }) {
  const tracking = ref(false);
  const error = ref('');
  const sessionId = crypto.randomUUID();
  let sequence = 0;
  let lastInputAt = Date.now();
  let timer;
  let inFlight = null;
  const touch = () => { lastInputAt = Date.now(); };
  const heartbeat = async (forceInactive = false) => {
    if (!enabled.value || !token.value) { tracking.value = false; return; }
    if (inFlight) return inFlight;
    const active = !forceInactive && isOnboardingActive({ visible: document.visibilityState === 'visible',
      focused: document.hasFocus(), lastInputAt, now: Date.now(),
      playingVideo: [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended) });
    inFlight = http.post(`/prehire-portal/${token.value}/activity`, { sessionId, sequence: ++sequence, active })
      .then(({ data }) => { tracking.value = data.tracking && active; error.value = ''; })
      .catch(() => { tracking.value = false; error.value = 'Time tracking could not connect. Please reconnect before continuing, or report missing time to People Operations.'; })
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  const attentionChanged = () => { void heartbeat(); };
  const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
  onMounted(() => {
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    document.addEventListener('visibilitychange', attentionChanged);
    window.addEventListener('focus', attentionChanged);
    window.addEventListener('blur', attentionChanged);
    timer = setInterval(heartbeat, 15000);
    void heartbeat();
  });
  watch(enabled, () => { void heartbeat(); });
  onBeforeUnmount(() => {
    clearInterval(timer);
    events.forEach((name) => window.removeEventListener(name, touch));
    document.removeEventListener('visibilitychange', attentionChanged);
    window.removeEventListener('focus', attentionChanged);
    window.removeEventListener('blur', attentionChanged);
    void heartbeat(true);
  });
  return { tracking, error, flush: heartbeat };
}
