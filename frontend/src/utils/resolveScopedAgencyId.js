import { resolveOrganizationBySlug } from './organizationContext.js';

export function pickPortalKey(org) {
  return String(org?.portal_url || org?.portalUrl || org?.slug || '').trim().toLowerCase();
}

export function findAgencyInListBySlug(list, slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (!key || !Array.isArray(list)) return null;
  return list.find((a) => pickPortalKey(a) === key) || null;
}

/**
 * Resolve the agency id for a tenant-scoped admin route.
 * Route slug wins over persisted currentAgency so /itsco/... loads ITSCO data.
 */
export async function resolveScopedAgencyId({
  route,
  agencyStore,
  authStore,
  agenciesList = null
} = {}) {
  const fromQuery = route?.query?.agencyId ? Number(route.query.agencyId) : null;
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;

  const slug =
    typeof route?.params?.organizationSlug === 'string'
      ? route.params.organizationSlug.trim().toLowerCase()
      : '';

  if (slug) {
    const role = String(authStore?.user?.role || '').toLowerCase();
    const list =
      agenciesList ??
      (role === 'super_admin'
        ? agencyStore?.agencies
        : agencyStore?.userAgencies ?? agencyStore?.agencies) ??
      [];
    const match = findAgencyInListBySlug(list, slug);
    if (match?.id) return Number(match.id);

    const org = await resolveOrganizationBySlug(slug);
    if (org?.id) return Number(org.id);
  }

  if (agencyStore?.currentAgency?.id) return Number(agencyStore.currentAgency.id);
  if (authStore?.user?.agencyId) return Number(authStore.user.agencyId);

  const fallbackList = agenciesList ?? agencyStore?.agencies ?? agencyStore?.userAgencies ?? [];
  if (fallbackList[0]?.id) return Number(fallbackList[0].id);
  return null;
}
