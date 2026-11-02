import { describe, expect, it } from 'vitest';
import { tenantWorkspaceDestination, platformWorkspaceDestination, isFamilyPortalRoute } from '../workspaceDestination';

const itsco = { id: 1, slug: 'itsco', custom_domain: 'app.itsco.health' };
const tisi = { id: 2, slug: 'tisi', custom_domain: 'app.theinnerstrengthinstitute.com' };
const qa = { id: 450, slug: 'auricwell-qa-demo', feature_flags: { qaSandbox: { syntheticOnly: true } } };
const nluQa = { id: 453, slug: 'nlu-qa-demo', feature_flags: { qaSandbox: { syntheticOnly: true, program: 'tutoring', appHostname: 'app.nextleveluplcc.com' } } };

describe('workspace addresses', () => {
  it.each(['provider', 'support', 'admin', 'staff', 'school_staff', 'client_guardian'])('keeps an authenticated %s on their sign-in origin with tenant identity in the path', role => {
    for (const hostname of ['app.nextleveluplcc.com', 'app.itsco.health', 'plottwisthq.com', 'custom.example.com']) {
      for (const agency of [nluQa, { id: 454, slug: 'nlu-qa-learning' }, { id: 999, slug: 'new-school' }, tisi]) {
        expect(tenantWorkspaceDestination({ agency, role, hostname, hostPortalSlug: 'unrelated-live-tenant', path: '/dashboard', query: { tab: 'my' }, hash: '#overview' }))
          .toEqual({ hostname, path: `/${agency.slug}/dashboard`, query: { tab: 'my' }, hash: '#overview' });
      }
    }
  });
  it('uses flat paths only when the current host identifies that exact tenant', () => {
    expect(tenantWorkspaceDestination({ agency: { id: 6, slug: 'nlu' }, role: 'provider', hostname: 'app.nextleveluplcc.com', hostPortalSlug: 'nlu', path: '/dashboard' }))
      .toMatchObject({ hostname: 'app.nextleveluplcc.com', path: '/dashboard' });
    expect(tenantWorkspaceDestination({ agency: nluQa, role: 'provider', hostname: 'app.nextleveluplcc.com', hostPortalSlug: 'nlu', path: '/dashboard' }))
      .toMatchObject({ hostname: 'app.nextleveluplcc.com', path: '/nlu-qa-demo/dashboard' });
    expect(tenantWorkspaceDestination({ agency: nluQa, role: 'provider', hostname: 'localhost', path: '/dashboard' }))
      .toMatchObject({ hostname: 'localhost', path: '/nlu-qa-demo/dashboard' });
  });
  it('still requires an organization address', () => {
    expect(() => tenantWorkspaceDestination({ agency: { id: 999 }, role: 'provider', hostname: 'app.itsco.health' }))
      .toThrow('no portal address');
  });
  it.each(['provider', 'support', 'admin'])('keeps the isolated QA %s in its full-platform agency path', role => {
    expect(tenantWorkspaceDestination({ agency: qa, role, hostname: 'app.itsco.health', hostPortalSlug: 'itsco', path: '/dashboard', query: { tab: 'my', my: 'payroll' } }))
      .toEqual({ hostname: 'app.itsco.health', path: '/auricwell-qa-demo/dashboard', query: { tab: 'my', my: 'payroll' }, hash: '' });
  });
  it('accepts server-serialized QA flags and retains the scoped schedule route', () => {
    expect(tenantWorkspaceDestination({ agency: { ...qa, feature_flags: JSON.stringify(qa.feature_flags) }, role: 'provider', hostname: 'app.itsco.health', path: '/my-schedule' }))
      .toMatchObject({ hostname: 'app.itsco.health', path: '/auricwell-qa-demo/my-schedule' });
  });
  it('supports a tenant without a custom domain from another app host', () => {
    expect(tenantWorkspaceDestination({ agency: { id: 999, slug: 'new-agency' }, role: 'provider', hostname: 'app.theinnerstrengthinstitute.com', path: '/dashboard' }))
      .toMatchObject({ hostname: 'app.theinnerstrengthinstitute.com', path: '/new-agency/dashboard' });
  });
  it.each(['client_guardian', 'client'])('preserves the signed-in origin for %s family profile switches', role => {
    for (const path of ['/guardian', '/nlu/guardian', '/tisi/guardian', '/itsco/guardian/waivers']) {
      expect(isFamilyPortalRoute({role, path})).toBe(true);
    }
    expect(isFamilyPortalRoute({role, path:'/nlu/admin'})).toBe(false);
    expect(isFamilyPortalRoute({role, path:'/nlu/guardian-other'})).toBe(false);
  });
  it.each(['provider', 'admin', 'super_admin'])('retains tenant domain rules for %s staff', role => {
    expect(isFamilyPortalRoute({role,path:'/nlu/guardian'})).toBe(false);
  });
  it('keeps a superadmin opening ITSCO on the ITSCO host', () => {
    expect(tenantWorkspaceDestination({ agency: itsco, role: 'super_admin', hostname: 'app.itsco.health', hostPortalSlug: 'itsco' }))
      .toMatchObject({ hostname: 'app.itsco.health', path: '/admin' });
  });

  it('moves a superadmin switching tenants from ITSCO to explicit HQ tenant context', () => {
    expect(tenantWorkspaceDestination({ agency: tisi, role: 'super_admin', hostname: 'app.itsco.health', hostPortalSlug: 'itsco' }))
      .toMatchObject({ hostname: 'plottwisthq.com', path: '/tisi/admin' });
  });

  it('keeps subsequent superadmin switches scoped on HQ', () => {
    expect(tenantWorkspaceDestination({ agency: itsco, role: 'super_admin', hostname: 'plottwisthq.com', path: '/note-aid' }))
      .toMatchObject({ hostname: 'plottwisthq.com', path: '/itsco/note-aid' });
  });

  it.each(['provider', 'admin', 'staff'])('keeps %s signed in on HQ with an explicit tenant route', (role) => {
    expect(tenantWorkspaceDestination({ agency: tisi, role, hostname: 'plottwisthq.com', path: '/dashboard' }))
      .toMatchObject({ hostname: 'plottwisthq.com', path: '/tisi/dashboard' });
  });

  it('uses slug navigation for local development', () => {
    expect(tenantWorkspaceDestination({ agency: tisi, role: 'super_admin', hostname: 'localhost' }))
      .toMatchObject({ hostname: 'localhost', path: '/tisi/admin' });
  });

  it('platform navigation always targets the HQ dashboard', () => {
    expect(platformWorkspaceDestination('app.itsco.health'))
      .toMatchObject({ hostname: 'plottwisthq.com', path: '/admin' });
  });
});
