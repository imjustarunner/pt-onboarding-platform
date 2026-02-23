/**
 * Dark mode: applies user preference to the app.
 * Uses data-theme="dark" on documentElement; CSS variables handle the rest.
 */

const STORAGE_KEY = 'prefs:dark_mode';
const FALLBACK_KEY = 'prefs:dark_mode:current';

export function applyDarkMode(enabled) {
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
}

function getFromStorage(key) {
  try {
    const val = localStorage.getItem(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function getStoredDarkMode(userId) {
  if (userId) {
    const val = getFromStorage(`${STORAGE_KEY}:${userId}`);
    if (val !== null) return val;
  }
  return getFromStorage(FALLBACK_KEY);
}

export function setStoredDarkMode(userId, enabled) {
  try {
    if (userId) {
      localStorage.setItem(`${STORAGE_KEY}:${userId}`, String(enabled));
    }
    localStorage.setItem(FALLBACK_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}

/**
 * Apply dark mode from stored value (for instant apply on page load).
 * Returns true if applied from storage, false otherwise.
 */
export function applyStoredDarkMode(userId) {
  const stored = getStoredDarkMode(userId);
  if (stored !== null) {
    applyDarkMode(stored);
    return true;
  }
  return false;
}

/**
 * Apply dark mode and persist to storage.
 */
export function setDarkMode(userId, enabled) {
  applyDarkMode(enabled);
  if (userId) setStoredDarkMode(userId, enabled);
}
