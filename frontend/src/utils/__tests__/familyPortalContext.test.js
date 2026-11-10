import { expect, it } from 'vitest';
import { resolveFamilyPortalOrganization, familyPortalDashboardPath, familyPortalClients, familyProfileHasRecordAccess } from '../familyPortalContext';
const school = { id: 2, slug: 'school', organization_type: 'school' };
const tenant = { id: 1, slug: 'itsco', organization_type: 'agency' };
const tutoring = { id: 3, portal_url: 'tutoring', organization_type: 'learning' };
it('keeps the invited main tenant even when a school is the first membership', () => {
  expect(resolveFamilyPortalOrganization([school, tutoring, tenant], 'itsco')).toEqual(tenant);
  expect(familyPortalDashboardPath(tenant)).toBe('/itsco/guardian?portal=itsco');
});
it('selects the distinct tutoring experience', () => {
  expect(resolveFamilyPortalOrganization([tenant, tutoring], 'tutoring')).toEqual(tutoring);
  expect(familyPortalDashboardPath(tutoring)).toBe('/tutoring/guardian?portal=tutoring');
});
it('never uses an unlinked organization or school as the care portal', () => {
  expect(resolveFamilyPortalOrganization([school, tenant], 'other-tenant')).toBeNull();
  expect(resolveFamilyPortalOrganization([school, tenant], 'school')).toBeNull();
});

it('keeps clients in the invited tenant or tutoring organization', () => {
  const clients = [{ client_id: 1, agency_id: 1, organization_id: 2 }, { client_id: 2, agency_id: 1, organization_id: 3 }, { client_id: 3, agency_id: 9, organization_id: 8 }];
  expect(familyPortalClients(clients, tenant).map(c => c.client_id)).toEqual([1, 2]);
  expect(familyPortalClients(clients, tutoring).map(c => c.client_id)).toEqual([2]);
});

it('uses server relationship restrictions when deciding whether records may be preloaded', () => {
 expect(familyProfileHasRecordAccess(null)).toBe(false);
 expect(familyProfileHasRecordAccess({client_id:1,no_view:true})).toBe(false);
 expect(familyProfileHasRecordAccess({client_id:1,guardian_portal_locked:true})).toBe(false);
 expect(familyProfileHasRecordAccess({client_id:1,no_view:false,guardian_portal_locked:false})).toBe(true);
});
