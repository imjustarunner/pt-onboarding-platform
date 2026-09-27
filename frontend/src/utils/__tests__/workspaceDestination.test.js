import { describe, expect, it } from 'vitest';
import { tenantWorkspaceDestination, platformWorkspaceDestination } from '../workspaceDestination';

const itsco = { id: 1, slug: 'itsco', custom_domain: 'app.itsco.health' };
const tisi = { id: 2, slug: 'tisi', custom_domain: 'app.theinnerstrengthinstitute.com' };

describe('workspace addresses', () => {
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

  it.each(['provider', 'admin', 'staff'])('sends %s to the tenant domain, never HQ', (role) => {
    expect(tenantWorkspaceDestination({ agency: tisi, role, hostname: 'plottwisthq.com', path: '/dashboard' }))
      .toMatchObject({ hostname: 'app.theinnerstrengthinstitute.com', path: '/dashboard' });
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
