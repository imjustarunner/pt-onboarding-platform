import { isPlotlineHost } from './plotline.js';
import { isSchoolCareBridgeHost, isSchoolCareBridgePath } from './schoolCareBridge';

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host.endsWith('.localhost') ||
    host === '::1' || host === '[::1]' || host === '0.0.0.0' ||
    /^127\./.test(host);
}

export function resolveApiBaseUrl(configuredUrl, location = {}) {
  const hostname = String(location.hostname || '').toLowerCase();
  if (isPlotlineHost(hostname) || isSchoolCareBridgeHost(hostname) ||
      (hostname.replace(/^www\./, '') === 'mh4kidz.org' && isSchoolCareBridgePath(location.pathname || ''))) {
    return '/api';
  }

  const base = String(configuredUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '/api';
  try {
    const target = new URL(base, 'https://api-base.invalid');
    // A development build/config must never send public-site users to their own computers.
    if (isLoopbackHost(target.hostname) && !isLoopbackHost(hostname)) return '/api';
    // Google signs in on the public site's host. Its host-only session cookie
    // cannot accompany calls to our separate Cloud Run backend hostname.
    // Public web builds must use the site's API proxy even if a build supplies
    // the backend's direct URL; local/native clients retain their explicit API.
    if (hostname && !isLoopbackHost(hostname) &&
        /^onboarding-backend-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/i.test(target.hostname)) return '/api';
  } catch {
    return '/api';
  }
  return base;
}

export function getApiBaseUrl() {
  return resolveApiBaseUrl(
    import.meta.env.VITE_API_URL,
    typeof window !== 'undefined' ? window.location : undefined
  );
}
