import api from '../services/api';

// Operational events only. Never send SDK messages, tokens, names, or media.
export function reportSupervisionConnection(sessionId, event, detail = {}) {
  if (!sessionId) return;
  void api.post(`/supervision/sessions/${encodeURIComponent(sessionId)}/connection-events`, {
    event,
    reason: detail.reason,
    code: Number.isInteger(Number(detail.code)) ? Number(detail.code) : undefined,
    online: typeof navigator === 'undefined' ? undefined : navigator.onLine
  }, { skipGlobalLoading: true, skipAuthRedirect: true }).catch(() => {
    // Diagnostics must never block entering, leaving, or retrying a meeting.
  });
}
