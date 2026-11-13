const sharedHosts = new Set(['plottwisthq.com', 'www.plottwisthq.com', 'app.plottwistco.com']);

/** Upgrade older shared-host invitation links using the server's canonical URL.
 * Preserve the exact event/token path; this never accepts a URL from query input. */
export function companyEventInvitationRedirect(canonicalUrl, currentHref) {
  try {
    const current = new URL(currentHref), target = new URL(canonicalUrl);
    if (!sharedHosts.has(current.hostname) || target.protocol !== 'https:' || target.username || target.password
      || target.origin === current.origin || target.pathname !== current.pathname) return '';
    target.search = current.search;
    target.hash = current.hash;
    return target.href;
  } catch { return ''; }
}
