import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: { user: null, setAuth: vi.fn() }, agency: { userAgencies: [], applyLoginAgencies: vi.fn(), setCurrentAgency: vi.fn() } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('../router', () => ({ getDashboardRoute: () => '/default' }));
vi.mock('../schoolStaffPortal.js', () => ({ getPrimarySchoolStaffPortalSlug: () => null }));
vi.mock('../loginRedirect.js', () => ({ storeUserAgencies: vi.fn() }));
vi.mock('../schoolPortalFirstLoginOnboarding.js', () => ({ markSchoolPortalFirstLoginOnboarding: vi.fn() }));
import { completePasswordTokenLogin } from '../completePasswordTokenLogin';
beforeEach(() => {
  vi.clearAllMocks(); mocks.agency.userAgencies = [];
  mocks.auth.setAuth.mockImplementation((token, user) => { mocks.auth.user = user; });
  mocks.agency.applyLoginAgencies.mockImplementation(agencies => { mocks.agency.userAgencies = agencies; });
});
it.each([['itsco','agency'],['tutoring','learning']])('sets the session and opens the invited %s dashboard without another login', async (slug, organization_type) => {
  const organization = { id: 1, slug, organization_type }, router = { replace: vi.fn() };
  await completePasswordTokenLogin({ token: 'jwt', sessionId: 'session', user: { id: 10, role: 'client_guardian' }, agencies: [{ id: 2, slug: 'school', organization_type: 'school' }, organization] }, router, { portalSlug: slug });
  expect(mocks.auth.setAuth).toHaveBeenCalledWith('jwt', expect.objectContaining({ id: 10 }), 'session');
  expect(mocks.agency.setCurrentAgency).toHaveBeenCalledWith(organization);
  expect(router.replace).toHaveBeenCalledWith(`/${slug}/guardian?portal=${slug}`);
});
it('does not let a query string select a tenant outside the account memberships', async () => {
  const router = { replace: vi.fn() };
  await completePasswordTokenLogin({ token: 'jwt', user: { role: 'client' }, agencies: [{ id: 1, slug: 'itsco', organization_type: 'agency' }] }, router, { portalSlug: 'unlinked' });
  expect(mocks.agency.setCurrentAgency).not.toHaveBeenCalled(); expect(router.replace).toHaveBeenCalledWith('/default');
});

import {auricWellAccountDestination} from '../familyPortalContext.js';
it('routes returning guardian and self-client accounts to their invited agency instead of the admin preview',()=>{
 const organizations=[{id:6,slug:'nlu',organization_type:'agency'},{id:2,slug:'itsco',organization_type:'agency'}];
 for(const role of ['client_guardian','client']) {
  const dest=auricWellAccountDestination({hostname:'auricwell.com',role,organizations,requestedSlug:'itsco',redirectPath:'/app'});
  expect(dest).toEqual({path:'/itsco/guardian?portal=itsco',hardNavigate:false,organization:organizations[1]});
 }
 expect(auricWellAccountDestination({hostname:'auricwell.com',role:'provider',organizations,requestedSlug:'itsco'})).toBeNull();
 expect(auricWellAccountDestination({hostname:'auricwell.com',role:'super_admin'})).toMatchObject({path:'/app',hardNavigate:true});
});
it('preserves an internal message link without accepting an external redirect or unauthorized tenant',()=>{
 const input={hostname:'auricwell.com',role:'client_guardian',organizations:[{id:2,slug:'itsco',organization_type:'agency'}],requestedSlug:'unlinked'};
 expect(auricWellAccountDestination({...input,redirectPath:'//outside.test'}).path).toBe('/itsco/guardian?portal=itsco');
 expect(auricWellAccountDestination({...input,redirectPath:'/itsco/messages?threadId=5'}).path).toBe('/itsco/messages?threadId=5');
 expect(auricWellAccountDestination({...input,hostname:'app.itsco.health'})).toBeNull();
});
