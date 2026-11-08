import { describe, it, expect, vi } from 'vitest';
vi.mock('../../services/narrivaSource.service.js', () => ({ loadNarrivaSource: vi.fn() }));
vi.mock('../../services/narrivaAssessmentEvidence.service.js', () => ({ loadNarrivaAssessmentEvidence: vi.fn() }));
vi.mock('../../services/officeClientSubmissions.service.js', () => ({ readSubmissionAnswers: value => value }));
import { createMobileNoteReviewInsights } from '../clinicalNoteReviewInsights.controller.js';

function setup(overrides = {}) {
  const actor = { id: 7, role: 'provider', is_active: 1, status: 'ACTIVE_EMPLOYEE', is_demo: 0 };
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 3 }]]) }, authorize = vi.fn(async user => { user.role = 'supervisor'; }), insights = vi.fn(async () => ({ noteId: 40, quickLook: { artifacts: [{ id: 8, href: '/api/narriva/assessments/client_document/8/view?agencyId=3' }] } }));
  const handler = createMobileNoteReviewInsights({ db, findUser: async () => actor, authorize, insights, scope: async (_id, cb) => cb(), ...overrides });
  const req = { quickView: { userId: 7, agencyId: 2, mobileDeviceSessionId: 11 }, query: { agencyId: 3 }, params: { noteId: '40' }, headers: {} }, res = { set: vi.fn(), json: vi.fn() }, next = vi.fn();
  return { actor, db, authorize, insights, handler, req, res, next };
}
describe('read-only all-agency mobile review cards', () => {
  it('rechecks target membership and author/reviewer source without rotating the device token', async () => {
    const t = setup(); await t.handler(t.req, t.res, t.next);
    expect(t.next).not.toHaveBeenCalled(); expect(t.db.execute.mock.calls[0][1]).toEqual([7, 3]);
    expect(t.authorize).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 3);
    expect(t.insights).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ role: 'supervisor' }), query: { agencyId: 3 }, quickView: expect.objectContaining({ agencyId: 3 }) }), { agencyId: 3, noteId: 40 });
    expect(t.req.quickView.agencyId).toBe(2); expect(t.actor.role).toBe('provider');
    expect(t.res.json.mock.calls[0][0].insights.quickLook.artifacts[0]).toMatchObject({ href: null, openNoteToView: true });
  });
  it('refuses legacy PIN, removed membership, deactivated account and source denial', async () => {
    const pin = setup(); delete pin.req.quickView.mobileDeviceSessionId; await pin.handler(pin.req, pin.res, pin.next); expect(pin.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(pin.insights).not.toHaveBeenCalled();
    const removed = setup({ db: { execute: async () => [[]] } }); await removed.handler(removed.req, removed.res, removed.next); expect(removed.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(removed.insights).not.toHaveBeenCalled();
    const inactive = setup({ findUser: async () => ({ id: 7, is_active: 0 }) }); await inactive.handler(inactive.req, inactive.res, inactive.next); expect(inactive.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    const denied = setup({ insights: async () => { throw Object.assign(new Error('not assigned'), { status: 403 }); } }); await denied.handler(denied.req, denied.res, denied.next); expect(denied.res.json).not.toHaveBeenCalled(); expect(denied.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
  it('retains the approved synthetic tenant boundary', async () => {
    const t = setup({ findUser: async () => ({ id: 1433, email: 'qa.provider.auricwell@example.com', role: 'provider', is_demo: 1, is_active: 1, status: 'ACTIVE_EMPLOYEE' }) });
    await t.handler(t.req, t.res, t.next); expect(t.insights).not.toHaveBeenCalled(); expect(t.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
});
