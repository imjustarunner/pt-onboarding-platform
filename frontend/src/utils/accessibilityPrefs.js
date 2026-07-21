/**
 * User accessibility preferences applied on documentElement.
 * Mirrors dark-mode pattern: apply immediately + persist to localStorage so
 * remount/reload races cannot wipe a toggle the user just made.
 */

const STORAGE_PREFIX = 'prefs:a11y';

export function applyHighContrast(enabled) {
  const root = document.documentElement;
  if (enabled) root.setAttribute('data-high-contrast', 'true');
  else root.removeAttribute('data-high-contrast');
}

export function applyLargerText(enabled) {
  const root = document.documentElement;
  if (enabled) root.setAttribute('data-larger-text', 'true');
  else root.removeAttribute('data-larger-text');
}

export function applyReducedMotion(enabled) {
  const root = document.documentElement;
  if (enabled) root.setAttribute('data-reduced-motion', 'true');
  else root.removeAttribute('data-reduced-motion');
}

export function applyAccessibilityPrefs({ highContrast, largerText, reducedMotion } = {}) {
  if (highContrast !== undefined) applyHighContrast(!!highContrast);
  if (largerText !== undefined) applyLargerText(!!largerText);
  if (reducedMotion !== undefined) applyReducedMotion(!!reducedMotion);
}

function readBool(key) {
  try {
    const val = localStorage.getItem(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeBool(key, enabled) {
  try {
    localStorage.setItem(key, String(!!enabled));
  } catch {
    /* ignore */
  }
}

function storageKey(userId, field) {
  return `${STORAGE_PREFIX}:${field}:${userId}`;
}

/** Read locally cached a11y flags for a user (null = not set). */
export function getStoredAccessibilityPrefs(userId) {
  if (!userId) return null;
  const highContrast = readBool(storageKey(userId, 'high_contrast_mode'));
  const largerText = readBool(storageKey(userId, 'larger_text'));
  const reducedMotion = readBool(storageKey(userId, 'reduced_motion'));
  if (highContrast === null && largerText === null && reducedMotion === null) return null;
  return { highContrast, largerText, reducedMotion };
}

/** Persist a11y flags locally (partial update supported). */
export function setStoredAccessibilityPrefs(userId, { highContrast, largerText, reducedMotion } = {}) {
  if (!userId) return;
  if (highContrast !== undefined) writeBool(storageKey(userId, 'high_contrast_mode'), highContrast);
  if (largerText !== undefined) writeBool(storageKey(userId, 'larger_text'), largerText);
  if (reducedMotion !== undefined) writeBool(storageKey(userId, 'reduced_motion'), reducedMotion);
}

/**
 * Apply a11y prefs and cache them. Undefined fields are left unchanged in storage/DOM.
 */
export function setAccessibilityPrefs(userId, prefs = {}) {
  applyAccessibilityPrefs(prefs);
  if (userId) setStoredAccessibilityPrefs(userId, prefs);
}

const NAV_HOVER_KEY = 'prefs:nav_hover_menus_enabled';

export function getStoredNavHoverMenusEnabled(userId) {
  if (!userId) return null;
  return readBool(`${NAV_HOVER_KEY}:${userId}`);
}

export function setStoredNavHoverMenusEnabled(userId, enabled) {
  if (!userId) return;
  writeBool(`${NAV_HOVER_KEY}:${userId}`, enabled !== false);
}
