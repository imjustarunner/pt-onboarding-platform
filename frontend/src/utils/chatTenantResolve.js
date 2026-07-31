/**
 * Pure helpers for picking the correct tenant (agency / school org) when opening DMs.
 */

export function collectPersonAgencyIds(person) {
  const ids = new Set();
  for (const id of person?.shared_agency_ids || []) {
    const n = Number(id);
    if (n) ids.add(n);
  }
  for (const m of person?.shared_agency_memberships || []) {
    const n = Number(m?.id);
    if (n) ids.add(n);
  }
  return ids;
}

export function sharedAgencyIdsBetween(myMembershipIds, person) {
  const personIds = collectPersonAgencyIds(person);
  const shared = [];
  for (const id of myMembershipIds || []) {
    const n = Number(id);
    if (n && personIds.has(n)) shared.push(n);
  }
  return shared;
}

export function sortDirectThreadsForPerson(threads, otherUserId) {
  const other = Number(otherUserId);
  if (!other) return [];

  return (threads || [])
    .filter((t) => {
      if (String(t.thread_type || 'direct') !== 'direct') return false;
      return Number(t.other_participant?.id) === other;
    })
    .slice()
    .sort((a, b) => {
      const unreadDiff = (Number(b.unread_count) || 0) - (Number(a.unread_count) || 0);
      if (unreadDiff !== 0) return unreadDiff;
      const at = new Date(a.last_message?.created_at || a.updated_at || 0).getTime();
      const bt = new Date(b.last_message?.created_at || b.updated_at || 0).getTime();
      return bt - at;
    });
}

function pickSharedAgencyId(sharedIds, membershipAgencies, composeAgencyId) {
  if (!sharedIds?.length) return null;
  const compose = Number(composeAgencyId || 0);
  if (compose && sharedIds.includes(compose)) return compose;

  const nameById = new Map(
    (membershipAgencies || []).map((a) => [Number(a.id), String(a.name || '').trim()])
  );
  return sharedIds
    .slice()
    .sort((a, b) => String(nameById.get(a) || `Tenant ${a}`).localeCompare(String(nameById.get(b) || `Tenant ${b}`)))[0];
}

/**
 * Resolve which agencyId / organizationId to use when opening a DM.
 * Prefers an existing thread (unread, then recent), then a shared tenant.
 */
export function resolveChatContextForPerson({
  person,
  agencyIdOverride = null,
  organizationIdOverride = null,
  myMembershipAgencyIds = [],
  membershipAgencies = [],
  composeAgencyId = null,
  fallbackAgencyId = null,
  threads = [],
  allowPeerOnlyFallback = false
}) {
  const overrideAgency = Number(agencyIdOverride || 0);
  const overrideOrg =
    organizationIdOverride != null && organizationIdOverride !== ''
      ? Number(organizationIdOverride)
      : null;

  if (overrideAgency) {
    return { agencyId: overrideAgency, organizationId: Number.isFinite(overrideOrg) ? overrideOrg : null };
  }

  const otherId = Number(person?.id || 0);
  if (!otherId) return { agencyId: null, organizationId: null };

  const ranked = sortDirectThreadsForPerson(threads, otherId);
  if (ranked.length) {
    const best = ranked[0];
    return {
      agencyId: Number(best.agency_id) || null,
      organizationId: best.organization_id != null ? Number(best.organization_id) : null
    };
  }

  const membershipIds = (myMembershipAgencyIds || []).map((id) => Number(id)).filter((n) => n > 0);
  const shared = sharedAgencyIdsBetween(membershipIds, person);
  const picked = pickSharedAgencyId(shared, membershipAgencies, composeAgencyId);
  if (picked) return { agencyId: picked, organizationId: null };

  if (allowPeerOnlyFallback) {
    const peerIds = [...collectPersonAgencyIds(person)];
    if (peerIds.length) return { agencyId: peerIds[0], organizationId: null };
  }

  const fallback = Number(fallbackAgencyId || composeAgencyId || 0);
  return fallback ? { agencyId: fallback, organizationId: null } : { agencyId: null, organizationId: null };
}

export function canDirectMessagePerson({
  person,
  myMembershipAgencyIds = [],
  threads = [],
  allowPeerOnlyFallback = false,
  meId = null
}) {
  if (!person) return false;
  if (meId != null && Number(person.id) === Number(meId)) return false;
  const otherId = Number(person.id);
  if (!otherId) return false;
  if (sortDirectThreadsForPerson(threads, otherId).length > 0) return true;
  if (sharedAgencyIdsBetween(myMembershipAgencyIds, person).length > 0) return true;
  if (allowPeerOnlyFallback && collectPersonAgencyIds(person).size > 0) return true;
  return false;
}
