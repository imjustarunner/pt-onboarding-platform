import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { isOnboardingActive } from './useOnboardingActivity';

export function useGuideTrainingActivity({ enabled, send }) {
  const paused = ref(false), tracking = ref(false), error = ref('');
  const sessionId = crypto.randomUUID();
  let sequence = 0, lastInputAt = Date.now(), timer, pending, disposed = false;
  const touch = () => { lastInputAt = Date.now(); };
  async function flush(inactive = false) {
    if (pending) { await pending; if (inactive) return flush(true); return; }
    if (!enabled.value && !inactive) { tracking.value = false; return; }
    const active = !inactive && !paused.value && isOnboardingActive({ visible: document.visibilityState === 'visible', focused: document.hasFocus(), lastInputAt, now: Date.now() });
    pending = send({ sessionId, sequence: ++sequence, active }).then(data => { if (!disposed) { tracking.value = active && data.tracking; error.value = ''; } })
      .catch(() => { if (!disposed) { tracking.value = false; error.value = 'Time tracking could not connect. Reconnect before continuing; report any missing work time through the app.'; } })
      .finally(() => { pending = null; });
    return pending;
  }
  const attention = () => { if (enabled.value) void flush(); };
  const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
  onMounted(() => {
    events.forEach(e => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', attention); window.addEventListener('focus', attention); window.addEventListener('blur', attention);
    timer = setInterval(attention, 15000); attention();
  });
  watch(enabled, (value, before) => { if (value) { touch(); void flush(); } else if (before) void flush(true); });
  watch(paused, () => { touch(); if (enabled.value) void flush(); });
  onBeforeUnmount(() => {
    clearInterval(timer); disposed = true;
    events.forEach(e => window.removeEventListener(e, touch)); document.removeEventListener('visibilitychange', attention); window.removeEventListener('focus', attention); window.removeEventListener('blur', attention);
    if (enabled.value) void flush(true);
  });
  return { paused, tracking, error, flush };
}
