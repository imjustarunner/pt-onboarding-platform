import { describe, it, expect } from 'vitest';
import { editableWebsiteSlug, marketingEditorPath, websiteManagementUrl } from '../publicWebsiteEditing';
const input = { user: { role: 'super_admin' }, route: { path: '/p/itsco/providers', meta: { publicMarketingHub: true } }, hostname: 'plottwisthq.com' };
describe('website editor access', () => {
 it('links a public visitor to the matching app origin without transferring credentials',()=>{expect(websiteManagementUrl(input.route,'www.itsco.health')).toBe('https://app.itsco.health/p/itsco/providers?editWebsite=1');expect(websiteManagementUrl(input.route,'plottwisthq.com')).toBe('/p/itsco/providers?editWebsite=1');});
 it('allows a superadmin with a session on a public host to edit',()=>{expect(editableWebsiteSlug({...input,hostname:'itsco.health'})).toBe('itsco');});

  it('keeps editing on the current authenticated app origin', () => {
    for (const hostname of ['plottwisthq.com', 'app.itsco.health', 'app.nextleveluplcc.com']) {
      expect(editableWebsiteSlug({ ...input, hostname })).toBe('itsco');
      expect(new URL(marketingEditorPath('itsco'), `https://${hostname}`).origin).toBe(`https://${hostname}`);
    }
  });
  it('does not expose editing to visitors, other roles or preview frames', () => {
    for (const extra of [{ user: null }, { user: { role: 'admin' } }, { user: { role: 'support' } }, { framed: true }, { route: { path: '/login' } }, { user: { role: 'super_admin', demoMode: true } }]) {
      expect(editableWebsiteSlug({ ...input, ...extra })).toBeNull();
    }
  });
});
