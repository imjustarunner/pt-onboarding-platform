/**
 * Subdomain detection utilities
 * Extracts subdomain from hostname for portal URL detection
 */

/**
 * Get the subdomain from the current hostname
 * Examples:
 * - itsco.app.plottwistco.com -> "itsco"
 * - qv.itsco.app.plottwisthq.com -> "itsco" (Quick View host)
 * - qv.app.itsco.health -> null here; resolved via /agencies/resolve after stripping qv.
 * - nextleveluplcc.app.plottwistco.com -> "nextleveluplcc"
 * - app.plottwistco.com -> null
 * - localhost -> null
 *
 * @returns {string|null} The subdomain identifier or null if no subdomain
 */
export function getSubdomain() {
  const hostname = window.location.hostname;

  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  if (hostname.endsWith('.run.app')) {
    return null;
  }

  const parts = hostname.split('.');

  // Quick View host: qv.{portal}.app.{base}
  if (parts.length >= 5 && parts[0].toLowerCase() === 'qv' && parts[2].toLowerCase() === 'app') {
    const portal = String(parts[1] || '').toLowerCase();
    if (portal && portal !== 'app' && portal !== 'www') return portal;
  }

  // DNS-safe variant: qv-{portal}.app.{base}
  if (parts.length >= 4 && parts[1].toLowerCase() === 'app' && parts[0].toLowerCase().startsWith('qv-')) {
    const portal = parts[0].slice(3).toLowerCase();
    if (portal) return portal;
  }

  // <portal>.app.<base-domain>
  if (parts.length >= 4 && parts[1].toLowerCase() === 'app') {
    const portal = String(parts[0] || '').toLowerCase();
    if (!portal || portal === 'app' || portal === 'www' || portal === 'qv') return null;
    return portal;
  }

  return null;
}

/**
 * True when this host is a dedicated Quick View origin (PIN-only home screen).
 */
export function isQuickViewHost(hostname = null) {
  const h = String(hostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!h) return false;
  const parts = h.split('.');
  if (parts[0] === 'qv') return true;
  if (parts[0].startsWith('qv-')) return true;
  return false;
}

/**
 * Host to pass to /agencies/resolve (strip leading qv. for dedicated hosts).
 * qv.app.itsco.health → app.itsco.health
 */
export function resolveHostForAgencyLookup(hostname = null) {
  const h = String(hostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!h) return h;
  if (h.startsWith('qv.')) return h.slice(3);
  return h;
}

/**
 * Get the portal URL identifier from the subdomain
 * @returns {string|null}
 */
export function getPortalUrl() {
  return getSubdomain();
}

/**
 * Check if we're on a subdomain (agency-specific portal)
 * @returns {boolean}
 */
export function isSubdomainPortal() {
  return getSubdomain() !== null || isQuickViewHost();
}
