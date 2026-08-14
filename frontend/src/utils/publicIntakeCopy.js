const INTERNAL_DESCRIPTION_RE = /inherits\s+(office|school)\s+master|in-depth intake shell|not for public sharing|published shell|master office digital|agency master|shadow master/i;

export function isInternalIntakeDescription(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return INTERNAL_DESCRIPTION_RE.test(text);
}

export function publicIntakeDescription(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text || isInternalIntakeDescription(text)) return String(fallback || '').trim();
  return text;
}
