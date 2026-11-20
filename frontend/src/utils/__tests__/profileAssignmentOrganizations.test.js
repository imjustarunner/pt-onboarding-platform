import { expect, it, vi } from 'vitest';
import { loadProfileAssignmentOrganizations, mergeProfileAssignmentOrganizations, profileAssignmentOrganizations, resolveProfileAssignmentAgency } from '../profileAssignmentOrganizations.js';

const itsco = { id: 2, name: 'ITSCO', slug: 'itsco', organization_type: 'agency' };
const qa = { id: 450, name: 'Demo agency', organization_type: 'agency' };
const legacySchool = { id: 422, name: 'Real school', organization_type: null, affiliated_agency_id: 2 };
const demoSchool = { id: 451, name: 'Demo K-8 School', organization_type: 'school', affiliated_agency_id: 450 };

it('uses the viewed ITSCO agency instead of the profile’s first demo membership', () => {
  const memberships = [qa, itsco];
  expect(resolveProfileAssignmentAgency({ currentAgency: itsco, memberships })).toBe(2);
  expect(resolveProfileAssignmentAgency({ routeAgencyId: '2', currentAgency: qa, memberships })).toBe(2);
  expect(resolveProfileAssignmentAgency({ routeSlug: 'itsco', currentAgency: qa, memberships })).toBe(2);
  expect(resolveProfileAssignmentAgency({ currentAgency: { ...itsco, affiliated_agency_id: 1 }, memberships })).toBe(2);
});

it('uses a school’s parent context and keeps a legacy school from becoming a second parent agency', () => {
  expect(resolveProfileAssignmentAgency({ currentAgency: legacySchool, memberships: [qa, itsco] })).toBe(2);
  expect(resolveProfileAssignmentAgency({ memberships: [itsco, { ...legacySchool, affiliated_agency_id: null }], catalog: [legacySchool] })).toBe(2);
});

it('keeps Platform profiles global when there is no selected agency', () => {
  expect(resolveProfileAssignmentAgency({ memberships: [qa, itsco] })).toBeNull();
});

it('keeps legacy real schools visible alongside explicitly typed demo schools', () => {
  const options = profileAssignmentOrganizations([itsco, qa, legacySchool, demoSchool], { type: 'school', agencyId: 2 });
  expect(options.map((org) => org.id)).toEqual([422]);
});

it('uses corrected affiliation data instead of retaining the raw catalog type', () => {
  const rows = mergeProfileAssignmentOrganizations([{ ...legacySchool, id: '422', affiliated_agency_id: null }],
    [{ ...legacySchool, organization_type: 'school', __affiliatedAgencyId: 2 }]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: 422, organization_type: 'school', __affiliatedAgencyIds: [2] });
});

it('retains a shared school under both agencies and excludes existing assignments', () => {
  const rows = mergeProfileAssignmentOrganizations([{ ...legacySchool, __affiliatedAgencyId: 2 }],
    [{ ...legacySchool, affiliated_agency_id: 6, __affiliatedAgencyId: 6 }]);
  for (const agencyId of [2, 6]) expect(profileAssignmentOrganizations(rows, { type: 'school', agencyId })).toHaveLength(1);
  expect(profileAssignmentOrganizations(rows, { type: 'school', agencyId: 2, assignedIds: new Set(['422']) })).toEqual([]);
});

it('preserves program and learning types and excludes archived schools', () => {
  const rows = [legacySchool, { id: 43, organization_type: ' program ', affiliated_agency_id: 2 },
    { id: 44, organization_type: 'learning', affiliated_agency_id: 2 }, { ...demoSchool, affiliated_agency_id: 2, is_archived: 1 }];
  expect(profileAssignmentOrganizations(rows, { type: 'school', agencyId: 2 }).map((org) => org.id)).toEqual([422]);
  expect(profileAssignmentOrganizations(rows, { type: 'program', agencyId: 2 }).map((org) => org.id)).toEqual([43]);
  expect(profileAssignmentOrganizations(rows, { type: 'learning', agencyId: 2 }).map((org) => org.id)).toEqual([44]);
});

it('loads fresh options without treating legacy child rows as parent agencies', async () => {
  const get = vi.fn(async (url) => {
    if (url === '/agencies') return { data: [itsco, qa, legacySchool, demoSchool] };
    return { data: url.includes('/2/') ? [{ ...legacySchool, organization_type: 'school' }] : [demoSchool] };
  });
  const result = await loadProfileAssignmentOrganizations({ get }, { agencyId: 2 });
  expect(get.mock.calls.map(([url]) => url).sort()).toEqual(['/agencies', '/agencies/2/affiliated-organizations', '/agencies/450/affiliated-organizations'].sort());
  expect(result.failedAgencyIds).toEqual([]);
  expect(profileAssignmentOrganizations(result.organizations, { type: 'school', agencyId: 2 }).map((org) => org.id)).toEqual([422]);
});

it('reports a failed agency request so a partial demo-only catalog is not treated as complete', async () => {
  const get = vi.fn(async (url) => {
    if (url === '/agencies') return { data: [qa, demoSchool] };
    if (url.includes('/2/')) throw new Error('School lookup unavailable');
    return { data: [demoSchool] };
  });
  const result = await loadProfileAssignmentOrganizations({ get }, { agencyId: 2 });
  expect(result.failedAgencyIds).toEqual([2]);
  expect(profileAssignmentOrganizations(result.organizations, { type: 'school', agencyId: 2 })).toEqual([]);
});

it('limits concurrent affiliation requests while loading every parent', async () => {
  let active = 0, peak = 0;
  const agencies = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, organization_type: 'agency' }));
  const get = vi.fn(async (url) => {
    if (url === '/agencies') return { data: agencies };
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1)); active--;
    return { data: [] };
  });
  await loadProfileAssignmentOrganizations({ get });
  expect(get).toHaveBeenCalledTimes(13);
  expect(peak).toBeLessThanOrEqual(4);
});
