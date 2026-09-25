import { describe, expect, it } from 'vitest';
import { getSsoArrivalRoute, isLoginEntryRoute, safeLoginDestination } from '../loginHandoff';
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
  it.each(['//outside.test', '/\\outside.test', 'https://outside.test'])('rejects unsafe post-login destination %s', value => expect(safeLoginDestination(value)).toBeNull());
});
