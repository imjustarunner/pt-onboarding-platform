import { ref, watch, onMounted, onBeforeUnmount } from 'vue';

export function isOnboardingActive({ visible, focused, lastInputAt, now, playingVideo = false }) {
  return visible && focused && (playingVideo || now - lastInputAt < 120000);
}

// Time comes from the server. The browser reports only attention and a replay sequence.
export function useOnboardingActivity({ enabled, token, http, playingVideo = null, onCredit = null }) {
  const tracking = ref(false);
  const error = ref('');
  const sessionId = crypto.randomUUID();
  let sequence = 0;
  let lastInputAt = Date.now();
  let timer;
  let inFlight = null;
  const touch = () => {
    const wasIdle = Date.now() - lastInputAt >= 120000;
    lastInputAt = Date.now();
    if (enabled.value && (wasIdle || !tracking.value)) void heartbeat();
  };
  const attachedFrames = new Map();
  const attachFrames = () => {
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        const doc = frame.contentDocument;
        if (!doc || attachedFrames.get(frame) === doc) continue;
        events.forEach(name => doc.addEventListener(name, touch, { passive: true, capture: true }));
        attachedFrames.set(frame, doc);
      } catch { /* Cross-origin media reports playback separately. */ }
    }
  };
  const heartbeat = async (forceInactive = false) => {
    if ((!enabled.value && !forceInactive) || !token.value) { tracking.value = false; return; }
    if (inFlight) {
      // A phase change must still pause after an already-sent active heartbeat.
      if (forceInactive) { await inFlight; return heartbeat(true); }
      return inFlight;
    }
    const active = !forceInactive && isOnboardingActive({ visible: document.visibilityState === 'visible',
      focused: document.hasFocus(), lastInputAt, now: Date.now(),
      playingVideo: !!playingVideo?.value || [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended) });
    inFlight = http.post(`/prehire-portal/${token.value}/activity`, { sessionId, sequence: ++sequence, active })
      .then(({ data }) => { tracking.value = data.tracking && active; error.value = ''; if (Number(data.creditedSeconds) > 0) onCredit?.(Number(data.creditedSeconds)); })
      .catch(() => { tracking.value = false; error.value = 'Time tracking could not connect. Please reconnect before continuing, or report missing time to People Operations.'; })
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  const attentionChanged = () => { if (document.visibilityState === 'visible' && document.hasFocus()) lastInputAt = Date.now(); void heartbeat(); };
  const events = ['pointerdown', 'pointermove', 'keydown', 'input', 'scroll', 'touchstart', 'focusin'];
  onMounted(() => {
    events.forEach((name) => window.addEventListener(name, touch, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', attentionChanged);
    window.addEventListener('focus', attentionChanged);
    window.addEventListener('blur', attentionChanged);
    attachFrames();
    timer = setInterval(() => { attachFrames(); void heartbeat(); }, 15000);
    void heartbeat();
  });
  watch(enabled, (value, previous) => { if (value) { lastInputAt = Date.now(); void heartbeat(); } else if (previous) void heartbeat(true); });
  onBeforeUnmount(() => {
    clearInterval(timer);
    for (const doc of attachedFrames.values()) events.forEach(name => doc.removeEventListener(name, touch, true));
    attachedFrames.clear();
    events.forEach((name) => window.removeEventListener(name, touch, true));
    document.removeEventListener('visibilitychange', attentionChanged);
    window.removeEventListener('focus', attentionChanged);
    window.removeEventListener('blur', attentionChanged);
    void heartbeat(true);
  });
  return { tracking, error, flush: heartbeat };
}
