const consumed = new Map();

// Persist the consumed login across component remounts and query navigation.
export function claimLoginBriefing(userId, trigger) {
  if (!userId) return false;
  let token = String(trigger || '');
  try {
    const timestamp = sessionStorage.getItem('justLoggedInAt');
    if (timestamp) token = timestamp;
    if (!trigger && sessionStorage.getItem('justLoggedIn') !== 'true') return false;
  } catch { if (!trigger) return false; }
  if (!token) token = 'initial';
  const key = `pt.loginBriefing.consumed:${userId}`;
  try {
    if (sessionStorage.getItem(key) === token) return false;
    sessionStorage.setItem(key, token);
  } catch {
    if (consumed.get(key) === token) return false;
    consumed.set(key, token);
  }
  return true;
}

export function openCommandCenter() {
  window.dispatchEvent(new CustomEvent('app:open-command-center'));
}
