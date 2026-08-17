/**
 * Appearance: applies user preference to the app.
 * Uses data-theme="dark" on documentElement; CSS variables handle the rest.
 *
 * Preference is light | dark | system (follow the device color scheme).
 * dark_mode localStorage keys are kept for backward compatibility.
 */

const THEME_KEY = 'prefs:theme';
const THEME_FALLBACK_KEY = 'prefs:theme:current';
const STORAGE_KEY = 'prefs:dark_mode';
const FALLBACK_KEY = 'prefs:dark_mode:current';

export const THEME_LIGHT = 'light';
export const THEME_DARK = 'dark';
export const THEME_SYSTEM = 'system';

function getFromStorage(key) {
  try {
    const val = localStorage.getItem(key);
    if (val == null || val === '') return null;
    return val;
  } catch {
    return null;
  }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function normalizeThemePreference(value, darkModeFallback) {
  const v = String(value || '').trim().toLowerCase();
  if (v === THEME_LIGHT || v === THEME_DARK || v === THEME_SYSTEM) return v;
  if (darkModeFallback === true || darkModeFallback === 1 || darkModeFallback === '1' || darkModeFallback === 'true') {
    return THEME_DARK;
  }
  if (darkModeFallback === false || darkModeFallback === 0 || darkModeFallback === '0' || darkModeFallback === 'false') {
    return THEME_LIGHT;
  }
  return THEME_LIGHT;
}

export function getSystemPrefersDark() {
  try {
    return !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  } catch {
    return false;
  }
}

export function resolveIsDark(preference) {
  const pref = normalizeThemePreference(preference);
  if (pref === THEME_SYSTEM) return getSystemPrefersDark();
  return pref === THEME_DARK;
}

export function applyDarkMode(enabled) {
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'light';
  }
}

let systemMql = null;
let systemChangeHandler = null;

function stopSystemThemeListener() {
  if (systemMql && systemChangeHandler) {
    try {
      if (systemMql.removeEventListener) systemMql.removeEventListener('change', systemChangeHandler);
      else if (systemMql.removeListener) systemMql.removeListener(systemChangeHandler);
    } catch {
      /* ignore */
    }
  }
  systemMql = null;
  systemChangeHandler = null;
}

function startSystemThemeListener() {
  stopSystemThemeListener();
  try {
    systemMql = window.matchMedia?.('(prefers-color-scheme: dark)') || null;
  } catch {
    systemMql = null;
  }
  if (!systemMql) return;
  systemChangeHandler = () => {
    applyDarkMode(getSystemPrefersDark());
  };
  try {
    if (systemMql.addEventListener) systemMql.addEventListener('change', systemChangeHandler);
    else if (systemMql.addListener) systemMql.addListener(systemChangeHandler);
  } catch {
    /* ignore */
  }
}

export function applyThemePreference(preference) {
  const pref = normalizeThemePreference(preference);
  applyDarkMode(resolveIsDark(pref));
  if (pref === THEME_SYSTEM) startSystemThemeListener();
  else stopSystemThemeListener();
}

export function getStoredThemePreference(userId) {
  if (userId) {
    const val = getFromStorage(`${THEME_KEY}:${userId}`);
    if (val) return normalizeThemePreference(val);
    const legacy = getFromStorage(`${STORAGE_KEY}:${userId}`);
    if (legacy === 'true') return THEME_DARK;
    if (legacy === 'false') return THEME_LIGHT;
    return null;
  }
  const val = getFromStorage(THEME_FALLBACK_KEY);
  if (val) return normalizeThemePreference(val);
  const legacy = getFromStorage(FALLBACK_KEY);
  if (legacy === 'true') return THEME_DARK;
  if (legacy === 'false') return THEME_LIGHT;
  return null;
}

export function setStoredThemePreference(userId, preference) {
  const pref = normalizeThemePreference(preference);
  const resolvedDark = resolveIsDark(pref);
  try {
    if (userId) {
      setStorage(`${THEME_KEY}:${userId}`, pref);
      setStorage(`${STORAGE_KEY}:${userId}`, String(resolvedDark));
    }
    setStorage(THEME_FALLBACK_KEY, pref);
    setStorage(FALLBACK_KEY, String(resolvedDark));
  } catch {
    /* ignore */
  }
}

/** @deprecated use getStoredThemePreference */
export function getStoredDarkMode(userId) {
  const pref = getStoredThemePreference(userId);
  if (pref == null) return null;
  return resolveIsDark(pref);
}

/** @deprecated use setStoredThemePreference */
export function setStoredDarkMode(userId, enabled) {
  setStoredThemePreference(userId, enabled ? THEME_DARK : THEME_LIGHT);
}

export function applyStoredDarkMode(userId) {
  const stored = getStoredThemePreference(userId);
  if (stored != null) {
    applyThemePreference(stored);
    return true;
  }
  return false;
}

export function setThemePreference(userId, preference) {
  const pref = normalizeThemePreference(preference);
  setStoredThemePreference(userId, pref);
  applyThemePreference(pref);
  return pref;
}

/**
 * Apply dark mode and persist to storage (explicit light/dark; clears Match device).
 */
export function setDarkMode(userId, enabled) {
  setThemePreference(userId, enabled ? THEME_DARK : THEME_LIGHT);
}

export function persistThemePreference(userId, preference) {
  if (!userId) return;
  const pref = normalizeThemePreference(preference);
  const dark = resolveIsDark(pref);
  void import('../services/api').then(({ default: api }) =>
    api.put(
      `/users/${userId}/preferences`,
      { theme_preference: pref, dark_mode: dark },
      { skipGlobalLoading: true }
    )
  ).catch(() => {});
}
