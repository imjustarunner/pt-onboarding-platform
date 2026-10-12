import { describe, expect, it, vi } from 'vitest';
import { consumeSsoHandoff, getSsoArrivalRoute, isLoginEntryRoute, isTokenAuthenticationRoute, isSessionEntryRoute, safeLoginDestination } from '../loginHandoff';
describe('branded SSO arrival', () => {
  it('keeps super admins on the original tenant login while loading the platform workspace', () => {
    expect(getSsoArrivalRoute({ path: '/admin', query: { sso: '1', ssoOrg: 'itsco' } }, 'itsco')).toEqual({ path: '/login', query: { sso: '1', ssoOrg: 'itsco', redirect: '/admin' }, replace: true });
  });
  it('preserves a meeting destination and its parameters', () => {
    const arrival = getSsoArrivalRoute({ path: '/join/team-meeting/123', query: { sso: '1', ssoOrg: 'itsco', guest: 'yes' }, hash: '#join' });
    expect(arrival.path).toBe('/itsco/login');
    expect(arrival.query.redirect).toBe('/join/team-meeting/123?guest=yes#join');
  });
  it('preserves nested school login branding', () => {
    expect(getSsoArrivalRoute({ path: '/itsco/school/dashboard', params: { organizationSlug: 'school', parentOrgSlug: 'itsco' }, query: { sso: '1' } }).path).toBe('/itsco/school/login');
  });
  it('only treats the three login entry routes as public login screens', () => {
    for (const name of ['Login', 'OrganizationLogin', 'ParentOrganizationLogin']) expect(isLoginEntryRoute({ name })).toBe(true);
    expect(isLoginEntryRoute({ name: 'OrganizationDashboard' })).toBe(false);
    expect(isLoginEntryRoute({ name: 'OrganizationPasswordlessTokenLogin' })).toBe(false);
  });
  it.each(['PasswordlessTokenLogin','OrganizationPasswordlessTokenLogin','InitialSetup','NewAccount','ResetPassword','OrganizationResetPassword'])('lets %s validate a new credential without inheriting the old session screen', name => {
    expect(isTokenAuthenticationRoute({name})).toBe(true);
    expect(isSessionEntryRoute({name})).toBe(true);
  });
  it('keeps authenticated guardian pages subject to session locking', () => {
    expect(isTokenAuthenticationRoute({name:'GuardianPortal'})).toBe(false);
    expect(isSessionEntryRoute({name:'GuardianPortal'})).toBe(false);
  });
  it.each(['//outside.test', '/\\outside.test', 'https://outside.test'])('rejects unsafe post-login destination %s', value => expect(safeLoginDestination(value)).toBeNull());
});

it('consumes the SSO flag once while keeping library folder, category, search, and document location', async () => {
  const bootstrap = vi.fn().mockResolvedValue(true);
  const to = { path: '/itsco/library/resources/263', query: { sso:'1', ssoOrg:'itsco', section:'all', folder:'36', category:'4', q:'Starwars' }, hash:'#page-2' };
  const clean = await consumeSsoHandoff(to, bootstrap);
  expect(clean).toEqual({path:to.path, query:{section:'all',folder:'36',category:'4',q:'Starwars'},hash:'#page-2',replace:true});
  for (const path of ['/itsco/library', '/itsco/library/resources/264', '/itsco/my-learning']) {
    expect(await consumeSsoHandoff({...clean,path}, bootstrap)).toBeNull();
  }
  expect(bootstrap).toHaveBeenCalledTimes(1);
  expect(to.query.sso).toBe('1');
});
it('leaves a failed handoff available for normal sign-in recovery', async () => {
  expect(await consumeSsoHandoff({path:'/itsco/library',query:{sso:'1'}}, async()=>false)).toBeNull();
});
