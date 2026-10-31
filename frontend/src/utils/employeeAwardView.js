import { isLikelyDemoTenant, pickFirstNonDemoTenant } from './demoTenant.js';

// Explicit links and demo sessions retain their scope. Ordinary staff should not
// land on a stale demo tenant when opening their work agency's awards page.
export function resolveAwardsAgencyId({ agencies = [], requestedId, currentId, portalSlug = '', demoSession = false }) {
  if (Number(requestedId) > 0) return String(requestedId);
  const current = agencies.find(a => Number(a.id) === Number(currentId));
  if (demoSession) return current ? String(current.id) : '';
  const slug = String(portalSlug).toLowerCase();
  const portal = slug && agencies.find(a => [a.slug, a.portal_url, a.portalUrl].some(value => String(value || '').toLowerCase() === slug));
  const chosen = portal || (current && !isLikelyDemoTenant(current) ? current : pickFirstNonDemoTenant(agencies));
  return chosen ? String(chosen.id) : '';
}
