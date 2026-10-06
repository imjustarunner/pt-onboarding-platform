import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ session: vi.fn(), state: vi.fn(), find: vi.fn(), slide: vi.fn(), slides: vi.fn(), upsert: vi.fn(), presenters: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: async () => [[{ user_id: 7 }]] } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: { findById: m.session, listPresentersForSession: m.presenters } }));
vi.mock('../../models/SupervisionCasePresentation.model.js', () => ({ default: { getState: m.state, findById: m.find, getSlideById: m.slide, listSlides: m.slides, upsertState: m.upsert } }));
vi.mock('../../services/storage.service.js', () => ({ default: {} }));
vi.mock('../../utils/supervisorSchoolAccess.js', () => ({ isAdminLikeRole: role => role === 'super_admin', isSupervisorActor: async () => false }));
import { putPresentationState } from '../supervisionPresentations.controller.js';
beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue({ id:101, supervisor_user_id:1, co_facilitator_user_id:2 });
  m.state.mockResolvedValue({ active_presentation_id:11 });
  m.find.mockImplementation(async id => ({ id, session_id: Number(id) === 99 ? 999 : 101, presenter_user_id: Number(id) === 11 ? 7 : 8 }));
  m.slide.mockResolvedValue({ id:3, presentation_id:11 });
  m.slides.mockResolvedValue([{ id:4 }]);
  m.presenters.mockResolvedValue([{ user_id:7 }, { user_id:8 }]);
  m.upsert.mockResolvedValue({});
});
async function request(id, body, role='provider') {
  const res = { status:vi.fn().mockReturnThis(), json:vi.fn() }, next=vi.fn();
  await putPresentationState({ params:{id:101}, user:{id,role}, body }, res, next);
  expect(next).not.toHaveBeenCalled(); return res;
}
it.each([1,2,8,9])('does not let user %i advance presenter 7’s slides', async id => {
  expect((await request(id,{activePresentationId:11,currentSlideId:3},id===1?'super_admin':'provider')).status).toHaveBeenCalledWith(403);
  expect(m.upsert).not.toHaveBeenCalled();
});
it('lets the active presenter advance their own slides, but not a foreign slide', async () => {
  await request(7,{activePresentationId:11,currentSlideId:3}); expect(m.upsert).toHaveBeenCalledOnce();
  m.slide.mockResolvedValue({id:3,presentation_id:12});
  expect((await request(7,{activePresentationId:11,currentSlideId:3})).status).toHaveBeenCalledWith(403);
});
it.each([1,2,7])('allows host/cohost/active presenter %i to hand off to presentation two', async id => {
  await request(id,{activePresentationId:12,currentSlideId:999,handoff:true});
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({activePresentationId:12,currentSlideId:4,currentSlideOrder:0}));
});
it('rejects an attendee takeover and cross-session handoff', async () => {
  expect((await request(9,{activePresentationId:12,handoff:true})).status).toHaveBeenCalledWith(403);
  expect((await request(1,{activePresentationId:99,handoff:true})).status).toHaveBeenCalledWith(403);
});
