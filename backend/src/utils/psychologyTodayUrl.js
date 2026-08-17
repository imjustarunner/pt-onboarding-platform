const MAX_LEN = 700;

/**
 * Normalize a Psychology Today profile URL. Empty input → null.
 * Invalid / non-psychologytoday hosts throw.
 */
export function sanitizePsychologyTodayUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new Error('Psychology Today URL must be a valid http(s) link');
  }
  const host = String(url.hostname || '').toLowerCase();
  if (host !== 'psychologytoday.com' && !host.endsWith('.psychologytoday.com')) {
    throw new Error('URL must be a psychologytoday.com profile link');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Psychology Today URL must be a valid http(s) link');
  }
  url.protocol = 'https:';
  url.hash = '';
  const out = url.toString();
  if (out.length > MAX_LEN) {
    throw new Error('Psychology Today URL is too long');
  }
  return out;
}
