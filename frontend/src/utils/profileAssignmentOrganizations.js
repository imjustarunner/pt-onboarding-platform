const parentIds = (org) => [...new Set([
  ...(org?.__affiliatedAgencyIds || []),
  org?.affiliated_agency_id,
  org?.__affiliatedAgencyId
].map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];

export function mergeProfileAssignmentOrganizations(...lists) {
  const byId = new Map();
  for (const org of lists.flat()) {
    const id = Number(org?.id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const previous = byId.get(id);
    const parents = [...new Set([...parentIds(previous), ...parentIds(org)])];
    // Preserve whether a type came from the API: an earlier inferred "agency"
    // must not hide a later legacy school affiliation with a blank raw type.
    const declaredType = Object.prototype.hasOwnProperty.call(org, '__assignmentOrganizationType')
      ? org.__assignmentOrganizationType : String(org.organization_type || '').trim().toLowerCase();
    const explicitType = declaredType || previous?.__assignmentOrganizationType || '';
    const type = explicitType || (parents.length ? 'school' : 'agency');
    byId.set(id, { ...previous, ...org, id, organization_type: type, __assignmentOrganizationType: explicitType, __affiliatedAgencyIds: parents });
  }
  return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function profileAssignmentOrganizations(orgs, { type, agencyId = null, assignedIds = [] } = {}) {
  const assigned = new Set([...assignedIds].map(Number));
  return mergeProfileAssignmentOrganizations(orgs || []).filter((org) =>
    org.organization_type === type && !assigned.has(org.id) &&
    ![true, 1, '1'].includes(org.is_archived) &&
    (!agencyId || parentIds(org).includes(Number(agencyId)))
  );
}

export function resolveProfileAssignmentAgency({ routeAgencyId, routeSlug, currentAgency, memberships = [], catalog = [] } = {}) {
  const explicitId = Number(routeAgencyId);
  if (Number.isSafeInteger(explicitId) && explicitId > 0) return explicitId;
  const organizations = mergeProfileAssignmentOrganizations(memberships, catalog);
  const fromSlug = routeSlug && organizations.find((org) => String(org.slug || '').toLowerCase() === String(routeSlug).toLowerCase());
  const agencyFor = (org) => org?.organization_type === 'agency' ? Number(org.id) : (parentIds(org)[0] || null);
  const requested = agencyFor(fromSlug);
  if (requested) return requested;
  const current = currentAgency && mergeProfileAssignmentOrganizations([currentAgency])[0];
  const selected = agencyFor(current);
  if (selected) return selected;
  const memberIds = new Set(memberships.map((org) => Number(org.id)));
  const parents = organizations.filter((org) => memberIds.has(org.id) && org.organization_type === 'agency');
  return parents.length === 1 ? parents[0].id : null;
}

/** Fetch picker data without changing the global agency store or hiding failed school requests. */
export async function loadProfileAssignmentOrganizations(api, { agencyId = null } = {}) {
  const response = await api.get('/agencies', { params: { minimal: 1 }, skipGlobalLoading: true });
  const base = mergeProfileAssignmentOrganizations(response.data || []);
  const parents = new Set(base.filter((org) => org.organization_type === 'agency').map((org) => org.id));
  // The viewed agency is authoritative even when a cached catalog omitted it.
  if (Number.isSafeInteger(Number(agencyId)) && Number(agencyId) > 0) parents.add(Number(agencyId));
  const queue = [...parents];
  const groups = [];
  const failedAgencyIds = [];
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (index < queue.length) {
      const parentId = queue[index++];
      try {
        const result = await api.get(`/agencies/${parentId}/affiliated-organizations`, { skipGlobalLoading: true });
        groups.push((result.data || []).filter((org) => Number(org.id) !== parentId).map((org) => ({
          ...org,
          affiliated_agency_id: org.affiliated_agency_id || parentId,
          __affiliatedAgencyId: parentId
        })));
      } catch {
        failedAgencyIds.push(parentId);
      }
    }
  }));
  // Affiliation responses normalize legacy school types; they must replace the raw catalog row.
  return { organizations: mergeProfileAssignmentOrganizations(base, ...groups), failedAgencyIds };
}
