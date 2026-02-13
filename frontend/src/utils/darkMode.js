/**
 * Dark mode: applies user preference to the app.
 * Uses data-theme="dark" on documentElement; CSS variables handle the rest.
 */

const STORAGE_KEY = 'prefs:dark_mode';

export function applyDarkMode(enabled) {
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function getStoredDarkMode(userId) {
  if (!userId) return null;
  try {
    const key = `${STORAGE_KEY}:${userId}`;
    const val = localStorage.getItem(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function setStoredDarkMode(userId, enabled) {
  if (!userId) return;
  try {
    const key = `${STORAGE_KEY}:${userId}`;
    localStorage.setItem(key, String(enabled));
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
