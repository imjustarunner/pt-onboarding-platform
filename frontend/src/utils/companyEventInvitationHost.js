// Shared invitations keep their canonical public host. Inside the application,
// use the same route on the current origin so its authenticated session survives.
export function companyEventPageHref(value) {
  try {
    const target = new URL(value);
    if (target.origin === 'https://auricwell.com' && !target.username && !target.password
      && /^\/conversa\/events\/[a-z0-9-]+\/[a-z0-9-]+$/.test(target.pathname)) {
      return target.pathname + target.search + target.hash;
    }
  } catch { /* Existing relative staff links already stay on this origin. */ }
  return value;
}

/** A canonical URL comes only from the event endpoint, never query input. */
export function companyEventInvitationRedirect(canonicalUrl, currentHref) {
  try {
    const current = new URL(currentHref), target = new URL(canonicalUrl);
    if (target.origin !== 'https://auricwell.com' || target.username || target.password
      || !/^\/conversa\/events\/[a-z0-9-]+\/[a-z0-9-]+$/.test(target.pathname)) return '';
    const localTarget = new URL(companyEventPageHref(canonicalUrl), current.origin);
    const search = new URLSearchParams(current.search);
    for (const [key,value] of target.searchParams) search.set(key,value);
    localTarget.search = search.toString();
    localTarget.hash = current.hash;
    if (localTarget.href === current.href) return '';
    return localTarget.href;
  } catch { return ''; }
}
