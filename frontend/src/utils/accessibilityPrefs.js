/**
 * User accessibility preferences applied on documentElement.
 */

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
