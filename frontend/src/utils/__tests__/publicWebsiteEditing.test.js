import { describe, it, expect } from 'vitest';
import { editableWebsiteSlug, marketingEditorPath } from '../publicWebsiteEditing';
const input = { user: { role: 'super_admin' }, route: { path: '/p/itsco/providers', meta: { publicMarketingHub: true } }, hostname: 'plottwisthq.com' };
describe('website editor access', () => {
  it('keeps editing on the current authenticated app origin', () => {
    for (const hostname of ['plottwisthq.com', 'app.itsco.health', 'app.nextleveluplcc.com']) {
      expect(editableWebsiteSlug({ ...input, hostname })).toBe('itsco');
      expect(new URL(marketingEditorPath('itsco'), `https://${hostname}`).origin).toBe(`https://${hostname}`);
    }
  });
  it('does not expose editing to visitors, other roles, public domains or preview frames', () => {
    for (const extra of [{ user: null }, { user: { role: 'admin' } }, { user: { role: 'support' } }, { framed: true }, { hostname: 'itsco.health' }, { hostname: 'www.kimicain.com' }, { route: { path: '/login' } }, { user: { role: 'super_admin', demoMode: true } }]) {
      expect(editableWebsiteSlug({ ...input, ...extra })).toBeNull();
    }
  });
});
