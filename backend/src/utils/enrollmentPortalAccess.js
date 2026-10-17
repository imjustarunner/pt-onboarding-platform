/** Only ordinary HTTPS login pages may be exposed in enrollment responses. */
export function safeEnrollmentPortalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/\/login\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
