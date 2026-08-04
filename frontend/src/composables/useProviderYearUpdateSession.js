import { onUnmounted } from 'vue';
import api from '../services/api';

const HEARTBEAT_MS = 60_000;

/**
 * Accrue visible time while a provider is in the Year Update flow.
 * Sends heartbeats every 60s while the tab is visible (auth or magic-link).
 */
export function useProviderYearUpdateSession({ cycleId, agencyId, mode, token }) {
  let timer = null;
  let stopping = false;

  async function sendHeartbeat() {
    if (stopping || document.visibilityState !== 'visible') return;
    const id = typeof cycleId === 'function' ? cycleId() : cycleId?.value;
    if (!id) return;
    try {
      if (mode === 'token' && token) {
        const tok = typeof token === 'function' ? token() : token?.value;
        if (!tok) return;
        await api.post(
          `/public/provider-year-update/${encodeURIComponent(tok)}/session-heartbeat`,
          { visible: true },
          { skipGlobalLoading: true }
        );
      } else {
        const aid = typeof agencyId === 'function' ? agencyId() : agencyId?.value;
        if (!aid) return;
        await api.post(
          '/provider-year-update/me/session-heartbeat',
          { agencyId: aid, cycleId: id, visible: true },
          { skipGlobalLoading: true }
        );
      }
    } catch {
      /* non-blocking */
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      sendHeartbeat();
    }
  }

  function start() {
    stop();
    stopping = false;
    sendHeartbeat();
    timer = setInterval(sendHeartbeat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', sendHeartbeat);
  }

  function stop() {
    stopping = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', sendHeartbeat);
    sendHeartbeat();
  }

  onUnmounted(stop);

  return { start, stop };
}
