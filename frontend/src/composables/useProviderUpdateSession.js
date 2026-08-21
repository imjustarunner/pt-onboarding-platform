import { onUnmounted } from 'vue';
import api from '../services/api';

const HEARTBEAT_MS = 60_000;

export function useProviderUpdateSession({ recipientId, agencyId, mode, token }) {
  let timer = null;
  let stopping = false;

  async function sendHeartbeat() {
    if (stopping || document.visibilityState !== 'visible') return;
    try {
      if (mode === 'token' && token) {
        const tok = typeof token === 'function' ? token() : token?.value;
        if (!tok) return;
        await api.post(
          `/public/provider-update/${encodeURIComponent(tok)}/session-heartbeat`,
          { visible: true },
          { skipGlobalLoading: true }
        );
      } else {
        const aid = typeof agencyId === 'function' ? agencyId() : agencyId?.value;
        if (!aid) return;
        await api.post(
          '/provider-update/me/session-heartbeat',
          { agencyId: aid, visible: true },
          { skipGlobalLoading: true }
        );
      }
    } catch {
      /* non-blocking */
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') sendHeartbeat();
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
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', sendHeartbeat);
    sendHeartbeat();
  }

  onUnmounted(stop);
  return { start, stop };
}
