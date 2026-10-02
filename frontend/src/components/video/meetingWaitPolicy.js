export const WAIT_PROMPT_MS = 2 * 60 * 1000;
export const WAIT_RESPONSE_MS = 30 * 1000;
export const MAX_ALONE_MS = 10 * 60 * 1000;

// Absolute deadlines also cover background tabs and a suspended browser waking up.
export function createMeetingWaitPolicy() {
  let aloneSince = null;
  let promptAt = null;
  function reset() { aloneSince = null; promptAt = null; }
  function snapshot(now) {
    if (aloneSince === null) return { phase: 'inactive' };
    const hardDeadline = aloneSince + MAX_ALONE_MS;
    const disconnectAt = Math.min(promptAt + WAIT_RESPONSE_MS, hardDeadline);
    return { phase: now >= disconnectAt ? 'expired' : now >= promptAt ? 'prompt' : 'waiting',
      aloneSince, hardDeadline, disconnectAt,
      secondsRemaining: Math.max(0, Math.ceil((disconnectAt - now) / 1000)),
      canExtend: now < hardDeadline && promptAt + WAIT_RESPONSE_MS < hardDeadline };
  }
  return {
    update({ connected, others, now = Date.now() }) {
      if (!connected || others > 0) reset();
      else if (aloneSince === null) { aloneSince = now; promptAt = now + WAIT_PROMPT_MS; }
      return snapshot(now);
    },
    extend(now = Date.now()) {
      const state = snapshot(now);
      if (state.phase !== 'prompt' || !state.canExtend) return state;
      promptAt = Math.min(now + WAIT_PROMPT_MS, state.hardDeadline - WAIT_RESPONSE_MS);
      return snapshot(now);
    },
    reset
  };
}

export function participantIdentity(connection) {
  let data = {};
  try { data = typeof connection?.data === 'string' ? JSON.parse(connection.data) : connection?.data || {}; } catch { /* old SDK connections */ }
  return { key: String(data.identity || connection?.connectionId || connection?.id || ''),
    name: String(data.displayName || data.name || 'A participant').slice(0, 160) };
}
