import { onUnmounted, ref } from 'vue';
import api from '../services/api';
export const UPDATE_IDLE_MS = 5 * 60_000;
export function useProviderUpdateSession({ agencyId, mode, token, sectionKey }) {
  const paused = ref(false), activeSeconds = ref(0), timeError = ref('');
  let wasVisible = document.visibilityState === 'visible';
  let timer, running = false, lastActivity = 0, lastTick = 0, pendingMs = 0, sequence = 0, previousSection = 'overview';
  const sessionId = crypto.randomUUID();
  let queue = Promise.resolve();
  const value = x => typeof x === 'function' ? x() : x?.value ?? x;
  function collect() {
    const now = Date.now();
    const delta = now - lastTick;
    if (running && !paused.value && wasVisible && delta >= 0 && delta <= 45000) {
      pendingMs += Math.max(0, Math.min(now, lastActivity + UPDATE_IDLE_MS) - lastTick);
    }
    lastTick = now;
    wasVisible = document.visibilityState === 'visible';
    paused.value = now - lastActivity >= UPDATE_IDLE_MS;
  }
  function flush() {
    if (!running) return queue;
    collect();
    const seconds = Math.min(45, Math.floor(pendingMs / 1000));
    pendingMs -= seconds * 1000;
    const body = { sessionId, sequence: ++sequence, sectionKey: previousSection, activeSeconds: seconds, active: !paused.value && document.visibilityState === 'visible' };
    previousSection = value(sectionKey) || 'overview';
    const tok = value(token), aid = value(agencyId);
    const url = mode === 'token' ? `/public/provider-update/${encodeURIComponent(tok)}/session-heartbeat` : '/provider-update/me/session-heartbeat';
    if (mode !== 'token') body.agencyId = aid;
    queue = queue.catch(() => {}).then(async () => {
      try {
        const { data } = await api.post(url, body, { skipGlobalLoading: true });
        activeSeconds.value = data.activeSeconds;
        timeError.value = data.recording === false ? 'Time is being tracked in another open updater tab. Use one tab at a time.' : '';
      } catch {
        timeError.value = 'Time could not be saved. Reconnect and use Need help to report any missing work time before completing.';
      }
    });
    return queue;
  }
  function changeSection(key) { flush(); previousSection = key || 'overview'; }
  function activity() {
    if (!running || document.visibilityState !== 'visible') return;
    collect(); lastActivity = Date.now();
    if (paused.value) { paused.value = false; lastTick = lastActivity; flush(); }
  }
  function visibility() { flush(); lastTick = Date.now(); }
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'provider-update-activity'];
  function start(initialSeconds = 0) {
    if (running) return;
    running = true; activeSeconds.value = initialSeconds; lastTick = lastActivity = Date.now();
    previousSection = value(sectionKey) || 'overview'; flush();
    timer = setInterval(flush, 15000);
    for (const event of events) document.addEventListener(event, activity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', flush);
  }
  async function stop() {
    if (!running) return;
    const saved = flush(); running = false; clearInterval(timer);
    for (const event of events) document.removeEventListener(event, activity, true);
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', flush);
    await saved;
  }
  onUnmounted(stop);
  return { start, stop, flush, changeSection, activity, paused, activeSeconds, timeError };
}
