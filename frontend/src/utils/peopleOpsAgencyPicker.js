import { findAgencyInListBySlug } from './resolveScopedAgencyId.js';

/**
 * Default agency for People Ops pickers (Onboarding / Pre-Hire).
 * Host-implied portal (app.itsco.health → ITSCO) wins so superadmins are not
 * dropped onto the first alphabetical agency (Burning Sage) on a dedicated host.
 */
export function pickDefaultAgencyChoiceId({
  choices = [],
  currentAgency = null,
  routeSlug = '',
  hostSlug = ''
} = {}) {
  const list = Array.isArray(choices) ? choices.filter(Boolean) : [];
  if (!list.length) return '';

  const idForSlug = (slug) => {
    const found = findAgencyInListBySlug(list, slug);
    return found?.id != null ? String(found.id) : '';
  };

  const fromHost = idForSlug(hostSlug);
  if (fromHost) return fromHost;

  const fromRoute = idForSlug(routeSlug);
  if (fromRoute) return fromRoute;

  const curId = Number(currentAgency?.id);
  if (Number.isFinite(curId) && curId > 0) {
    const direct = list.find((a) => Number(a.id) === curId);
    if (direct) return String(direct.id);
    const parentId = Number(
      currentAgency?.affiliated_agency_id
      || currentAgency?.parent_agency_id
      || currentAgency?.parentAgencyId
      || 0
    );
    const parent = list.find((a) => Number(a.id) === parentId);
    if (parent) return String(parent.id);
  }

  return String(list[0]?.id || '');
}
