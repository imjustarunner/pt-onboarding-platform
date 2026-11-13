/** A canonical URL comes only from the event endpoint, never query input. */
export function companyEventInvitationRedirect(canonicalUrl, currentHref) {
  try {
    const current = new URL(currentHref), target = new URL(canonicalUrl);
    if (target.origin !== 'https://auricwell.com' || target.username || target.password
      || !/^\/conversa\/events\/[a-z0-9-]+\/[a-z0-9-]+$/.test(target.pathname)) return '';
    const search = new URLSearchParams(current.search);
    for (const [key,value] of target.searchParams) search.set(key,value);
    target.search = search.toString();
    target.hash = current.hash;
    if (target.href === current.href) return '';
    return target.href;
  } catch { return ''; }
}
