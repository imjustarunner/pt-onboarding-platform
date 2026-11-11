import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
import { createQuickSessionCommentPrincipal } from '../quickViewSessionComments.controller.js';

const active = { id: 1433, role: 'provider', status: 'ACTIVE_EMPLOYEE', is_active: 1, is_archived: 0 };
async function call({ session = { userId: 1433, agencyId: 450, mobileDeviceSessionId: 99 }, user = active, membership = true, body = {}, query = {} } = {}) {
  const db = { execute: vi.fn().mockResolvedValue([[membership ? { allowed: 1 } : undefined].filter(Boolean)]) };
  const loadUser = vi.fn().mockResolvedValue(user), req = { quickView: session, body, query, params: {}, user: { role: 'quick_view' } };
  const res = { set: vi.fn() }, next = vi.fn();
  await createQuickSessionCommentPrincipal({ db, loadUser })(req, res, next);
  return { req, res, next, db, loadUser, error: next.mock.calls[0]?.[0] };
}
describe('primary mobile session comment bridge', () => {
  it('preserves the actual account and pins canonical service scope to the authenticated workspace', async () => {
    const r = await call({ body: { actorUserId: 9, role: 'super_admin' } });
    expect(r.error).toBeUndefined();
    expect(r.req.user).toMatchObject({ id: 1433, role: 'provider', sessionCommentAgencyId: 450 });
    expect(r.db.execute).toHaveBeenCalledWith(expect.stringContaining('is_active=1'), [1433, 450]);
    expect(r.res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('does not upgrade a shortcut PIN into clinical access', async () => {
    const r = await call({ session: { userId: 1433, agencyId: 450 } });
    expect(r.error.status).toBe(403); expect(r.loadUser).not.toHaveBeenCalled();
  });
  it('keeps family credentials on their existing family surface', async () => {
    const r = await call({ session: { userId: 1663, agencyId: 450, mobileDeviceSessionId: 3, mobileSurface: 'family' } });
    expect(r.error.status).toBe(403); expect(r.loadUser).not.toHaveBeenCalled();
  });
  it.each([{ body: { agencyId: 1 } }, { query: { agencyId: 1 } }])('rejects caller-selected cross-workspace data before identity lookup', async options => {
    const r = await call(options); expect(r.error.status).toBe(403); expect(r.loadUser).not.toHaveBeenCalled();
  });
  it.each([{ ...active, status: 'TERMINATED' }, { ...active, is_active: 0 }, { ...active, is_archived: 1 }, { ...active, terminated_at: '2026-11-11' }, { ...active, id: 2 }])('rechecks current identity and account state', async user => {
    const r = await call({ user }); expect(r.error.status).toBe(403); expect(r.db.execute).not.toHaveBeenCalled();
  });
  it('rechecks membership rather than trusting a previously unlocked device', async () => {
    const r = await call({ membership: false }); expect(r.error.status).toBe(403);
  });
});
