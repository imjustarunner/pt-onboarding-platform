// Short-lived, login-scoped leases. No credentials or participant data are shared.
import { applicantInterviewMode } from './applicantInterviewMode';
const PREFIX = 'pt-live-meeting:';
export const LIVE_MEETING_TTL = 45000;
function identity() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const session = localStorage.getItem('sessionId');
    return user?.id && session ? `${user.id}:${session}:` : null;
  } catch { return null; }
}
export function hasLiveMeeting(now = Date.now()) {
  const login = identity();
  if (!login) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX + login)) continue;
      const expires = Number(localStorage.getItem(key));
      if (expires > now && expires <= now + LIVE_MEETING_TTL) return true;
    }
  } catch { /* Storage unavailable: normal session deadlines still apply. */ }
  return false;
}
export function startLiveMeetingPresence() {
  if (applicantInterviewMode.value) return () => {};
  const login = identity();
  if (!login) return () => {};
  const key = PREFIX + login + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const renew = () => {
    if (identity() !== login) { stop(); return; }
    try { localStorage.setItem(key, String(Date.now() + LIVE_MEETING_TTL)); } catch { /* optional */ }
  };
  let timer;
  const stop = () => {
    clearInterval(timer);
    window.removeEventListener('pagehide', stop);
    try { localStorage.removeItem(key); } catch { /* optional */ }
  };
  renew(); timer = setInterval(renew, 10000);
  window.addEventListener('pagehide', stop);
  return stop;
}
