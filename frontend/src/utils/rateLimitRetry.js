// Retry-After may be seconds or an HTTP date. Preserve the server's deadline.
export function rateLimitRetryAt(error, now = Date.now(), fallbackMs = 60000) {
  const headers = error?.response?.headers;
  const raw = headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? headers?.['Retry-After'];
  const value = String(raw ?? '').trim();
  const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  const headerAt = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value);
  const explicitAt = Number(error?.retryAt);
  const deadline = Math.max(Number.isFinite(headerAt) ? headerAt : 0,
    Number.isFinite(explicitAt) ? explicitAt : 0);
  return deadline > 0 ? Math.max(now, deadline) : now + fallbackMs;
}
