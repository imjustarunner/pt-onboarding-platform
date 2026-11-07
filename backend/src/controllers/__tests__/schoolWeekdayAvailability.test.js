import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../services/schoolWeekdayAvailability.service.js', () => ({ readSchoolWeekdays: vi.fn(), writeSchoolWeekdays: vi.fn(), requestSchoolWeekdayUpdates: vi.fn(), updateSchoolProviderFocus: vi.fn() }));
import User from '../../models/User.model.js';
import { readSchoolWeekdays, writeSchoolWeekdays, requestSchoolWeekdayUpdates, updateSchoolProviderFocus } from '../../services/schoolWeekdayAvailability.service.js';
import { getSchoolWeekdays, putSchoolWeekdays, pushSchoolWeekdays, putSchoolProviderFocus } from '../schoolWeekdayAvailability.controller.js';
let req, res, next;
beforeEach(() => {
  vi.resetAllMocks(); User.getAgencies.mockResolvedValue([{ id: 2 }]);
  req = { user: { id: 7, role: 'provider' }, params: { providerId: '7' }, query: { agencyId: '2' }, body: {} };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
});
it('allows providers to read and update only their own tenant-authorized school days', async () => {
  readSchoolWeekdays.mockResolvedValue({ eligible: true }); await getSchoolWeekdays(req, res, next);
  expect(readSchoolWeekdays).toHaveBeenCalledWith(7, 2);
  req.params.providerId = '8'; await putSchoolWeekdays(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(writeSchoolWeekdays).not.toHaveBeenCalled();
});
it('rejects cross-agency access, invalid IDs, and provider-initiated bulk pushes', async () => {
  req.query.agencyId = '3'; await getSchoolWeekdays(req, res, next); expect(res.status).toHaveBeenLastCalledWith(403);
  req.query.agencyId = 'invalid'; await getSchoolWeekdays(req, res, next); expect(res.status).toHaveBeenLastCalledWith(400);
  req.query.agencyId = '2'; await pushSchoolWeekdays(req, res, next); expect(res.status).toHaveBeenLastCalledWith(403);
  expect(requestSchoolWeekdayUpdates).not.toHaveBeenCalled();
});
it('allows authorized managers to request one provider and exposes partial failures', async () => {
  req.user.role = 'admin'; req.params = {}; req.body = { providerId: 8 };
  requestSchoolWeekdayUpdates.mockResolvedValue({ requested: [], failed: [8], skipped: [] });
  await pushSchoolWeekdays(req, res, next);
  expect(requestSchoolWeekdayUpdates).toHaveBeenCalledWith({ agencyId: 2, providerId: 8, actorId: 7 }); expect(res.status).toHaveBeenCalledWith(207);
});

it('allows focus changes only for managers in the provider’s agency',async()=>{
 await putSchoolProviderFocus(req,res,next);expect(res.status).toHaveBeenLastCalledWith(403);expect(updateSchoolProviderFocus).not.toHaveBeenCalled();
 req.user.role='admin';req.body={serviceFocus:'School-Based Counseling',expectedServiceFocus:''};await putSchoolProviderFocus(req,res,next);expect(updateSchoolProviderFocus).toHaveBeenCalledWith({agencyId:2,providerId:7,actorId:7,...req.body});
});
