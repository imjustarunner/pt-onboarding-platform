/** Side chat rail preference — default OFF; opt-in from full Team chat. */
export const CHAT_SIDE_RAIL_ENABLED_KEY = 'pt.messages.sideRail.enabled.v1';

export function isChatSideRailEnabled() {
  try {
    const v = localStorage.getItem(CHAT_SIDE_RAIL_ENABLED_KEY);
    if (v == null || v === '') return false;
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function setChatSideRailEnabled(enabled) {
  const next = !!enabled;
  try {
    localStorage.setItem(CHAT_SIDE_RAIL_ENABLED_KEY, next ? '1' : '0');
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent('pt-chat-side-rail-changed', { detail: { enabled: next } })
    );
  } catch {
    /* ignore */
  }
  return next;
}
