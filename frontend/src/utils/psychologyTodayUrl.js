export function psychologyTodayHref(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = String(url.hostname || '').toLowerCase();
    if (host !== 'psychologytoday.com' && !host.endsWith('.psychologytoday.com')) return '';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.protocol = 'https:';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}
