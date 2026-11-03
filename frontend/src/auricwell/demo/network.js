// The public demo has exactly one network write: anonymous, allowlisted analytics.
// Shared application components never receive a transport to clinical services.
export const DEMO_ANALYTICS_PATH = '/api/public/marketing-pages/auricwell/analytics/events';
export function permittedDemoRequest(url, options = {}, origin) {
  try {
    const parsed = new URL(typeof url === 'string' || url instanceof URL ? String(url) : url.url, origin);
    const method = String(options.method || url?.method || 'GET').toUpperCase();
    return parsed.origin === origin && parsed.pathname === DEMO_ANALYTICS_PATH && !parsed.search && !parsed.hash && method === 'POST';
  } catch { return false; }
}

export function installDemoNetworkBoundary(window) {
  const fetch = window.fetch.bind(window);
  window.fetch = (url, options = {}) => {
    if (!permittedDemoRequest(url, options, window.location.origin)) {
      return Promise.reject(new TypeError('Demo only: clinical and external network requests are unavailable.'));
    }
    return fetch(url, { ...options, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' } });
  };
  if (window.XMLHttpRequest) window.XMLHttpRequest.prototype.open = () => { throw new TypeError('Network requests are unavailable in this fictional demo.'); };
  if (window.navigator.sendBeacon) window.navigator.sendBeacon = () => false;
  for (const name of ['WebSocket', 'EventSource']) {
    if (window[name]) window[name] = class { constructor() { throw new TypeError('Live connections are unavailable in this fictional demo.'); } };
  }
}
