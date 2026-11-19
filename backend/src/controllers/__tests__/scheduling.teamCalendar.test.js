import { beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn(async () => [[]]), query: vi.fn(async () => [[]]) }));
vi.mock('../../config/database.js', () => ({ default: db, onTableWrite: () => {} }));
vi.mock('../../services/companyEventPersonalAgenda.service.js', () => ({
  acceptedCompanyEventCalendar: vi.fn(async () => []), companyEventScheduleVisibility: vi.fn()
}));
vi.mock('../../services/appointmentCalendarFallback.service.js', () => ({ appointmentCalendarFallbacks: vi.fn() }));
vi.mock('../../services/schoolSoftScheduleCalendar.service.js', () => ({ schoolSoftScheduleCalendar: { list: vi.fn(async () => []) } }));
vi.mock('../../services/schoolDayClosures.service.js', () => ({ listProviderSchoolDayClosures: vi.fn(async () => []) }));
vi.mock('../../services/scheduleRecordReference.service.js', () => ({ default: { enrich: vi.fn() } }));

import { getUserScheduleSummary } from '../user.controller.js';
import User from '../../models/User.model.js';
import ProviderScheduleEvent from '../../models/ProviderScheduleEvent.model.js';
import SupervisionSession from '../../models/SupervisionSession.model.js';
import { appointmentCalendarFallbacks } from '../../services/appointmentCalendarFallback.service.js';

const shared = { id: 2, timezone: 'America/Denver', organization_type: 'agency' };
const outside = { id: 99, timezone: 'America/Denver', organization_type: 'agency' };
const time = { startAt: '2026-11-19T01:00:00.000Z', endAt: '2026-11-19T02:00:00.000Z' };
const appointment = { ...time, id: 19, agencyId: outside.id, appointmentId: 11, title: 'Private client', notes: 'Private note' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(User, 'findById').mockResolvedValue({ id: 8, role: 'provider' });
  vi.spyOn(User, 'getAgencies').mockImplementation(async id => id === 8 ? [shared, outside] : [shared]);
  vi.spyOn(User, 'supervisorHasAccess').mockResolvedValue(false);
  vi.spyOn(ProviderScheduleEvent, 'listForUserInWindow').mockResolvedValue([]);
  vi.spyOn(SupervisionSession, 'listForUserInWindow').mockResolvedValue([]);
  vi.spyOn(SupervisionSession, 'listSignupOfferingsForUserInWindow').mockResolvedValue([]);
  vi.spyOn(SupervisionSession, 'listOpenJoinOfferingsForUserInWindow').mockResolvedValue([]);
  appointmentCalendarFallbacks.mockResolvedValue([appointment]);
});

async function request(role, agencyId = shared.id) {
  const next = vi.fn();
  const res = { json: vi.fn(), status: vi.fn(() => res) };
  await getUserScheduleSummary({
    user: { id: 7, role }, params: { id: '8' },
    query: { teamCalendar: 'true', agencyId: String(agencyId), weekStart: '2026-11-16', detailLevel: 'full',
      includeGoogleBusy: 'true', includeGoogleEvents: 'true' }
  }, res, next);
  expect(next.mock.calls.map(([error]) => error?.message)).toEqual([]);
  return res;
}

it('requires a shared organization or a supervision relationship before any cross-organization read', async () => {
  User.getAgencies.mockImplementation(async id => id === 8 ? [shared, outside] : [{ id: 3 }]);
  const res = await request('provider');
  expect(res.status).toHaveBeenCalledWith(403);
  expect(appointmentCalendarFallbacks).not.toHaveBeenCalled();
});

it('returns only anonymous busy time to a provider even when full detail and outside scope were requested', async () => {
  const res = await request('provider', outside.id);
  expect(appointmentCalendarFallbacks).toHaveBeenCalledWith(expect.objectContaining({ allAgencies: true, agencyId: shared.id }));
  expect(res.json).toHaveBeenCalledWith({
    ok: true, detailLevel: 'availability', weekStart: '2026-11-16', weekEnd: '2026-11-23',
    busyBlocks: [{ ...time, title: 'Busy', activityType: 'busy' }]
  });
});

it.each([['admin', false], ['super_admin', true]])('returns the correct organization detail to %s', async (role, fullAccess) => {
  const res = await request(role);
  const payload = res.json.mock.calls[0][0];
  expect(payload.googleCalendarEnabled).toBe(false);
  expect(payload.scheduleEvents).toEqual(fullAccess ? [appointment] : []);
  if (!fullAccess) {
    expect(payload.crossOrganizationBusy).toEqual([time]);
    expect(payload.scheduleAgencyIds).toEqual([shared.id]);
  }
});
